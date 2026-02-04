import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

export function signToken(user) {
  return jwt.sign(
    { sub: String(user.id), role: user.role, name: user.name, email: user.email },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

export async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
}

export async function verifyPassword(password, passwordHash) {
  return await bcrypt.compare(password, passwordHash);
}

export async function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const [type, token] = header.split(' ');
  if (type !== 'Bearer' || !token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const payload = verifyToken(token);
    const userId = Number(payload.sub);
    if (!Number.isFinite(userId)) return res.status(401).json({ error: 'Unauthorized' });

    const row = await db.get(
      `SELECT id, role, isBlocked, blockedReason, deletedAt, deletedReason FROM users WHERE id = ?`,
      [userId]
    );
    if (!row) return res.status(401).json({ error: 'Unauthorized' });
    if (row.deletedAt) {
      return res.status(403).json({ error: 'UserDeleted', reason: row.deletedReason || null });
    }
    if (Number(row.isBlocked) === 1) {
      return res.status(403).json({ error: 'UserBlocked', reason: row.blockedReason || null });
    }

    req.auth = {
      userId,
      role: payload.role,
      name: payload.name,
      email: payload.email
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.auth) return res.status(401).json({ error: 'Unauthorized' });
    if (!roles.includes(req.auth.role)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

