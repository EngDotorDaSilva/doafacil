import { z } from 'zod';
import { Comment } from '../models/Comment.js';
import { Post } from '../models/Post.js';
import { Center } from '../models/Center.js';
import { db } from '../db.js';

const NOW_SQL = db.provider === 'mysql' ? 'NOW()' : "datetime('now')";

export class CommentController {
  static async getByPostId(req, res) {
    const postId = Number(req.params.id);
    if (!Number.isFinite(postId)) return res.status(400).json({ error: 'Invalid post id' });

    const post = await Post.findById(postId);
    if (!post || post.deletedAt) return res.status(404).json({ error: 'Not found' });

    if (post.centerId) {
      const center = await Center.findById(post.centerId);
      if (!center || !center.approved) return res.status(404).json({ error: 'Not found' });
    }

    const comments = await Comment.findByPostId(postId);
    const commentsFormatted = comments.map((c) => ({
      id: c.id,
      postId: c.postId,
      text: c.text,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      author: {
        id: c.authorId,
        name: c.authorName,
        role: c.authorRole,
        avatarUrl: c.authorAvatarUrl
      }
    }));

    return res.json({ comments: commentsFormatted });
  }

  static async create(req, res, io) {
    const postId = Number(req.params.id);
    if (!Number.isFinite(postId)) return res.status(400).json({ error: 'Invalid post id' });

    // Anti-spam: Check rate limiting (max 20 comments per hour)
    const NOW_SQL = db.provider === 'mysql' ? 'NOW()' : "datetime('now')";
    const recentComments = await db.all(
      db.provider === 'mysql'
        ? `SELECT COUNT(*) as count FROM comments 
           WHERE authorUserId = ? AND createdAt >= DATE_SUB(${NOW_SQL}, INTERVAL 1 HOUR)`
        : `SELECT COUNT(*) as count FROM comments 
           WHERE authorUserId = ? AND createdAt >= datetime('now', '-1 hour')`,
      [req.auth.userId]
    );
    const recentCommentCount = Number(recentComments[0]?.count || 0);
    if (recentCommentCount >= 20) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please wait before commenting again.' });
    }

    // Anti-spam: Check for duplicate content (same text in last hour)
    const duplicateCheck = await db.get(
      db.provider === 'mysql'
        ? `SELECT id FROM comments 
           WHERE authorUserId = ? AND postId = ? AND text = ? AND createdAt >= DATE_SUB(${NOW_SQL}, INTERVAL 1 HOUR)`
        : `SELECT id FROM comments 
           WHERE authorUserId = ? AND postId = ? AND text = ? AND createdAt >= datetime('now', '-1 hour')`,
      [req.auth.userId, postId, req.body.text?.trim()]
    );
    if (duplicateCheck) {
      return res.status(400).json({ error: 'Duplicate comment detected.' });
    }

    const schema = z.object({ text: z.string().min(1).max(2000) }).strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body' });

    const post = await Post.findById(postId);
    if (!post || post.deletedAt) return res.status(404).json({ error: 'Not found' });

    if (post.centerId) {
      const center = await Center.findById(post.centerId);
      if (!center || !center.approved) return res.status(404).json({ error: 'Not found' });
    }

    const comment = await Comment.create({
      postId,
      authorUserId: req.auth.userId,
      text: parsed.data.text
    });

    const commentWithAuthor = await db.get(
      `SELECT c.id, c.postId, c.text, c.createdAt, c.updatedAt, u.id AS authorId, u.name AS authorName, u.role AS authorRole, u.avatarUrl AS authorAvatarUrl
       FROM comments c JOIN users u ON u.id = c.authorUserId
       WHERE c.id = ?`,
      [comment.id]
    );

    const commentFormatted = {
      id: commentWithAuthor.id,
      postId: commentWithAuthor.postId,
      text: commentWithAuthor.text,
      createdAt: commentWithAuthor.createdAt,
      updatedAt: commentWithAuthor.updatedAt,
      author: {
        id: commentWithAuthor.authorId,
        name: commentWithAuthor.authorName,
        role: commentWithAuthor.authorRole,
        avatarUrl: commentWithAuthor.authorAvatarUrl
      }
    };

    const cntRow = await db.get(`SELECT COUNT(*) as cnt FROM comments WHERE postId = ? AND deletedAt IS NULL`, [postId]);
    const commentCount = Number(cntRow?.cnt || 0);
    io.emit('comment:new', { postId, comment: commentFormatted, commentCount });
    io.emit('post:commentCount', { postId, commentCount });

    return res.json({ comment: commentFormatted });
  }

  static async update(req, res, io) {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid comment id' });

    const schema = z.object({ text: z.string().min(1) }).strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body' });

    const existingComment = await Comment.findById(id);
    if (!existingComment || existingComment.deletedAt) return res.status(404).json({ error: 'Not found' });

    const isOwner = existingComment.authorUserId === req.auth.userId;
    const isAdmin = req.auth.role === 'admin';
    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Forbidden' });

    await Comment.update(id, parsed.data.text);

    const row = await db.get(
      `SELECT c.id, c.postId, c.text, c.createdAt, c.updatedAt, u.id AS authorId, u.name AS authorName, u.role AS authorRole, u.avatarUrl AS authorAvatarUrl
       FROM comments c JOIN users u ON u.id = c.authorUserId
       WHERE c.id = ?`,
      [id]
    );

    const comment = {
      id: row.id,
      postId: row.postId,
      text: row.text,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      author: {
        id: row.authorId,
        name: row.authorName,
        role: row.authorRole,
        avatarUrl: row.authorAvatarUrl
      }
    };

    io.emit('comment:updated', { postId: row.postId, comment });
    return res.json({ comment });
  }

  static async delete(req, res, io) {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid comment id' });

    const comment = await Comment.findById(id);
    if (!comment) return res.status(404).json({ error: 'Not found' });
    if (comment.deletedAt) return res.json({ ok: true });

    const isOwner = comment.authorUserId === req.auth.userId;
    const isAdmin = req.auth.role === 'admin';
    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Forbidden' });

    await Comment.softDelete(id);
    const cntRow = await db.get(`SELECT COUNT(*) as cnt FROM comments WHERE postId = ? AND deletedAt IS NULL`, [
      comment.postId
    ]);
    const commentCount = Number(cntRow?.cnt || 0);
    io.emit('comment:deleted', { postId: comment.postId, commentId: id, commentCount });
    io.emit('post:commentCount', { postId: comment.postId, commentCount });
    return res.json({ ok: true });
  }
}
