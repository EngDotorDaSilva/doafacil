import { Server } from 'socket.io';
import { verifyToken } from './auth.js';
import { db } from './db.js';

export function createSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
  });

  const onlineCounts = new Map();

  io.on('connection', (socket) => {
    socket.data.userId = null;

    socket.on('auth', async (token) => {
      try {
        const payload = verifyToken(token);
        const userId = Number(payload.sub);
        const row = await db.get(`SELECT isBlocked, deletedAt FROM users WHERE id = ?`, [userId]);
        if (!row) {
          socket.emit('auth:error');
          return;
        }
        if (row.deletedAt) {
          socket.emit('auth:deleted');
          socket.disconnect(true);
          return;
        }
        if (Number(row.isBlocked) === 1) {
          socket.emit('auth:blocked');
          socket.disconnect(true);
          return;
        }
        socket.data.userId = userId;
        socket.join(`user:${userId}`);
        const wasOffline = (onlineCounts.get(userId) || 0) === 0;
        onlineCounts.set(userId, (onlineCounts.get(userId) || 0) + 1);
        socket.emit('auth:ok', { userId });
        // Notify others that user came online (only if was offline)
        if (wasOffline) {
          io.emit('user:online', { userId });
        }
      } catch {
        socket.emit('auth:error');
      }
    });

    socket.on('typing', async (payload) => {
      try {
        const userId = socket.data.userId;
        const threadId = Number(payload?.threadId);
        const isTyping = !!payload?.isTyping;
        if (!userId || !Number.isFinite(threadId)) return;

        const thread = await db.get(`SELECT donorUserId, centerUserId FROM threads WHERE id = ?`, [threadId]);
        if (!thread) return;
        if (thread.donorUserId !== userId && thread.centerUserId !== userId) return;
        const recipientUserId = userId === thread.donorUserId ? thread.centerUserId : thread.donorUserId;
        io.to(`user:${recipientUserId}`).emit('typing', { threadId, fromUserId: userId, isTyping });
      } catch {
        // ignore
      }
    });

    socket.on('disconnect', () => {
      const userId = socket.data.userId;
      if (!userId) return;
      const next = (onlineCounts.get(userId) || 1) - 1;
      if (next <= 0) {
        onlineCounts.delete(userId);
        // Notify others that user went offline
        io.emit('user:offline', { userId });
      } else {
        onlineCounts.set(userId, next);
      }
    });
  });

  function notifyUser(userId, event, payload) {
    io.to(`user:${userId}`).emit(event, payload);
  }

  function isUserOnline(userId) {
    return (onlineCounts.get(userId) || 0) > 0;
  }

  return { io, notifyUser, isUserOnline };
}

