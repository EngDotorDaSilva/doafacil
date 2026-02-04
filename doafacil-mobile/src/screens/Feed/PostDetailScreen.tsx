import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Image, KeyboardAvoidingView, Platform, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useChat } from '../../chat/ChatContext';
import { Button } from '../../ui/Button';
import { Avatar } from '../../ui/Avatar';
import { ReactionButtons } from '../../ui/ReactionButtons';
import { Screen } from '../../ui/Screen';
import { colors } from '../../ui/theme';

type Post = {
  id: number;
  text: string;
  category: string;
  imageUrl?: string | null;
  imageUrls?: string[] | null;
  commentCount?: number;
  reactions?: { like: number; love: number; dislike: number };
  myReaction?: 'like' | 'love' | 'dislike' | null;
  isSaved?: boolean;
  createdAt: string;
  author: { id: number; name: string; role: 'donor' | 'center' | 'admin'; avatarUrl?: string | null };
  center: null | { id: number; displayName: string; address: string; lat: number | null; lng: number | null };
  distanceKm?: number | null;
};

type Comment = {
  id: number;
  postId: number;
  text: string;
  createdAt: string;
  updatedAt: string;
  author: { id: number; name: string; role: 'donor' | 'center' | 'admin'; avatarUrl?: string | null };
};

const CommentRow = React.memo(function CommentRow({
  c,
  canEdit,
  canDelete,
  isAdmin,
  isOwner,
  onEdit,
  onDelete,
  onPressAuthor,
  onReport
}: {
  c: Comment;
  canEdit: boolean;
  canDelete: boolean;
  isAdmin: boolean;
  isOwner: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onPressAuthor?: () => void;
  onReport?: () => void;
}) {
  return (
    <Pressable onLongPress={() => (canEdit ? onEdit() : null)} style={styles.comment}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <Pressable onPress={onPressAuthor} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <Avatar name={c.author.name} url={(c.author.avatarUrl as any) || null} size={34} />
          <Text style={styles.author}>
            {c.author.name} <Text style={styles.role}>({c.author.role})</Text>
          </Text>
        </Pressable>
        <Text style={styles.time}>{new Date(c.createdAt).toLocaleString()}</Text>
      </View>
      <Text style={styles.commentText}>{c.text}</Text>
      {c.updatedAt !== c.createdAt ? <Text style={styles.edited}>editado</Text> : null}

      <View style={styles.actionsRow}>
        {canDelete ? (
          <>
            {canEdit ? (
              <Pressable onPress={onEdit} style={styles.actionBtn}>
                <Text style={styles.actionText}>Editar</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={onDelete} style={[styles.actionBtn, { backgroundColor: colors.danger, borderColor: colors.danger }]}>
              <Text style={styles.actionText}>{isAdmin && !isOwner ? 'Remover (moderar)' : 'Apagar'}</Text>
            </Pressable>
          </>
        ) : null}
        {onReport ? (
          <Pressable onPress={onReport} style={[styles.actionBtn, { backgroundColor: colors.warning, borderColor: colors.warning }]}>
            <Text style={styles.actionText}>🚨 Denunciar</Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
});

export function PostDetailScreen({ route, navigation }: any) {
  const { user, token } = useAuth();
  const { socket } = useChat();
  const post = (route.params?.post || null) as Post | null;

  const listRef = useRef<FlatList<Comment>>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentCount, setCommentCount] = useState<number>(post?.commentCount ?? 0);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [postState, setPostState] = useState<Post>(post!);

  const canComment = useMemo(() => !!token, [token]);
  const dedupedComments = useMemo(() => {
    const seen = new Set<number>();
    return comments.filter((c) => {
      if (!Number.isFinite(c.id)) return false;
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
  }, [comments]);

  const load = useCallback(async () => {
    if (!post) return;
    setLoading(true);
    try {
      const resp = await api.get(`/posts/${post.id}/comments`);
      setComments(resp.data.comments);
      setCommentCount(resp.data.comments?.length ?? 0);
    } catch (e: any) {
      Alert.alert('Erro', e?.response?.data?.error || 'Falha ao carregar comentários.');
    } finally {
      setLoading(false);
    }
  }, [post?.id]);

  const submit = useCallback(async () => {
    if (!post) return;
    const t = text.trim();
    if (!t) return;
    if (!canComment) {
      Alert.alert('Login necessário', 'Entre para comentar.');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        const resp = await api.put(`/comments/${editingId}`, { text: t });
        setComments((prev) => prev.map((c) => (c.id === editingId ? resp.data.comment : c)));
        setEditingId(null);
        setText('');
      } else {
        const resp = await api.post(`/posts/${post.id}/comments`, { text: t });
        const created = resp.data.comment as Comment | undefined;
        if (created?.id) {
          // Avoid duplicates when the socket event arrives before this state update is applied.
          setComments((prev) => (prev.some((x) => x.id === created.id) ? prev : [...prev, created]));
        }
        setCommentCount((c) => c + 1);
        setText('');
        requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
      }
    } catch (e: any) {
      Alert.alert('Erro', e?.response?.data?.error || 'Falha ao enviar.');
    } finally {
      setSaving(false);
    }
  }, [post?.id, text, canComment, editingId]);

  const remove = useCallback(async (commentId: number) => {
    try {
      await api.delete(`/comments/${commentId}`);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      setCommentCount((c) => Math.max(0, c - 1));
      if (editingId === commentId) {
        setEditingId(null);
        setText('');
      }
    } catch (e: any) {
      Alert.alert('Erro', e?.response?.data?.error || 'Falha ao apagar.');
    }
  }, [editingId]);

  const startEdit = useCallback((c: Comment) => {
    if (!user) return;
    const isOwner = c.author.id === user.id;
    const isAdmin = user.role === 'admin';
    if (!isOwner && !isAdmin) return;
    setEditingId(c.id);
    setText(c.text);
  }, [user?.id, user?.role]);

  useEffect(() => {
    load().finally(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post?.id]);

  useEffect(() => {
    if (!socket || !post) return;

    const onNew = (payload: any) => {
      if (Number(payload?.postId) !== post.id) return;
      const c = payload?.comment as Comment | undefined;
      if (c && Number(c.postId) === post.id) {
        setComments((prev) => {
          if (prev.some((x) => x.id === c.id)) return prev;
          return [...prev, c];
        });
      }
      if (payload?.commentCount != null) setCommentCount(Number(payload.commentCount) || 0);
    };
    const onUpdated = (payload: any) => {
      if (Number(payload?.postId) !== post.id) return;
      const c = payload?.comment as Comment | undefined;
      if (!c) return;
      setComments((prev) => prev.map((x) => (x.id === c.id ? c : x)));
    };
    const onDeleted = (payload: any) => {
      if (Number(payload?.postId) !== post.id) return;
      const commentId = Number(payload?.commentId);
      if (!Number.isFinite(commentId)) return;
      setComments((prev) => prev.filter((x) => x.id !== commentId));
      if (payload?.commentCount != null) setCommentCount(Number(payload.commentCount) || 0);
    };
    const onCount = (payload: any) => {
      if (Number(payload?.postId) !== post.id) return;
      if (payload?.commentCount != null) setCommentCount(Number(payload.commentCount) || 0);
    };

    socket.on('comment:new', onNew);
    socket.on('comment:updated', onUpdated);
    socket.on('comment:deleted', onDeleted);
    socket.on('post:commentCount', onCount);
    return () => {
      socket.off('comment:new', onNew);
      socket.off('comment:updated', onUpdated);
      socket.off('comment:deleted', onDeleted);
      socket.off('post:commentCount', onCount);
    };
  }, [socket, post?.id]);

  useEffect(() => {
    if (post) {
      setPostState(post);
    }
  }, [post]);

  const handleReaction = useCallback(
    async (type: 'like' | 'love' | 'dislike' | null) => {
      if (!postState) return;
      try {
        if (type === null) {
          await api.delete(`/posts/${postState.id}/reactions`);
        } else {
          await api.post(`/posts/${postState.id}/reactions`, { type });
        }
        // Update local state optimistically
        const currentReactions = postState.reactions || { like: 0, love: 0, dislike: 0 };
        const currentMyReaction = postState.myReaction;
        let newReactions = { ...currentReactions };
        let newMyReaction: 'like' | 'love' | 'dislike' | null = type;

        // Remove old reaction count
        if (currentMyReaction) {
          newReactions[currentMyReaction] = Math.max(0, newReactions[currentMyReaction] - 1);
        }

        // Add new reaction count
        if (type) {
          newReactions[type] = (newReactions[type] || 0) + 1;
        }

        setPostState({ ...postState, reactions: newReactions, myReaction: newMyReaction });
      } catch (e: any) {
        Alert.alert('Erro', e?.response?.data?.error || 'Falha ao reagir.');
      }
    },
    [postState]
  );

  if (!post) {
    return (
      <Screen>
        <Text style={{ color: colors.muted }}>Publicação não encontrada.</Text>
      </Screen>
    );
  }

  const header = (
    <View style={{ padding: 16, gap: 12 }}>
      <View style={styles.card}>
        <View style={styles.postHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
            <Avatar name={post.author.name} url={(post.author.avatarUrl as any) || null} size={36} />
            <View style={{ flex: 1 }}>
              <Text style={styles.authorName}>
                {post.author.name} <Text style={styles.role}>({post.author.role})</Text>
              </Text>
              <Text style={styles.meta}>{new Date(post.createdAt).toLocaleString()}</Text>
            </View>
          </View>
          <Text style={styles.category}>{post.category}</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
          {user?.role === 'center' && post.author.id === user.id ? (
            <>
              <Pressable
                onPress={() => navigation.navigate('PostEditor', { post })}
                style={[styles.actionBtn, { backgroundColor: colors.card2, borderColor: colors.border }]}
              >
                <Text style={styles.actionText}>Editar</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  Alert.alert('Apagar publicação?', 'Esta ação pode ser desfeita apenas pelo administrador.', [
                    { text: 'Cancelar', style: 'cancel' },
                    {
                      text: 'Apagar',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          await api.delete(`/posts/${post.id}`);
                          // go back to feed
                          navigation.goBack();
                        } catch (e: any) {
                          Alert.alert('Erro', e?.response?.data?.error || 'Falha ao apagar publicação.');
                        }
                      }
                    }
                  ]);
                }}
                style={[styles.actionBtn, { backgroundColor: colors.danger, borderColor: colors.danger }]}
              >
                <Text style={styles.actionText}>Apagar</Text>
              </Pressable>
            </>
          ) : null}
          {user && post.author.id !== user.id ? (
            <Pressable
              onPress={() => navigation.navigate('Report', { targetType: 'post', targetId: post.id })}
              style={[styles.actionBtn, { backgroundColor: colors.warning, borderColor: colors.warning }]}
            >
              <Text style={styles.actionText}>🚨 Denunciar</Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.text}>{postState.text}</Text>
        {postState.center ? (
          <Text style={styles.meta}>
            {postState.center.displayName} • {postState.center.address}
            {postState.distanceKm != null ? ` • ${postState.distanceKm.toFixed(1)}km` : ''}
          </Text>
        ) : null}

        {postState.reactions && user ? (
          <View style={styles.reactionsContainer}>
            <ReactionButtons
              counts={postState.reactions}
              myReaction={postState.myReaction || null}
              onReaction={handleReaction}
            />
          </View>
        ) : null}

        {user ? (
          <View style={styles.actionsRow}>
            <Pressable
              onPress={async () => {
                try {
                  if (postState.isSaved) {
                    await api.delete(`/posts/${postState.id}/save`);
                  } else {
                    await api.post(`/posts/${postState.id}/save`);
                  }
                  setPostState({ ...postState, isSaved: !postState.isSaved });
                } catch (e: any) {
                  Alert.alert('Erro', e?.response?.data?.error || 'Falha ao salvar publicação.');
                }
              }}
              style={[styles.iconBtn, postState.isSaved && styles.iconBtnActive]}
            >
              <Text style={styles.iconBtnText}>{postState.isSaved ? '🔖' : '📌'}</Text>
              <Text style={styles.iconBtnLabel}>{postState.isSaved ? 'Salvo' : 'Salvar'}</Text>
            </Pressable>
            <Pressable
              onPress={async () => {
                try {
                  const message = `${postState.text}\n\n${postState.center ? `Centro: ${postState.center.displayName}` : `Por: ${postState.author.name}`}`;
                  await Share.share({
                    message,
                    title: 'Publicação DoaFácil'
                  });
                  // Create share in backend
                  try {
                    await api.post(`/posts/${postState.id}/share`);
                  } catch (e: any) {
                    // Ignore errors - share might already exist
                  }
                } catch (e: any) {
                  // User cancelled or error
                }
              }}
              style={styles.iconBtn}
            >
              <Text style={styles.iconBtnText}>📤</Text>
              <Text style={styles.iconBtnLabel}>Compartilhar</Text>
            </Pressable>
          </View>
        ) : null}

        {((postState.imageUrls && postState.imageUrls.length) || postState.imageUrl) ? (
          <FlatList
            data={(postState.imageUrls && postState.imageUrls.length ? postState.imageUrls : postState.imageUrl ? [postState.imageUrl] : []) as string[]}
            keyExtractor={(u, idx) => `${u}:${idx}`}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10 }}
            renderItem={({ item }) => <Image source={{ uri: item }} style={styles.image} />}
          />
        ) : null}
      </View>

      <Text style={styles.hint}>{loading ? 'Carregando comentários...' : `Comentários (${commentCount})`}</Text>
    </View>
  );

  const renderItem = useCallback(
    ({ item }: { item: Comment }) => {
      const isOwner = !!user && item.author.id === user.id;
      const isAdmin = user?.role === 'admin';
      const canDelete = isOwner || isAdmin;
      const canEdit = isOwner || isAdmin;
      return (
        <CommentRow
          c={item}
          isOwner={!!isOwner}
          isAdmin={!!isAdmin}
          canEdit={!!canEdit}
          canDelete={!!canDelete}
          onEdit={() => startEdit(item)}
          onDelete={() => remove(item.id)}
          onPressAuthor={() => navigation.navigate('UserProfile', { userId: item.author.id })}
          onReport={user && item.author.id !== user.id ? () => navigation.navigate('Report', { targetType: 'comment', targetId: item.id }) : undefined}
        />
      );
    },
    [user?.id, user?.role, startEdit, remove, navigation]
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={listRef}
        data={dedupedComments}
        keyExtractor={(c) => String(c.id)}
        renderItem={renderItem}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: 140 }}
        ListEmptyComponent={
          !loading ? (
            <View style={{ paddingHorizontal: 16 }}>
              <Text style={{ color: colors.muted }}>Seja o primeiro a comentar.</Text>
            </View>
          ) : null
        }
        initialNumToRender={10}
        maxToRenderPerBatch={12}
        windowSize={8}
        removeClippedSubviews
      />

      <View style={styles.composerFixed}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={editingId ? 'Editar comentário...' : 'Escreva um comentário...'}
          placeholderTextColor={colors.muted}
          style={styles.input}
          multiline
        />
        <View style={{ gap: 8 }}>
          <Button title={saving ? '...' : editingId ? 'Salvar' : 'Enviar'} onPress={submit} disabled={saving} />
          {editingId ? (
            <Button
              title="Cancelar"
              variant="secondary"
              onPress={() => {
                setEditingId(null);
                setText('');
              }}
            />
          ) : null}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 10 },
  postHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  authorName: { color: colors.text, fontWeight: '900' },
  category: { color: colors.primary, fontWeight: '900', textTransform: 'uppercase', fontSize: 12 },
  text: { color: colors.text, fontSize: 15, fontWeight: '600' },
  meta: { color: colors.muted, fontWeight: '700', fontSize: 12 },
  image: { width: '100%', height: 240, borderRadius: 14, backgroundColor: colors.card2 },
  reactionsContainer: { marginTop: 8, marginBottom: 8 },
  iconBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.card2, borderWidth: 1, borderColor: colors.border },
  iconBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  iconBtnText: { fontSize: 16 },
  iconBtnLabel: { color: colors.text, fontWeight: '700', fontSize: 12 },
  hint: { color: colors.muted, fontWeight: '800' },
  composerFixed: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12, gap: 10, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, minHeight: 54, textAlignVertical: 'top' },
  comment: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 6, marginHorizontal: 16, marginBottom: 10 },
  author: { color: colors.text, fontWeight: '900' },
  role: { color: colors.muted, fontWeight: '800' },
  time: { color: colors.muted, fontWeight: '700', fontSize: 12 },
  commentText: { color: colors.text, fontWeight: '600' },
  edited: { color: colors.muted, fontWeight: '800', fontSize: 12 },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  actionBtn: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.card2, borderWidth: 1, borderColor: colors.border },
  actionText: { color: '#fff', fontWeight: '900' }
});

