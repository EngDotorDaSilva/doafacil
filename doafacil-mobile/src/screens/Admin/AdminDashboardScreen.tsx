import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useChat } from '../../chat/ChatContext';
import { Screen } from '../../ui/Screen';
import { colors, shadows, borderRadius, spacing } from '../../ui/theme';

type AdminStackParamList = {
  AdminDashboard: undefined;
  AdminUsers: undefined;
  AdminPosts: undefined;
  AdminComments: undefined;
  AdminPendingCenters: undefined;
  AdminLogs: undefined;
  AdminReports: undefined;
};

type AdminNavigationProp = NativeStackNavigationProp<AdminStackParamList>;

type Stats = {
  users: {
    total: number;
    active: number;
    blocked: number;
    deleted: number;
    byRole: { donor: number; center: number; admin: number };
  };
  posts: {
    total: number;
    active: number;
    deleted: number;
    withComments: number;
  };
  comments: {
    total: number;
    active: number;
    deleted: number;
  };
  centers: {
    total: number;
    approved: number;
    pending: number;
  };
  moderation: {
    logsLast24h: number;
    logsLast7d: number;
    logsLast30d: number;
  };
};

export function AdminDashboardScreen() {
  const navigation = useNavigation<AdminNavigationProp>();
  const { user } = useAuth();
  const { socket } = useChat();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingCentersCount, setPendingCentersCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await api.get('/admin/stats');
      setStats(resp.data.stats);
    } catch (e: any) {
      console.error('Failed to load stats:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === 'admin') {
      load();
      const interval = setInterval(load, 30000); // Refresh every 30s
      return () => clearInterval(interval);
    }
  }, [user?.role, load]);

  useEffect(() => {
    if (stats) {
      setPendingCentersCount(stats.centers.pending);
    }
  }, [stats]);

  useEffect(() => {
    if (!socket || user?.role !== 'admin') return;
    const onNewPendingCenter = () => {
      load(); // Refresh stats when new center is pending
    };
    try {
      socket.on('admin:new_pending_center', onNewPendingCenter);
    } catch (e) {
      console.error('Error setting up socket listener:', e);
    }
    return () => {
      try {
        if (socket) {
          socket.off('admin:new_pending_center', onNewPendingCenter);
        }
      } catch (e) {
        // ignore cleanup errors
      }
    };
  }, [socket, user?.role, load]);

  if (user?.role !== 'admin') {
    return (
      <Screen>
        <Text style={{ color: colors.muted }}>Apenas administradores.</Text>
      </Screen>
    );
  }

  if (loading && !stats) {
    return (
      <Screen>
        <ActivityIndicator size="large" color={colors.primary} />
      </Screen>
    );
  }

  if (!stats) {
    return (
      <Screen>
        <Text style={{ color: colors.muted }}>Erro ao carregar estatísticas.</Text>
        <Pressable onPress={load} style={styles.btn}>
          <Text style={styles.btnText}>Tentar novamente</Text>
        </Pressable>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Text style={styles.title}>Dashboard Administrativo</Text>
        <Pressable onPress={load} style={styles.refreshBtn}>
          <Text style={styles.refreshText}>🔄 Atualizar</Text>
        </Pressable>
      </View>

      <View style={styles.grid}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>👥 Usuários</Text>
          <Text style={styles.cardValue}>{stats.users.total}</Text>
          <View style={styles.cardDetails}>
            <Text style={styles.cardDetail}>✅ Ativos: {stats.users.active}</Text>
            <Text style={styles.cardDetail}>🚫 Bloqueados: {stats.users.blocked}</Text>
            <Text style={styles.cardDetail}>🗑️ Removidos: {stats.users.deleted}</Text>
            <Text style={styles.cardDetail}>👤 Doadores: {stats.users.byRole.donor}</Text>
            <Text style={styles.cardDetail}>🏢 Centros: {stats.users.byRole.center}</Text>
            <Text style={styles.cardDetail}>👑 Admins: {stats.users.byRole.admin}</Text>
          </View>
          <Pressable onPress={() => navigation.push('AdminUsers')} style={styles.cardBtn}>
            <Text style={styles.cardBtnText}>Ver Usuários</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>📝 Publicações</Text>
          <Text style={styles.cardValue}>{stats.posts.total}</Text>
          <View style={styles.cardDetails}>
            <Text style={styles.cardDetail}>✅ Ativas: {stats.posts.active}</Text>
            <Text style={styles.cardDetail}>🗑️ Removidas: {stats.posts.deleted}</Text>
            <Text style={styles.cardDetail}>💬 Com comentários: {stats.posts.withComments}</Text>
          </View>
          <Pressable onPress={() => navigation.push('AdminPosts')} style={styles.cardBtn}>
            <Text style={styles.cardBtnText}>Ver Publicações</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>💬 Comentários</Text>
          <Text style={styles.cardValue}>{stats.comments.total}</Text>
          <View style={styles.cardDetails}>
            <Text style={styles.cardDetail}>✅ Ativos: {stats.comments.active}</Text>
            <Text style={styles.cardDetail}>🗑️ Removidos: {stats.comments.deleted}</Text>
          </View>
          <Pressable onPress={() => navigation.push('AdminComments')} style={styles.cardBtn}>
            <Text style={styles.cardBtnText}>Ver Comentários</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>🏢 Centros</Text>
          <Text style={styles.cardValue}>{stats.centers.total}</Text>
          <View style={styles.cardDetails}>
            <Text style={styles.cardDetail}>✅ Aprovados: {stats.centers.approved}</Text>
            <Text style={[styles.cardDetail, stats.centers.pending > 0 && { color: colors.primary, fontWeight: '900' }]}>
              ⏳ Pendentes: {stats.centers.pending}
              {stats.centers.pending > 0 ? ' ⚠️' : ''}
            </Text>
          </View>
          <Pressable onPress={() => navigation.push('AdminPendingCenters')} style={styles.cardBtn}>
            <Text style={styles.cardBtnText}>
              Ver Pendentes {stats.centers.pending > 0 ? `(${stats.centers.pending})` : ''}
            </Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>📊 Moderação</Text>
          <View style={styles.cardDetails}>
            <Text style={styles.cardDetail}>Últimas 24h: {stats.moderation.logsLast24h}</Text>
            <Text style={styles.cardDetail}>Últimos 7 dias: {stats.moderation.logsLast7d}</Text>
            <Text style={styles.cardDetail}>Últimos 30 dias: {stats.moderation.logsLast30d}</Text>
          </View>
          <View style={styles.barChart}>
            <View
              style={[
                styles.bar,
                {
                  width: `${
                    stats.moderation.logsLast7d > 0
                      ? Math.min(100, (stats.moderation.logsLast24h / stats.moderation.logsLast7d) * 100)
                      : 0
                  }%`
                }
              ]}
            />
          </View>
          <Pressable onPress={() => navigation.push('AdminLogs')} style={styles.cardBtn}>
            <Text style={styles.cardBtnText}>Ver Logs</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>🚨 Denúncias</Text>
          <Text style={styles.cardValue}>Gerenciar</Text>
          <View style={styles.cardDetails}>
            <Text style={styles.cardDetail}>Denúncias pendentes</Text>
            <Text style={styles.cardDetail}>Bloquear usuários</Text>
            <Text style={styles.cardDetail}>Remover conteúdos</Text>
          </View>
          <Pressable onPress={() => navigation.push('AdminReportsManagement')} style={styles.cardBtn}>
            <Text style={styles.cardBtnText}>Ver Denúncias</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>📈 Gráficos</Text>
          <View style={styles.chartContainer}>
            <View style={styles.chartRow}>
              <Text style={styles.chartLabel}>Usuários por Role</Text>
              <View style={styles.horizontalBar}>
                {stats.users.active > 0 ? (
                  <>
                    <View
                      style={[
                        styles.barSegment,
                        { width: `${(stats.users.byRole.donor / stats.users.active) * 100}%`, backgroundColor: '#4CAF50' }
                      ]}
                    />
                    <View
                      style={[
                        styles.barSegment,
                        { width: `${(stats.users.byRole.center / stats.users.active) * 100}%`, backgroundColor: '#2196F3' }
                      ]}
                    />
                    <View
                      style={[
                        styles.barSegment,
                        { width: `${(stats.users.byRole.admin / stats.users.active) * 100}%`, backgroundColor: '#FF9800' }
                      ]}
                    />
                  </>
                ) : (
                  <View style={[styles.barSegment, { width: '100%', backgroundColor: colors.card2 }]} />
                )}
              </View>
              <View style={styles.legend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColor, { backgroundColor: '#4CAF50' }]} />
                  <Text style={styles.legendText}>Doadores: {stats.users.byRole.donor}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColor, { backgroundColor: '#2196F3' }]} />
                  <Text style={styles.legendText}>Centros: {stats.users.byRole.center}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColor, { backgroundColor: '#FF9800' }]} />
                  <Text style={styles.legendText}>Admins: {stats.users.byRole.admin}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>📊 Relatórios e Estatísticas</Text>
          <Text style={styles.cardValue}>Análise Detalhada</Text>
          <View style={styles.cardDetails}>
            <Text style={styles.cardDetail}>📦 Total de doações</Text>
            <Text style={styles.cardDetail}>🏢 Centros mais ativos</Text>
            <Text style={styles.cardDetail}>❤️ Doadores mais ativos</Text>
            <Text style={styles.cardDetail}>📅 Doações por período</Text>
            <Text style={styles.cardDetail}>🔥 Publicações mais reagidas</Text>
          </View>
          <Pressable onPress={() => navigation.push('AdminReports')} style={styles.cardBtn}>
            <Text style={styles.cardBtnText}>Ver Relatórios</Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl
  },
  title: {
    color: colors.text,
    fontWeight: '900',
    fontSize: 26,
    letterSpacing: -0.5
  },
  refreshBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.card2,
    borderWidth: 1.5,
    borderColor: colors.border,
    ...shadows.small
  },
  refreshText: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 13
  },
  grid: {
    gap: spacing.lg
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.medium
  },
  cardTitle: {
    color: colors.text,
    fontWeight: '900',
    fontSize: 18,
    marginBottom: spacing.xs
  },
  cardValue: {
    color: colors.primary,
    fontWeight: '900',
    fontSize: 36,
    letterSpacing: -1
  },
  cardDetails: {
    gap: spacing.xs,
    marginTop: spacing.sm
  },
  cardDetail: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 13
  },
  cardBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primaryDark,
    ...shadows.small
  },
  cardBtnText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 0.3
  },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    marginTop: spacing.lg,
    ...shadows.medium
  },
  btnText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 15
  },
  barChart: {
    height: 10,
    backgroundColor: colors.card2,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border
  },
  bar: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm
  },
  chartContainer: {
    gap: spacing.lg
  },
  chartRow: {
    gap: spacing.sm
  },
  chartLabel: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 14,
    marginBottom: spacing.xs
  },
  horizontalBar: {
    height: 28,
    backgroundColor: colors.card2,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border
  },
  barSegment: {
    height: '100%'
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.sm
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  legendColor: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.border
  },
  legendText: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 12
  }
});
