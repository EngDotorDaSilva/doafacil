import { db } from '../db.js';

export class SavedPost {
  static async findByUserId(userId) {
    return await db.all(
      `SELECT sp.*, p.id as postId, p.text, p.category, p.imageUrl, p.imageUrls, p.createdAt as postCreatedAt
       FROM saved_posts sp
       JOIN posts p ON sp.postId = p.id
       WHERE sp.userId = ? AND p.deletedAt IS NULL
       ORDER BY sp.createdAt DESC`,
      [userId]
    );
  }

  static async findByPostIdAndUserId(postId, userId) {
    return await db.get(
      `SELECT * FROM saved_posts WHERE postId = ? AND userId = ?`,
      [postId, userId]
    );
  }

  static async getSavedPostIdsByPostIds(postIds, userId) {
    if (!postIds || postIds.length === 0) return new Set();
    
    const placeholders = postIds.map(() => '?').join(',');
    const saved = await db.all(
      `SELECT postId FROM saved_posts WHERE postId IN (${placeholders}) AND userId = ?`,
      [...postIds, userId]
    );
    
    return new Set(saved.map((s) => s.postId));
  }

  static async create(postId, userId) {
    const NOW_SQL = db.provider === 'mysql' ? 'NOW()' : "datetime('now')";
    
    if (db.provider === 'mysql') {
      await db.run(
        `INSERT INTO saved_posts (postId, userId, createdAt) 
         VALUES (?, ?, ${NOW_SQL})
         ON DUPLICATE KEY UPDATE createdAt = ${NOW_SQL}`,
        [postId, userId]
      );
    } else {
      // SQLite: delete and insert
      await db.run(`DELETE FROM saved_posts WHERE postId = ? AND userId = ?`, [postId, userId]);
      await db.run(
        `INSERT INTO saved_posts (postId, userId, createdAt) 
         VALUES (?, ?, ${NOW_SQL})`,
        [postId, userId]
      );
    }
    
    return await this.findByPostIdAndUserId(postId, userId);
  }

  static async delete(postId, userId) {
    await db.run(`DELETE FROM saved_posts WHERE postId = ? AND userId = ?`, [postId, userId]);
    return { success: true };
  }
}
