import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Avatar } from '../../ui/Avatar';
import { Screen } from '../../ui/Screen';
import { colors } from '../../ui/theme';
import { DateRangePicker } from '../../ui/DateRangePicker';

type AdminPost = {
  id: number;
  text: string;
  category: string;
  imageUrl?: string | null;
  imageUrls?: string[] | null;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  deletedReason?: string | null;
  author: { id: number; name: string; role: 'donor' | 'center' | 'admin'; avatarUrl?: string | null };
  center: null | { id: number; displayName: string; approved: boolean };
};

const CATEGORIES = ['todas', 'roupa', 'alimento', 'livros', 'brinquedos', 'eletronicos', 'moveis', 'outros'];

export function AdminPostsScreen() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reasonById, setReasonById] = useState<Record<number, string>>({});
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('todas');
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'createdAt' | 'commentCount'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const limit = 50;

  async function load(reset = false) {
    if (reset) {
      setLoading(true);
      setOffset(0);
    } else {
      setLoadingMore(true);
    }
    try {
      const params: any = {
        limit,
        offset: reset ? 0 : offset,
        sortBy,
        sortOrder
      };
      if (includeDeleted) params.includeDeleted = 1;
      if (search.trim()) params.search = search.trim();
      if (category !== 'todas') params.category = category;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;

      const resp = await api.get('/admin/posts', { params });
      const nextPosts = resp.data.posts as AdminPost[];
      const total = resp.data.total || 0;

      if (reset) {
        setPosts(nextPosts);
        setOffset(nextPosts.length);
      } else {
        setPosts((prev) => {
          // Deduplicate by id
          const existingIds = new Set(prev.map((p) => p.id));
          const newPosts = nextPosts.filter((p) => !existingIds.has(p.id));
          return [...prev, ...newPosts];
        });
        setOffset(offset + nextPosts.length);
      }
      setHasMore(nextPosts.length === limit && (reset ? nextPosts.length : offset + nextPosts.length) < total);
    } catch (e: any) {
      Alert.alert('Erro', e?.response?.data?.error || 'Falha ao carregar publicações.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  async function remove(post: AdminPost) {
    const reason = (reasonById[post.id] || '').trim();
    Alert.alert('Remover publicação', 'Deseja remover esta publicação?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/admin/posts/${post.id}`, { data: reason ? { reason } : {} });
            await load(true);
          } catch (e: any) {
            Alert.alert('Erro', e?.response?.data?.error || 'Falha ao remover publicação.');
          }
        }
      }
    ]);
  }

  async function restore(postId: number) {
    try {
      await api.post(`/admin/posts/${postId}/restore`);
      await load(true);
    } catch (e: any) {
      Alert.alert('Erro', e?.response?.data?.error || 'Falha ao restaurar publicação.');
    }
  }

  useEffect(() => {
    if (user?.role === 'admin') {
      load(true).catch((e) => {
        console.error('Error loading posts:', e);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  useEffect(() => {
    if (user?.role === 'admin') {
      const timeout = setTimeout(() => {
        load(true).catch((e) => {
          console.error('Error loading posts:', e);
        });
      }, 500);
      return () => clearTimeout(timeout);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, category, dateFrom, dateTo, sortBy, sortOrder, includeDeleted]);

  if (user?.role !== 'admin') {
    return (
      <Screen>
        <Text style={{ color: colors.muted }}>Apenas administradores.</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.filters}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar por texto ou autor..."
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
        />
        <View style={styles.filterRow}>
          {CATEGORIES.map((c) => (
            <Pressable
              key={c}
              onPress={() => setCategory(c)}
              style={[styles.chip, category === c && styles.chipActive]}
            >
              <Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c}</Text>
            </Pressable>
          ))}
        </View>
        <DateRangePicker
          dateFrom={dateFrom}
          dateTo={dateTo}
          onSelect={(from, to) => {
            setDateFrom(from);
            setDateTo(to);
          }}
          onClear={() => {
            setDateFrom(null);
            setDateTo(null);
          }}
        />
        <View style={styles.filterRow}>
          <Pressable
            onPress={() => setSortBy(sortBy === 'createdAt' ? 'commentCount' : 'createdAt')}
            style={styles.chip}
          >
            <Text style={styles.chipText}>
              Ordenar: {sortBy === 'createdAt' ? 'Data' : 'Comentários'}
            </Text>
          </Pressable>
          <Pressable onPress={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')} style={styles.chip}>
            <Text style={styles.chipText}>{sortOrder === 'desc' ? '↓' : '↑'}</Text>
          </Pressable>
          <Pressable
            onPress={() => setIncludeDeleted(!includeDeleted)}
            style={[styles.chip, includeDeleted && styles.chipActive]}
          >
            <Text style={[styles.chipText, includeDeleted && styles.chipTextActive]}>
              {includeDeleted ? 'Com removidas' : 'Sem removidas'}
            </Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={posts}
        keyExtractor={(p) => String(p.id)}
        onRefresh={() => load(true)}
        refreshing={loading}
        onEndReached={() => {
          if (!loadingMore && hasMore) load(false);
        }}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <Text style={styles.hint}>
            {loading ? 'Carregando...' : `${posts.length} publicação${posts.length !== 1 ? 'ões' : ''}`}
          </Text>
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={{ padding: 16 }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null
        }
        renderItem={({ item: p }) => (
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <Avatar name={p.author.name} url={(p.author.avatarUrl as any) || null} size={34} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>
                    {p.author.name} <Text style={styles.role}>({p.author.role})</Text>
                  </Text>
                  <Text style={styles.meta}>
                    {new Date(p.createdAt).toLocaleString()} • {p.category} • comentários: {p.commentCount}
                  </Text>
                  {p.center ? (
                    <Text style={styles.meta}>
                      Centro: {p.center.displayName} • {p.center.approved ? 'aprovado' : 'não aprovado'}
                    </Text>
                  ) : null}
                  <Text style={styles.meta}>
                    Status:{' '}
                    <Text style={{ color: p.deletedAt ? colors.danger : '#78FFB7', fontWeight: '900' }}>
                      {p.deletedAt ? 'removido' : 'ativo'}
                    </Text>
                    {p.deletedAt && p.deletedReason ? ` • Motivo: ${p.deletedReason}` : ''}
                  </Text>
                </View>
              </View>
              {p.deletedAt ? (
                <Pressable onPress={() => restore(p.id)} style={styles.restoreBtn}>
                  <Text style={styles.restoreText}>Restaurar</Text>
                </Pressable>
              ) : (
                <Pressable onPress={() => remove(p)} style={styles.removeBtn}>
                  <Text style={styles.removeText}>Remover</Text>
                </Pressable>
              )}
            </View>

            <Text style={styles.text} numberOfLines={5}>
              {p.text}
            </Text>
            {p.imageUrls && p.imageUrls.length > 0 ? (
              <FlatList
                data={p.imageUrls}
                keyExtractor={(url, idx) => `${url}-${idx}`}
                horizontal
                showsHorizontalScrollIndicator={false}
                renderItem={({ item: url }) => <Image source={{ uri: url }} style={styles.image} />}
              />
            ) : p.imageUrl ? (
              <Image source={{ uri: p.imageUrl }} style={styles.image} />
            ) : null}

            {!p.deletedAt ? (
              <TextInput
                value={reasonById[p.id] || ''}
                onChangeText={(t) => setReasonById((prev) => ({ ...prev, [p.id]: t }))}
                placeholder="Motivo da remoção (opcional)"
                placeholderTextColor={colors.muted}
                style={styles.input}
              />
            ) : null}
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: {
    padding: 16,
    gap: 10,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  searchInput: {
    backgroundColor: colors.card2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 14
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.card2,
    borderWidth: 1,
    borderColor: colors.border
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  chipText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 12
  },
  chipTextActive: {
    color: '#fff'
  },
  hint: { color: colors.muted, fontWeight: '800', padding: 16 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12
  },
  title: { color: colors.text, fontWeight: '900' },
  role: { color: colors.muted, fontWeight: '800' },
  meta: { color: colors.muted, fontWeight: '700', fontSize: 12 },
  text: { color: colors.text, fontWeight: '600' },
  image: { width: '100%', height: 220, borderRadius: 14, backgroundColor: colors.card2 },
  removeBtn: { backgroundColor: colors.danger, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  removeText: { color: '#fff', fontWeight: '900' },
  restoreBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  restoreText: { color: '#fff', fontWeight: '900' },
  input: {
    backgroundColor: colors.card2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text
  }
});
