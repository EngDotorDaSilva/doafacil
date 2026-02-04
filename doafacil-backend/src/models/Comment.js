import { db } from '../db.js';

const NOW_SQL = db.provider === 'mysql' ? 'NOW()' : "datetime('now')";

export class Comment {
  static async findById(id) {
    return await db.get(`SELECT * FROM comments WHERE id = ?`, [id]);
  }

  static async findByPostId(postId) {
    return await db.all(
      `SELECT c.*,
              u.id AS authorId, u.name AS authorName, u.role AS authorRole, u.avatarUrl AS authorAvatarUrl
       FROM comments c
       JOIN users u ON u.id = c.authorUserId
       WHERE c.postId = ? AND c.deletedAt IS NULL
       ORDER BY c.createdAt ASC`,
      [postId]
    );
  }

  static async create(data) {
    const { postId, authorUserId, text } = data;
    const result = await db.run(
      `INSERT INTO comments (postId, authorUserId, text) VALUES (?, ?, ?)`,
      [postId, authorUserId, text]
    );
    return await this.findById(Number(result.insertId));
  }

  static async update(id, text) {
    await db.run(`UPDATE comments SET text = ?, updatedAt = ${NOW_SQL} WHERE id = ?`, [text, id]);
    return await this.findById(id);
  }

  static async softDelete(id, adminUserId = null, reason = null) {
    await db.run(
      `UPDATE comments SET deletedAt = ${NOW_SQL}, deletedByAdminUserId = ?, deletedReason = ? WHERE id = ?`,
      [adminUserId, reason, id]
    );
    return await this.findById(id);
  }

  static async restore(id) {
    await db.run(`UPDATE comments SET deletedAt = NULL, deletedByAdminUserId = NULL, deletedReason = NULL WHERE id = ?`, [id]);
    return await this.findById(id);
  }

  static async findAllForAdmin(limit = 500) {
    return await db.all(
      `SELECT c.id, c.text, c.createdAt, c.updatedAt,
              c.deletedAt, c.deletedByAdminUserId, c.deletedReason,
              u.id AS authorId, u.name AS authorName, u.role AS authorRole, u.avatarUrl AS authorAvatarUrl,
              p.id AS postId, p.text AS postText, p.category AS postCategory
       FROM comments c
       JOIN users u ON u.id = c.authorUserId
       JOIN posts p ON p.id = c.postId
       ORDER BY c.createdAt DESC
       LIMIT ?`,
      [limit]
    );
  }
}
