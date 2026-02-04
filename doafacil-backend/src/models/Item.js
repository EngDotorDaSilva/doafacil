import { db } from '../db.js';

export class Item {
  static async create(data) {
    const { centerId, itemType, description, quantity, status = 'available' } = data;
    const NOW_SQL = db.provider === 'mysql' ? 'NOW()' : "datetime('now')";
    const result = await db.run(
      `INSERT INTO available_items (centerId, itemType, description, quantity, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ${NOW_SQL}, ${NOW_SQL})`,
      [centerId, itemType, description || null, quantity || null, status]
    );
    return await this.findById(result.insertId);
  }

  static async findById(id) {
    return await db.get(`SELECT * FROM available_items WHERE id = ?`, [id]);
  }

  static async findByCenterId(centerId, status = null) {
    if (status) {
      return await db.all(
        `SELECT * FROM available_items WHERE centerId = ? AND status = ? ORDER BY createdAt DESC`,
        [centerId, status]
      );
    }
    return await db.all(
      `SELECT * FROM available_items WHERE centerId = ? ORDER BY createdAt DESC`,
      [centerId]
    );
  }

  static async findAllAvailable(itemType = null) {
    if (itemType) {
      return await db.all(
        `SELECT ai.*, c.displayName as centerName, c.address as centerAddress, c.lat as centerLat, c.lng as centerLng
         FROM available_items ai
         JOIN centers c ON c.id = ai.centerId
         WHERE ai.status = 'available' AND ai.itemType = ? AND c.approved = 1
         ORDER BY ai.createdAt DESC`,
        [itemType]
      );
    }
    return await db.all(
      `SELECT ai.*, c.displayName as centerName, c.address as centerAddress, c.lat as centerLat, c.lng as centerLng
       FROM available_items ai
       JOIN centers c ON c.id = ai.centerId
       WHERE ai.status = 'available' AND c.approved = 1
       ORDER BY ai.createdAt DESC`
    );
  }

  static async update(id, data) {
    const { itemType, description, quantity, status } = data;
    const NOW_SQL = db.provider === 'mysql' ? 'NOW()' : "datetime('now')";
    const updates = [];
    const params = [];
    if (itemType !== undefined) {
      updates.push('itemType = ?');
      params.push(itemType);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }
    if (quantity !== undefined) {
      updates.push('quantity = ?');
      params.push(quantity);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      params.push(status);
    }
    if (updates.length === 0) return await this.findById(id);
    updates.push(`updatedAt = ${NOW_SQL}`);
    params.push(id);
    await db.run(
      `UPDATE available_items SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
    return await this.findById(id);
  }

  static async delete(id) {
    await db.run(`DELETE FROM available_items WHERE id = ?`, [id]);
  }
}
