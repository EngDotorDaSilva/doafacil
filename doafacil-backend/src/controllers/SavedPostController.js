import { SavedPost } from '../models/SavedPost.js';
import { Post } from '../models/Post.js';
import { db } from '../db.js';
import { normalizeImageUrls } from '../utils/helpers.js';
import { Reaction } from '../models/Reaction.js';

export class SavedPostController {
  static async getAll(req, res) {
    const userId = req.auth.userId;
    const saved = await SavedPost.findByUserId(userId);
    
    const posts = saved.map((s) => ({
      id: s.postId,
      text: s.text,
      category: s.category,
      imageUrl: s.imageUrl,
      imageUrls: normalizeImageUrls({ imageUrl: s.imageUrl, imageUrls: s.imageUrls }),
      createdAt: s.postCreatedAt,
      savedAt: s.createdAt
    }));

    const postIds = posts.map((p) => p.id);
    const reactionCounts = await Reaction.getCountsByPostIds(postIds);
    const userReactions = await Reaction.getUserReactionsByPostIds(postIds, userId);
    const savedPostIds = await SavedPost.getSavedPostIdsByPostIds(postIds, userId);

    const postsWithDetails = posts.map((p) => ({
      ...p,
      reactions: reactionCounts[p.id] || { like: 0, love: 0, dislike: 0 },
      myReaction: userReactions[p.id] || null,
      isSaved: savedPostIds.has(p.id)
    }));

    return res.json({ posts: postsWithDetails });
  }

  static async create(req, res) {
    const postId = Number(req.params.id);
    const userId = req.auth.userId;

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.deletedAt) return res.status(404).json({ error: 'Post not found' });

    await SavedPost.create(postId, userId);
    return res.json({ success: true });
  }

  static async delete(req, res) {
    const postId = Number(req.params.id);
    const userId = req.auth.userId;

    await SavedPost.delete(postId, userId);
    return res.json({ success: true });
  }
}
