import { z } from 'zod';
import { Reaction } from '../models/Reaction.js';
import { Post } from '../models/Post.js';
import { db } from '../db.js';

export class ReactionController {
  static async createOrUpdate(req, res) {
    const postId = Number(req.params.id);
    const userId = req.auth.userId;

    const schema = z
      .object({
        type: z.enum(['like', 'love', 'dislike'])
      })
      .strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body' });

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.deletedAt) return res.status(404).json({ error: 'Post not found' });

    const reaction = await Reaction.create(postId, userId, parsed.data.type);
    const counts = await Reaction.getCountsByPostId(postId);

    return res.json({
      reaction: {
        id: reaction.id,
        postId: reaction.postId,
        userId: reaction.userId,
        type: reaction.type,
        createdAt: reaction.createdAt
      },
      counts
    });
  }

  static async delete(req, res) {
    const postId = Number(req.params.id);
    const userId = req.auth.userId;

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    await Reaction.delete(postId, userId);
    const counts = await Reaction.getCountsByPostId(postId);

    return res.json({ counts });
  }

  static async getCounts(req, res) {
    const postId = Number(req.params.id);
    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const counts = await Reaction.getCountsByPostId(postId);
    return res.json({ counts });
  }
}
