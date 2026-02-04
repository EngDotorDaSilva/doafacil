import { db } from '../db.js';

export class Reaction {
  static async getByPostId(postId) {
    return await db.all(
      `SELECT r.*, u.name as userName 
       FROM reactions r
       JOIN users u ON r.userId = u.id
       WHERE r.postId = ?
       ORDER BY r.createdAt DESC`,
      [postId]
    );
  }

  static async getByPostIdAndUserId(postId, userId) {
    return await db.get(
      `SELECT * FROM reactions WHERE postId = ? AND userId = ?`,
      [postId, userId]
    );
  }

  static async getCountsByPostId(postId) {
    const counts = await db.all(
      `SELECT type, COUNT(*) as count 
       FROM reactions 
       WHERE postId = ?
       GROUP BY type`,
      [postId]
    );
    
    const result = { like: 0, love: 0, dislike: 0 };
    for (const row of counts) {
      result[row.type] = Number(row.count || 0);
    }
    return result;
  }

  static async getCountsByPostIds(postIds) {
    if (!postIds || postIds.length === 0) return {};
    
    const placeholders = postIds.map(() => '?').join(',');
    const counts = await db.all(
      `SELECT postId, type, COUNT(*) as count 
       FROM reactions 
       WHERE postId IN (${placeholders})
       GROUP BY postId, type`,
      postIds
    );
    
    const result = {};
    for (const postId of postIds) {
      result[postId] = { like: 0, love: 0, dislike: 0 };
    }
    
    for (const row of counts) {
      if (result[row.postId]) {
        result[row.postId][row.type] = Number(row.count || 0);
      }
    }
    
    return result;
  }

  static async getUserReactionsByPostIds(postIds, userId) {
    if (!postIds || postIds.length === 0) return {};
    
    const placeholders = postIds.map(() => '?').join(',');
    const reactions = await db.all(
      `SELECT postId, type 
       FROM reactions 
       WHERE postId IN (${placeholders}) AND userId = ?`,
      [...postIds, userId]
    );
    
    const result = {};
    for (const row of reactions) {
      result[row.postId] = row.type;
    }
    
    return result;
  }

  static async create(postId, userId, type) {
    const NOW_SQL = db.provider === 'mysql' ? 'NOW()' : "datetime('now')";
    
    // Try to update if exists, otherwise insert
    if (db.provider === 'mysql') {
      await db.run(
        `INSERT INTO reactions (postId, userId, type, createdAt) 
         VALUES (?, ?, ?, ${NOW_SQL})
         ON DUPLICATE KEY UPDATE type = VALUES(type), createdAt = ${NOW_SQL}`,
        [postId, userId, type]
      );
    } else {
      // SQLite: delete and insert
      await db.run(`DELETE FROM reactions WHERE postId = ? AND userId = ?`, [postId, userId]);
      await db.run(
        `INSERT INTO reactions (postId, userId, type, createdAt) 
         VALUES (?, ?, ?, ${NOW_SQL})`,
        [postId, userId, type]
      );
    }
    
    return await this.getByPostIdAndUserId(postId, userId);
  }

  static async delete(postId, userId) {
    await db.run(`DELETE FROM reactions WHERE postId = ? AND userId = ?`, [postId, userId]);
    return { success: true };
  }
}
