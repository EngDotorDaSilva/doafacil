import { z } from 'zod';
import { Report } from '../models/Report.js';
import { Post } from '../models/Post.js';
import { Comment } from '../models/Comment.js';
import { User } from '../models/User.js';
import { ModerationLog } from '../models/ModerationLog.js';
import { db } from '../db.js';

export class ReportController {
  static async create(req, res) {
    const schema = z
      .object({
        targetType: z.enum(['post', 'comment', 'user']),
        targetId: z.number().int().positive(),
        reason: z.enum(['spam', 'inappropriate', 'harassment', 'fake', 'other']),
        description: z.string().optional()
      })
      .strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid body', details: parsed.error.errors });
    }

    // Check if user already reported this
    const alreadyReported = await Report.hasUserReported(
      req.auth.userId,
      parsed.data.targetType,
      parsed.data.targetId
    );
    if (alreadyReported) {
      return res.status(409).json({ error: 'You have already reported this item' });
    }

    // Verify target exists
    let targetExists = false;
    if (parsed.data.targetType === 'post') {
      const post = await Post.findById(parsed.data.targetId);
      targetExists = !!post && !post.deletedAt;
    } else if (parsed.data.targetType === 'comment') {
      const comment = await Comment.findById(parsed.data.targetId);
      targetExists = !!comment && !comment.deletedAt;
    } else if (parsed.data.targetType === 'user') {
      const user = await User.findById(parsed.data.targetId);
      targetExists = !!user && !user.deletedAt;
    }

    if (!targetExists) {
      return res.status(404).json({ error: 'Target not found' });
    }

    // Cannot report yourself
    if (parsed.data.targetType === 'user' && parsed.data.targetId === req.auth.userId) {
      return res.status(400).json({ error: 'Cannot report yourself' });
    }

    const report = await Report.create({
      reporterUserId: req.auth.userId,
      targetType: parsed.data.targetType,
      targetId: parsed.data.targetId,
      reason: parsed.data.reason,
      description: parsed.data.description
    });

    return res.json({ report });
  }

  static async getAll(req, res) {
    const status = req.query.status ? String(req.query.status) : null;
    const limit = req.query.limit ? Math.min(100, Math.max(1, Number(req.query.limit))) : 50;
    const offset = req.query.offset ? Math.max(0, Number(req.query.offset)) : 0;

    const reports = await Report.findAll(status, limit, offset);
    const counts = await Report.countByStatus();

    return res.json({ reports, counts });
  }

  static async getByTarget(req, res) {
    const targetType = String(req.params.type);
    const targetId = Number(req.params.id);

    if (!['post', 'comment', 'user'].includes(targetType)) {
      return res.status(400).json({ error: 'Invalid target type' });
    }

    const reports = await Report.findByTarget(targetType, targetId);
    return res.json({ reports });
  }

  static async updateStatus(req, res) {
    const id = Number(req.params.id);
    const schema = z
      .object({
        status: z.enum(['pending', 'reviewed', 'resolved', 'dismissed']),
        action: z.enum(['block', 'delete', 'none']).optional()
      })
      .strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid body', details: parsed.error.errors });
    }

    const report = await Report.findById(id);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    // Update report status
    await Report.updateStatus(id, parsed.data.status, req.auth.userId);

    // Take action if requested
    if (parsed.data.action === 'block' && report.targetType === 'user') {
      const NOW_SQL = db.provider === 'mysql' ? 'NOW()' : "datetime('now')";
      await db.run(
        `UPDATE users SET isBlocked = 1, blockedAt = ${NOW_SQL}, blockedReason = ? WHERE id = ?`,
        [`Reported: ${report.reason}`, report.targetId]
      );
      await ModerationLog.create({
        adminUserId: req.auth.userId,
        action: 'user.block',
        targetType: 'user',
        targetId: report.targetId,
        reason: `Based on report #${id}: ${report.reason}`
      });
    } else if (parsed.data.action === 'delete') {
      const NOW_SQL = db.provider === 'mysql' ? 'NOW()' : "datetime('now')";
      if (report.targetType === 'post') {
        await db.run(
          `UPDATE posts SET deletedAt = ${NOW_SQL}, deletedByAdminUserId = ?, deletedReason = ? WHERE id = ?`,
          [req.auth.userId, `Reported: ${report.reason}`, report.targetId]
        );
        await ModerationLog.create({
          adminUserId: req.auth.userId,
          action: 'post.delete',
          targetType: 'post',
          targetId: report.targetId,
          reason: `Based on report #${id}: ${report.reason}`
        });
      } else if (report.targetType === 'comment') {
        await db.run(
          `UPDATE comments SET deletedAt = ${NOW_SQL}, deletedByAdminUserId = ?, deletedReason = ? WHERE id = ?`,
          [req.auth.userId, `Reported: ${report.reason}`, report.targetId]
        );
        await ModerationLog.create({
          adminUserId: req.auth.userId,
          action: 'comment.delete',
          targetType: 'comment',
          targetId: report.targetId,
          reason: `Based on report #${id}: ${report.reason}`
        });
      }
    }

    const updatedReport = await Report.findById(id);
    return res.json({ report: updatedReport });
  }
}
