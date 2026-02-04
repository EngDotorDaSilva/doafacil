import { db } from '../db.js';

export class User {
  static async findById(id) {
    return await db.get(`SELECT * FROM users WHERE id = ?`, [id]);
  }

  static async findByEmail(email) {
    return await db.get(`SELECT * FROM users WHERE email = ?`, [email.toLowerCase()]);
  }

  static async create(data) {
    const { name, email, passwordHash, role, phone, avatarUrl, lat, lng } = data;
    const result = await db.run(
      `INSERT INTO users (name, email, passwordHash, role, phone, avatarUrl, lat, lng) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, email.toLowerCase(), passwordHash, role, phone ?? null, avatarUrl ?? null, lat ?? null, lng ?? null]
    );
    return await this.findById(Number(result.insertId));
  }

  static async update(id, data) {
    const fields = [];
    const values = [];
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    });
    if (fields.length === 0) return null;
    values.push(id);
    await db.run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
    return await this.findById(id);
  }

  static async findPublic(id) {
    return await db.get(
      `SELECT id, name, email, role, phone, avatarUrl, lat, lng, createdAt 
       FROM users WHERE id = ? AND deletedAt IS NULL`,
      [id]
    );
  }

  static async findAll(limit = 100) {
    return await db.all(
      `SELECT id, name, email, role, phone, avatarUrl, lat, lng, isBlocked, blockedAt, 
              blockedReason, deletedAt, deletedByAdminUserId, deletedReason, createdAt 
       FROM users ORDER BY createdAt DESC LIMIT ?`,
      [limit]
    );
  }

  static async findBlocked() {
    return await db.all(
      `SELECT id, name, email, role, isBlocked, blockedAt, blockedReason, deletedAt 
       FROM users WHERE isBlocked = 1 OR deletedAt IS NOT NULL ORDER BY createdAt DESC`
    );
  }
}
