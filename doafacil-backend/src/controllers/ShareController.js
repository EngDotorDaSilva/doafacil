import { Share } from '../models/Share.js';
import { Post } from '../models/Post.js';
import { db } from '../db.js';
import { normalizeImageUrls } from '../utils/helpers.js';
import { Reaction } from '../models/Reaction.js';
import { SavedPost } from '../models/SavedPost.js';

export class ShareController {
  static async getAll(req, res) {
    const userId = req.auth.userId;
    const shared = await Share.findByUserId(userId);
    
    const posts = shared.map((s) => ({
      id: s.postId,
      text: s.text,
      category: s.category,
      imageUrl: s.imageUrl,
      imageUrls: normalizeImageUrls({ imageUrl: s.imageUrl, imageUrls: s.imageUrls }),
      createdAt: s.postCreatedAt,
      sharedAt: s.createdAt,
      author: {
        id: s.authorId,
        name: s.authorName,
        role: s.authorRole,
        avatarUrl: s.authorAvatarUrl
      },
      center: s.centerId
        ? {
            id: s.centerId,
            displayName: s.centerName,
            address: s.centerAddress,
            lat: s.centerLat,
            lng: s.centerLng,
            approved: !!s.centerApproved
          }
        : null
    }));

    const postIds = posts.map((p) => p.id);
    const reactionCounts = await Reaction.getCountsByPostIds(postIds);
    const userReactions = await Reaction.getUserReactionsByPostIds(postIds, userId);
    const savedPostIds = await SavedPost.getSavedPostIdsByPostIds(postIds, userId);
    const sharedPostIds = await Share.getSharedPostIdsByPostIds(postIds, userId);

    // Get comment counts
    let commentCountMap = {};
    if (postIds.length > 0) {
      const placeholders = postIds.map(() => '?').join(',');
      const commentCounts = await db.all(
        `SELECT postId, COUNT(*) as count 
         FROM comments 
         WHERE postId IN (${placeholders}) AND deletedAt IS NULL
         GROUP BY postId`,
        postIds
      );
      for (const cc of commentCounts) {
        commentCountMap[cc.postId] = Number(cc.count || 0);
      }
    }

    const postsWithDetails = posts.map((p) => ({
      ...p,
      commentCount: commentCountMap[p.id] || 0,
      reactions: reactionCounts[p.id] || { like: 0, love: 0, dislike: 0 },
      myReaction: userReactions[p.id] || null,
      isSaved: savedPostIds.has(p.id),
      isShared: sharedPostIds.has(p.id)
    }));

    return res.json({ posts: postsWithDetails });
  }

  static async create(req, res) {
    const postId = Number(req.params.id);
    const userId = req.auth.userId;

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.deletedAt) return res.status(404).json({ error: 'Post not found' });

    await Share.create(postId, userId);
    return res.json({ success: true });
  }

  static async delete(req, res) {
    const postId = Number(req.params.id);
    const userId = req.auth.userId;

    await Share.delete(postId, userId);
    return res.json({ success: true });
  }
}
