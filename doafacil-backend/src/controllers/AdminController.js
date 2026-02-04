import { z } from 'zod';
import { User } from '../models/User.js';
import { Center } from '../models/Center.js';
import { Post } from '../models/Post.js';
import { Comment } from '../models/Comment.js';
import { ModerationLog } from '../models/ModerationLog.js';
import { DonationRequest } from '../models/DonationRequest.js';
import { db } from '../db.js';
import { safeJsonParse } from '../utils/helpers.js';

const NOW_SQL = db.provider === 'mysql' ? 'NOW()' : "datetime('now')";

export class AdminController {
  // Centers
  static async getPendingCenters(req, res) {
    const centers = await Center.findPending();
    const centersFormatted = centers.map((c) => ({
      ...c,
      acceptedItemTypes: safeJsonParse(c.acceptedItemTypes, [])
    }));
    return res.json({ centers: centersFormatted });
  }

  static async approveCenter(req, res, io) {
    const id = Number(req.params.id);
    const center = await Center.findById(id);
    if (!center) return res.status(404).json({ error: 'Not found' });

    await Center.update(id, { approved: 1 });
    await ModerationLog.create({
      adminUserId: req.auth.userId,
      action: 'center.approve',
      targetType: 'center',
      targetId: id
    });
    
    // Emit event to notify all clients that a center was approved
    const updatedCenter = await Center.findById(id);
    if (updatedCenter) {
      const centerWithUser = await db.get(
        `SELECT c.*, u.name AS userName, u.email AS userEmail, u.avatarUrl AS userAvatarUrl
         FROM centers c
         JOIN users u ON u.id = c.userId
         WHERE c.id = ?`,
        [id]
      );
      if (centerWithUser) {
        const centerData = {
          ...centerWithUser,
          acceptedItemTypes: safeJsonParse(centerWithUser.acceptedItemTypes, [])
        };
        io.emit('center:approved', { center: centerData });
      }
    }
    
    return res.json({ ok: true });
  }

  // Users
  static async getUsers(req, res) {
    const role = req.query.role ? String(req.query.role) : null;
    const includeDeleted = String(req.query.includeDeleted || '') === '1';
    const search = req.query.search ? String(req.query.search).trim() : null;
    const isBlocked = req.query.isBlocked ? String(req.query.isBlocked) : null;
    const dateFrom = req.query.dateFrom ? String(req.query.dateFrom) : null;
    const dateTo = req.query.dateTo ? String(req.query.dateTo) : null;
    const limit = req.query.limit ? Math.min(500, Math.max(1, Number(req.query.limit))) : 200;
    const offset = req.query.offset ? Math.max(0, Number(req.query.offset)) : 0;
    const sortBy = req.query.sortBy ? String(req.query.sortBy) : 'createdAt'; // createdAt, name, email
    const sortOrder = req.query.sortOrder === 'asc' ? 'ASC' : 'DESC';

    const where = [];
    const params = [];

    if (role) {
      where.push('role = ?');
      params.push(role);
    }
    if (!includeDeleted) {
      where.push('deletedAt IS NULL');
    }
    if (isBlocked === '1') {
      where.push('isBlocked = 1');
    } else if (isBlocked === '0') {
      where.push('isBlocked = 0');
    }
    if (search && search.length > 0) {
      where.push('(name LIKE ? OR email LIKE ?)');
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }
    if (dateFrom) {
      where.push('DATE(createdAt) >= ?');
      params.push(dateFrom);
    }
    if (dateTo) {
      where.push('DATE(createdAt) <= ?');
      params.push(dateTo);
    }

    const whereClause = where.length > 0 ? where.join(' AND ') : '1=1';

    let orderClause = 'ORDER BY createdAt DESC';
    if (sortBy === 'name') {
      orderClause = `ORDER BY name ${sortOrder}`;
    } else if (sortBy === 'email') {
      orderClause = `ORDER BY email ${sortOrder}`;
    } else {
      orderClause = `ORDER BY createdAt ${sortOrder}`;
    }

    const users = await db.all(
      `SELECT id, name, email, role, phone, avatarUrl, lat, lng,
              isBlocked, blockedAt, blockedReason,
              deletedAt, deletedByAdminUserId, deletedReason,
              createdAt
       FROM users WHERE ${whereClause} ${orderClause} LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const total = await db.get(
      `SELECT COUNT(*) as cnt FROM users WHERE ${whereClause}`,
      params
    );

    return res.json({ users, total: Number(total?.cnt || 0), limit, offset });
  }

  static async blockUser(req, res) {
    const id = Number(req.params.id);
    const schema = z.object({ reason: z.string().min(1).optional() }).strict();
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body' });

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: 'Not found' });
    if (user.role === 'admin') return res.status(400).json({ error: 'Cannot block admin' });
    if (user.deletedAt) return res.status(400).json({ error: 'UserDeleted' });

    const NOW_SQL_VAL = db.provider === 'mysql' ? 'NOW()' : "datetime('now')";
    await db.run(`UPDATE users SET isBlocked = 1, blockedAt = ${NOW_SQL_VAL}, blockedReason = ? WHERE id = ?`, [
      parsed.data.reason ?? null,
      id
    ]);

    await ModerationLog.create({
      adminUserId: req.auth.userId,
      action: 'user.block',
      targetType: 'user',
      targetId: id,
      reason: parsed.data.reason ?? null
    });
    return res.json({ ok: true });
  }

  static async unblockUser(req, res) {
    const id = Number(req.params.id);
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: 'Not found' });

    await User.update(id, {
      isBlocked: 0,
      blockedAt: null,
      blockedReason: null
    });

    await ModerationLog.create({
      adminUserId: req.auth.userId,
      action: 'user.unblock',
      targetType: 'user',
      targetId: id
    });
    return res.json({ ok: true });
  }

  static async deleteUser(req, res) {
    const id = Number(req.params.id);
    const schema = z.object({ reason: z.string().min(1).optional() }).strict();
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body' });

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: 'Not found' });
    if (user.role === 'admin') return res.status(400).json({ error: 'Cannot delete admin' });
    if (user.deletedAt) return res.json({ ok: true });

    const NOW_SQL_VAL = db.provider === 'mysql' ? 'NOW()' : "datetime('now')";
    await db.run(
      `UPDATE users SET deletedAt = ${NOW_SQL_VAL}, deletedByAdminUserId = ?, deletedReason = ? WHERE id = ?`,
      [req.auth.userId, parsed.data.reason ?? null, id]
    );

    await ModerationLog.create({
      adminUserId: req.auth.userId,
      action: 'user.soft_delete',
      targetType: 'user',
      targetId: id,
      reason: parsed.data.reason ?? null
    });
    return res.json({ ok: true });
  }

  static async restoreUser(req, res) {
    const id = Number(req.params.id);
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: 'Not found' });
    if (user.role === 'admin') return res.status(400).json({ error: 'Cannot restore admin' });

    await User.update(id, {
      deletedAt: null,
      deletedByAdminUserId: null,
      deletedReason: null
    });

    await ModerationLog.create({
      adminUserId: req.auth.userId,
      action: 'user.restore',
      targetType: 'user',
      targetId: id
    });
    return res.json({ ok: true });
  }

  static async hardDeleteUser(req, res) {
    const id = Number(req.params.id);
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: 'Not found' });
    if (user.role === 'admin') return res.status(400).json({ error: 'Cannot delete admin' });

    await db.run(`DELETE FROM users WHERE id = ?`, [id]);
    await ModerationLog.create({
      adminUserId: req.auth.userId,
      action: 'user.hard_delete',
      targetType: 'user',
      targetId: id
    });
    return res.json({ ok: true });
  }

  // Posts
  static async getPosts(req, res) {
    const search = req.query.search ? String(req.query.search).trim() : null;
    const category = req.query.category ? String(req.query.category) : null;
    const includeDeleted = String(req.query.includeDeleted || '') === '1';
    const dateFrom = req.query.dateFrom ? String(req.query.dateFrom) : null;
    const dateTo = req.query.dateTo ? String(req.query.dateTo) : null;
    const limit = req.query.limit ? Math.min(500, Math.max(1, Number(req.query.limit))) : 200;
    const offset = req.query.offset ? Math.max(0, Number(req.query.offset)) : 0;
    const sortBy = req.query.sortBy ? String(req.query.sortBy) : 'createdAt'; // createdAt, commentCount
    const sortOrder = req.query.sortOrder === 'asc' ? 'ASC' : 'DESC';

    let where = [];
    const params = [];

    if (!includeDeleted) {
      where.push('p.deletedAt IS NULL');
    }
    if (category) {
      where.push('p.category = ?');
      params.push(category);
    }
    if (search && search.length > 0) {
      where.push('(p.text LIKE ? OR u.name LIKE ?)');
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }
    if (dateFrom) {
      where.push('DATE(p.createdAt) >= ?');
      params.push(dateFrom);
    }
    if (dateTo) {
      where.push('DATE(p.createdAt) <= ?');
      params.push(dateTo);
    }

    const whereClause = where.length > 0 ? where.join(' AND ') : '1=1';

    let orderClause = 'ORDER BY p.createdAt DESC';
    if (sortBy === 'commentCount') {
      orderClause = `ORDER BY commentCount ${sortOrder}, p.createdAt DESC`;
    } else {
      orderClause = `ORDER BY p.createdAt ${sortOrder}`;
    }

    const rows = await db.all(
      `SELECT 
        p.id, p.text, p.category, p.imageUrl, p.imageUrls,
        p.createdAt, p.updatedAt, p.deletedAt, p.deletedByAdminUserId, p.deletedReason,
        u.id as authorId, u.name as authorName, u.role as authorRole, u.avatarUrl as authorAvatarUrl,
        p.centerId, c.displayName as centerName, c.approved as centerApproved,
        (SELECT COUNT(*) FROM comments WHERE postId = p.id AND deletedAt IS NULL) as commentCount
       FROM posts p
       LEFT JOIN users u ON u.id = p.authorUserId
       LEFT JOIN centers c ON c.id = p.centerId
       WHERE ${whereClause}
       ${orderClause}
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const total = await db.get(
      `SELECT COUNT(*) as cnt FROM posts p
       LEFT JOIN users u ON u.id = p.authorUserId
       WHERE ${whereClause}`,
      params
    );
    const posts = rows.map((r) => ({
      id: r.id,
      text: r.text,
      category: r.category,
      imageUrl: r.imageUrl,
      imageUrls: safeJsonParse(r.imageUrls, []),
      commentCount: Number(r.commentCount || 0),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      deletedAt: r.deletedAt,
      deletedByAdminUserId: r.deletedByAdminUserId,
      deletedReason: r.deletedReason,
      author: {
        id: r.authorId,
        name: r.authorName,
        role: r.authorRole,
        avatarUrl: r.authorAvatarUrl
      },
      center: r.centerId
        ? {
            id: r.centerId,
            displayName: r.centerName,
            approved: !!r.centerApproved
          }
        : null
    }));
    return res.json({ posts, total: Number(total?.cnt || 0), limit, offset });
  }

  static async deletePost(req, res, io) {
    const id = Number(req.params.id);
    const schema = z.object({ reason: z.string().min(1).optional() }).strict();
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body' });

    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ error: 'Not found' });
    if (post.deletedAt) return res.json({ ok: true });

    await Post.softDelete(id, req.auth.userId, parsed.data.reason ?? null);
    io.emit('post:deleted', { postId: id });

    await ModerationLog.create({
      adminUserId: req.auth.userId,
      action: 'post.soft_delete',
      targetType: 'post',
      targetId: id,
      reason: parsed.data.reason ?? null
    });
    return res.json({ ok: true });
  }

  static async restorePost(req, res, io) {
    const id = Number(req.params.id);
    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ error: 'Not found' });

    await Post.restore(id);
    io.emit('post:restored', { postId: id });

    await ModerationLog.create({
      adminUserId: req.auth.userId,
      action: 'post.restore',
      targetType: 'post',
      targetId: id
    });
    return res.json({ ok: true });
  }

  // Comments
  static async getComments(req, res) {
    const limit = req.query.limit ? Math.min(500, Math.max(1, Number(req.query.limit))) : 200;
    const offset = req.query.offset ? Math.max(0, Number(req.query.offset)) : 0;
    const postId = req.query.postId ? Number(req.query.postId) : null;
    const includeDeleted = String(req.query.includeDeleted || '') === '1';
    const search = req.query.search ? String(req.query.search).trim() : null;
    const dateFrom = req.query.dateFrom ? String(req.query.dateFrom) : null;
    const dateTo = req.query.dateTo ? String(req.query.dateTo) : null;
    const sortBy = req.query.sortBy ? String(req.query.sortBy) : 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 'ASC' : 'DESC';

    const where = [];
    const params = [];

    if (postId && Number.isFinite(postId)) {
      where.push('c.postId = ?');
      params.push(postId);
    }
    if (!includeDeleted) {
      where.push('c.deletedAt IS NULL');
    }
    if (search && search.length > 0) {
      where.push('(c.text LIKE ? OR u.name LIKE ?)');
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }
    if (dateFrom) {
      where.push('DATE(c.createdAt) >= ?');
      params.push(dateFrom);
    }
    if (dateTo) {
      where.push('DATE(c.createdAt) <= ?');
      params.push(dateTo);
    }

    const whereClause = where.length > 0 ? where.join(' AND ') : '1=1';

    let orderClause = 'ORDER BY c.createdAt DESC';
    if (sortBy === 'postId') {
      orderClause = `ORDER BY c.postId ${sortOrder}, c.createdAt DESC`;
    } else {
      orderClause = `ORDER BY c.createdAt ${sortOrder}`;
    }

    const comments = await db.all(
      `SELECT 
        c.id, c.postId, c.text, c.createdAt, c.updatedAt,
        c.deletedAt, c.deletedByAdminUserId, c.deletedReason,
        u.id as authorId, u.name as authorName, u.role as authorRole, u.avatarUrl as authorAvatarUrl,
        p.category as postCategory, p.createdAt as postCreatedAt
       FROM comments c
       LEFT JOIN users u ON u.id = c.authorUserId
       LEFT JOIN posts p ON p.id = c.postId
       WHERE ${whereClause}
       ${orderClause}
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const total = await db.get(
      `SELECT COUNT(*) as cnt FROM comments c
       LEFT JOIN users u ON u.id = c.authorUserId
       WHERE ${whereClause}`,
      params
    );

    let filtered = comments;

    const commentsFormatted = filtered.map((c) => ({
      id: c.id,
      postId: c.postId,
      text: c.text,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      deletedAt: c.deletedAt,
      deletedByAdminUserId: c.deletedByAdminUserId,
      deletedReason: c.deletedReason,
      author: {
        id: c.authorId,
        name: c.authorName,
        role: c.authorRole,
        avatarUrl: c.authorAvatarUrl
      },
      post: {
        category: c.postCategory,
        createdAt: c.postCreatedAt
      }
    }));

    return res.json({ comments: commentsFormatted, total: Number(total?.cnt || 0), limit, offset });
  }

  static async deleteComment(req, res, io) {
    const id = Number(req.params.id);
    const schema = z.object({ reason: z.string().min(1).optional() }).strict();
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body' });

    const comment = await Comment.findById(id);
    if (!comment) return res.status(404).json({ error: 'Not found' });
    if (comment.deletedAt) return res.json({ ok: true });

    await Comment.softDelete(id, req.auth.userId, parsed.data.reason ?? null);

    const cntRow = await db.get(`SELECT COUNT(*) as cnt FROM comments WHERE postId = ? AND deletedAt IS NULL`, [
      comment.postId
    ]);
    const commentCount = Number(cntRow?.cnt || 0);
    io.emit('comment:deleted', { postId: comment.postId, commentId: id, commentCount });
    io.emit('post:commentCount', { postId: comment.postId, commentCount });

    await ModerationLog.create({
      adminUserId: req.auth.userId,
      action: 'comment.soft_delete',
      targetType: 'comment',
      targetId: id,
      reason: parsed.data.reason ?? null,
      meta: { postId: comment.postId }
    });
    return res.json({ ok: true });
  }

  static async restoreComment(req, res, io) {
    const id = Number(req.params.id);
    const comment = await Comment.findById(id);
    if (!comment) return res.status(404).json({ error: 'Not found' });

    await Comment.restore(id);

    const cntRow = await db.get(`SELECT COUNT(*) as cnt FROM comments WHERE postId = ? AND deletedAt IS NULL`, [
      comment.postId
    ]);
    const commentCount = Number(cntRow?.cnt || 0);
    io.emit('post:commentCount', { postId: comment.postId, commentCount });
    io.emit('comment:restored', { postId: comment.postId, commentId: id, commentCount });

    await ModerationLog.create({
      adminUserId: req.auth.userId,
      action: 'comment.restore',
      targetType: 'comment',
      targetId: id,
      meta: { postId: comment.postId }
    });
    return res.json({ ok: true });
  }

  // Dashboard Statistics
  static async getStats(req, res) {
    const stats = {
      users: {
        total: 0,
        active: 0,
        blocked: 0,
        deleted: 0,
        byRole: { donor: 0, center: 0, admin: 0 }
      },
      posts: {
        total: 0,
        active: 0,
        deleted: 0,
        withComments: 0
      },
      comments: {
        total: 0,
        active: 0,
        deleted: 0
      },
      centers: {
        total: 0,
        approved: 0,
        pending: 0
      },
      moderation: {
        logsLast24h: 0,
        logsLast7d: 0,
        logsLast30d: 0
      }
    };

    // Users stats
    const userStats = await db.all(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN deletedAt IS NULL THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN isBlocked = 1 AND deletedAt IS NULL THEN 1 ELSE 0 END) as blocked,
        SUM(CASE WHEN deletedAt IS NOT NULL THEN 1 ELSE 0 END) as deleted,
        SUM(CASE WHEN role = 'donor' AND deletedAt IS NULL THEN 1 ELSE 0 END) as donor,
        SUM(CASE WHEN role = 'center' AND deletedAt IS NULL THEN 1 ELSE 0 END) as center,
        SUM(CASE WHEN role = 'admin' AND deletedAt IS NULL THEN 1 ELSE 0 END) as admin
       FROM users`
    );
    if (userStats[0]) {
      stats.users.total = Number(userStats[0].total || 0);
      stats.users.active = Number(userStats[0].active || 0);
      stats.users.blocked = Number(userStats[0].blocked || 0);
      stats.users.deleted = Number(userStats[0].deleted || 0);
      stats.users.byRole.donor = Number(userStats[0].donor || 0);
      stats.users.byRole.center = Number(userStats[0].center || 0);
      stats.users.byRole.admin = Number(userStats[0].admin || 0);
    }

    // Posts stats
    const postStats = await db.all(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN deletedAt IS NULL THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN deletedAt IS NOT NULL THEN 1 ELSE 0 END) as deleted
       FROM posts`
    );
    if (postStats[0]) {
      stats.posts.total = Number(postStats[0].total || 0);
      stats.posts.active = Number(postStats[0].active || 0);
      stats.posts.deleted = Number(postStats[0].deleted || 0);
    }

    const postsWithComments = await db.get(
      `SELECT COUNT(DISTINCT postId) as cnt FROM comments WHERE deletedAt IS NULL`
    );
    stats.posts.withComments = Number(postsWithComments?.cnt || 0);

    // Comments stats
    const commentStats = await db.all(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN deletedAt IS NULL THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN deletedAt IS NOT NULL THEN 1 ELSE 0 END) as deleted
       FROM comments`
    );
    if (commentStats[0]) {
      stats.comments.total = Number(commentStats[0].total || 0);
      stats.comments.active = Number(commentStats[0].active || 0);
      stats.comments.deleted = Number(commentStats[0].deleted || 0);
    }

    // Centers stats
    const centerStats = await db.all(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN approved = 1 THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN approved = 0 THEN 1 ELSE 0 END) as pending
       FROM centers`
    );
    if (centerStats[0]) {
      stats.centers.total = Number(centerStats[0].total || 0);
      stats.centers.approved = Number(centerStats[0].approved || 0);
      stats.centers.pending = Number(centerStats[0].pending || 0);
    }

    // Moderation logs stats
    const NOW_SQL_VAL = db.provider === 'mysql' ? 'NOW()' : "datetime('now')";
    const log24h = await db.get(
      `SELECT COUNT(*) as cnt FROM moderation_logs 
       WHERE createdAt >= ${db.provider === 'mysql' ? 'DATE_SUB(NOW(), INTERVAL 24 HOUR)' : "datetime('now', '-24 hours')"}`
    );
    stats.moderation.logsLast24h = Number(log24h?.cnt || 0);

    const log7d = await db.get(
      `SELECT COUNT(*) as cnt FROM moderation_logs 
       WHERE createdAt >= ${db.provider === 'mysql' ? 'DATE_SUB(NOW(), INTERVAL 7 DAY)' : "datetime('now', '-7 days')"}`
    );
    stats.moderation.logsLast7d = Number(log7d?.cnt || 0);

    const log30d = await db.get(
      `SELECT COUNT(*) as cnt FROM moderation_logs 
       WHERE createdAt >= ${db.provider === 'mysql' ? 'DATE_SUB(NOW(), INTERVAL 30 DAY)' : "datetime('now', '-30 days')"}`
    );
    stats.moderation.logsLast30d = Number(log30d?.cnt || 0);

    return res.json({ stats });
  }

  // Reports and Analytics
  static async getReports(req, res) {
    const period = req.query.period || 'all'; // 'all', 'today', 'week', 'month', 'year'
    const limit = req.query.limit ? Math.min(50, Math.max(1, Number(req.query.limit))) : 10;

    const NOW_SQL = db.provider === 'mysql' ? 'NOW()' : "datetime('now')";
    let dateFilter = '';
    if (period === 'today') {
      dateFilter = db.provider === 'mysql' 
        ? "AND DATE(createdAt) = CURDATE()"
        : "AND DATE(createdAt) = DATE('now')";
    } else if (period === 'week') {
      dateFilter = db.provider === 'mysql'
        ? "AND createdAt >= DATE_SUB(NOW(), INTERVAL 7 DAY)"
        : "AND createdAt >= datetime('now', '-7 days')";
    } else if (period === 'month') {
      dateFilter = db.provider === 'mysql'
        ? "AND createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)"
        : "AND createdAt >= datetime('now', '-30 days')";
    } else if (period === 'year') {
      dateFilter = db.provider === 'mysql'
        ? "AND createdAt >= DATE_SUB(NOW(), INTERVAL 365 DAY)"
        : "AND createdAt >= datetime('now', '-365 days')";
    }

    const reports = {
      totalDonations: {
        total: 0,
        completed: 0,
        pending: 0,
        accepted: 0,
        cancelled: 0,
        byPeriod: []
      },
      topCenters: [],
      topDonors: [],
      donationsByPeriod: [],
      topPosts: []
    };

    // Total de doações
    const donationStats = await db.all(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) as accepted,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
       FROM donation_requests
       WHERE 1=1 ${dateFilter}`
    );
    if (donationStats[0]) {
      reports.totalDonations.total = Number(donationStats[0].total || 0);
      reports.totalDonations.completed = Number(donationStats[0].completed || 0);
      reports.totalDonations.pending = Number(donationStats[0].pending || 0);
      reports.totalDonations.accepted = Number(donationStats[0].accepted || 0);
      reports.totalDonations.cancelled = Number(donationStats[0].cancelled || 0);
    }

    // Doações por período (últimos 12 meses ou período selecionado)
    const donationsByPeriod = await db.all(
      db.provider === 'mysql'
        ? `SELECT 
            DATE_FORMAT(createdAt, '%Y-%m') as period,
            COUNT(*) as count,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
           FROM donation_requests
           WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
           GROUP BY DATE_FORMAT(createdAt, '%Y-%m')
           ORDER BY period DESC
           LIMIT 12`
        : `SELECT 
            strftime('%Y-%m', createdAt) as period,
            COUNT(*) as count,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
           FROM donation_requests
           WHERE createdAt >= datetime('now', '-12 months')
           GROUP BY strftime('%Y-%m', createdAt)
           ORDER BY period DESC
           LIMIT 12`
    );
    reports.donationsByPeriod = donationsByPeriod.map((row) => ({
      period: row.period,
      total: Number(row.count || 0),
      completed: Number(row.completed || 0)
    }));

    // Centros mais ativos (por número de doações recebidas)
    const topCentersQuery = dateFilter
      ? `SELECT 
          c.id,
          c.displayName,
          c.address,
          COUNT(dr.id) as donationCount,
          SUM(CASE WHEN dr.status = 'completed' THEN 1 ELSE 0 END) as completedCount
         FROM centers c
         LEFT JOIN donation_requests dr ON dr.centerId = c.id ${dateFilter}
         WHERE c.approved = 1
         GROUP BY c.id, c.displayName, c.address
         ORDER BY donationCount DESC, completedCount DESC
         LIMIT ?`
      : `SELECT 
          c.id,
          c.displayName,
          c.address,
          COUNT(dr.id) as donationCount,
          SUM(CASE WHEN dr.status = 'completed' THEN 1 ELSE 0 END) as completedCount
         FROM centers c
         LEFT JOIN donation_requests dr ON dr.centerId = c.id
         WHERE c.approved = 1
         GROUP BY c.id, c.displayName, c.address
         ORDER BY donationCount DESC, completedCount DESC
         LIMIT ?`;
    const topCenters = await db.all(topCentersQuery, [limit]);
    reports.topCenters = topCenters.map((row) => ({
      id: row.id,
      name: row.displayName,
      address: row.address,
      donationCount: Number(row.donationCount || 0),
      completedCount: Number(row.completedCount || 0)
    }));

    // Doadores mais ativos (por número de pedidos de doação)
    const topDonorsQuery = dateFilter
      ? `SELECT 
          u.id,
          u.name,
          u.email,
          COUNT(dr.id) as requestCount,
          SUM(CASE WHEN dr.status = 'completed' THEN 1 ELSE 0 END) as completedCount
         FROM users u
         LEFT JOIN donation_requests dr ON dr.donorUserId = u.id ${dateFilter}
         WHERE u.role = 'donor' AND u.deletedAt IS NULL
         GROUP BY u.id, u.name, u.email
         ORDER BY requestCount DESC, completedCount DESC
         LIMIT ?`
      : `SELECT 
          u.id,
          u.name,
          u.email,
          COUNT(dr.id) as requestCount,
          SUM(CASE WHEN dr.status = 'completed' THEN 1 ELSE 0 END) as completedCount
         FROM users u
         LEFT JOIN donation_requests dr ON dr.donorUserId = u.id
         WHERE u.role = 'donor' AND u.deletedAt IS NULL
         GROUP BY u.id, u.name, u.email
         ORDER BY requestCount DESC, completedCount DESC
         LIMIT ?`;
    const topDonors = await db.all(topDonorsQuery, [limit]);
    reports.topDonors = topDonors.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      requestCount: Number(row.requestCount || 0),
      completedCount: Number(row.completedCount || 0)
    }));

    // Publicações mais reagidas
    const topPostsQuery = dateFilter
      ? `SELECT 
          p.id,
          p.text,
          p.category,
          p.createdAt,
          u.name as authorName,
          c.displayName as centerName,
          COUNT(DISTINCT r.id) as reactionCount,
          COUNT(DISTINCT cm.id) as commentCount
         FROM posts p
         LEFT JOIN users u ON u.id = p.authorUserId
         LEFT JOIN centers c ON c.id = p.centerId
         LEFT JOIN reactions r ON r.postId = p.id
         LEFT JOIN comments cm ON cm.postId = p.id AND cm.deletedAt IS NULL
         WHERE p.deletedAt IS NULL ${dateFilter.replace('createdAt', 'p.createdAt')}
         GROUP BY p.id, p.text, p.category, p.createdAt, u.name, c.displayName
         ORDER BY reactionCount DESC, commentCount DESC
         LIMIT ?`
      : `SELECT 
          p.id,
          p.text,
          p.category,
          p.createdAt,
          u.name as authorName,
          c.displayName as centerName,
          COUNT(DISTINCT r.id) as reactionCount,
          COUNT(DISTINCT cm.id) as commentCount
         FROM posts p
         LEFT JOIN users u ON u.id = p.authorUserId
         LEFT JOIN centers c ON c.id = p.centerId
         LEFT JOIN reactions r ON r.postId = p.id
         LEFT JOIN comments cm ON cm.postId = p.id AND cm.deletedAt IS NULL
         WHERE p.deletedAt IS NULL
         GROUP BY p.id, p.text, p.category, p.createdAt, u.name, c.displayName
         ORDER BY reactionCount DESC, commentCount DESC
         LIMIT ?`;
    const topPosts = await db.all(topPostsQuery, [limit]);
    reports.topPosts = topPosts.map((row) => {
      const postCommentCount = Number(row.commentCount || 0);
      return {
        id: row.id,
        text: row.text ? (row.text.length > 100 ? row.text.substring(0, 100) + '...' : row.text) : '',
        category: row.category,
        authorName: row.authorName,
        centerName: row.centerName,
        reactionCount: Number(row.reactionCount || 0),
        commentCount: postCommentCount,
        createdAt: row.createdAt
      };
    });

    return res.json({ reports, period });
  }

  // Moderation Logs
  static async getModerationLogs(req, res) {
    const limit = req.query.limit ? Math.min(500, Math.max(1, Number(req.query.limit))) : 200;
    const offset = req.query.offset ? Math.max(0, Number(req.query.offset)) : 0;
    const action = req.query.action ? String(req.query.action) : null;
    const targetType = req.query.targetType ? String(req.query.targetType) : null;
    const adminUserId = req.query.adminUserId ? Number(req.query.adminUserId) : null;

    let where = '1=1';
    const params = [];

    if (action) {
      where += ' AND ml.action = ?';
      params.push(action);
    }
    if (targetType) {
      where += ' AND ml.targetType = ?';
      params.push(targetType);
    }
    if (adminUserId != null && Number.isFinite(adminUserId)) {
      where += ' AND ml.adminUserId = ?';
      params.push(adminUserId);
    }

    const rows = await db.all(
      `SELECT
       ml.id, ml.adminUserId, au.name as adminName, au.email as adminEmail,
       ml.action, ml.targetType, ml.targetId, ml.reason, ml.meta, ml.createdAt
     FROM moderation_logs ml
     JOIN users au ON au.id = ml.adminUserId
     WHERE ${where}
     ORDER BY ml.createdAt DESC
     LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const logs = rows.map((r) => ({
      id: r.id,
      admin: { id: r.adminUserId, name: r.adminName, email: r.adminEmail },
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      reason: r.reason,
      meta: safeJsonParse(r.meta, null),
      createdAt: r.createdAt
    }));

    return res.json({ logs, limit, offset });
  }

  // Export data
  static async exportData(req, res) {
    const type = req.query.type ? String(req.query.type) : 'json'; // json or csv
    const entity = req.query.entity ? String(req.query.entity) : 'users'; // users, posts, comments, centers

    try {
      let data = [];
      let filename = '';
      let headers = [];

      if (entity === 'users') {
        const users = await db.all(
          `SELECT id, name, email, role, phone, isBlocked, blockedAt, blockedReason,
                  deletedAt, deletedReason, createdAt
           FROM users ORDER BY createdAt DESC`
        );
        data = users;
        filename = 'users';
        headers = ['ID', 'Nome', 'Email', 'Role', 'Telefone', 'Bloqueado', 'Data Bloqueio', 'Motivo Bloqueio', 'Removido', 'Motivo Remoção', 'Data Criação'];
      } else if (entity === 'posts') {
        const posts = await db.all(
          `SELECT p.id, p.text, p.category, p.createdAt, p.deletedAt, p.deletedReason,
                  u.name as authorName, u.email as authorEmail,
                  c.displayName as centerName
           FROM posts p
           LEFT JOIN users u ON u.id = p.authorUserId
           LEFT JOIN centers c ON c.id = p.centerId
           ORDER BY p.createdAt DESC`
        );
        data = posts;
        filename = 'posts';
        headers = ['ID', 'Texto', 'Categoria', 'Autor', 'Email Autor', 'Centro', 'Data Criação', 'Removido', 'Motivo Remoção'];
      } else if (entity === 'comments') {
        const comments = await db.all(
          `SELECT c.id, c.postId, c.text, c.createdAt, c.deletedAt, c.deletedReason,
                  u.name as authorName, u.email as authorEmail
           FROM comments c
           LEFT JOIN users u ON u.id = c.authorUserId
           ORDER BY c.createdAt DESC`
        );
        data = comments;
        filename = 'comments';
        headers = ['ID', 'Post ID', 'Texto', 'Autor', 'Email Autor', 'Data Criação', 'Removido', 'Motivo Remoção'];
      } else if (entity === 'centers') {
        const centers = await db.all(
          `SELECT c.id, c.displayName, c.address, c.approved, c.createdAt,
                  u.name as ownerName, u.email as ownerEmail
           FROM centers c
           LEFT JOIN users u ON u.id = c.userId
           ORDER BY c.createdAt DESC`
        );
        data = centers;
        filename = 'centers';
        headers = ['ID', 'Nome', 'Endereço', 'Aprovado', 'Proprietário', 'Email Proprietário', 'Data Criação'];
      }

      if (type === 'csv') {
        // CSV format
        const csvRows = [];
        csvRows.push(headers.join(','));
        
        for (const row of data) {
          const values = headers.map((h, idx) => {
            const keys = Object.keys(row);
            const val = row[keys[idx]] || '';
            // Escape commas and quotes
            const str = String(val).replace(/"/g, '""');
            return `"${str}"`;
          });
          csvRows.push(values.join(','));
        }

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}_${new Date().toISOString().split('T')[0]}.csv"`);
        return res.send(csvRows.join('\n'));
      } else {
        // JSON format
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}_${new Date().toISOString().split('T')[0]}.json"`);
        return res.json({ entity, exportedAt: new Date().toISOString(), count: data.length, data });
      }
    } catch (error) {
      return res.status(500).json({ error: 'Failed to export data', message: error.message });
    }
  }

  // Bulk actions
  static async bulkBlockUsers(req, res) {
    const schema = z.object({
      userIds: z.array(z.number()).min(1),
      reason: z.string().optional()
    }).strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body' });

    const results = { success: [], failed: [] };
    const NOW_SQL_VAL = db.provider === 'mysql' ? 'NOW()' : "datetime('now')";

    for (const userId of parsed.data.userIds) {
      try {
        const user = await User.findById(userId);
        if (!user) {
          results.failed.push({ userId, error: 'User not found' });
          continue;
        }
        if (user.role === 'admin') {
          results.failed.push({ userId, error: 'Cannot block admin' });
          continue;
        }
        if (user.deletedAt) {
          results.failed.push({ userId, error: 'User is deleted' });
          continue;
        }

        await db.run(
          `UPDATE users SET isBlocked = 1, blockedAt = ${NOW_SQL_VAL}, blockedReason = ? WHERE id = ?`,
          [parsed.data.reason ?? null, userId]
        );

        await ModerationLog.create({
          adminUserId: req.auth.userId,
          action: 'user.block',
          targetType: 'user',
          targetId: userId,
          reason: parsed.data.reason ?? null
        });

        results.success.push(userId);
      } catch (error) {
        results.failed.push({ userId, error: error.message });
      }
    }

    return res.json({ results, total: parsed.data.userIds.length, success: results.success.length, failed: results.failed.length });
  }

  static async bulkUnblockUsers(req, res) {
    const schema = z.object({
      userIds: z.array(z.number()).min(1)
    }).strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body' });

    const results = { success: [], failed: [] };

    for (const userId of parsed.data.userIds) {
      try {
        const user = await User.findById(userId);
        if (!user) {
          results.failed.push({ userId, error: 'User not found' });
          continue;
        }

        await User.update(userId, {
          isBlocked: 0,
          blockedAt: null,
          blockedReason: null
        });

        await ModerationLog.create({
          adminUserId: req.auth.userId,
          action: 'user.unblock',
          targetType: 'user',
          targetId: userId
        });

        results.success.push(userId);
      } catch (error) {
        results.failed.push({ userId, error: error.message });
      }
    }

    return res.json({ results, total: parsed.data.userIds.length, success: results.success.length, failed: results.failed.length });
  }
}
