import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../ui/Button';
import { Screen } from '../../ui/Screen';
import { Skeleton } from '../../ui/Skeleton';
import { colors, shadows, borderRadius, spacing } from '../../ui/theme';

type Item = {
  id: number;
  itemType: string;
  description: string | null;
  quantity: number | null;
  centerName: string;
  centerAddress: string;
  centerLat: number | null;
  centerLng: number | null;
};

const ITEM_TYPES = ['todas', 'roupa', 'alimento', 'livros', 'higiene', 'brinquedos', 'outros'];

export function AvailableItemsScreen({ navigation }: any) {
  const { user } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [category, setCategory] = useState('todas');
  const [searchText, setSearchText] = useState('');

  async function load() {
    if (refreshing) return;
    setLoading(true);
    try {
      const params: any = {};
      if (category !== 'todas') params.itemType = category;
      const resp = await api.get('/items', { params });
      setItems(resp.data.items);
    } catch (e: any) {
      Alert.alert('Erro', e?.response?.data?.error || 'Falha ao carregar itens.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await load();
  }

  const filteredItems = items.filter((item) => {
    if (!searchText.trim()) return true;
    const search = searchText.toLowerCase();
    return (
      item.itemType.toLowerCase().includes(search) ||
      item.description?.toLowerCase().includes(search) ||
      item.centerName.toLowerCase().includes(search) ||
      item.centerAddress.toLowerCase().includes(search)
    );
  });

  async function requestDonation(itemId: number) {
    Alert.alert(
      'Solicitar Doação',
      'Deseja enviar um pedido de doação para este item?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Enviar',
          onPress: async () => {
            try {
              const payload: any = { itemId };
              await api.post('/donations', payload);
              Alert.alert('Sucesso', 'Pedido de doação enviado com sucesso!');
              load();
            } catch (e: any) {
              Alert.alert('Erro', e?.response?.data?.error || 'Falha ao enviar pedido.');
            }
          }
        }
      ]
    );
  }

  useEffect(() => {
    load();
  }, [category]);

  const header = (
    <View style={{ padding: spacing.lg, gap: spacing.md }}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Itens Disponíveis</Text>
          <Text style={styles.subtitle}>{filteredItems.length} itens disponíveis</Text>
        </View>
      </View>

      <TextInput
        value={searchText}
        onChangeText={setSearchText}
        placeholder="Buscar itens..."
        placeholderTextColor={colors.muted}
        style={styles.searchInput}
      />

      <View style={styles.filters}>
        {ITEM_TYPES.map((type) => (
          <Pressable
            key={type}
            onPress={() => setCategory(type)}
            style={[styles.chip, category === type && styles.chipActive]}
          >
            <Text style={[styles.chipText, category === type && styles.chipTextActive]}>
              {type === 'todas' ? 'Todos' : type}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  if (loading && items.length === 0) {
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
        data={filteredItems}
        keyExtractor={(item) => String(item.id)}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: spacing.lg }}
        renderItem={({ item }) => (
          <View style={[styles.card, { marginHorizontal: spacing.lg, marginBottom: spacing.md }]}>
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemType}>{item.itemType}</Text>
                {item.quantity ? (
                  <Text style={styles.quantityBadge}>Quantidade: {item.quantity}</Text>
                ) : null}
              </View>
              <View style={styles.availableBadge}>
                <Text style={styles.availableText}>✓ Disponível</Text>
              </View>
            </View>
            {item.description ? <Text style={styles.description}>{item.description}</Text> : null}
            <View style={styles.centerInfo}>
              <Text style={styles.centerName}>🏢 {item.centerName}</Text>
              <Text style={styles.centerAddress}>{item.centerAddress}</Text>
            </View>
            {user?.role === 'donor' ? (
              <Button
                title="📦 Solicitar Doação"
                onPress={() => requestDonation(item.id)}
                style={styles.requestBtn}
              />
            ) : null}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {searchText.trim() || category !== 'todas'
                ? 'Nenhum item encontrado com os filtros aplicados.'
                : 'Nenhum item disponível.'}
            </Text>
            {(searchText.trim() || category !== 'todas') && (
              <Button
                title="Limpar filtros"
                variant="secondary"
                onPress={() => {
                  setSearchText('');
                  setCategory('todas');
                }}
              />
            )}
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: spacing.lg },
  title: { color: colors.text, fontSize: 24, fontWeight: '900' },
  subtitle: { color: colors.muted, fontSize: 13, fontWeight: '700', marginTop: spacing.xs },
  searchInput: {
    backgroundColor: colors.card2,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md
  },
  skeletonCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.small
  },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card2
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontWeight: '800', fontSize: 13 },
  chipTextActive: { color: '#fff' },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.small
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  itemType: { color: colors.text, fontSize: 18, fontWeight: '900', textTransform: 'capitalize' },
  availableBadge: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.success
  },
  availableText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  description: { color: colors.textSecondary, marginBottom: spacing.sm },
  quantityBadge: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    marginTop: spacing.xs
  },
  centerInfo: {
    backgroundColor: colors.card2,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.md
  },
  centerName: { color: colors.text, fontWeight: '900', fontSize: 15, marginBottom: spacing.xs },
  centerAddress: { color: colors.textSecondary, fontSize: 13 },
  requestBtn: { marginTop: spacing.sm },
  empty: { padding: spacing.xl, alignItems: 'center' },
  emptyText: { color: colors.muted, fontWeight: '800' }
});
