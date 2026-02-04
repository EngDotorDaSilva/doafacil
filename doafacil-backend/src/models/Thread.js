import { db } from '../db.js';

export class Thread {
  static async findById(id) {
    return await db.get(`SELECT * FROM threads WHERE id = ?`, [id]);
  }

  static async findByUsers(donorUserId, centerUserId) {
    return await db.get(
      `SELECT * FROM threads WHERE donorUserId = ? AND centerUserId = ?`,
      [donorUserId, centerUserId]
    );
  }

  static async findOrCreate(donorUserId, centerUserId) {
    let thread = await this.findByUsers(donorUserId, centerUserId);
    if (!thread) {
      const result = await db.run(
        `INSERT INTO threads (donorUserId, centerUserId) VALUES (?, ?)`,
        [donorUserId, centerUserId]
      );
      thread = await this.findById(Number(result.insertId));
    }
    return thread;
  }

  static async findAllByUserId(userId) {
    return await db.all(
      `SELECT t.*,
              d.id AS donorId, d.name AS donorName, d.avatarUrl AS donorAvatarUrl,
              c.id AS centerId, c.name AS centerName, c.avatarUrl AS centerAvatarUrl,
              (SELECT COUNT(*) FROM messages m WHERE m.threadId = t.id AND m.readAt IS NULL AND m.senderUserId != ?) AS unreadCount,
              (SELECT m.text FROM messages m WHERE m.threadId = t.id ORDER BY m.createdAt DESC LIMIT 1) AS lastMessageText,
              (SELECT m.createdAt FROM messages m WHERE m.threadId = t.id ORDER BY m.createdAt DESC LIMIT 1) AS lastMessageAt
       FROM threads t
       JOIN users d ON d.id = t.donorUserId
       JOIN users c ON c.id = t.centerUserId
       WHERE (t.donorUserId = ? OR t.centerUserId = ?)
       ORDER BY lastMessageAt DESC, t.updatedAt DESC`,
      [userId, userId, userId]
    );
  }
}
