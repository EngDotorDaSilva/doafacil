import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Avatar } from '../../ui/Avatar';
import { Screen } from '../../ui/Screen';
import { colors } from '../../ui/theme';
import { DateRangePicker } from '../../ui/DateRangePicker';

type AdminComment = {
  id: number;
  postId: number;
  text: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  deletedReason?: string | null;
  author: { id: number; name: string; role: 'donor' | 'center' | 'admin'; avatarUrl?: string | null };
  post: { category: string; createdAt: string };
};

export function AdminCommentsScreen() {
  const { user } = useAuth();
  const [comments, setComments] = useState<AdminComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reasonById, setReasonById] = useState<Record<number, string>>({});
  const [postIdFilter, setPostIdFilter] = useState('');
  const [search, setSearch] = useState('');
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'createdAt' | 'postId'>('createdAt');
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
      const pid = Number(postIdFilter.trim());
      if (postIdFilter.trim() && Number.isFinite(pid)) params.postId = pid;
      if (includeDeleted) params.includeDeleted = 1;
      if (search.trim()) params.search = search.trim();
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;

      const resp = await api.get('/admin/comments', { params });
      const nextComments = resp.data.comments as AdminComment[];
      const total = resp.data.total || 0;

      if (reset) {
        setComments(nextComments);
        setOffset(nextComments.length);
      } else {
        setComments((prev) => {
          // Deduplicate by id
          const existingIds = new Set(prev.map((c) => c.id));
          const newComments = nextComments.filter((c) => !existingIds.has(c.id));
          return [...prev, ...newComments];
        });
        setOffset(offset + nextComments.length);
      }
      setHasMore(nextComments.length === limit && (reset ? nextComments.length : offset + nextComments.length) < total);
    } catch (e: any) {
      Alert.alert('Erro', e?.response?.data?.error || 'Falha ao carregar comentários.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  async function restore(c: AdminComment) {
    try {
      await api.post(`/admin/comments/${c.id}/restore`);
      await load(true);
    } catch (e: any) {
      Alert.alert('Erro', e?.response?.data?.error || 'Falha ao restaurar comentário.');
    }
  }

  async function remove(c: AdminComment) {
    const reason = (reasonById[c.id] || '').trim();
    Alert.alert('Remover comentário', 'Deseja remover este comentário?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/admin/comments/${c.id}`, { data: reason ? { reason } : {} });
            await load(true);
          } catch (e: any) {
            Alert.alert('Erro', e?.response?.data?.error || 'Falha ao remover comentário.');
          }
        }
      }
    ]);
  }

  useEffect(() => {
    if (user?.role === 'admin') {
      load(true).catch((e) => {
        console.error('Error loading comments:', e);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  useEffect(() => {
    if (user?.role === 'admin') {
      const timeout = setTimeout(() => {
        load(true).catch((e) => {
          console.error('Error loading comments:', e);
        });
      }, 500);
      return () => clearTimeout(timeout);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postIdFilter, search, dateFrom, dateTo, sortBy, sortOrder, includeDeleted]);

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
        <TextInput
          value={postIdFilter}
          onChangeText={setPostIdFilter}
          placeholder="Filtrar por Post ID (opcional)"
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
          keyboardType="numeric"
        />
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
            onPress={() => setSortBy(sortBy === 'createdAt' ? 'postId' : 'createdAt')}
            style={styles.chip}
          >
            <Text style={styles.chipText}>
              Ordenar: {sortBy === 'createdAt' ? 'Data' : 'Post ID'}
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
              {includeDeleted ? 'Com removidos' : 'Sem removidos'}
            </Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={comments}
        keyExtractor={(c) => String(c.id)}
        onRefresh={() => load(true)}
        refreshing={loading}
        onEndReached={() => {
          if (!loadingMore && hasMore) load(false);
        }}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <Text style={styles.hint}>
            {loading ? 'Carregando...' : `${comments.length} comentário${comments.length !== 1 ? 's' : ''}`}
          </Text>
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={{ padding: 16 }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          !loading ? (
            <View style={{ padding: 16 }}>
              <Text style={{ color: colors.muted }}>Nenhum comentário encontrado.</Text>
            </View>
          ) : null
        }
        renderItem={({ item: c }) => (
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar name={c.author.name} url={(c.author.avatarUrl as any) || null} size={40} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.title}>
                  {c.author.name} <Text style={styles.role}>({c.author.role})</Text>
                </Text>
                <Text style={styles.meta}>
                  Post #{c.postId} • {c.post.category} • {new Date(c.createdAt).toLocaleString()}
                </Text>
                <Text style={styles.meta}>
                  Status:{' '}
                  <Text style={{ color: c.deletedAt ? colors.danger : '#78FFB7', fontWeight: '900' }}>
                    {c.deletedAt ? 'removido' : 'ativo'}
                  </Text>
                  {c.deletedAt && c.deletedReason ? ` • Motivo: ${c.deletedReason}` : ''}
                </Text>
              </View>
            </View>

            <Text style={styles.text}>{c.text}</Text>

            {!c.deletedAt ? (
              <>
                <TextInput
                  value={reasonById[c.id] || ''}
                  onChangeText={(t) => setReasonById((prev) => ({ ...prev, [c.id]: t }))}
                  placeholder="Motivo da remoção (opcional)"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                />
                <Pressable onPress={() => remove(c)} style={styles.removeBtn}>
                  <Text style={styles.removeText}>Remover (moderar)</Text>
                </Pressable>
              </>
            ) : (
              <Pressable onPress={() => restore(c)} style={styles.restoreBtn}>
                <Text style={styles.restoreText}>Restaurar</Text>
              </Pressable>
            )}
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
  input: {
    backgroundColor: colors.card2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text
  },
  removeBtn: { backgroundColor: colors.danger, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  removeText: { color: '#fff', fontWeight: '900' },
  restoreBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  restoreText: { color: '#fff', fontWeight: '900' }
});
