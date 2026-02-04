import { db } from '../db.js';

const NOW_SQL = db.provider === 'mysql' ? 'NOW()' : "datetime('now')";
const NOW_PLUS_15M_SQL = db.provider === 'mysql' ? 'DATE_ADD(NOW(), INTERVAL 15 MINUTE)' : "datetime('now', '+15 minutes')";

export class PasswordReset {
  static async create(userId, codeHash) {
    await db.run(
      `UPDATE password_resets SET usedAt = ${NOW_SQL} WHERE userId = ? AND usedAt IS NULL`,
      [userId]
    );
    await db.run(
      `INSERT INTO password_resets (userId, codeHash, expiresAt) VALUES (?, ?, ${NOW_PLUS_15M_SQL})`,
      [userId, codeHash]
    );
  }

  static async findValid(userId) {
    return await db.get(
      `SELECT id, codeHash
       FROM password_resets
       WHERE userId = ? AND usedAt IS NULL AND expiresAt > ${NOW_SQL}
       ORDER BY id DESC
       LIMIT 1`,
      [userId]
    );
  }

  static async markAsUsed(userId) {
    await db.run(`UPDATE password_resets SET usedAt = ${NOW_SQL} WHERE userId = ? AND usedAt IS NULL`, [userId]);
  }
}
