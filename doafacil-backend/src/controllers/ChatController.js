import { z } from 'zod';
import { Thread } from '../models/Thread.js';
import { Message } from '../models/Message.js';
import { User } from '../models/User.js';
import { db } from '../db.js';
import { touchThread } from '../db.js';

const NOW_SQL = db.provider === 'mysql' ? 'NOW()' : "datetime('now')";

async function sendExpoPushToUser(userId, { title, body, data }) {
  const tokens = (await db.all(`SELECT token FROM push_tokens WHERE userId = ?`, [userId])).map((r) => r.token);
  if (!tokens.length) return;
  const messages = tokens.map((to) => ({ to, title, body, data, sound: 'default' }));

  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages)
    });
  } catch {
    // best-effort
  }
}

export class ChatController {
  static async getThreads(req, res) {
    const me = req.auth.userId;
    const search = req.query.search ? String(req.query.search).trim() : null;
    const unreadOnly = String(req.query.unreadOnly || '') === '1';

    let whereClause = 't.donorUserId = ? OR t.centerUserId = ?';
    const params = [me, me];

    if (search && search.length > 0) {
      whereClause += ` AND (u1.name LIKE ? OR u2.name LIKE ? OR c.displayName LIKE ?)`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    if (unreadOnly) {
      whereClause += ` AND EXISTS (
        SELECT 1 FROM messages m 
        WHERE m.threadId = t.id 
        AND m.readAt IS NULL 
        AND m.senderUserId != ?
      )`;
      params.push(me);
    }

    const threads = await db.all(
      `SELECT
       t.id, t.donorUserId, t.centerUserId, t.updatedAt,
       u1.name AS donorName, u1.avatarUrl AS donorAvatarUrl,
       u2.name AS centerUserName, u2.avatarUrl AS centerAvatarUrl,
       c.id AS centerId, c.displayName AS centerDisplayName,
       (SELECT COUNT(*) FROM messages m WHERE m.threadId = t.id AND m.readAt IS NULL AND m.senderUserId != ?) AS unreadCount,
       (SELECT m.id FROM messages m WHERE m.threadId = t.id ORDER BY m.createdAt DESC, m.id DESC LIMIT 1) AS lastMessageId,
       (SELECT m.text FROM messages m WHERE m.threadId = t.id ORDER BY m.createdAt DESC, m.id DESC LIMIT 1) AS lastMessageText,
       (SELECT m.createdAt FROM messages m WHERE m.threadId = t.id ORDER BY m.createdAt DESC, m.id DESC LIMIT 1) AS lastMessageAt,
       (SELECT m.senderUserId FROM messages m WHERE m.threadId = t.id ORDER BY m.createdAt DESC, m.id DESC LIMIT 1) AS lastSenderUserId,
       (SELECT m.readAt FROM messages m WHERE m.threadId = t.id ORDER BY m.createdAt DESC, m.id DESC LIMIT 1) AS lastMessageReadAt
     FROM threads t
     JOIN users u1 ON u1.id = t.donorUserId
     JOIN users u2 ON u2.id = t.centerUserId
     LEFT JOIN centers c ON c.userId = t.centerUserId
     WHERE ${whereClause}
     ORDER BY t.updatedAt DESC`,
      [me, ...params]
    );

    const threadsFormatted = threads.map((t) => ({
      id: t.id,
      donorUser: { id: t.donorUserId, name: t.donorName, avatarUrl: t.donorAvatarUrl },
      centerUser: { id: t.centerUserId, name: t.centerUserName, avatarUrl: t.centerAvatarUrl },
      center: t.centerId ? { id: t.centerId, displayName: t.centerDisplayName } : null,
      updatedAt: t.updatedAt,
      unreadCount: Number(t.unreadCount || 0),
      lastMessage: t.lastMessageAt
        ? {
            id: t.lastMessageId,
            text: t.lastMessageText,
            createdAt: t.lastMessageAt,
            senderUserId: t.lastSenderUserId,
            readAt: t.lastMessageReadAt
          }
        : null
    }));

    return res.json({ threads: threadsFormatted });
  }

  static async createThread(req, res) {
    const schema = z.object({ centerUserId: z.number().int().positive() }).strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body' });

    const centerUserId = parsed.data.centerUserId;
    const centerUser = await User.findById(centerUserId);
    if (!centerUser || centerUser.role !== 'center') return res.status(404).json({ error: 'Center user not found' });

    const me = req.auth.userId;
    if (req.auth.role !== 'donor') return res.status(403).json({ error: 'Only donors can start a thread' });

    const thread = await Thread.findOrCreate(me, centerUserId);
    return res.json({ threadId: thread.id });
  }

  static async getMessages(req, res) {
    const threadId = Number(req.params.id);
    const thread = await Thread.findById(threadId);
    if (!thread) return res.status(404).json({ error: 'Not found' });
    if (thread.donorUserId !== req.auth.userId && thread.centerUserId !== req.auth.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const limit = req.query.limit ? Math.min(100, Math.max(1, Number(req.query.limit))) : 50;
    const beforeId = req.query.beforeId ? Number(req.query.beforeId) : null;

    let messages;
    if (beforeId && Number.isFinite(beforeId)) {
      // Pagination: get messages before a specific message ID
      messages = await db.all(
        `SELECT m.*,
                u.id AS senderId, u.name AS senderName, u.avatarUrl AS senderAvatarUrl
         FROM messages m
         JOIN users u ON u.id = m.senderUserId
         WHERE m.threadId = ? AND m.id < ?
         ORDER BY m.createdAt DESC, m.id DESC
         LIMIT ?`,
        [threadId, beforeId, limit]
      );
      messages.reverse(); // Reverse to get chronological order
    } else {
      // Get latest messages
      messages = await db.all(
        `SELECT m.*,
                u.id AS senderId, u.name AS senderName, u.avatarUrl AS senderAvatarUrl
         FROM messages m
         JOIN users u ON u.id = m.senderUserId
         WHERE m.threadId = ?
         ORDER BY m.createdAt DESC, m.id DESC
         LIMIT ?`,
        [threadId, limit]
      );
      messages.reverse(); // Reverse to get chronological order
    }

    const messagesFormatted = messages.map((m) => ({
      id: m.id,
      threadId: m.threadId,
      sender: {
        id: m.senderId,
        name: m.senderName,
        avatarUrl: m.senderAvatarUrl
      },
      text: m.text,
      createdAt: m.createdAt,
      readAt: m.readAt
    }));

    const hasMore = messages.length === limit && (beforeId ? true : messages.length > 0);
    const oldestMessageId = messages.length > 0 ? messages[0].id : null;

    return res.json({ messages: messagesFormatted, hasMore, oldestMessageId });
  }

  static async markAsRead(req, res, notifyUser) {
    const threadId = Number(req.params.id);
    const thread = await Thread.findById(threadId);
    if (!thread) return res.status(404).json({ error: 'Not found' });
    if (thread.donorUserId !== req.auth.userId && thread.centerUserId !== req.auth.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const nowRow = await db.get(`SELECT ${NOW_SQL} as now`);
    const now = nowRow?.now;

    await Message.markAsRead(threadId, req.auth.userId);

    const recipientUserId = req.auth.userId === thread.donorUserId ? thread.centerUserId : thread.donorUserId;
    notifyUser(recipientUserId, 'thread:read', { threadId, readerUserId: req.auth.userId, readAt: now });

    return res.json({ ok: true, readAt: now });
  }

  static async sendMessage(req, res, notifyUser, isUserOnline) {
    const threadId = Number(req.params.id);
    const schema = z.object({ text: z.string().min(1) }).strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body' });

    const thread = await Thread.findById(threadId);
    if (!thread) return res.status(404).json({ error: 'Not found' });
    if (thread.donorUserId !== req.auth.userId && thread.centerUserId !== req.auth.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const message = await Message.create({
      threadId,
      senderUserId: req.auth.userId,
      text: parsed.data.text
    });
    await touchThread(threadId);

    const messageWithSender = await db.get(
      `SELECT m.id, m.threadId, m.senderUserId, u.name as senderName, u.avatarUrl as senderAvatarUrl, m.text, m.createdAt, m.readAt
       FROM messages m JOIN users u ON u.id = m.senderUserId
       WHERE m.id = ?`,
      [message.id]
    );

    const recipientUserId = req.auth.userId === thread.donorUserId ? thread.centerUserId : thread.donorUserId;
    notifyUser(recipientUserId, 'message:new', {
      threadId,
      message: {
        id: messageWithSender.id,
        threadId: messageWithSender.threadId,
        sender: {
          id: messageWithSender.senderUserId,
          name: messageWithSender.senderName,
          avatarUrl: messageWithSender.senderAvatarUrl
        },
        text: messageWithSender.text,
        createdAt: messageWithSender.createdAt,
        readAt: messageWithSender.readAt
      }
    });

    // Get sender name for notification
    const senderName = messageWithSender.senderName || 'Alguém';
    const messagePreview = String(messageWithSender.text || 'Você recebeu uma nova mensagem.');
    const truncatedPreview = messagePreview.length > 50 ? messagePreview.substring(0, 50) + '...' : messagePreview;

    // Remote push (dev build): only if recipient isn't currently connected via Socket.IO.
    if (!isUserOnline(recipientUserId)) {
      sendExpoPushToUser(recipientUserId, {
        title: `${senderName} enviou uma mensagem`,
        body: truncatedPreview,
        data: { type: 'message', threadId, senderName }
      }).catch(() => {});
    }

    return res.json({
      message: {
        id: messageWithSender.id,
        threadId: messageWithSender.threadId,
        sender: {
          id: messageWithSender.senderUserId,
          name: messageWithSender.senderName,
          avatarUrl: messageWithSender.senderAvatarUrl
        },
        text: messageWithSender.text,
        createdAt: messageWithSender.createdAt,
        readAt: messageWithSender.readAt
      }
    });
  }
}
