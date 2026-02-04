import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View, Keyboard } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useChat } from '../../chat/ChatContext';
import { Avatar } from '../../ui/Avatar';
import { colors, shadows, borderRadius, spacing } from '../../ui/theme';

type Msg = {
  id: number;
  threadId: number;
  sender: { id: number; name: string; avatarUrl?: string | null };
  text: string;
  createdAt: string;
  readAt?: string | null;
};

function formatMessageTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Agora';
  if (diffMins < 60) return `${diffMins}m atrás`;
  if (diffHours < 24) return date.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return `Ontem ${date.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`;
  if (diffDays < 7) {
    const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    return `${days[date.getDay()]} ${date.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return date.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function shouldShowDateSeparator(current: Msg, previous: Msg | null): boolean {
  if (!previous) return true;
  const currentDate = new Date(current.createdAt);
  const previousDate = new Date(previous.createdAt);
  return currentDate.toDateString() !== previousDate.toDateString();
}

function formatDateSeparator(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) return 'Hoje';
  if (diffDays === 1) return 'Ontem';
  if (diffDays < 7) {
    const days = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    return days[date.getDay()];
  }
  return date.toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function ChatThreadScreen({ route }: any) {
  const { user } = useAuth();
  const { markThreadRead, socket, setActiveThreadId } = useChat();
  const navigation = useNavigation();
  const threadId = route.params.threadId as number;
  const [messages, setMessages] = useState<Msg[]>([]);
  const messagesRef = useRef<Msg[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const typingTimeoutRef = useRef<any>(null);
  const stopTypingTimeoutRef = useRef<any>(null);
  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const composerRef = useRef<View>(null);
  const textRef = useRef(text);
  const socketRef = useRef(socket);
  const threadIdRef = useRef(threadId);
  const userRef = useRef(user);

  // Keep refs in sync
  useEffect(() => {
    textRef.current = text;
    socketRef.current = socket;
    threadIdRef.current = threadId;
    userRef.current = user;
  }, [text, socket, threadId, user]);

  // Keep messagesRef in sync with messages state
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const load = useCallback(async (beforeId?: number) => {
    try {
      const params: any = { limit: 50 };
      if (beforeId) params.beforeId = beforeId;
      const resp = await api.get(`/threads/${threadId}/messages`, { params });
      const newMessages = resp.data.messages as Msg[];
      const hasMoreMessages = resp.data.hasMore || false;

      if (beforeId) {
        // Loading older messages - prepend
        setMessages((prev) => {
          const merged = [...newMessages, ...prev];
          const seen = new Set<number>();
          return merged.filter((m) => {
            if (seen.has(m.id)) return false;
            seen.add(m.id);
            return true;
          });
        });
      } else {
        // Initial load or refresh
        setMessages(newMessages);
      }
      setHasMore(hasMoreMessages);
      markThreadRead(threadId);
    } catch (e: any) {
      Alert.alert('Erro', e?.response?.data?.error || 'Falha ao carregar mensagens.');
    }
  }, [threadId, markThreadRead]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const oldestId = messages[0].id;
      await load(oldestId);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, messages.length, load]);

  const markReadServer = useCallback(async () => {
    try {
      await api.post(`/threads/${threadId}/read`);
    } catch {
      // ignore
    }
  }, [threadId]);

  const send = useCallback(async () => {
    const currentText = textRef.current.trim();
    if (!currentText) return;
    
    setSending(true);
    const currentSocket = socketRef.current;
    const currentThreadId = threadIdRef.current;
    
    try {
      if (currentSocket) {
        currentSocket.emit('typing', { threadId: currentThreadId, isTyping: false });
      }
      
      const resp = await api.post(`/threads/${currentThreadId}/messages`, { text: currentText });
      
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        if (seen.has(resp.data.message.id)) return prev;
        return [...prev, resp.data.message];
      });
      
      setText('');
      textRef.current = '';
      markThreadRead(currentThreadId);
      
      // Scroll to bottom after sending
      setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true });
      }, 100);
      
      // Dismiss keyboard after sending
      Keyboard.dismiss();
    } catch (e: any) {
      Alert.alert('Erro', e?.response?.data?.error || 'Falha ao enviar mensagem.');
    } finally {
      setSending(false);
    }
  }, [markThreadRead]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  // Configure header with back button
  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <Pressable
          onPress={() => navigation.goBack()}
          style={{
            marginLeft: Platform.OS === 'ios' ? 0 : 16,
            padding: 8,
            paddingHorizontal: 12,
            borderRadius: borderRadius.md,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6
          }}
        >
          <Text style={{ fontSize: 20, fontWeight: '900' }}>←</Text>
          <Text style={{ fontSize: 16, fontWeight: '800', color: colors.primary }}>Voltar</Text>
        </Pressable>
      )
    });
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      setActiveThreadId(threadId);
      markThreadRead(threadId);
      markReadServer();
      return () => {
        if (socketRef.current) socketRef.current.emit('typing', { threadId, isTyping: false });
        if (stopTypingTimeoutRef.current) clearTimeout(stopTypingTimeoutRef.current);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        setActiveThreadId(null);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [threadId])
  );

  useEffect(() => {
    const currentSocket = socketRef.current;
    if (!currentSocket) return;
    
    const handler = (payload: any) => {
      const incomingThreadId = Number(payload?.threadId);
      if (incomingThreadId !== threadIdRef.current) return;
      const msg = payload?.message as Msg | undefined;
      if (!msg) return;
      
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        if (seen.has(msg.id)) return prev;
        return [...prev, msg];
      });
      
      markThreadRead(threadIdRef.current);
      markReadServer();
      
      // Scroll to bottom on new message
      setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true });
      }, 100);
    };

    const onTyping = (payload: any) => {
      const incomingThreadId = Number(payload?.threadId);
      const fromUserId = Number(payload?.fromUserId);
      if (incomingThreadId !== threadIdRef.current) return;
      const currentUser = userRef.current;
      if (!currentUser?.id || fromUserId === currentUser.id) return;
      setOtherTyping(!!payload?.isTyping);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (payload?.isTyping) {
        typingTimeoutRef.current = setTimeout(() => setOtherTyping(false), 3000);
      }
    };

    const onRead = (payload: any) => {
      const incomingThreadId = Number(payload?.threadId);
      const readerUserId = Number(payload?.readerUserId);
      if (incomingThreadId !== threadIdRef.current) return;
      const currentUser = userRef.current;
      if (!currentUser?.id || readerUserId === currentUser.id) return;
      const readAt = payload?.readAt ? String(payload.readAt) : new Date().toISOString();
      setMessages((prev) =>
        prev.map((m) => {
          // Mark my messages as read
          if (m.sender.id === currentUser.id && !m.readAt) return { ...m, readAt };
          return m;
        })
      );
    };

    currentSocket.on('message:new', handler);
    currentSocket.on('typing', onTyping);
    currentSocket.on('thread:read', onRead);
    
    return () => {
      currentSocket.off('message:new', handler);
      currentSocket.off('typing', onTyping);
      currentSocket.off('thread:read', onRead);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  // Render item without useCallback to avoid dependency issues
  // Using refs to access current values
  const renderItem = ({ item, index }: { item: Msg; index: number }) => {
    const currentUser = userRef.current;
    const currentMessages = messagesRef.current;
    const mine = item.sender.id === currentUser?.id;
    const previous = index > 0 ? currentMessages[index - 1] : null;
    const next = index < currentMessages.length - 1 ? currentMessages[index + 1] : null;
    const showDateSeparator = shouldShowDateSeparator(item, previous);
    const isConsecutive = next && next.sender.id === item.sender.id && 
      new Date(next.createdAt).getTime() - new Date(item.createdAt).getTime() < 60000; // menos de 1 minuto
    const ticks = mine ? (item.readAt ? '✓✓' : '✓') : '';

    return (
      <View style={styles.messageContainer}>
        {showDateSeparator && (
          <View style={styles.dateSeparator}>
            <Text style={styles.dateSeparatorText}>{formatDateSeparator(item.createdAt)}</Text>
          </View>
        )}
        <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
          {!mine && !isConsecutive ? (
            <Avatar name={item.sender.name} url={(item.sender.avatarUrl as any) || null} size={36} />
          ) : !mine ? (
            <View style={styles.avatarSpacer} />
          ) : null}
          <View style={[styles.bubbleContainer, mine ? styles.bubbleContainerMine : styles.bubbleContainerTheirs]}>
            {!mine && !isConsecutive ? (
              <Text style={styles.sender}>{item.sender.name}</Text>
            ) : null}
            <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
              <Text style={[styles.msg, !mine && { color: colors.text }]}>{item.text}</Text>
            </View>
            <View style={styles.footer}>
              <Text style={styles.time}>
                {formatMessageTime(item.createdAt)}
              </Text>
              {mine && (
                <Text style={[styles.ticks, item.readAt ? styles.ticksRead : styles.ticksUnread]}>
                  {ticks}
                </Text>
              )}
            </View>
          </View>
        </View>
      </View>
    );
  };

  const handleTextChange = useCallback((t: string) => {
    setText(t);
    if (socketRef.current) {
      socketRef.current.emit('typing', { threadId: threadIdRef.current, isTyping: true });
    }
    if (stopTypingTimeoutRef.current) clearTimeout(stopTypingTimeoutRef.current);
    stopTypingTimeoutRef.current = setTimeout(() => {
      if (socketRef.current) {
        socketRef.current.emit('typing', { threadId: threadIdRef.current, isTyping: false });
      }
    }, 700);
  }, []);

  useEffect(() => {
    const keyboardWillShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (event) => {
        // Scroll to end when keyboard shows
        setTimeout(() => {
          listRef.current?.scrollToEnd({ animated: true });
        }, Platform.OS === 'ios' ? 250 : 100);
      }
    );

    const keyboardWillHide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        // Optional: scroll to end when keyboard hides
      }
    );

    return () => {
      keyboardWillShow.remove();
      keyboardWillHide.remove();
    };
  }, []);

  const handleInputFocus = useCallback(() => {
    // Scroll to end when input is focused
    setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 300);
  }, []);

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView 
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.select({ ios: 0, android: 0 })}
      >
        <View style={styles.listContainer}>
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => String(m.id)}
            contentContainerStyle={styles.list}
            renderItem={renderItem}
            inverted={false}
            onEndReached={loadMore}
            onEndReachedThreshold={0.3}
            extraData={messages.length}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={true}
            ListHeaderComponent={
              loadingMore ? (
                <View style={styles.loadingMore}>
                  <ActivityIndicator color={colors.primary} size="small" />
                </View>
              ) : null
            }
            initialNumToRender={18}
            maxToRenderPerBatch={20}
            windowSize={10}
            removeClippedSubviews={false}
          />
        </View>

        {otherTyping ? (
          <View style={styles.typingWrap}>
            <Text style={styles.typingText}>✍️ Digitando...</Text>
          </View>
        ) : null}

        <View ref={composerRef} style={styles.composer}>
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={handleTextChange}
            onFocus={handleInputFocus}
            placeholder="Digite uma mensagem..."
            placeholderTextColor={colors.muted}
            style={styles.input}
            multiline
            maxLength={2000}
            returnKeyType="default"
            blurOnSubmit={false}
          />
          <Pressable 
            onPress={send} 
            disabled={sending || !text.trim()} 
            style={[styles.sendBtn, (sending || !text.trim()) && styles.sendBtnDisabled]}
          >
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.sendText}>Enviar</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  listContainer: {
    flex: 1,
    minHeight: 0 // Important for flex layout
  },
  list: { 
    padding: spacing.md, 
    paddingBottom: spacing.xxxl, // Extra padding to ensure messages are visible
    gap: spacing.xs,
    flexGrow: 1
  },
  loadingMore: {
    padding: spacing.lg,
    alignItems: 'center'
  },
  messageContainer: {
    marginBottom: spacing.xs
  },
  dateSeparator: {
    alignItems: 'center',
    marginVertical: spacing.lg,
    marginHorizontal: spacing.lg
  },
  dateSeparatorText: {
    color: colors.textSecondary,
    fontWeight: '800',
    fontSize: 11,
    backgroundColor: colors.card2,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.small
  },
  row: { 
    flexDirection: 'row', 
    alignItems: 'flex-end', 
    gap: spacing.sm, 
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.xs
  },
  rowMine: {
    justifyContent: 'flex-end'
  },
  rowTheirs: {
    justifyContent: 'flex-start'
  },
  avatarSpacer: {
    width: 36,
    height: 36
  },
  bubbleContainer: {
    maxWidth: '75%',
    gap: 4
  },
  bubbleContainerMine: {
    alignItems: 'flex-end'
  },
  bubbleContainerTheirs: {
    alignItems: 'flex-start'
  },
  bubble: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    ...shadows.small
  },
  mine: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: borderRadius.sm
  },
  theirs: {
    backgroundColor: colors.card,
    borderBottomLeftRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border
  },
  sender: { 
    color: colors.primaryLight, 
    fontWeight: '800', 
    fontSize: 12, 
    marginBottom: 4,
    paddingHorizontal: spacing.xs
  },
  msg: { 
    color: '#fff', 
    fontWeight: '600', 
    fontSize: 15, 
    lineHeight: 22,
    letterSpacing: 0.2
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xs,
    marginTop: 4,
    paddingHorizontal: spacing.xs
  },
  time: { 
    color: colors.muted, 
    fontWeight: '700', 
    fontSize: 10
  },
  ticks: {
    fontSize: 12,
    fontWeight: '900'
  },
  ticksRead: {
    color: colors.primaryLight
  },
  ticksUnread: {
    color: colors.muted
  },
  typingWrap: { 
    paddingHorizontal: spacing.md, 
    paddingBottom: spacing.sm,
    paddingTop: spacing.xs
  },
  typingText: { 
    color: colors.primary, 
    fontWeight: '800', 
    fontStyle: 'italic', 
    fontSize: 13 
  },
  composer: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    paddingBottom: Platform.OS === 'ios' ? spacing.md : spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
    ...shadows.medium,
    minHeight: Platform.OS === 'ios' ? 60 : 70,
    maxHeight: 150
  },
  input: {
    flex: 1,
    backgroundColor: colors.card2,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    maxHeight: Platform.OS === 'ios' ? 100 : 120,
    minHeight: 44,
    fontSize: 15,
    fontWeight: '600',
    textAlignVertical: 'top',
    includeFontPadding: false // Android only - removes extra padding
  },
  sendBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 75,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.primaryDark,
    ...shadows.small
  },
  sendBtnDisabled: {
    opacity: 0.5
  },
  sendText: { 
    color: '#fff', 
    fontWeight: '900', 
    fontSize: 14, 
    letterSpacing: 0.3 
  }
});
