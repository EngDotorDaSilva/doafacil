import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useChat } from '../../chat/ChatContext';
import { Avatar } from '../../ui/Avatar';
import { colors, shadows, borderRadius, spacing } from '../../ui/theme';

type Thread = {
  id: number;
  donorUser: { id: number; name: string; avatarUrl?: string | null };
  centerUser: { id: number; name: string; avatarUrl?: string | null };
  center: null | { id: number; displayName: string };
  updatedAt: string;
  unreadCount: number;
  lastMessage: null | { id: number; text: string; createdAt: string; senderUserId: number; readAt?: string | null };
};

const ThreadRow = React.memo(function ThreadRow({
  title,
  subtitle,
  time,
  avatarUrl,
  unread,
  isOnline,
  onPress
}: {
  title: string;
  subtitle: string;
  time: string;
  avatarUrl: string | null;
  unread: number;
  isOnline?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.card}>
      <View style={{ position: 'relative' }}>
        <Avatar name={title} url={avatarUrl} size={44} />
        {isOnline && <View style={styles.onlineIndicator} />}
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {time}
          </Text>
        </View>
        <Text style={[styles.preview, unread > 0 && styles.previewUnread]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {unread ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
});

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Agora';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays === 1) return 'Ontem';
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
}

export function ChatsScreen({ navigation }: any) {
  const { user } = useAuth();
  const { unreadByThread, socket } = useChat();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(false);
  const [typingByThread, setTypingByThread] = useState<Record<number, boolean>>({});
  const [search, setSearch] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Set<number>>(new Set());

  async function load() {
    setLoading(true);
    try {
      const params: any = {};
      if (search.trim()) params.search = search.trim();
      if (unreadOnly) params.unreadOnly = 1;
      const resp = await api.get('/threads', { params });
      setThreads(resp.data.threads);
    } catch (e: any) {
      Alert.alert('Erro', e?.response?.data?.error || 'Falha ao carregar conversas.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().finally(() => {});
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => load(), 300);
    return () => clearTimeout(timeout);
  }, [search, unreadOnly]);

  useFocusEffect(
    useCallback(() => {
      load().finally(() => {});
    }, [])
  );

  useEffect(() => {
    if (!socket) return;
    const handler = (payload: any) => {
      const threadId = Number(payload?.threadId);
      const msg = payload?.message;
      if (!Number.isFinite(threadId) || !msg) return;
      setThreads((prev) => {
        const idx = prev.findIndex((t) => t.id === threadId);
        if (idx === -1) return prev;
        const next = [...prev];
        const t = next[idx];
        next[idx] = {
          ...t,
          updatedAt: msg.createdAt || new Date().toISOString(),
          unreadCount: (t.unreadCount || 0) + 1,
          lastMessage: {
            id: Number(msg.id),
            text: String(msg.text || ''),
            createdAt: String(msg.createdAt || new Date().toISOString()),
            senderUserId: Number(msg.sender?.id),
            readAt: msg.readAt ? String(msg.readAt) : null
          }
        };
        // move to top
        const [moved] = next.splice(idx, 1);
        next.unshift(moved);
        return next;
      });
    };
    socket.on('message:new', handler);
    return () => {
      socket.off('message:new', handler);
    };
  }, [socket]);

  useEffect(() => {
    if (!socket) return;
    const handler = (payload: any) => {
      const threadId = Number(payload?.threadId);
      const fromUserId = Number(payload?.fromUserId);
      const isTyping = !!payload?.isTyping;
      if (!Number.isFinite(threadId) || !Number.isFinite(fromUserId)) return;
      if (fromUserId === user?.id) return;
      setTypingByThread((prev) => ({ ...prev, [threadId]: isTyping }));
      if (isTyping) {
        setTimeout(() => {
          setTypingByThread((prev) => ({ ...prev, [threadId]: false }));
        }, 3000);
      }
    };
    socket.on('typing', handler);
    return () => {
      socket.off('typing', handler);
    };
  }, [socket, user?.id]);

  useEffect(() => {
    if (!socket) return;
    const handler = (payload: any) => {
      const threadId = Number(payload?.threadId);
      const readerUserId = Number(payload?.readerUserId);
      if (!Number.isFinite(threadId) || !Number.isFinite(readerUserId)) return;
      if (readerUserId === user?.id) return;
      const readAt = payload?.readAt ? String(payload.readAt) : new Date().toISOString();
      setThreads((prev) =>
        prev.map((t) => {
          if (t.id !== threadId || !t.lastMessage) return t;
          if (t.lastMessage.senderUserId !== user?.id) return t;
          return { ...t, lastMessage: { ...t.lastMessage, readAt } };
        })
      );
    };
    socket.on('thread:read', handler);
    return () => {
      socket.off('thread:read', handler);
    };
  }, [socket, user?.id]);

  useEffect(() => {
    if (!socket) return;
    const onUserOnline = (payload: any) => {
      const userId = Number(payload?.userId);
      if (Number.isFinite(userId)) {
        setOnlineUsers((prev) => new Set([...prev, userId]));
      }
    };
    const onUserOffline = (payload: any) => {
      const userId = Number(payload?.userId);
      if (Number.isFinite(userId)) {
        setOnlineUsers((prev) => {
          const next = new Set(prev);
          next.delete(userId);
          return next;
        });
      }
    };
    socket.on('user:online', onUserOnline);
    socket.on('user:offline', onUserOffline);
    return () => {
      socket.off('user:online', onUserOnline);
      socket.off('user:offline', onUserOffline);
    };
  }, [socket]);

  const data = useMemo(() => threads, [threads]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.header}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar conversas..."
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
        />
        <Pressable
          onPress={() => setUnreadOnly(!unreadOnly)}
          style={[styles.filterBtn, unreadOnly && styles.filterBtnActive]}
        >
          <Text style={[styles.filterBtnText, unreadOnly && styles.filterBtnTextActive]}>
            {unreadOnly ? '📬 Não lidas' : '📭 Todas'}
          </Text>
        </Pressable>
      </View>
      <FlatList
        data={data}
        keyExtractor={(t) => String(t.id)}
        contentContainerStyle={{ padding: 16, gap: 12, paddingTop: 8 }}
        ListHeaderComponent={<Text style={styles.hint}>{loading ? 'Carregando...' : 'Suas conversas'}</Text>}
        refreshing={loading}
        onRefresh={load}
        renderItem={({ item: t }) => {
          const otherName = user?.role === 'donor' ? t.center?.displayName || t.centerUser.name : t.donorUser.name;
          const otherAvatar =
            user?.role === 'donor' ? (t.centerUser.avatarUrl as any) || null : (t.donorUser.avatarUrl as any) || null;
          const otherUserId = user?.role === 'donor' ? t.centerUser.id : t.donorUser.id;
          const unread = t.unreadCount || unreadByThread[t.id] || 0;
          const isTyping = !!typingByThread[t.id];
          const last = isTyping ? 'Digitando...' : t.lastMessage?.text ? t.lastMessage.text : 'Toque para abrir';
          const isMine = t.lastMessage && t.lastMessage.senderUserId === user?.id;
          const prefix = isTyping ? '' : isMine ? 'Você: ' : '';
          const ticks = isTyping ? '' : isMine ? (t.lastMessage?.readAt ? ' ✓✓' : t.lastMessage ? ' ✓' : '') : '';
          const time = t.lastMessage?.createdAt
            ? formatTime(t.lastMessage.createdAt)
            : formatTime(t.updatedAt);
          const isOnline = onlineUsers.has(otherUserId);

          return (
            <ThreadRow
              title={otherName}
              subtitle={`${prefix}${last}${ticks}`}
              time={time}
              avatarUrl={otherAvatar}
              unread={unread}
              isOnline={isOnline}
              onPress={() => navigation.navigate('ChatThread', { threadId: t.id })}
            />
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <Text style={{ color: colors.muted, textAlign: 'center', marginTop: 20 }}>
              {unreadOnly ? 'Nenhuma conversa não lida.' : search ? 'Nenhuma conversa encontrada.' : 'Nenhuma conversa ainda.'}
            </Text>
          ) : (
            <Text style={{ color: colors.muted }}> </Text>
          )
        }
        initialNumToRender={10}
        maxToRenderPerBatch={12}
        windowSize={8}
        removeClippedSubviews
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    padding: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    ...shadows.small
  },
  searchInput: {
    backgroundColor: colors.card2,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    ...shadows.small
  },
  filterBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.card2,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignSelf: 'flex-start',
    ...shadows.small
  },
  filterBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryDark
  },
  filterBtnText: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 13
  },
  filterBtnTextActive: {
    color: '#fff',
    fontWeight: '900'
  },
  hint: { color: colors.muted, fontWeight: '800', marginBottom: spacing.sm, fontSize: 13 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadows.small
  },
  title: { color: colors.text, fontWeight: '900', fontSize: 16 },
  meta: { color: colors.muted, fontWeight: '700', fontSize: 12 },
  preview: { color: colors.muted, fontWeight: '700', fontSize: 12 },
  previewUnread: { color: colors.text, fontWeight: '900', fontSize: 13 },
  badge: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    minWidth: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primaryDark,
    ...shadows.small
  },
  badgeText: { color: '#fff', fontWeight: '900', fontSize: 11 },
  onlineIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.success,
    borderWidth: 3,
    borderColor: colors.bg,
    ...shadows.small
  }
});
