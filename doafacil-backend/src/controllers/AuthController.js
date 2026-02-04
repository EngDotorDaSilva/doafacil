import { z } from 'zod';
import { randomInt } from 'crypto';
import { User } from '../models/User.js';
import { Center } from '../models/Center.js';
import { PasswordReset } from '../models/PasswordReset.js';
import { hashPassword, signToken, verifyPassword } from '../auth.js';
import { db } from '../db.js';

const NOW_SQL = db.provider === 'mysql' ? 'NOW()' : "datetime('now')";
const NOW_PLUS_15M_SQL = db.provider === 'mysql' ? 'DATE_ADD(NOW(), INTERVAL 15 MINUTE)' : "datetime('now', '+15 minutes')";

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export class AuthController {
  static async register(req, res) {
    const bodySchema = z
      .object({
        role: z.enum(['donor', 'center']),
        name: z.string().min(2),
        email: z.string().email(),
        password: z.string().min(6),
        phone: z.string().min(3).optional(),
        avatarUrl: z.string().url().optional(),
        lat: z.number().optional(),
        lng: z.number().optional(),
        center: z
          .object({
            displayName: z.string().min(2),
            address: z.string().min(3),
            lat: z.number().optional(),
            lng: z.number().optional(),
            hours: z.string().optional(),
            acceptedItemTypes: z.array(z.string()).default([])
          })
          .optional()
      })
      .strict();

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    const { role, name, email, password, center, phone, avatarUrl, lat, lng } = parsed.data;
    if (role === 'center' && !center) return res.status(400).json({ error: 'center is required' });

    const passwordHash = await hashPassword(password);

    try {
      console.log('[AuthController.register] Starting registration for:', { email, role, hasCenter: !!center });
      
      // Check if email already exists
      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        console.log('[AuthController.register] Email already exists:', email);
        return res.status(409).json({ error: 'Email already exists' });
      }

      console.log('[AuthController.register] Creating user transaction...');
      const user = await db.tx(async (tx) => {
        console.log('[AuthController.register] Inserting user...');
        const userIns = await tx.run(
          `INSERT INTO users (name, email, passwordHash, role, phone, avatarUrl, lat, lng) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [name, email.toLowerCase(), passwordHash, role, phone ?? null, avatarUrl ?? null, lat ?? null, lng ?? null]
        );
        
        console.log('[AuthController.register] User insert result:', userIns);
        
        // Get insertId - works for both SQLite and MySQL
        const userId = db.provider === 'mysql' 
          ? Number(userIns.insertId) 
          : Number(userIns.lastInsertRowid || userIns.insertId);
        
        console.log('[AuthController.register] User ID:', userId, 'Provider:', db.provider);
        
        if (!userId || isNaN(userId) || userId === 0) {
          console.error('[AuthController.register] Invalid user ID:', userId);
          throw new Error(`Failed to get user ID after insert. insertId: ${userIns.insertId}, lastInsertRowid: ${userIns.lastInsertRowid}`);
        }

        if (role === 'center') {
          if (!center) {
            throw new Error('Center data is required for center role');
          }
          
          console.log('[AuthController.register] Inserting center for user:', userId);
          await tx.run(
            `INSERT INTO centers (userId, displayName, address, lat, lng, hours, acceptedItemTypes, approved)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
            [
              userId,
              center.displayName,
              center.address,
              center.lat ?? null,
              center.lng ?? null,
              center.hours ?? null,
              JSON.stringify(center.acceptedItemTypes ?? [])
            ]
          );
          console.log('[AuthController.register] Center inserted successfully');
          
          // Notify admins about new pending center
          try {
            const io = req.app.get('io');
            if (io) {
              io.emit('admin:new_pending_center', {
                centerId: userId,
                displayName: center.displayName,
                address: center.address
              });
            }
          } catch (notifyErr) {
            console.error('[AuthController.register] Error notifying admins:', notifyErr);
            // Don't fail registration if notification fails
          }
        }

        console.log('[AuthController.register] Retrieving created user...');
        const createdUser = await tx.get(
          `SELECT id, name, email, role, phone, avatarUrl, lat, lng FROM users WHERE id = ?`, 
          [userId]
        );
        
        console.log('[AuthController.register] Created user:', createdUser);
        
        if (!createdUser) {
          throw new Error(`Failed to retrieve created user with ID: ${userId}`);
        }
        
        return createdUser;
      });
      
      console.log('[AuthController.register] User created successfully, generating token...');
      const token = signToken(user);
      console.log('[AuthController.register] Registration successful for:', email);
      return res.json({ token, user });
    } catch (e) {
      console.error('[AuthController.register] Error:', e);
      console.error('[AuthController.register] Error message:', e?.message);
      console.error('[AuthController.register] Error stack:', e?.stack);
      console.error('[AuthController.register] Error name:', e?.name);
      console.error('[AuthController.register] Error code:', e?.code);
      
      // Handle specific database errors
      const errorMsg = String(e?.message || '');
      const errorCode = String(e?.code || '');
      
      if (errorMsg.includes('UNIQUE') || errorMsg.includes('Duplicate entry') || errorCode === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Email already exists' });
      }
      if (errorMsg.includes('FOREIGN KEY') || errorMsg.includes('constraint') || errorCode.includes('FOREIGN')) {
        return res.status(400).json({ error: 'Invalid data provided' });
      }
      if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('connection')) {
        return res.status(503).json({ error: 'Database connection error' });
      }
      
      // Return detailed error in development, generic in production
      const isDev = process.env.NODE_ENV !== 'production';
      return res.status(500).json({ 
        error: 'Server error',
        ...(isDev && { 
          details: errorMsg, 
          code: errorCode,
          name: e?.name,
          stack: e?.stack 
        })
      });
    }
  }

  static async login(req, res) {
    const schema = z.object({ email: z.string().email(), password: z.string().min(1) }).strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      console.log('[AuthController.login] Validation error:', parsed.error.errors);
      return res.status(400).json({ error: 'Invalid body', details: parsed.error.errors });
    }

    const { email, password } = parsed.data;
    const user = await User.findByEmail(email);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.deletedAt) return res.status(403).json({ error: 'UserDeleted', reason: user.deletedReason || null });
    if (Number(user.isBlocked) === 1) return res.status(403).json({ error: 'UserBlocked', reason: user.blockedReason || null });
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role };
    const token = signToken(safeUser);
    return res.json({ token, user: safeUser });
  }

  static async forgot(req, res) {
    const schema = z.object({ email: z.string().email() }).strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body' });

    const email = parsed.data.email.toLowerCase();
    const user = await User.findByEmail(email);

    // Avoid email enumeration: always respond ok.
    if (!user || user.deletedAt) return res.json({ ok: true });

    const code = String(randomInt(100000, 1000000)); // 6 digits
    const codeHash = await hashPassword(code);

    try {
      await PasswordReset.create(user.id, codeHash);
    } catch {
      // still respond ok to avoid leaking existence
      return res.json({ ok: true });
    }

    // In a real app we'd send this code by email/SMS. For now we return it so Expo Go can complete the flow.
    return res.json({ ok: true, code });
  }

  static async reset(req, res) {
    try {
      console.log('[AuthController.reset] Starting password reset...');
      
      const schema = z
        .object({
          email: z.string().email(),
          code: z.string().min(4),
          newPassword: z.string().min(6)
        })
        .strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        console.log('[AuthController.reset] Invalid body:', parsed.error);
        return res.status(400).json({ error: 'Invalid body' });
      }

      const email = parsed.data.email.toLowerCase();
      console.log('[AuthController.reset] Looking for user:', email);
      
      const user = await User.findByEmail(email);
      if (!user) {
        console.log('[AuthController.reset] User not found');
        return res.status(400).json({ error: 'InvalidResetCode' });
      }
      if (user.deletedAt) {
        console.log('[AuthController.reset] User deleted');
        return res.status(403).json({ error: 'UserDeleted', reason: user.deletedReason || null });
      }

      console.log('[AuthController.reset] Finding valid reset code for user:', user.id);
      const reset = await PasswordReset.findValid(user.id);
      if (!reset) {
        console.log('[AuthController.reset] No valid reset code found');
        return res.status(400).json({ error: 'InvalidResetCode' });
      }

      console.log('[AuthController.reset] Verifying code...');
      const ok = await verifyPassword(parsed.data.code, reset.codeHash);
      if (!ok) {
        console.log('[AuthController.reset] Code verification failed');
        return res.status(400).json({ error: 'InvalidResetCode' });
      }

      console.log('[AuthController.reset] Code verified, hashing new password...');
      const nextHash = await hashPassword(parsed.data.newPassword);
      
      console.log('[AuthController.reset] Starting transaction...');
      await db.tx(async (tx) => {
        console.log('[AuthController.reset] Updating user password...');
        await tx.run(`UPDATE users SET passwordHash = ? WHERE id = ?`, [nextHash, user.id]);
        console.log('[AuthController.reset] Marking reset as used...');
        await tx.run(`UPDATE password_resets SET usedAt = ${NOW_SQL} WHERE id = ?`, [reset.id]);
      });
      
      console.log('[AuthController.reset] Password reset successful');
      return res.json({ ok: true });
    } catch (error) {
      console.error('[AuthController.reset] Error:', error);
      console.error('[AuthController.reset] Stack:', error?.stack);
      
      if (!res.headersSent) {
        const isDev = process.env.NODE_ENV !== 'production';
        return res.status(500).json({ 
          error: 'Failed to update password',
          details: isDev ? error.message : undefined
        });
      }
    }
  }
}
