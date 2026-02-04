import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
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

type TopCenter = {
  id: number;
  name: string;
  address: string;
  donationCount: number;
  completedCount: number;
};

type TopDonor = {
  id: number;
  name: string;
  email: string;
  requestCount: number;
  completedCount: number;
};

type TopPost = {
  id: number;
  text: string;
  category: string;
  authorName: string;
  centerName: string | null;
  reactionCount: number;
  commentCount: number;
  createdAt: string;
};

type DonationByPeriod = {
  period: string;
  total: number;
  completed: number;
};

type Reports = {
  totalDonations: {
    total: number;
    completed: number;
    pending: number;
    accepted: number;
    cancelled: number;
    byPeriod: DonationByPeriod[];
  };
  topCenters: TopCenter[];
  topDonors: TopDonor[];
  donationsByPeriod: DonationByPeriod[];
  topPosts: TopPost[];
};

const PERIODS = [
  { value: 'all', label: 'Todos' },
  { value: 'today', label: 'Hoje' },
  { value: 'week', label: 'Última Semana' },
  { value: 'month', label: 'Último Mês' },
  { value: 'year', label: 'Último Ano' }
];

export function AdminReportsScreen() {
  const navigation = useNavigation<AdminNavigationProp>();
  const { user } = useAuth();
  const [reports, setReports] = useState<Reports | null>(null);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (refreshing) return;
    setLoading(true);
    try {
      const resp = await api.get('/admin/reports', { params: { period, limit: 10 } });
      setReports(resp.data.reports);
    } catch (e: any) {
      console.error('Failed to load reports:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period, refreshing]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  useEffect(() => {
    if (user?.role === 'admin') {
      load();
    }
  }, [user?.role, period, load]);

  if (user?.role !== 'admin') {
    return (
      <Screen>
        <Text style={{ color: colors.muted }}>Apenas administradores.</Text>
      </Screen>
    );
  }

  if (loading && !reports) {
    return (
      <Screen>
        <ActivityIndicator size="large" color={colors.primary} />
      </Screen>
    );
  }

  if (!reports) {
    return (
      <Screen>
        <Text style={{ color: colors.muted }}>Erro ao carregar relatórios.</Text>
        <Pressable onPress={load} style={styles.btn}>
          <Text style={styles.btnText}>Tentar novamente</Text>
        </Pressable>
      </Screen>
    );
  }

  const header = (
    <View style={{ padding: spacing.lg, gap: spacing.md }}>
      <View style={styles.header}>
        <Text style={styles.title}>📊 Relatórios e Estatísticas</Text>
      </View>

      <View style={styles.periodFilters}>
        {PERIODS.map((p) => (
          <Pressable
            key={p.value}
            onPress={() => setPeriod(p.value)}
            style={[styles.periodChip, period === p.value && styles.periodChipActive]}
          >
            <Text style={[styles.periodText, period === p.value && styles.periodTextActive]}>
              {p.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Total de Doações */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📦 Total de Doações</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{reports.totalDonations.total}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.success }]}>
            <Text style={[styles.statValue, { color: '#fff' }]}>{reports.totalDonations.completed}</Text>
            <Text style={[styles.statLabel, { color: '#fff' }]}>Concluídas</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.warning }]}>
            <Text style={[styles.statValue, { color: '#fff' }]}>{reports.totalDonations.pending}</Text>
            <Text style={[styles.statLabel, { color: '#fff' }]}>Pendentes</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.primary }]}>
            <Text style={[styles.statValue, { color: '#fff' }]}>{reports.totalDonations.accepted}</Text>
            <Text style={[styles.statLabel, { color: '#fff' }]}>Aceitas</Text>
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <Screen>
      <FlatList
        data={[]}
        keyExtractor={() => 'reports'}
        ListHeaderComponent={header}
        refreshing={refreshing}
        onRefresh={onRefresh}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        renderItem={() => null}
        ListFooterComponent={
          <View style={{ padding: spacing.lg, gap: spacing.lg }}>
            {/* Centros Mais Ativos */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🏢 Centros Mais Ativos</Text>
              {reports.topCenters.length > 0 ? (
                <View style={styles.list}>
                  {reports.topCenters.map((center, idx) => (
                    <View key={center.id} style={styles.listItem}>
                      <View style={styles.rankBadge}>
                        <Text style={styles.rankText}>#{idx + 1}</Text>
                      </View>
                      <View style={{ flex: 1, gap: spacing.xs }}>
                        <Text style={styles.listItemTitle}>{center.name}</Text>
                        <Text style={styles.listItemSubtitle}>{center.address}</Text>
                        <View style={styles.listItemStats}>
                          <Text style={styles.listItemStat}>
                            📦 {center.donationCount} pedidos • ✓ {center.completedCount} concluídos
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyText}>Nenhum centro encontrado.</Text>
              )}
            </View>

            {/* Doadores Mais Ativos */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>❤️ Doadores Mais Ativos</Text>
              {reports.topDonors.length > 0 ? (
                <View style={styles.list}>
                  {reports.topDonors.map((donor, idx) => (
                    <View key={donor.id} style={styles.listItem}>
                      <View style={styles.rankBadge}>
                        <Text style={styles.rankText}>#{idx + 1}</Text>
                      </View>
                      <View style={{ flex: 1, gap: spacing.xs }}>
                        <Text style={styles.listItemTitle}>{donor.name}</Text>
                        <Text style={styles.listItemSubtitle}>{donor.email}</Text>
                        <View style={styles.listItemStats}>
                          <Text style={styles.listItemStat}>
                            📦 {donor.requestCount} pedidos • ✓ {donor.completedCount} concluídos
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyText}>Nenhum doador encontrado.</Text>
              )}
            </View>

            {/* Doações por Período */}
            {reports.donationsByPeriod.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>📅 Doações por Período (Últimos 12 Meses)</Text>
                <View style={styles.list}>
                  {reports.donationsByPeriod.map((item) => (
                    <View key={item.period} style={styles.listItem}>
                      <View style={{ flex: 1, gap: spacing.xs }}>
                        <Text style={styles.listItemTitle}>
                          {new Date(item.period + '-01').toLocaleDateString('pt-BR', {
                            month: 'long',
                            year: 'numeric'
                          })}
                        </Text>
                        <View style={styles.listItemStats}>
                          <Text style={styles.listItemStat}>
                            Total: {item.total} • Concluídas: {item.completed}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Publicações Mais Reagidas */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🔥 Publicações Mais Reagidas</Text>
              {reports.topPosts.length > 0 ? (
                <View style={styles.list}>
                  {reports.topPosts.map((post, idx) => (
                    <View key={post.id} style={styles.listItem}>
                      <View style={styles.rankBadge}>
                        <Text style={styles.rankText}>#{idx + 1}</Text>
                      </View>
                      <View style={{ flex: 1, gap: spacing.xs }}>
                        <Text style={styles.listItemTitle} numberOfLines={2}>
                          {post.text || '(Sem texto)'}
                        </Text>
                        <Text style={styles.listItemSubtitle}>
                          Por: {post.authorName}
                          {post.centerName ? ` • ${post.centerName}` : ''}
                        </Text>
                        <Text style={styles.listItemSubtitle}>
                          Categoria: {post.category} • {new Date(post.createdAt).toLocaleDateString('pt-BR')}
                        </Text>
                        <View style={styles.listItemStats}>
                          <Text style={styles.listItemStat}>
                            ❤️ {post.reactionCount} reações • 💬 {post.commentCount} comentários
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyText}>Nenhuma publicação encontrada.</Text>
              )}
            </View>
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: spacing.md
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900'
  },
  periodFilters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg
  },
  periodChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card2
  },
  periodChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  periodText: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 13
  },
  periodTextActive: {
    color: '#fff'
  },
  section: {
    marginBottom: spacing.lg
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
    marginBottom: spacing.md
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    ...shadows.small
  },
  statValue: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '900',
    marginBottom: spacing.xs
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '800'
  },
  list: {
    gap: spacing.md
  },
  listItem: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.md,
    alignItems: 'flex-start',
    ...shadows.small
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  rankText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 14
  },
  listItemTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900'
  },
  listItemSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700'
  },
  listItemStats: {
    marginTop: spacing.xs
  },
  listItemStat: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800'
  },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    padding: spacing.lg
  },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md
  },
  btnText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 16
  }
});
