import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '../config';
import { useAuth } from '../auth/AuthContext';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Alert } from 'react-native';

type UnreadMap = Record<number, number>;

type ChatContextValue = {
  socket: Socket | null;
  unreadByThread: UnreadMap;
  bumpUnread: (threadId: number) => void;
  markThreadRead: (threadId: number) => void;
  setActiveThreadId: (threadId: number | null) => void;
  activeThreadId: number | null;
};

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { token, logout } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [unreadByThread, setUnreadByThread] = useState<UnreadMap>({});
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null);
  const activeThreadIdRef = useRef<number | null>(null);
  const handlingRef = useRef(false);

  useEffect(() => {
    (async () => {
      // Best-effort: request permission for local notifications (especially iOS).
      try {
        if (Device.isDevice) {
          const perms = await Notifications.getPermissionsAsync();
          if (!perms.granted) await Notifications.requestPermissionsAsync();
        }
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.DEFAULT
        });
      } catch {
        // ignore
      }
    })();
  }, []);

  function bumpUnread(threadId: number) {
    setUnreadByThread((prev) => ({ ...prev, [threadId]: (prev[threadId] || 0) + 1 }));
  }

  function markThreadRead(threadId: number) {
    setUnreadByThread((prev) => {
      const { [threadId]: _ignore, ...rest } = prev;
      return rest;
    });
  }

  function setActiveThreadIdSafe(threadId: number | null) {
    activeThreadIdRef.current = threadId;
    setActiveThreadId(threadId);
  }

  useEffect(() => {
    if (!token) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocket(null);
      setUnreadByThread({});
      setActiveThreadIdSafe(null);
      return;
    }

    const socket = io(API_BASE_URL, { transports: ['websocket'], autoConnect: true });
    socketRef.current = socket;
    setSocket(socket);

    socket.on('connect', () => {
      socket.emit('auth', token);
    });

    socket.on('auth:blocked', async () => {
      if (handlingRef.current) return;
      handlingRef.current = true;
      try {
        await logout();
        Alert.alert('Conta bloqueada', 'Entre em contato com o administrador.');
      } finally {
        handlingRef.current = false;
      }
    });

    socket.on('auth:deleted', async () => {
      if (handlingRef.current) return;
      handlingRef.current = true;
      try {
        await logout();
        Alert.alert('Conta removida', 'Entre em contato com o administrador.');
      } finally {
        handlingRef.current = false;
      }
    });

    socket.on('message:new', (payload: any) => {
      const threadId = Number(payload?.threadId);
      const isActive = Number.isFinite(threadId) && activeThreadIdRef.current === threadId;
      if (Number.isFinite(threadId) && !isActive) bumpUnread(threadId);
      // Local notification (works in Expo Go). Remote push can be added later if needed.
      if (!isActive) {
        const senderName = payload?.message?.sender?.name || 'Alguém';
        const messageText = payload?.message?.text ? String(payload.message.text) : 'Você recebeu uma nova mensagem.';
        const truncatedText = messageText.length > 50 ? messageText.substring(0, 50) + '...' : messageText;
        Notifications.scheduleNotificationAsync({
          content: {
            title: `${senderName} enviou uma mensagem`,
            body: truncatedText,
            data: { type: 'message', threadId, senderName }
          },
          trigger: null
        }).catch(() => {});
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const value = useMemo<ChatContextValue>(
    () => ({
      socket,
      unreadByThread,
      bumpUnread,
      markThreadRead,
      activeThreadId,
      setActiveThreadId: setActiveThreadIdSafe
    }),
    [socket, unreadByThread, activeThreadId]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within ChatProvider');
  return ctx;
}

