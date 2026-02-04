import { db } from '../db.js';

export class Report {
  static async create(data) {
    const { reporterUserId, targetType, targetId, reason, description } = data;
    const NOW_SQL = db.provider === 'mysql' ? 'NOW()' : "datetime('now')";
    const result = await db.run(
      `INSERT INTO reports (reporterUserId, targetType, targetId, reason, description, status, createdAt)
       VALUES (?, ?, ?, ?, ?, 'pending', ${NOW_SQL})`,
      [reporterUserId, targetType, targetId, reason, description || null]
    );
    return await this.findById(Number(result.insertId));
  }

  static async findById(id) {
    return await db.get(
      `SELECT r.*,
              u.name as reporterName, u.email as reporterEmail,
              a.name as reviewerName
       FROM reports r
       LEFT JOIN users u ON u.id = r.reporterUserId
       LEFT JOIN users a ON a.id = r.reviewedByAdminUserId
       WHERE r.id = ?`,
      [id]
    );
  }

  static async findByTarget(targetType, targetId) {
    return await db.all(
      `SELECT r.*,
              u.name as reporterName, u.email as reporterEmail
       FROM reports r
       LEFT JOIN users u ON u.id = r.reporterUserId
       WHERE r.targetType = ? AND r.targetId = ?
       ORDER BY r.createdAt DESC`,
      [targetType, targetId]
    );
  }

  static async findAll(status = null, limit = 100, offset = 0) {
    let query = `SELECT r.*,
                        u.name as reporterName, u.email as reporterEmail,
                        a.name as reviewerName
                 FROM reports r
                 LEFT JOIN users u ON u.id = r.reporterUserId
                 LEFT JOIN users a ON a.id = r.reviewedByAdminUserId`;
    const params = [];
    
    if (status) {
      query += ' WHERE r.status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY r.createdAt DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    return await db.all(query, params);
  }

  static async countByStatus() {
    const counts = await db.all(
      `SELECT status, COUNT(*) as count
       FROM reports
       GROUP BY status`
    );
    const result = { pending: 0, reviewed: 0, resolved: 0, dismissed: 0 };
    for (const row of counts) {
      result[row.status] = Number(row.count || 0);
    }
    return result;
  }

  static async updateStatus(id, status, reviewedByAdminUserId) {
    const NOW_SQL = db.provider === 'mysql' ? 'NOW()' : "datetime('now')";
    await db.run(
      `UPDATE reports 
       SET status = ?, reviewedByAdminUserId = ?, reviewedAt = ${NOW_SQL}
       WHERE id = ?`,
      [status, reviewedByAdminUserId, id]
    );
    return await this.findById(id);
  }

  static async hasUserReported(reporterUserId, targetType, targetId) {
    const existing = await db.get(
      `SELECT id FROM reports 
       WHERE reporterUserId = ? AND targetType = ? AND targetId = ? AND status = 'pending'`,
      [reporterUserId, targetType, targetId]
    );
    return !!existing;
  }
}
