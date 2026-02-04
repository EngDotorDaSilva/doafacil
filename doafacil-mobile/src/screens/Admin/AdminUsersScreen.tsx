import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Screen } from '../../ui/Screen';
import { colors } from '../../ui/theme';
import { DateRangePicker } from '../../ui/DateRangePicker';

type UserRow = {
  id: number;
  name: string;
  email: string;
  role: 'donor' | 'center' | 'admin';
  phone?: string | null;
  avatarUrl?: string | null;
  isBlocked: number;
  blockedReason?: string | null;
  deletedAt?: string | null;
  deletedReason?: string | null;
  createdAt: string;
};

export function AdminUsersScreen() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reasonById, setReasonById] = useState<Record<number, string>>({});
  const [deleteReasonById, setDeleteReasonById] = useState<Record<number, string>>({});
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'donor' | 'center' | 'admin'>('all');
  const [blockedFilter, setBlockedFilter] = useState<'all' | '1' | '0'>('all');
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'createdAt' | 'name' | 'email'>('createdAt');
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
      if (roleFilter !== 'all') params.role = roleFilter;
      if (blockedFilter !== 'all') params.isBlocked = blockedFilter;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;

      const resp = await api.get('/admin/users', { params });
      const nextUsers = resp.data.users as UserRow[];
      const total = resp.data.total || 0;

      if (reset) {
        setUsers(nextUsers);
        setOffset(nextUsers.length);
      } else {
        setUsers((prev) => {
          // Deduplicate by id
          const existingIds = new Set(prev.map((u) => u.id));
          const newUsers = nextUsers.filter((u) => !existingIds.has(u.id));
          return [...prev, ...newUsers];
        });
        setOffset(offset + nextUsers.length);
      }
      setHasMore(nextUsers.length === limit && (reset ? nextUsers.length : offset + nextUsers.length) < total);
    } catch (e: any) {
      Alert.alert('Erro', e?.response?.data?.error || 'Falha ao carregar usuários.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  async function block(u: UserRow) {
    const reason = (reasonById[u.id] || '').trim();
    try {
      await api.post(`/admin/users/${u.id}/block`, reason ? { reason } : {});
      await load(true);
    } catch (e: any) {
      Alert.alert('Erro', e?.response?.data?.error || 'Falha ao bloquear usuário.');
    }
  }

  async function unblock(u: UserRow) {
    try {
      await api.post(`/admin/users/${u.id}/unblock`);
      await load(true);
    } catch (e: any) {
      Alert.alert('Erro', e?.response?.data?.error || 'Falha ao desbloquear usuário.');
    }
  }

  async function remove(u: UserRow) {
    const reason = (deleteReasonById[u.id] || '').trim();
    Alert.alert('Remover usuário', `Remover ${u.name}? Isso apagará dados relacionados.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/admin/users/${u.id}`, { data: reason ? { reason } : {} });
            await load(true);
          } catch (e: any) {
            Alert.alert('Erro', e?.response?.data?.error || 'Falha ao remover usuário.');
          }
        }
      }
    ]);
  }

  async function restore(u: UserRow) {
    try {
      await api.post(`/admin/users/${u.id}/restore`);
      await load(true);
    } catch (e: any) {
      Alert.alert('Erro', e?.response?.data?.error || 'Falha ao restaurar usuário.');
    }
  }

  useEffect(() => {
    if (user?.role === 'admin') {
      load(true).catch((e) => {
        console.error('Error loading users:', e);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  useEffect(() => {
    if (user?.role === 'admin') {
      const timeout = setTimeout(() => {
        load(true).catch((e) => {
          console.error('Error loading users:', e);
        });
      }, 500);
      return () => clearTimeout(timeout);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, roleFilter, blockedFilter, dateFrom, dateTo, sortBy, sortOrder, includeDeleted]);

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
          placeholder="Buscar por nome ou email..."
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
        />
        <View style={styles.filterRow}>
          <Pressable
            onPress={() => setRoleFilter(roleFilter === 'all' ? 'donor' : roleFilter === 'donor' ? 'center' : roleFilter === 'center' ? 'admin' : 'all')}
            style={[styles.chip, roleFilter !== 'all' && styles.chipActive]}
          >
            <Text style={[styles.chipText, roleFilter !== 'all' && styles.chipTextActive]}>
              {roleFilter === 'all' ? 'Todas roles' : roleFilter === 'donor' ? 'Doadores' : roleFilter === 'center' ? 'Centros' : 'Admins'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setBlockedFilter(blockedFilter === 'all' ? '1' : blockedFilter === '1' ? '0' : 'all')}
            style={[styles.chip, blockedFilter !== 'all' && styles.chipActive]}
          >
            <Text style={[styles.chipText, blockedFilter !== 'all' && styles.chipTextActive]}>
              {blockedFilter === 'all' ? 'Todos' : blockedFilter === '1' ? 'Bloqueados' : 'Não bloqueados'}
            </Text>
          </Pressable>
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
            onPress={() => setSortBy(sortBy === 'createdAt' ? 'name' : sortBy === 'name' ? 'email' : 'createdAt')}
            style={styles.chip}
          >
            <Text style={styles.chipText}>
              Ordenar: {sortBy === 'createdAt' ? 'Data' : sortBy === 'name' ? 'Nome' : 'Email'}
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
        data={users}
        keyExtractor={(u) => String(u.id)}
        onRefresh={() => load(true)}
        refreshing={loading}
        onEndReached={() => {
          if (!loadingMore && hasMore) load(false);
        }}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <Text style={styles.hint}>
            {loading ? 'Carregando...' : `${users.length} usuário${users.length !== 1 ? 's' : ''}`}
          </Text>
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={{ padding: 16 }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null
        }
        renderItem={({ item: u }) => {
          const blocked = Number(u.isBlocked) === 1;
          const deleted = !!u.deletedAt;
          return (
            <View style={styles.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Avatar name={u.name} url={(u.avatarUrl as any) || null} size={44} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.title}>
                    {u.name} <Text style={styles.role}>({u.role})</Text>
                  </Text>
                  <Text style={styles.meta}>{u.email}</Text>
                  {u.phone ? <Text style={styles.meta}>Contato: {u.phone}</Text> : null}
                  <Text style={styles.meta}>
                    Status:{' '}
                    <Text style={{ color: deleted ? colors.danger : blocked ? colors.danger : '#78FFB7', fontWeight: '900' }}>
                      {deleted ? 'removido' : blocked ? 'bloqueado' : 'ativo'}
                    </Text>
                    {deleted && u.deletedReason ? ` • Motivo: ${u.deletedReason}` : ''}
                    {!deleted && blocked && u.blockedReason ? ` • Motivo: ${u.blockedReason}` : ''}
                  </Text>
                  <Text style={styles.meta}>Criado: {new Date(u.createdAt).toLocaleString()}</Text>
                </View>
              </View>

              {u.role !== 'admin' ? (
                <>
                  {deleted ? (
                    <View style={styles.actionsRow}>
                      <Pressable onPress={() => restore(u)} style={styles.actionBtn}>
                        <Text style={styles.actionText}>Restaurar</Text>
                      </Pressable>
                    </View>
                  ) : !blocked ? (
                    <View style={{ gap: 8 }}>
                      <TextInput
                        value={reasonById[u.id] || ''}
                        onChangeText={(t) => setReasonById((prev) => ({ ...prev, [u.id]: t }))}
                        placeholder="Motivo do bloqueio (opcional)"
                        placeholderTextColor={colors.muted}
                        style={styles.input}
                      />
                      <TextInput
                        value={deleteReasonById[u.id] || ''}
                        onChangeText={(t) => setDeleteReasonById((prev) => ({ ...prev, [u.id]: t }))}
                        placeholder="Motivo da remoção (opcional)"
                        placeholderTextColor={colors.muted}
                        style={styles.input}
                      />
                      <View style={styles.actionsRow}>
                        <Pressable
                          onPress={() => block(u)}
                          style={[styles.actionBtn, { backgroundColor: colors.danger, borderColor: colors.danger }]}
                        >
                          <Text style={styles.actionText}>Bloquear</Text>
                        </Pressable>
                        <Pressable onPress={() => remove(u)} style={styles.actionBtn}>
                          <Text style={styles.actionText}>Remover</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.actionsRow}>
                      <Pressable onPress={() => unblock(u)} style={styles.actionBtn}>
                        <Text style={styles.actionText}>Desbloquear</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => remove(u)}
                        style={[styles.actionBtn, { backgroundColor: colors.danger, borderColor: colors.danger }]}
                      >
                        <Text style={styles.actionText}>Remover</Text>
                      </Pressable>
                    </View>
                  )}
                </>
              ) : null}
            </View>
          );
        }}
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
  title: { color: colors.text, fontWeight: '900', fontSize: 16 },
  role: { color: colors.muted, fontWeight: '800' },
  meta: { color: colors.muted, fontWeight: '700', fontSize: 12 },
  input: {
    backgroundColor: colors.card2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text
  },
  actionsRow: { flexDirection: 'row', gap: 10 },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.card2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center'
  },
  actionText: { color: '#fff', fontWeight: '900' }
});
