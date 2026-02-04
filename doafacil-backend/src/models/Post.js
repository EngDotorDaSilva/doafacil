import { db } from '../db.js';

const NOW_SQL = db.provider === 'mysql' ? 'NOW()' : "datetime('now')";

export class Post {
  static async findById(id) {
    return await db.get(`SELECT * FROM posts WHERE id = ?`, [id]);
  }

  static async findByIdWithAuthor(id) {
    return await db.get(
      `SELECT p.*, 
              u.id AS authorId, u.name AS authorName, u.role AS authorRole, u.avatarUrl AS authorAvatarUrl,
              c.id AS centerId, c.displayName AS centerName, c.approved AS centerApproved
       FROM posts p
       JOIN users u ON u.id = p.authorUserId
       LEFT JOIN centers c ON c.id = p.centerId
       WHERE p.id = ? AND p.deletedAt IS NULL`,
      [id]
    );
  }

  static async create(data) {
    const { authorUserId, centerId, text, category, imageUrl, imageUrls, lat, lng } = data;
    const imageUrlsJson = Array.isArray(imageUrls) ? JSON.stringify(imageUrls) : (imageUrls || '[]');
    const result = await db.run(
      `INSERT INTO posts (authorUserId, centerId, text, category, imageUrl, imageUrls, lat, lng)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [authorUserId, centerId ?? null, text, category, imageUrl ?? null, imageUrlsJson, lat ?? null, lng ?? null]
    );
    return await this.findById(Number(result.insertId));
  }

  static async update(id, data) {
    const fields = [];
    const values = [];
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined) {
        if (key === 'imageUrls') {
          fields.push(`${key} = ?`);
          values.push(Array.isArray(value) ? JSON.stringify(value) : value);
        } else {
          fields.push(`${key} = ?`);
          values.push(value);
        }
      }
    });
    if (fields.length === 0) return null;
    fields.push(`updatedAt = ${NOW_SQL}`);
    values.push(id);
    await db.run(`UPDATE posts SET ${fields.join(', ')} WHERE id = ?`, values);
    return await this.findById(id);
  }

  static async softDelete(id, adminUserId = null, reason = null) {
    await db.run(
      `UPDATE posts SET deletedAt = ${NOW_SQL}, deletedByAdminUserId = ?, deletedReason = ? WHERE id = ?`,
      [adminUserId, reason, id]
    );
    return await this.findById(id);
  }

  static async restore(id) {
    await db.run(`UPDATE posts SET deletedAt = NULL, deletedByAdminUserId = NULL, deletedReason = NULL WHERE id = ?`, [id]);
    return await this.findById(id);
  }

  static async findAll(filters = {}) {
    const { category, lat, lng, radiusKm, cursor, limit = 20 } = filters;
    let where = 'p.deletedAt IS NULL';
    const params = [];

    if (category) {
      where += ' AND p.category = ?';
      params.push(category);
    }

    if (lat && lng && radiusKm) {
      const latDelta = radiusKm / 111.0;
      const lngDelta = radiusKm / (111.0 * Math.cos((lat * Math.PI) / 180));
      where += ' AND p.lat BETWEEN ? AND ? AND p.lng BETWEEN ? AND ?';
      params.push(lat - latDelta, lat + latDelta, lng - lngDelta, lng + lngDelta);
    }

    if (cursor) {
      where += ' AND p.id < ?';
      params.push(cursor);
    }

    const orderBy = cursor ? 'p.id DESC' : 'p.createdAt DESC';

    return await db.all(
      `SELECT p.*,
              u.id AS authorId, u.name AS authorName, u.role AS authorRole, u.avatarUrl AS authorAvatarUrl,
              c.id AS centerId, c.displayName AS centerName,
              (SELECT COUNT(*) FROM comments cm WHERE cm.postId = p.id AND cm.deletedAt IS NULL) AS commentCount
       FROM posts p
       JOIN users u ON u.id = p.authorUserId
       LEFT JOIN centers c ON c.id = p.centerId
       WHERE ${where}
       ORDER BY ${orderBy}
       LIMIT ?`,
      [...params, limit + 1]
    );
  }

  static async findByAuthor(authorUserId) {
    return await db.all(
      `SELECT p.*,
              (SELECT COUNT(*) FROM comments cm WHERE cm.postId = p.id AND cm.deletedAt IS NULL) AS commentCount
       FROM posts p
       WHERE p.authorUserId = ? AND p.deletedAt IS NULL
       ORDER BY p.createdAt DESC`,
      [authorUserId]
    );
  }

  static async findAllForAdmin(limit = 500) {
    return await db.all(
      `SELECT p.id, p.text, p.category, p.imageUrl, p.imageUrls, p.createdAt, p.updatedAt,
              p.deletedAt, p.deletedByAdminUserId, p.deletedReason,
              (SELECT COUNT(*) FROM comments cm WHERE cm.postId = p.id AND cm.deletedAt IS NULL) AS commentCount,
              u.id AS authorId, u.name AS authorName, u.role AS authorRole, u.avatarUrl AS authorAvatarUrl,
              c.id AS centerId, c.displayName AS centerName, c.approved AS centerApproved
       FROM posts p
       JOIN users u ON u.id = p.authorUserId
       LEFT JOIN centers c ON c.id = p.centerId
       ORDER BY p.createdAt DESC
       LIMIT ?`,
      [limit]
    );
  }
}
