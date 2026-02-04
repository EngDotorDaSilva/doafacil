import { db } from '../db.js';

export class Center {
  static async findById(id) {
    return await db.get(`SELECT * FROM centers WHERE id = ?`, [id]);
  }

  static async findByUserId(userId) {
    return await db.get(`SELECT * FROM centers WHERE userId = ?`, [userId]);
  }

  static async create(data) {
    const { userId, displayName, address, lat, lng, hours, acceptedItemTypes, approved = 0 } = data;
    const result = await db.run(
      `INSERT INTO centers (userId, displayName, address, lat, lng, hours, acceptedItemTypes, approved)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        displayName,
        address,
        lat ?? null,
        lng ?? null,
        hours ?? null,
        JSON.stringify(acceptedItemTypes ?? []),
        approved
      ]
    );
    return await this.findById(Number(result.insertId));
  }

  static async update(id, data) {
    const fields = [];
    const values = [];
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined) {
        if (key === 'acceptedItemTypes') {
          fields.push(`${key} = ?`);
          values.push(JSON.stringify(value));
        } else {
          fields.push(`${key} = ?`);
          values.push(value);
        }
      }
    });
    if (fields.length === 0) return null;
    values.push(id);
    await db.run(`UPDATE centers SET ${fields.join(', ')} WHERE id = ?`, values);
    return await this.findById(id);
  }

  static async findAll(includePending = false) {
    const where = includePending ? '' : 'WHERE c.approved = 1';
    return await db.all(
      `SELECT c.*, u.name AS userName, u.email AS userEmail, u.avatarUrl AS userAvatarUrl
       FROM centers c
       JOIN users u ON u.id = c.userId
       ${where}
       ORDER BY c.createdAt DESC`
    );
  }

  static async findPending() {
    return await db.all(
      `SELECT c.*, u.name AS userName, u.email AS userEmail, u.avatarUrl AS userAvatarUrl
       FROM centers c
       JOIN users u ON u.id = c.userId
       WHERE c.approved = 0
       ORDER BY c.createdAt DESC`
    );
  }

  static async findNearby(lat, lng, radiusKm = 10) {
    // Simple bounding box approximation (can be improved with haversine)
    const latDelta = radiusKm / 111.0;
    const lngDelta = radiusKm / (111.0 * Math.cos((lat * Math.PI) / 180));
    return await db.all(
      `SELECT c.*, u.name AS userName, u.email AS userEmail, u.avatarUrl AS userAvatarUrl
       FROM centers c
       JOIN users u ON u.id = c.userId
       WHERE c.approved = 1
         AND c.lat BETWEEN ? AND ?
         AND c.lng BETWEEN ? AND ?
       ORDER BY c.createdAt DESC`,
      [lat - latDelta, lat + latDelta, lng - lngDelta, lng + lngDelta]
    );
  }
}
