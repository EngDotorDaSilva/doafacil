import { db } from '../db.js';

const NOW_SQL = db.provider === 'mysql' ? 'NOW()' : "datetime('now')";

export class PushToken {
  static async findByUserId(userId) {
    return await db.all(`SELECT * FROM push_tokens WHERE userId = ?`, [userId]);
  }

  static async findByToken(token) {
    return await db.get(`SELECT * FROM push_tokens WHERE token = ?`, [token]);
  }

  static async upsert(userId, token, platform = null) {
    const ON_CONFLICT_SQL =
      db.provider === 'mysql'
        ? `ON DUPLICATE KEY UPDATE userId = VALUES(userId), platform = VALUES(platform), updatedAt = ${NOW_SQL}`
        : `ON CONFLICT(token) DO UPDATE SET userId = excluded.userId, platform = excluded.platform, updatedAt = ${NOW_SQL}`;
    await db.run(
      `INSERT INTO push_tokens (userId, token, platform) VALUES (?, ?, ?) ${ON_CONFLICT_SQL}`,
      [userId, token, platform]
    );
    return await this.findByToken(token);
  }

  static async deleteByToken(token) {
    await db.run(`DELETE FROM push_tokens WHERE token = ?`, [token]);
  }
}
