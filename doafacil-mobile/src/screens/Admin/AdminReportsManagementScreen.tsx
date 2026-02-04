import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Screen } from '../../ui/Screen';
import { Avatar } from '../../ui/Avatar';
import { colors, shadows, borderRadius, spacing } from '../../ui/theme';

type AdminStackParamList = {
  AdminDashboard: undefined;
  AdminReportsManagement: undefined;
  UserProfile: { userId: number };
  PostDetail: { post: any };
};

type AdminNavigationProp = NativeStackNavigationProp<AdminStackParamList>;

type Report = {
  id: number;
  reporterUserId: number;
  targetType: 'post' | 'comment' | 'user';
  targetId: number;
  reason: 'spam' | 'inappropriate' | 'harassment' | 'fake' | 'other';
  description: string | null;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
  reporterName: string;
  reporterEmail: string;
  reviewerName: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

const REASON_LABELS = {
  spam: 'Spam',
  inappropriate: 'Conteúdo Inadequado',
  harassment: 'Assédio',
  fake: 'Informação Falsa',
  other: 'Outro'
};

const STATUS_LABELS = {
  pending: 'Pendente',
  reviewed: 'Revisado',
  resolved: 'Resolvido',
  dismissed: 'Descartado'
};

export function AdminReportsManagementScreen() {
  const navigation = useNavigation<AdminNavigationProp>();
  const { user } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'reviewed' | 'resolved' | 'dismissed'>('all');
  const [counts, setCounts] = useState({ pending: 0, reviewed: 0, resolved: 0, dismissed: 0 });

  const load = useCallback(async () => {
    if (refreshing) return;
    setLoading(true);
    try {
      const params = statusFilter !== 'all' ? { status: statusFilter } : {};
      const resp = await api.get('/reports', { params });
      setReports(resp.data.reports);
      if (resp.data.counts) {
        setCounts(resp.data.counts);
      }
    } catch (e: any) {
      Alert.alert('Erro', e?.response?.data?.error || 'Falha ao carregar denúncias.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, refreshing]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  useEffect(() => {
    if (user?.role === 'admin') {
      load();
    }
  }, [user?.role, statusFilter, load]);

  async function updateStatus(reportId: number, status: string, action?: 'block' | 'delete' | 'none') {
    try {
      await api.put(`/reports/${reportId}/status`, { status, action: action || 'none' });
      Alert.alert('Sucesso', 'Status da denúncia atualizado.');
      load();
    } catch (e: any) {
      Alert.alert('Erro', e?.response?.data?.error || 'Falha ao atualizar status.');
    }
  }

  function handleAction(report: Report, action: 'block' | 'delete' | 'dismiss') {
    const actionLabels = {
      block: 'Bloquear',
      delete: 'Remover',
      dismiss: 'Descartar'
    };
    const confirmMessages = {
      block: 'Deseja bloquear este usuário baseado nesta denúncia?',
      delete: 'Deseja remover este conteúdo baseado nesta denúncia?',
      dismiss: 'Deseja descartar esta denúncia?'
    };

    Alert.alert(
      'Confirmar Ação',
      confirmMessages[action],
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: actionLabels[action],
          style: action === 'dismiss' ? 'default' : 'destructive',
          onPress: () => {
            if (action === 'dismiss') {
              updateStatus(report.id, 'dismissed', 'none');
            } else if (action === 'block' && report.targetType === 'user') {
              updateStatus(report.id, 'resolved', 'block');
            } else if (action === 'delete' && (report.targetType === 'post' || report.targetType === 'comment')) {
              updateStatus(report.id, 'resolved', 'delete');
            }
          }
        }
      ]
    );
  }

  if (user?.role !== 'admin') {
    return (
      <Screen>
        <Text style={{ color: colors.muted }}>Apenas administradores.</Text>
      </Screen>
    );
  }

  const header = (
    <View style={{ padding: spacing.lg, gap: spacing.md }}>
      <View style={styles.header}>
        <Text style={styles.title}>Gerenciar Denúncias</Text>
        <Text style={styles.subtitle}>
          {counts.pending} pendentes • {counts.resolved} resolvidas
        </Text>
      </View>

      <View style={styles.filters}>
        {(['all', 'pending', 'reviewed', 'resolved', 'dismissed'] as const).map((status) => (
          <Pressable
            key={status}
            onPress={() => setStatusFilter(status)}
            style={[styles.filterChip, statusFilter === status && styles.filterChipActive]}
          >
            <Text style={[styles.filterText, statusFilter === status && styles.filterTextActive]}>
              {status === 'all' ? 'Todas' : STATUS_LABELS[status]}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  if (loading && reports.length === 0) {
    return (
      <Screen>
        {header}
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xl }} />
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={reports}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={header}
        refreshing={refreshing}
        onRefresh={onRefresh}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.targetType}>
                  {item.targetType === 'post' ? '📝 Publicação' : item.targetType === 'comment' ? '💬 Comentário' : '👤 Usuário'}
                </Text>
                <Text style={styles.reason}>Motivo: {REASON_LABELS[item.reason]}</Text>
                <Text style={styles.meta}>
                  Denunciado por: {item.reporterName} • {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                </Text>
                {item.description ? (
                  <View style={styles.descriptionBox}>
                    <Text style={styles.description}>{item.description}</Text>
                  </View>
                ) : null}
              </View>
              <View style={[styles.statusBadge, getStatusStyle(item.status)]}>
                <Text style={styles.statusText}>{STATUS_LABELS[item.status]}</Text>
              </View>
            </View>

            {item.status === 'pending' ? (
              <View style={styles.actions}>
                {item.targetType === 'user' ? (
                  <Pressable
                    onPress={() => handleAction(item, 'block')}
                    style={[styles.actionBtn, { backgroundColor: colors.danger }]}
                  >
                    <Text style={styles.actionText}>🚫 Bloquear Usuário</Text>
                  </Pressable>
                ) : null}
                {(item.targetType === 'post' || item.targetType === 'comment') ? (
                  <Pressable
                    onPress={() => handleAction(item, 'delete')}
                    style={[styles.actionBtn, { backgroundColor: colors.danger }]}
                  >
                    <Text style={styles.actionText}>🗑️ Remover Conteúdo</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => handleAction(item, 'dismiss')}
                  style={[styles.actionBtn, { backgroundColor: colors.card2 }]}
                >
                  <Text style={[styles.actionText, { color: colors.text }]}>✕ Descartar</Text>
                </Pressable>
                <Pressable
                  onPress={() => updateStatus(item.id, 'reviewed', 'none')}
                  style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                >
                  <Text style={styles.actionText}>✓ Marcar como Revisado</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {statusFilter !== 'all' ? 'Nenhuma denúncia encontrada com este filtro.' : 'Nenhuma denúncia encontrada.'}
            </Text>
          </View>
        }
      />
    </Screen>
  );
}

function getStatusStyle(status: string) {
  switch (status) {
    case 'pending':
      return { backgroundColor: colors.warning };
    case 'reviewed':
      return { backgroundColor: colors.primary };
    case 'resolved':
      return { backgroundColor: colors.success };
    case 'dismissed':
      return { backgroundColor: colors.muted };
    default:
      return { backgroundColor: colors.card2 };
  }
}

const styles = StyleSheet.create({
  header: {
    marginBottom: spacing.md
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900'
  },
  subtitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    marginTop: spacing.xs
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  filterChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card2
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  filterText: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 13
  },
  filterTextActive: {
    color: '#fff'
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.md,
    ...shadows.small
  },
  cardHeader: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start'
  },
  targetType: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: spacing.xs
  },
  reason: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: spacing.xs
  },
  meta: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700'
  },
  descriptionBox: {
    backgroundColor: colors.card2,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary
  },
  description: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600'
  },
  statusBadge: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full
  },
  statusText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 11
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm
  },
  actionBtn: {
    flex: 1,
    minWidth: '45%',
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center'
  },
  actionText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13
  },
  empty: {
    padding: spacing.xl,
    alignItems: 'center'
  },
  emptyText: {
    color: colors.muted,
    fontWeight: '800'
  }
});
