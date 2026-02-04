import { db } from '../db.js';

export class DonationRequest {
  static async create(data) {
    const { itemId, donorUserId, centerId, message, status = 'pending' } = data;
    const NOW_SQL = db.provider === 'mysql' ? 'NOW()' : "datetime('now')";
    const result = await db.run(
      `INSERT INTO donation_requests (itemId, donorUserId, centerId, status, message, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ${NOW_SQL}, ${NOW_SQL})`,
      [itemId, donorUserId, centerId, status, message || null]
    );
    return await this.findById(result.insertId);
  }

  static async findById(id) {
    return await db.get(
      `SELECT dr.*,
              u.id as donorId, u.name as donorName, u.email as donorEmail, u.avatarUrl as donorAvatarUrl,
              ai.itemType, ai.description as itemDescription, ai.quantity as itemQuantity,
              c.displayName as centerName, c.address as centerAddress
       FROM donation_requests dr
       JOIN users u ON u.id = dr.donorUserId
       JOIN available_items ai ON ai.id = dr.itemId
       JOIN centers c ON c.id = dr.centerId
       WHERE dr.id = ?`,
      [id]
    );
  }

  static async findByDonorId(donorUserId, status = null) {
    let query = `SELECT dr.*,
                        ai.itemType, ai.description as itemDescription, ai.quantity as itemQuantity,
                        c.displayName as centerName, c.address as centerAddress
                 FROM donation_requests dr
                 JOIN available_items ai ON ai.id = dr.itemId
                 JOIN centers c ON c.id = dr.centerId
                 WHERE dr.donorUserId = ?`;
    const params = [donorUserId];
    if (status) {
      query += ' AND dr.status = ?';
      params.push(status);
    }
    query += ' ORDER BY dr.createdAt DESC';
    return await db.all(query, params);
  }

  static async findByCenterId(centerId, status = null) {
    let query = `SELECT dr.*,
                        u.id as donorId, u.name as donorName, u.email as donorEmail, u.avatarUrl as donorAvatarUrl,
                        ai.itemType, ai.description as itemDescription, ai.quantity as itemQuantity
                 FROM donation_requests dr
                 JOIN users u ON u.id = dr.donorUserId
                 JOIN available_items ai ON ai.id = dr.itemId
                 WHERE dr.centerId = ?`;
    const params = [centerId];
    if (status) {
      query += ' AND dr.status = ?';
      params.push(status);
    }
    query += ' ORDER BY dr.createdAt DESC';
    return await db.all(query, params);
  }

  static async updateStatus(id, status) {
    const NOW_SQL = db.provider === 'mysql' ? 'NOW()' : "datetime('now')";
    await db.run(
      `UPDATE donation_requests SET status = ?, updatedAt = ${NOW_SQL} WHERE id = ?`,
      [status, id]
    );
    return await this.findById(id);
  }

  static async delete(id) {
    await db.run(`DELETE FROM donation_requests WHERE id = ?`, [id]);
  }
}
