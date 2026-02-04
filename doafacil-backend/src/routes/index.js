import express from 'express';
import { authRequired, requireRole } from '../auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { AuthController } from '../controllers/AuthController.js';
import { PostController } from '../controllers/PostController.js';
import { CommentController } from '../controllers/CommentController.js';
import { ReactionController } from '../controllers/ReactionController.js';
import { SavedPostController } from '../controllers/SavedPostController.js';
import { ShareController } from '../controllers/ShareController.js';
import { ChatController } from '../controllers/ChatController.js';
import { AdminController } from '../controllers/AdminController.js';
import { ItemController } from '../controllers/ItemController.js';
import { DonationController } from '../controllers/DonationController.js';
import { ReportController } from '../controllers/ReportController.js';
import { db } from '../db.js';
import { haversineKm } from '../geo.js';
import { safeJsonParse } from '../utils/helpers.js';
import { User } from '../models/User.js';
import { Center } from '../models/Center.js';
import { PushToken } from '../models/PushToken.js';
import { hashPassword, verifyPassword } from '../auth.js';

const router = express.Router();
const NOW_SQL = db.provider === 'mysql' ? 'NOW()' : "datetime('now')";

const uploadsDir = fileURLToPath(new URL('../../uploads', import.meta.url));
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '');
    const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, name);
  }
});
const upload = multer({ storage });

// Health check
router.get('/health', (_req, res) => res.json({ ok: true }));

// Async error wrapper for async controller methods
function asyncHandler(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (err) {
      next(err);
    }
  };
}

// Auth routes
router.post('/auth/register', asyncHandler((req, res) => AuthController.register(req, res)));
router.post('/auth/login', asyncHandler((req, res) => AuthController.login(req, res)));
router.post('/auth/forgot', asyncHandler((req, res) => AuthController.forgot(req, res)));
router.post('/auth/reset', asyncHandler((req, res) => AuthController.reset(req, res)));

// User routes
router.get('/users/:id', authRequired, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid user id' });

  const user = await User.findPublic(id);
  if (!user) return res.status(404).json({ error: 'Not found' });

  const center = user.role === 'center' ? await Center.findByUserId(id) : null;
  const safeUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone ?? null,
    avatarUrl: user.avatarUrl ?? null,
    createdAt: user.createdAt
  };
  const centerParsed = center ? { ...center, acceptedItemTypes: safeJsonParse(center.acceptedItemTypes, []) } : null;

  return res.json({ user: safeUser, center: centerParsed });
});

router.get('/me', authRequired, async (req, res) => {
  const user = await User.findById(req.auth.userId);
  const center = await Center.findByUserId(req.auth.userId);
  const centerParsed = center ? { ...center, acceptedItemTypes: safeJsonParse(center.acceptedItemTypes, []) } : null;
  return res.json({ user, center: centerParsed });
});

router.put('/me/profile', authRequired, async (req, res) => {
  const { z } = await import('zod');
  const schema = z
    .object({
      name: z.string().min(2).optional(),
      phone: z.string().min(3).nullable().optional(),
      avatarUrl: z.string().url().nullable().optional(),
      lat: z.number().nullable().optional(),
      lng: z.number().nullable().optional()
    })
    .strict();

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body' });

  const existing = await User.findById(req.auth.userId);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const updated = await User.update(req.auth.userId, {
    name: parsed.data.name ?? existing.name,
    phone: parsed.data.phone !== undefined ? parsed.data.phone : existing.phone,
    avatarUrl: parsed.data.avatarUrl !== undefined ? parsed.data.avatarUrl : existing.avatarUrl,
    lat: parsed.data.lat !== undefined ? parsed.data.lat : existing.lat,
    lng: parsed.data.lng !== undefined ? parsed.data.lng : existing.lng
  });

  return res.json({ user: updated });
});

router.put('/me/password', authRequired, async (req, res) => {
  const { z } = await import('zod');
  const schema = z
    .object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(6)
    })
    .strict();
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body' });

  const user = await User.findById(req.auth.userId);
  if (!user) return res.status(404).json({ error: 'Not found' });
  if (user.deletedAt) return res.status(403).json({ error: 'UserDeleted' });

  const ok = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!ok) return res.status(400).json({ error: 'InvalidCurrentPassword' });

  const nextHash = await hashPassword(parsed.data.newPassword);
  await User.update(req.auth.userId, { passwordHash: nextHash });
  return res.json({ ok: true });
});

// Upload
router.post('/uploads', authRequired, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file is required' });
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const url = `${baseUrl}/uploads/${req.file.filename}`;
  return res.json({ url });
});

// Push tokens
router.post('/me/push-token', authRequired, async (req, res) => {
  const { z } = await import('zod');
  const schema = z.object({ token: z.string().min(8), platform: z.string().optional() }).strict();
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body' });

  const token = parsed.data.token.trim();
  const platform = parsed.data.platform ? String(parsed.data.platform) : null;
  await PushToken.upsert(req.auth.userId, token, platform);
  return res.json({ ok: true });
});

router.delete('/me/push-token', authRequired, async (req, res) => {
  const { z } = await import('zod');
  const schema = z.object({ token: z.string().min(8) }).strict();
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body' });
  await PushToken.deleteByToken(parsed.data.token.trim());
  return res.json({ ok: true });
});

// Centers (public)
router.get('/centers', async (req, res) => {
  const lat = req.query.lat ? Number(req.query.lat) : null;
  const lng = req.query.lng ? Number(req.query.lng) : null;
  const radiusKm = req.query.radiusKm ? Number(req.query.radiusKm) : null;
  const filterByLocation = req.query.filterByLocation === '1' || req.query.filterByLocation === 'true';

  const centers = await Center.findAll(false);
  const centersParsed = centers.map((c) => ({ ...c, acceptedItemTypes: safeJsonParse(c.acceptedItemTypes, []) }));

  // If location is provided, calculate distance for all centers
  if (lat != null && lng != null) {
    const centersWithDistance = centersParsed.map((c) => {
      if (c.lat == null || c.lng == null) return { ...c, distanceKm: null };
      return { ...c, distanceKm: haversineKm({ lat, lng }, { lat: c.lat, lng: c.lng }) };
    });

    // If filterByLocation is true, filter by radius and sort by distance
    if (filterByLocation && radiusKm != null) {
      const filtered = centersWithDistance
        .filter((c) => c.distanceKm != null && c.distanceKm <= radiusKm)
        .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
      return res.json({ centers: filtered });
    }

    // Otherwise, return all centers with distance, sorted by distance
    const sorted = centersWithDistance.sort((a, b) => {
      if (a.distanceKm == null && b.distanceKm == null) return 0;
      if (a.distanceKm == null) return 1;
      if (b.distanceKm == null) return -1;
      return a.distanceKm - b.distanceKm;
    });
    return res.json({ centers: sorted });
  }

  // No location provided, return all centers
  return res.json({ centers: centersParsed });
});

router.get('/centers/:id', async (req, res) => {
  const id = Number(req.params.id);
  const center = await Center.findById(id);
  if (!center || !center.approved) return res.status(404).json({ error: 'Not found' });
  return res.json({
    center: {
      ...center,
      acceptedItemTypes: safeJsonParse(center.acceptedItemTypes, [])
    }
  });
});

// Center profile (owner)
router.put('/centers/me', authRequired, requireRole('center'), async (req, res) => {
  const { z } = await import('zod');
  const schema = z
    .object({
      displayName: z.string().min(2).optional(),
      address: z.string().min(3).optional(),
      lat: z.number().nullable().optional(),
      lng: z.number().nullable().optional(),
      hours: z.string().nullable().optional(),
      acceptedItemTypes: z.array(z.string()).optional()
    })
    .strict();

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body' });

  const existing = await Center.findByUserId(req.auth.userId);
  if (!existing) return res.status(404).json({ error: 'Center not found' });

  const updated = await Center.update(existing.id, {
    displayName: parsed.data.displayName ?? existing.displayName,
    address: parsed.data.address ?? existing.address,
    lat: parsed.data.lat !== undefined ? parsed.data.lat : existing.lat,
    lng: parsed.data.lng !== undefined ? parsed.data.lng : existing.lng,
    hours: parsed.data.hours !== undefined ? parsed.data.hours : existing.hours,
    acceptedItemTypes: parsed.data.acceptedItemTypes !== undefined ? parsed.data.acceptedItemTypes : safeJsonParse(existing.acceptedItemTypes, [])
  });

  return res.json({ center: { ...updated, acceptedItemTypes: safeJsonParse(updated.acceptedItemTypes, []) } });
});

// Posts routes
// IMPORTANT: Specific routes must come before parameterized routes
router.get('/posts', async (req, res) => {
  const io = req.app.get('io');
  return PostController.getAll(req, res, io);
});

router.get('/posts/mine', authRequired, requireRole('center'), async (req, res) => {
  return PostController.getMine(req, res);
});

router.get('/posts/saved', authRequired, async (req, res) => {
  return SavedPostController.getAll(req, res);
});

router.get('/posts/shared', authRequired, asyncHandler((req, res) => ShareController.getAll(req, res)));

router.get('/posts/:id', async (req, res) => {
  return PostController.getById(req, res);
});

router.post('/posts', authRequired, requireRole('center'), asyncHandler(async (req, res) => {
  const io = req.app.get('io');
  return PostController.create(req, res, io);
}));

router.put('/posts/:id', authRequired, requireRole('center'), async (req, res) => {
  const io = req.app.get('io');
  return PostController.update(req, res, io);
});

router.delete('/posts/:id', authRequired, requireRole('center'), async (req, res) => {
  const io = req.app.get('io');
  return PostController.delete(req, res, io);
});

// Comments routes
router.get('/posts/:id/comments', async (req, res) => {
  return CommentController.getByPostId(req, res);
});

router.post('/posts/:id/comments', authRequired, async (req, res) => {
  const io = req.app.get('io');
  return CommentController.create(req, res, io);
});

router.put('/comments/:id', authRequired, async (req, res) => {
  const io = req.app.get('io');
  return CommentController.update(req, res, io);
});

router.delete('/comments/:id', authRequired, async (req, res) => {
  const io = req.app.get('io');
  return CommentController.delete(req, res, io);
});

// Reactions routes
router.post('/posts/:id/reactions', authRequired, async (req, res) => {
  return ReactionController.createOrUpdate(req, res);
});

router.delete('/posts/:id/reactions', authRequired, async (req, res) => {
  return ReactionController.delete(req, res);
});

router.get('/posts/:id/reactions', async (req, res) => {
  return ReactionController.getCounts(req, res);
});

// Saved posts routes (already moved above)
router.post('/posts/:id/save', authRequired, async (req, res) => {
  return SavedPostController.create(req, res);
});

router.delete('/posts/:id/save', authRequired, async (req, res) => {
  return SavedPostController.delete(req, res);
});

// Shares routes (shared route already moved above)
router.post('/posts/:id/share', authRequired, asyncHandler((req, res) => ShareController.create(req, res)));

router.delete('/posts/:id/share', authRequired, asyncHandler((req, res) => ShareController.delete(req, res)));

// Chat routes
router.get('/threads', authRequired, async (req, res) => {
  return ChatController.getThreads(req, res);
});

router.post('/threads', authRequired, async (req, res) => {
  return ChatController.createThread(req, res);
});

router.get('/threads/:id/messages', authRequired, async (req, res) => {
  return ChatController.getMessages(req, res);
});

router.post('/threads/:id/read', authRequired, async (req, res) => {
  const notifyUser = req.app.get('notifyUser');
  return ChatController.markAsRead(req, res, notifyUser);
});

router.post('/threads/:id/messages', authRequired, async (req, res) => {
  const notifyUser = req.app.get('notifyUser');
  const isUserOnline = req.app.get('isUserOnline');
  return ChatController.sendMessage(req, res, notifyUser, isUserOnline);
});

// Admin routes
router.get('/admin/stats', authRequired, requireRole('admin'), async (req, res) => {
  return AdminController.getStats(req, res);
});

router.get('/admin/reports', authRequired, requireRole('admin'), async (req, res) => {
  return AdminController.getReports(req, res);
});

// Report routes
router.post('/reports', authRequired, asyncHandler(async (req, res) => {
  return ReportController.create(req, res);
}));

router.get('/reports', authRequired, requireRole('admin'), asyncHandler(async (req, res) => {
  return ReportController.getAll(req, res);
}));

router.get('/reports/:type/:id', authRequired, requireRole('admin'), asyncHandler(async (req, res) => {
  return ReportController.getByTarget(req, res);
}));

router.put('/reports/:id/status', authRequired, requireRole('admin'), asyncHandler(async (req, res) => {
  return ReportController.updateStatus(req, res);
}));

router.get('/admin/centers/pending', authRequired, requireRole('admin'), async (req, res) => {
  return AdminController.getPendingCenters(req, res);
});

router.post('/admin/centers/:id/approve', authRequired, requireRole('admin'), asyncHandler(async (req, res) => {
  const io = req.app.get('io');
  return AdminController.approveCenter(req, res, io);
}));

router.get('/admin/users', authRequired, requireRole('admin'), async (req, res) => {
  return AdminController.getUsers(req, res);
});

router.post('/admin/users/:id/block', authRequired, requireRole('admin'), async (req, res) => {
  return AdminController.blockUser(req, res);
});

router.post('/admin/users/:id/unblock', authRequired, requireRole('admin'), async (req, res) => {
  return AdminController.unblockUser(req, res);
});

router.delete('/admin/users/:id', authRequired, requireRole('admin'), async (req, res) => {
  return AdminController.deleteUser(req, res);
});

router.post('/admin/users/:id/restore', authRequired, requireRole('admin'), async (req, res) => {
  return AdminController.restoreUser(req, res);
});

router.delete('/admin/users/:id/hard', authRequired, requireRole('admin'), async (req, res) => {
  return AdminController.hardDeleteUser(req, res);
});

router.get('/admin/posts', authRequired, requireRole('admin'), async (req, res) => {
  return AdminController.getPosts(req, res);
});

router.delete('/admin/posts/:id', authRequired, requireRole('admin'), async (req, res) => {
  const io = req.app.get('io');
  return AdminController.deletePost(req, res, io);
});

router.post('/admin/posts/:id/restore', authRequired, requireRole('admin'), async (req, res) => {
  const io = req.app.get('io');
  return AdminController.restorePost(req, res, io);
});

router.get('/admin/comments', authRequired, requireRole('admin'), async (req, res) => {
  return AdminController.getComments(req, res);
});

router.delete('/admin/comments/:id', authRequired, requireRole('admin'), async (req, res) => {
  const io = req.app.get('io');
  return AdminController.deleteComment(req, res, io);
});

router.post('/admin/comments/:id/restore', authRequired, requireRole('admin'), async (req, res) => {
  const io = req.app.get('io');
  return AdminController.restoreComment(req, res, io);
});

router.get('/admin/moderation/logs', authRequired, requireRole('admin'), async (req, res) => {
  return AdminController.getModerationLogs(req, res);
});

router.get('/admin/export', authRequired, requireRole('admin'), async (req, res) => {
  return AdminController.exportData(req, res);
});

router.post('/admin/users/bulk/block', authRequired, requireRole('admin'), async (req, res) => {
  return AdminController.bulkBlockUsers(req, res);
});

router.post('/admin/users/bulk/unblock', authRequired, requireRole('admin'), async (req, res) => {
  return AdminController.bulkUnblockUsers(req, res);
});

// Items routes (centers can create/manage available items)
router.get('/items', async (req, res) => {
  return ItemController.getAll(req, res);
});

router.get('/items/mine', authRequired, requireRole('center'), async (req, res) => {
  return ItemController.getMine(req, res);
});

router.post('/items', authRequired, requireRole('center'), asyncHandler((req, res) => {
  return ItemController.create(req, res);
}));

router.put('/items/:id', authRequired, requireRole('center'), asyncHandler((req, res) => {
  return ItemController.update(req, res);
}));

router.delete('/items/:id', authRequired, requireRole('center'), asyncHandler((req, res) => {
  return ItemController.delete(req, res);
}));

// Donation requests routes
router.get('/donations/mine', authRequired, async (req, res) => {
  return DonationController.getMine(req, res);
});

router.get('/donations/center', authRequired, requireRole('center'), async (req, res) => {
  return DonationController.getCenterRequests(req, res);
});

router.post('/donations', authRequired, asyncHandler(async (req, res) => {
  const io = req.app.get('io');
  return DonationController.create(req, res, io);
}));

router.put('/donations/:id/status', authRequired, asyncHandler(async (req, res) => {
  const io = req.app.get('io');
  return DonationController.updateStatus(req, res, io);
}));

router.delete('/donations/:id', authRequired, asyncHandler((req, res) => {
  return DonationController.delete(req, res);
}));

export default router;
