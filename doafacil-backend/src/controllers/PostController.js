import { z } from 'zod';
import { Post } from '../models/Post.js';
import { Center } from '../models/Center.js';
import { Comment } from '../models/Comment.js';
import { Reaction } from '../models/Reaction.js';
import { db } from '../db.js';
import { haversineKm } from '../geo.js';
import { normalizeImageUrls } from '../utils/helpers.js';
import { touchCenter } from '../db.js';

const NOW_SQL = db.provider === 'mysql' ? 'NOW()' : "datetime('now')";

export class PostController {
  static async getAll(req, res, io) {
    const category = req.query.category ? String(req.query.category) : null;
    const search = req.query.search ? String(req.query.search).trim() : null;
    const sortBy = req.query.sortBy ? String(req.query.sortBy) : 'recent'; // recent, reactions, comments
    const dateFilter = req.query.dateFilter ? String(req.query.dateFilter) : null; // today, week, month
    const dateFrom = req.query.dateFrom ? String(req.query.dateFrom) : null; // YYYY-MM-DD format
    const dateTo = req.query.dateTo ? String(req.query.dateTo) : null; // YYYY-MM-DD format
    const latRaw = req.query.lat != null ? Number(req.query.lat) : null;
    const lngRaw = req.query.lng != null ? Number(req.query.lng) : null;
    const radiusRaw = req.query.radiusKm != null ? Number(req.query.radiusKm) : null;
    const lat = Number.isFinite(latRaw) ? latRaw : null;
    const lng = Number.isFinite(lngRaw) ? lngRaw : null;
    const radiusKm = Number.isFinite(radiusRaw) ? Math.max(0.1, radiusRaw) : null;
    const limit = req.query.limit ? Math.min(200, Math.max(1, Number(req.query.limit))) : 20;
    const offset = req.query.offset ? Math.max(0, Number(req.query.offset)) : 0;
    const beforeCreatedAt = req.query.beforeCreatedAt ? String(req.query.beforeCreatedAt) : null;
    const beforeId = req.query.beforeId ? Number(req.query.beforeId) : null;

    const needsGeo = !(lat == null || lng == null || radiusKm == null);
    const fetchLimit = needsGeo ? 350 : limit;
    const fetchOffset = needsGeo ? 0 : offset;

    const params = [];
    let categoryClause = '';
    if (category) {
      categoryClause = ' AND p.category = ?';
      params.push(category);
    }

    let searchClause = '';
    if (search && search.length > 0) {
      searchClause = ' AND (p.text LIKE ? OR u.name LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }

    let dateClause = '';
    // Custom date range takes priority over dateFilter
    if (dateFrom || dateTo) {
      if (dateFrom && dateTo) {
        // Both dates specified
        dateClause = db.provider === 'mysql'
          ? ` AND DATE(p.createdAt) >= ? AND DATE(p.createdAt) <= ?`
          : ` AND DATE(p.createdAt) >= ? AND DATE(p.createdAt) <= ?`;
        params.push(dateFrom, dateTo);
      } else if (dateFrom) {
        // Only start date
        dateClause = db.provider === 'mysql'
          ? ` AND DATE(p.createdAt) >= ?`
          : ` AND DATE(p.createdAt) >= ?`;
        params.push(dateFrom);
      } else if (dateTo) {
        // Only end date
        dateClause = db.provider === 'mysql'
          ? ` AND DATE(p.createdAt) <= ?`
          : ` AND DATE(p.createdAt) <= ?`;
        params.push(dateTo);
      }
    } else if (dateFilter) {
      const NOW_SQL = db.provider === 'mysql' ? 'NOW()' : "datetime('now')";
      if (dateFilter === 'today') {
        dateClause = db.provider === 'mysql' 
          ? ` AND DATE(p.createdAt) = DATE(${NOW_SQL})`
          : ` AND DATE(p.createdAt) = DATE(${NOW_SQL})`;
      } else if (dateFilter === 'week') {
        dateClause = db.provider === 'mysql'
          ? ` AND p.createdAt >= DATE_SUB(${NOW_SQL}, INTERVAL 7 DAY)`
          : ` AND p.createdAt >= datetime('now', '-7 days')`;
      } else if (dateFilter === 'month') {
        dateClause = db.provider === 'mysql'
          ? ` AND p.createdAt >= DATE_SUB(${NOW_SQL}, INTERVAL 30 DAY)`
          : ` AND p.createdAt >= datetime('now', '-30 days')`;
      }
    }

    let orderClause = 'ORDER BY p.createdAt DESC, p.id DESC';
    if (sortBy === 'reactions') {
      // Will sort after fetching reaction counts
      orderClause = 'ORDER BY p.createdAt DESC, p.id DESC';
    } else if (sortBy === 'comments') {
      orderClause = 'ORDER BY commentCount DESC, p.createdAt DESC, p.id DESC';
    }

    let geoClause = '';
    if (needsGeo) {
      const dLat = radiusKm / 111;
      const latRad = (lat * Math.PI) / 180;
      const cosLat = Math.max(0.1, Math.cos(latRad));
      const dLng = radiusKm / (111 * cosLat);
      const minLat = lat - dLat;
      const maxLat = lat + dLat;
      const minLng = lng - dLng;
      const maxLng = lng + dLng;
      geoClause = ' AND c.lat IS NOT NULL AND c.lng IS NOT NULL AND c.lat BETWEEN ? AND ? AND c.lng BETWEEN ? AND ?';
      params.push(minLat, maxLat, minLng, maxLng);
    }

    let cursorClause = '';
    if (!needsGeo && beforeCreatedAt && beforeId != null && Number.isFinite(beforeId)) {
      cursorClause = ' AND (p.createdAt < ? OR (p.createdAt = ? AND p.id < ?))';
      params.push(beforeCreatedAt, beforeCreatedAt, beforeId);
    }

    const rows = await db.all(
      `SELECT
       p.id, p.text, p.category, p.imageUrl, p.imageUrls, p.createdAt, p.updatedAt,
       (SELECT COUNT(*) FROM comments cm WHERE cm.postId = p.id AND cm.deletedAt IS NULL) AS commentCount,
       u.id AS authorId, u.name AS authorName, u.role AS authorRole, u.avatarUrl AS authorAvatarUrl,
       c.id AS centerId, c.displayName AS centerName, c.address AS centerAddress, c.lat AS centerLat, c.lng AS centerLng, c.approved AS centerApproved
     FROM posts p
     JOIN users u ON u.id = p.authorUserId
     LEFT JOIN centers c ON c.id = p.centerId
     WHERE p.deletedAt IS NULL${categoryClause}${searchClause}${dateClause}${geoClause}${cursorClause}
     ${orderClause}
     LIMIT ? OFFSET ?`,
      [...params, fetchLimit, fetchOffset]
    );
    
    console.log(`[PostController.getAll] Found ${rows.length} posts (category: ${category || 'all'}, search: ${search || 'none'}, dateFilter: ${dateFilter || 'all'})`);
    
    if (rows.length === 0) {
      console.log('[PostController.getAll] No posts found. Checking if there are any posts in database...');
      const totalPosts = await db.get(`SELECT COUNT(*) as count FROM posts WHERE deletedAt IS NULL`);
      const approvedCenters = await db.get(`SELECT COUNT(*) as count FROM centers WHERE approved = 1`);
      console.log(`[PostController.getAll] Total posts in DB: ${totalPosts?.count || 0}, Approved centers: ${approvedCenters?.count || 0}`);
    }

    const posts = rows
      .map((r) => ({
        id: r.id,
        text: r.text,
        category: r.category,
        imageUrl: r.imageUrl,
        imageUrls: normalizeImageUrls({ imageUrl: r.imageUrl, imageUrls: r.imageUrls }),
        commentCount: Number(r.commentCount || 0),
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        author: { id: r.authorId, name: r.authorName, role: r.authorRole, avatarUrl: r.authorAvatarUrl },
        center: r.centerId
          ? {
              id: r.centerId,
              displayName: r.centerName,
              address: r.centerAddress,
              lat: r.centerLat,
              lng: r.centerLng,
              approved: !!r.centerApproved
            }
          : null
      }))
      .filter((p) => {
        // Only show posts from approved centers (or posts without centers)
        if (p.center) {
          const approved = p.center.approved;
          // Handle both boolean and number types
          if (approved === false || approved === 0 || approved === '0' || approved === null) {
            return false;
          }
        }
        return true;
      });

    // Add reaction counts, user reaction, and saved status
    const postIds = posts.map((p) => p.id);
    const reactionCounts = await Reaction.getCountsByPostIds(postIds);
    const userId = req.auth?.userId || null;
    const userReactions = userId ? await Reaction.getUserReactionsByPostIds(postIds, userId) : {};
    const savedPostIds = userId ? await SavedPost.getSavedPostIdsByPostIds(postIds, userId) : new Set();

    let postsWithReactions = posts.map((p) => ({
      ...p,
      reactions: reactionCounts[p.id] || { like: 0, love: 0, dislike: 0 },
      myReaction: userReactions[p.id] || null,
      isSaved: savedPostIds.has(p.id)
    }));

    // Sort by reactions if requested
    if (sortBy === 'reactions') {
      postsWithReactions.sort((a, b) => {
        const aTotal = (a.reactions.like || 0) + (a.reactions.love || 0) - (a.reactions.dislike || 0);
        const bTotal = (b.reactions.like || 0) + (b.reactions.love || 0) - (b.reactions.dislike || 0);
        if (bTotal !== aTotal) return bTotal - aTotal;
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
    }

    if (!needsGeo) {
      const hasMore = postsWithReactions.length === limit;
      const last = postsWithReactions[postsWithReactions.length - 1];
      const nextCursor = last ? { beforeCreatedAt: last.createdAt, beforeId: last.id } : null;
      return res.json({ posts: postsWithReactions, limit, offset, hasMore, nextCursor });
    }

    const filtered = postsWithReactions
      .map((p) => {
        if (!p.center || p.center.lat == null || p.center.lng == null) return { ...p, distanceKm: null };
        return {
          ...p,
          distanceKm: haversineKm({ lat, lng }, { lat: p.center.lat, lng: p.center.lng })
        };
      })
      .filter((p) => p.distanceKm != null && p.distanceKm <= radiusKm)
      .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));

    const paged = filtered.slice(offset, offset + limit);
    return res.json({ posts: paged, limit, offset, hasMore: filtered.length > offset + limit });
  }

  static async getById(req, res) {
    const id = Number(req.params.id);
    const post = await Post.findByIdWithAuthor(id);
    if (!post) return res.status(404).json({ error: 'Not found' });

    const reactionCounts = await Reaction.getCountsByPostId(id);
    const userId = req.auth?.userId || null;
    const userReaction = userId ? await Reaction.getByPostIdAndUserId(id, userId) : null;
    const isSaved = userId ? !!(await SavedPost.findByPostIdAndUserId(id, userId)) : false;

    return res.json({
      post: {
        id: post.id,
        text: post.text,
        category: post.category,
        imageUrl: post.imageUrl,
        imageUrls: normalizeImageUrls({ imageUrl: post.imageUrl, imageUrls: post.imageUrls }),
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        reactions: reactionCounts,
        myReaction: userReaction?.type || null,
        isSaved,
        author: {
          id: post.authorId,
          name: post.authorName,
          role: post.authorRole,
          avatarUrl: post.authorAvatarUrl
        },
        center: post.centerId
          ? {
              id: post.centerId,
              displayName: post.centerName,
              approved: !!post.centerApproved
            }
          : null
      }
    });
  }

  static async create(req, res, io) {
    try {
      // Anti-spam: Check rate limiting (max 10 posts per hour)
      const NOW_SQL = db.provider === 'mysql' ? 'NOW()' : "datetime('now')";
      const recentPosts = await db.all(
        db.provider === 'mysql'
          ? `SELECT COUNT(*) as count FROM posts 
             WHERE authorUserId = ? AND createdAt >= DATE_SUB(${NOW_SQL}, INTERVAL 1 HOUR)`
          : `SELECT COUNT(*) as count FROM posts 
             WHERE authorUserId = ? AND createdAt >= datetime('now', '-1 hour')`,
        [req.auth.userId]
      );
      const postCount = Number(recentPosts[0]?.count || 0);
      if (postCount >= 10) {
        return res.status(429).json({ error: 'Rate limit exceeded. Please wait before posting again.' });
      }

      // Anti-spam: Check for duplicate content (same text in last 24 hours)
      const duplicateCheck = await db.get(
        db.provider === 'mysql'
          ? `SELECT id FROM posts 
             WHERE authorUserId = ? AND text = ? AND createdAt >= DATE_SUB(${NOW_SQL}, INTERVAL 24 HOUR)`
          : `SELECT id FROM posts 
             WHERE authorUserId = ? AND text = ? AND createdAt >= datetime('now', '-24 hours')`,
        [req.auth.userId, req.body.text?.trim()]
      );
      if (duplicateCheck) {
        return res.status(400).json({ error: 'Duplicate content detected. Please post something different.' });
      }

      const schema = z
        .object({
          text: z.string().min(1).max(5000),
          category: z.string().min(1),
          imageUrl: z.string().url().optional().nullable(),
          imageUrls: z
            .array(z.string().url())
            .optional()
            .default([])
            .transform((arr) => (Array.isArray(arr) ? arr.filter((url) => url && url.trim()) : []))
        })
        .strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        console.error('[PostController.create] Validation error:', parsed.error);
        return res.status(400).json({ error: 'Invalid body', details: parsed.error.errors });
      }

      const center = await Center.findByUserId(req.auth.userId);
      if (!center) return res.status(404).json({ error: 'Center not found' });
      if (!center.approved) return res.status(403).json({ error: 'Center not approved yet' });

      const urls = normalizeImageUrls({ imageUrl: parsed.data.imageUrl ?? null, imageUrls: parsed.data.imageUrls ?? [] });
      const post = await Post.create({
        authorUserId: req.auth.userId,
        centerId: center.id,
        text: parsed.data.text,
        category: parsed.data.category,
        imageUrl: urls[0] ?? null,
        imageUrls: urls
      });
      await touchCenter(center.id);

      const postWithDetails = await db.get(
      `SELECT
       p.id, p.text, p.category, p.imageUrl, p.imageUrls, p.createdAt, p.updatedAt,
       (SELECT COUNT(*) FROM comments cm WHERE cm.postId = p.id AND cm.deletedAt IS NULL) AS commentCount,
       u.id AS authorId, u.name AS authorName, u.role AS authorRole, u.avatarUrl AS authorAvatarUrl,
       c.id AS centerId, c.displayName AS centerName, c.address AS centerAddress, c.lat AS centerLat, c.lng AS centerLng, c.approved AS centerApproved
     FROM posts p
     JOIN users u ON u.id = p.authorUserId
     LEFT JOIN centers c ON c.id = p.centerId
     WHERE p.id = ? AND p.deletedAt IS NULL`,
      [post.id]
      );

      const feedPost = postWithDetails
      ? {
          id: postWithDetails.id,
          text: postWithDetails.text,
          category: postWithDetails.category,
          imageUrl: postWithDetails.imageUrl,
          imageUrls: normalizeImageUrls({ imageUrl: postWithDetails.imageUrl, imageUrls: postWithDetails.imageUrls }),
          commentCount: Number(postWithDetails.commentCount || 0),
          reactions: { like: 0, love: 0, dislike: 0 },
          myReaction: null,
          createdAt: postWithDetails.createdAt,
          updatedAt: postWithDetails.updatedAt,
          author: {
            id: postWithDetails.authorId,
            name: postWithDetails.authorName,
            role: postWithDetails.authorRole,
            avatarUrl: postWithDetails.authorAvatarUrl
          },
          center: postWithDetails.centerId
            ? {
                id: postWithDetails.centerId,
                displayName: postWithDetails.centerName,
                address: postWithDetails.centerAddress,
                lat: postWithDetails.centerLat,
                lng: postWithDetails.centerLng,
                approved: !!postWithDetails.centerApproved
              }
            : null
        }
      : null;

      // Always emit post:new event if post exists and center is approved (or no center)
      if (feedPost) {
        const centerApproved = feedPost.center ? (feedPost.center.approved === true || feedPost.center.approved === 1 || feedPost.center.approved === '1') : true;
        if (!feedPost.center || centerApproved) {
          if (io) {
            console.log('[PostController.create] Emitting post:new event for post:', feedPost.id);
            console.log('[PostController.create] Socket.IO connected clients:', io.sockets.sockets.size);
            io.emit('post:new', { post: feedPost });
            console.log('[PostController.create] Event emitted successfully');
          } else {
            console.warn('[PostController.create] io is not available, cannot emit post:new event');
          }
        } else {
          console.log('[PostController.create] Post center not approved, not emitting event');
        }
      } else {
        console.warn('[PostController.create] feedPost is null, cannot emit event');
      }
      return res.json({ post: feedPost });
    } catch (e) {
      console.error('[PostController.create] Error:', e);
      console.error('[PostController.create] Error message:', e?.message);
      console.error('[PostController.create] Error stack:', e?.stack);
      throw e; // Let asyncHandler catch it
    }
  }

  static async update(req, res, io) {
    const id = Number(req.params.id);
    const schema = z
      .object({
        text: z.string().min(1).optional(),
        category: z.string().min(1).optional(),
        imageUrl: z.string().url().nullable().optional(),
        imageUrls: z
          .array(z.string().url())
          .optional()
          .default([])
          .transform((arr) => (Array.isArray(arr) ? arr.filter((url) => url && url.trim()) : []))
      })
      .strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      console.error('[PostController.update] Validation error:', parsed.error);
      return res.status(400).json({ error: 'Invalid body', details: parsed.error.errors });
    }

    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ error: 'Not found' });
    if (post.authorUserId !== req.auth.userId) return res.status(403).json({ error: 'Forbidden' });

    const nextUrls = normalizeImageUrls({
      imageUrl: parsed.data.imageUrl !== undefined ? parsed.data.imageUrl : post.imageUrl,
      imageUrls: parsed.data.imageUrls !== undefined ? parsed.data.imageUrls : post.imageUrls
    });

    await Post.update(id, {
      text: parsed.data.text ?? post.text,
      category: parsed.data.category ?? post.category,
      imageUrl: nextUrls[0] ?? null,
      imageUrls: nextUrls
    });

    const updated = await db.get(
      `SELECT
       p.id, p.text, p.category, p.imageUrl, p.imageUrls, p.createdAt, p.updatedAt,
       (SELECT COUNT(*) FROM comments cm WHERE cm.postId = p.id AND cm.deletedAt IS NULL) AS commentCount,
       u.id AS authorId, u.name AS authorName, u.role AS authorRole, u.avatarUrl AS authorAvatarUrl,
       c.id AS centerId, c.displayName AS centerName, c.address AS centerAddress, c.lat AS centerLat, c.lng AS centerLng, c.approved AS centerApproved
     FROM posts p
     JOIN users u ON u.id = p.authorUserId
     LEFT JOIN centers c ON c.id = p.centerId
     WHERE p.id = ? AND p.deletedAt IS NULL`,
      [id]
    );

    const reactionCounts = await Reaction.getCountsByPostId(id);
    const userReaction = await Reaction.getByPostIdAndUserId(id, req.auth.userId);

    const feedPost = updated
      ? {
          id: updated.id,
          text: updated.text,
          category: updated.category,
          imageUrl: updated.imageUrl,
          imageUrls: normalizeImageUrls({ imageUrl: updated.imageUrl, imageUrls: updated.imageUrls }),
          commentCount: Number(updated.commentCount || 0),
          reactions: reactionCounts,
          myReaction: userReaction?.type || null,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
          author: {
            id: updated.authorId,
            name: updated.authorName,
            role: updated.authorRole,
            avatarUrl: updated.authorAvatarUrl
          },
          center: updated.centerId
            ? {
                id: updated.centerId,
                displayName: updated.centerName,
                address: updated.centerAddress,
                lat: updated.centerLat,
                lng: updated.centerLng,
                approved: !!updated.centerApproved
              }
            : null
        }
      : null;

    if (feedPost && (!feedPost.center || feedPost.center.approved)) {
      io.emit('post:updated', { post: feedPost });
    }
    return res.json({ post: feedPost });
  }

  static async delete(req, res, io) {
    const id = Number(req.params.id);
    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ error: 'Not found' });
    if (post.authorUserId !== req.auth.userId) return res.status(403).json({ error: 'Forbidden' });
    if (post.deletedAt) return res.json({ ok: true });

    await Post.softDelete(id);
    io.emit('post:deleted', { postId: id });
    return res.json({ ok: true });
  }

  static async getMine(req, res) {
    const center = await Center.findByUserId(req.auth.userId);
    if (!center) return res.status(404).json({ error: 'Center not found' });

    const posts = await Post.findByAuthor(req.auth.userId);
    const postIds = posts.map((p) => p.id);
    const reactionCounts = await Reaction.getCountsByPostIds(postIds);
    const userReactions = await Reaction.getUserReactionsByPostIds(postIds, req.auth.userId);

    const postsFormatted = posts.map((p) => ({
      id: p.id,
      text: p.text,
      category: p.category,
      imageUrl: p.imageUrl,
      imageUrls: normalizeImageUrls({ imageUrl: p.imageUrl, imageUrls: p.imageUrls }),
      commentCount: Number(p.commentCount || 0),
      reactions: reactionCounts[p.id] || { like: 0, love: 0, dislike: 0 },
      myReaction: userReactions[p.id] || null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt
    }));

    return res.json({ posts: postsFormatted });
  }
}
