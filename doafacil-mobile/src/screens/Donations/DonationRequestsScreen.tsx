import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useChat } from '../../chat/ChatContext';
import { Button } from '../../ui/Button';
import { Screen } from '../../ui/Screen';
import { Avatar } from '../../ui/Avatar';
import { Skeleton } from '../../ui/Skeleton';
import { colors, shadows, borderRadius, spacing } from '../../ui/theme';

type DonationRequest = {
  id: number;
  itemId: number;
  itemType: string;
  itemDescription: string | null;
  itemQuantity: number | null;
  status: 'pending' | 'accepted' | 'completed' | 'cancelled';
  message: string | null;
  createdAt: string;
  donorId?: number;
  donorName?: string;
  donorAvatarUrl?: string | null;
  centerName?: string;
  centerAddress?: string;
};

export function DonationRequestsScreen({ navigation }: any) {
  const { user } = useAuth();
  const { socket } = useChat();
  const [requests, setRequests] = useState<DonationRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'accepted' | 'completed' | 'cancelled'>('all');
  const [stats, setStats] = useState({ total: 0, pending: 0, accepted: 0, completed: 0, cancelled: 0 });

  async function load() {
    if (refreshing) return;
    setLoading(true);
    try {
      const endpoint = user?.role === 'center' ? '/donations/center' : '/donations/mine';
      const params = statusFilter !== 'all' ? { status: statusFilter } : {};
      const resp = await api.get(endpoint, { params });
      setRequests(resp.data.requests);
      if (resp.data.stats) {
        setStats(resp.data.stats);
      }
    } catch (e: any) {
      Alert.alert('Erro', e?.response?.data?.error || 'Falha ao carregar pedidos.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await load();
  }

  async function updateStatus(requestId: number, newStatus: 'accepted' | 'completed' | 'cancelled') {
    const statusLabels = {
      accepted: 'aceitar',
      completed: 'marcar como concluído',
      cancelled: 'cancelar'
    };
    const confirmMessage = {
      accepted: 'Deseja aceitar este pedido de doação?',
      completed: 'Deseja marcar esta doação como concluída?',
      cancelled: 'Deseja cancelar este pedido?'
    };
    
    Alert.alert(
      'Confirmar',
      confirmMessage[newStatus],
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            try {
              await api.put(`/donations/${requestId}/status`, { status: newStatus });
              Alert.alert('Sucesso', `Pedido ${statusLabels[newStatus]} com sucesso!`);
              load();
            } catch (e: any) {
              Alert.alert('Erro', e?.response?.data?.error || 'Falha ao atualizar status.');
            }
          }
        }
      ]
    );
  }

  useEffect(() => {
    load();
  }, [user?.role, statusFilter]);

  useEffect(() => {
    if (!socket) return;
    const onRequestUpdated = () => {
      load();
    };
    socket.on('donation:request:updated', onRequestUpdated);
    socket.on('donation:request:new', onRequestUpdated);
    return () => {
      socket.off('donation:request:updated', onRequestUpdated);
      socket.off('donation:request:new', onRequestUpdated);
    };
  }, [socket, load]);

  const filteredRequests = requests;

  const header = (
    <View style={{ padding: spacing.lg, gap: spacing.md }}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>
            {user?.role === 'center' ? 'Pedidos de Doação' : 'Meus Pedidos'}
          </Text>
          <Text style={styles.subtitle}>
            {stats.total} total • {stats.pending} pendentes • {stats.completed} concluídos
          </Text>
        </View>
      </View>

      <View style={styles.filters}>
        {(['all', 'pending', 'accepted', 'completed', 'cancelled'] as const).map((status) => (
          <Pressable
            key={status}
            onPress={() => setStatusFilter(status)}
            style={[styles.filterChip, statusFilter === status && styles.filterChipActive]}
          >
            <Text style={[styles.filterText, statusFilter === status && styles.filterTextActive]}>
              {status === 'all' ? 'Todos' : status === 'pending' ? 'Pendentes' : status === 'accepted' ? 'Aceitos' : status === 'completed' ? 'Concluídos' : 'Cancelados'}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  if (loading && requests.length === 0) {
    return (
      <Screen>
        {header}
        <View style={{ gap: 12, padding: spacing.lg }}>
          {Array.from({ length: 3 }).map((_, idx) => (
            <View key={idx} style={styles.skeletonCard}>
              <Skeleton width="60%" height={20} radius={8} />
              <Skeleton width="100%" height={14} radius={8} />
              <Skeleton width="40%" height={14} radius={8} />
            </View>
          ))}
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={filteredRequests}
        keyExtractor={(item) => String(item.id)}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: spacing.lg }}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              {user?.role === 'center' && item.donorName ? (
                <View style={styles.userInfo}>
                  <Avatar name={item.donorName} url={item.donorAvatarUrl} size={40} />
                  <View style={styles.userDetails}>
                    <Text style={styles.userName}>{item.donorName}</Text>
                    <Text style={styles.itemType}>{item.itemType}</Text>
                  </View>
                </View>
              ) : (
                <View>
                  <Text style={styles.itemType}>{item.itemType}</Text>
                  {item.centerName ? <Text style={styles.centerName}>{item.centerName}</Text> : null}
                </View>
              )}
              <View style={[styles.statusBadge, getStatusStyle(item.status)]}>
                <Text style={styles.statusText}>{getStatusLabel(item.status)}</Text>
              </View>
            </View>

            {item.itemDescription ? <Text style={styles.description}>{item.itemDescription}</Text> : null}
            {item.itemQuantity ? <Text style={styles.quantity}>Quantidade: {item.itemQuantity}</Text> : null}
            {item.message ? (
              <View style={styles.messageBox}>
                <Text style={styles.messageLabel}>Mensagem:</Text>
                <Text style={styles.message}>{item.message}</Text>
              </View>
            ) : null}
            <Text style={styles.date}>
              {new Date(item.createdAt).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </Text>

            {user?.role === 'center' && item.status === 'pending' ? (
              <View style={styles.actions}>
                <Pressable
                  onPress={() => updateStatus(item.id, 'accepted')}
                  style={[styles.actionBtn, styles.acceptBtn]}
                >
                  <Text style={styles.actionText}>✓ Aceitar Pedido</Text>
                </Pressable>
                <Pressable
                  onPress={() => updateStatus(item.id, 'cancelled')}
                  style={[styles.actionBtn, styles.cancelBtn]}
                >
                  <Text style={styles.actionText}>✕ Recusar</Text>
                </Pressable>
              </View>
            ) : null}

            {item.status === 'accepted' ? (
              <View style={styles.actions}>
                <Pressable
                  onPress={() => updateStatus(item.id, 'completed')}
                  style={[styles.actionBtn, styles.completeBtn]}
                >
                  <Text style={styles.actionText}>✓ Marcar como Concluído</Text>
                </Pressable>
                {user?.role === 'center' ? (
                  <Pressable
                    onPress={() => updateStatus(item.id, 'cancelled')}
                    style={[styles.actionBtn, styles.cancelBtn]}
                  >
                    <Text style={styles.actionText}>✕ Cancelar</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {item.status === 'pending' && user?.role === 'donor' ? (
              <View style={styles.actions}>
                <Pressable
                  onPress={() => updateStatus(item.id, 'cancelled')}
                  style={[styles.actionBtn, styles.cancelBtn]}
                >
                  <Text style={styles.actionText}>✕ Cancelar Pedido</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {statusFilter !== 'all' ? 'Nenhum pedido encontrado com este filtro.' : 'Nenhum pedido encontrado.'}
            </Text>
            {statusFilter !== 'all' ? (
              <Button title="Limpar filtro" variant="secondary" onPress={() => setStatusFilter('all')} />
            ) : null}
          </View>
        }
      />
    </Screen>
  );
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'pending':
      return 'Pendente';
    case 'accepted':
      return 'Aceito';
    case 'completed':
      return 'Concluído';
    case 'cancelled':
      return 'Cancelado';
    default:
      return status;
  }
}

function getStatusStyle(status: string) {
  switch (status) {
    case 'pending':
      return { backgroundColor: colors.warning };
    case 'accepted':
      return { backgroundColor: colors.primary };
    case 'completed':
      return { backgroundColor: colors.success };
    case 'cancelled':
      return { backgroundColor: colors.muted };
    default:
      return { backgroundColor: colors.card2 };
  }
}

const styles = StyleSheet.create({
  header: { marginBottom: spacing.lg },
  title: { color: colors.text, fontSize: 24, fontWeight: '900' },
  subtitle: { color: colors.muted, fontSize: 13, fontWeight: '700', marginTop: spacing.xs },
  skeletonCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.small
  },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  filterChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card2
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.text, fontWeight: '800', fontSize: 13 },
  filterTextActive: { color: '#fff' },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.small
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm },
  userInfo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  userDetails: { flex: 1 },
  userName: { color: colors.text, fontWeight: '900', fontSize: 16 },
  itemType: { color: colors.text, fontSize: 16, fontWeight: '800', textTransform: 'capitalize' },
  centerName: { color: colors.textSecondary, fontSize: 14, marginTop: spacing.xs },
  statusBadge: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full
  },
  statusText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  description: { color: colors.textSecondary, marginBottom: spacing.sm },
  quantity: { color: colors.muted, marginBottom: spacing.xs },
  messageBox: {
    backgroundColor: colors.card2,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary
  },
  messageLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '800', marginBottom: spacing.xs },
  message: { color: colors.text, fontStyle: 'italic' },
  date: { color: colors.muted, fontSize: 12, marginBottom: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  actionBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    flex: 1,
    alignItems: 'center'
  },
  acceptBtn: { backgroundColor: colors.success },
  completeBtn: { backgroundColor: colors.primary },
  cancelBtn: { backgroundColor: colors.warning },
  actionText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  empty: { padding: spacing.xl, alignItems: 'center' },
  emptyText: { color: colors.muted, fontWeight: '800' }
});
