import { db } from '../db.js';

const NOW_SQL = db.provider === 'mysql' ? 'NOW()' : "datetime('now')";

export class Message {
  static async findById(id) {
    return await db.get(`SELECT * FROM messages WHERE id = ?`, [id]);
  }

  static async findByThreadId(threadId) {
    return await db.all(
      `SELECT m.*,
              u.id AS senderId, u.name AS senderName, u.avatarUrl AS senderAvatarUrl
       FROM messages m
       JOIN users u ON u.id = m.senderUserId
       WHERE m.threadId = ?
       ORDER BY m.createdAt ASC`,
      [threadId]
    );
  }

  static async create(data) {
    const { threadId, senderUserId, text } = data;
    const result = await db.run(
      `INSERT INTO messages (threadId, senderUserId, text) VALUES (?, ?, ?)`,
      [threadId, senderUserId, text]
    );
    return await this.findById(Number(result.insertId));
  }

  static async markAsRead(threadId, userId) {
    await db.run(
      `UPDATE messages SET readAt = ${NOW_SQL} 
       WHERE threadId = ? AND senderUserId != ? AND readAt IS NULL`,
      [threadId, userId]
    );
  }
}
