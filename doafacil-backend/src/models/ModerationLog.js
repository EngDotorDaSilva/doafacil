import { db } from '../db.js';

export class ModerationLog {
  static async create(data) {
    const { adminUserId, action, targetType, targetId = null, reason = null, meta = null } = data;
    try {
      await db.run(
        `INSERT INTO moderation_logs (adminUserId, action, targetType, targetId, reason, meta)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [adminUserId, action, targetType, targetId, reason, meta ? JSON.stringify(meta) : null]
      );
    } catch {
      // best-effort, ignore logging failures
    }
  }

  static async findAll(limit = 100) {
    return await db.all(
      `SELECT ml.*,
              u.id AS adminId, u.name AS adminName, u.email AS adminEmail
       FROM moderation_logs ml
       JOIN users u ON u.id = ml.adminUserId
       ORDER BY ml.createdAt DESC
       LIMIT ?`,
      [limit]
    );
  }
}
