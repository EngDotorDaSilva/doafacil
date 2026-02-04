import { db } from '../db.js';

export class Share {
  static async findByUserId(userId) {
    return await db.all(
      `SELECT s.*, p.id as postId, p.text, p.category, p.imageUrl, p.imageUrls, p.createdAt as postCreatedAt,
       u.id AS authorId, u.name AS authorName, u.role AS authorRole, u.avatarUrl AS authorAvatarUrl,
       c.id AS centerId, c.displayName AS centerName, c.address AS centerAddress, c.lat AS centerLat, c.lng AS centerLng, c.approved AS centerApproved
       FROM shares s
       JOIN posts p ON s.postId = p.id
       JOIN users u ON u.id = p.authorUserId
       LEFT JOIN centers c ON c.id = p.centerId
       WHERE s.userId = ? AND p.deletedAt IS NULL
       ORDER BY s.createdAt DESC`,
      [userId]
    );
  }

  static async findByPostIdAndUserId(postId, userId) {
    return await db.get(
      `SELECT * FROM shares WHERE postId = ? AND userId = ?`,
      [postId, userId]
    );
  }

  static async getSharedPostIdsByPostIds(postIds, userId) {
    if (!postIds || postIds.length === 0) return new Set();
    
    const placeholders = postIds.map(() => '?').join(',');
    const shared = await db.all(
      `SELECT postId FROM shares WHERE postId IN (${placeholders}) AND userId = ?`,
      [...postIds, userId]
    );
    
    return new Set(shared.map((s) => s.postId));
  }

  static async create(postId, userId) {
    const NOW_SQL = db.provider === 'mysql' ? 'NOW()' : "datetime('now')";
    
    if (db.provider === 'mysql') {
      await db.run(
        `INSERT INTO shares (postId, userId, createdAt) 
         VALUES (?, ?, ${NOW_SQL})
         ON DUPLICATE KEY UPDATE createdAt = ${NOW_SQL}`,
        [postId, userId]
      );
    } else {
      // SQLite: delete and insert
      await db.run(`DELETE FROM shares WHERE postId = ? AND userId = ?`, [postId, userId]);
      await db.run(
        `INSERT INTO shares (postId, userId, createdAt) 
         VALUES (?, ?, ${NOW_SQL})`,
        [postId, userId]
      );
    }
    
    return await this.findByPostIdAndUserId(postId, userId);
  }

  static async delete(postId, userId) {
    await db.run(`DELETE FROM shares WHERE postId = ? AND userId = ?`, [postId, userId]);
    return { success: true };
  }
}
