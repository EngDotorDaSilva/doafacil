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
  status: 'available' | 'unavailable' | 'donated';
  createdAt: string;
};

const ITEM_TYPES = ['roupa', 'alimento', 'livros', 'higiene', 'brinquedos', 'outros'];

export function ItemsScreen({ navigation }: any) {
  const { user } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [itemType, setItemType] = useState('roupa');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('');
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'unavailable' | 'donated'>('all');
  const [refreshing, setRefreshing] = useState(false);

  const [stats, setStats] = useState({ total: 0, available: 0, unavailable: 0, donated: 0 });

  async function load() {
    if (refreshing) return;
    setLoading(true);
    try {
      const params = statusFilter !== 'all' ? { status: statusFilter } : {};
      const resp = await api.get('/items/mine', { params });
      setItems(resp.data.items);
      if (resp.data.stats) {
        setStats(resp.data.stats);
      }
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

  async function save() {
    if (!itemType.trim()) {
      Alert.alert('Tipo obrigatório', 'Selecione o tipo de item.');
      return;
    }
    setSaving(true);
    try {
      const payload: any = { itemType: itemType.trim() };
      if (description.trim()) payload.description = description.trim();
      if (quantity.trim()) payload.quantity = Number(quantity.trim());

      if (editingItem) {
        await api.put(`/items/${editingItem.id}`, payload);
      } else {
        await api.post('/items', payload);
      }
      setShowForm(false);
      setEditingItem(null);
      setDescription('');
      setQuantity('');
      setItemType('roupa');
      load();
    } catch (e: any) {
      Alert.alert('Erro', e?.response?.data?.error || 'Falha ao salvar item.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(itemId: number) {
    Alert.alert('Confirmar', 'Deseja realmente excluir este item?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/items/${itemId}`);
            load();
          } catch (e: any) {
            Alert.alert('Erro', e?.response?.data?.error || 'Falha ao excluir item.');
          }
        }
      }
    ]);
  }

  function editItem(item: Item) {
    setEditingItem(item);
    setItemType(item.itemType);
    setDescription(item.description || '');
    setQuantity(item.quantity?.toString() || '');
    setShowForm(true);
  }

  function cancelEdit() {
    setShowForm(false);
    setEditingItem(null);
    setDescription('');
    setQuantity('');
    setItemType('roupa');
  }

  useEffect(() => {
    if (user?.role === 'center') {
      load();
    }
  }, [user?.role, statusFilter]);

  if (user?.role !== 'center') {
    return (
      <Screen>
        <Text style={{ color: colors.muted }}>Apenas centros podem gerenciar itens.</Text>
      </Screen>
    );
  }

  const header = (
    <View style={{ padding: spacing.lg, gap: spacing.md }}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Itens Disponíveis</Text>
          <Text style={styles.subtitle}>
            {stats.total} total • {stats.available} disponíveis • {stats.donated} doados
          </Text>
        </View>
        <Button
          title={showForm ? 'Cancelar' : '+ Adicionar'}
          variant={showForm ? 'secondary' : 'primary'}
          onPress={() => {
            if (showForm) {
              cancelEdit();
            } else {
              setShowForm(true);
            }
          }}
        />
      </View>

      <View style={styles.filters}>
        {(['all', 'available', 'unavailable', 'donated'] as const).map((status) => (
          <Pressable
            key={status}
            onPress={() => setStatusFilter(status)}
            style={[styles.filterChip, statusFilter === status && styles.filterChipActive]}
          >
            <Text style={[styles.filterText, statusFilter === status && styles.filterTextActive]}>
              {status === 'all' ? 'Todos' : status === 'available' ? 'Disponíveis' : status === 'unavailable' ? 'Indisponíveis' : 'Doados'}
            </Text>
          </Pressable>
        ))}
      </View>

      {showForm ? (
        <View style={styles.form}>
          <Text style={styles.label}>Tipo de Item *</Text>
          <View style={styles.chips}>
            {ITEM_TYPES.map((type) => (
              <Pressable
                key={type}
                onPress={() => setItemType(type)}
                style={[styles.chip, itemType === type && styles.chipActive]}
              >
                <Text style={[styles.chipText, itemType === type && styles.chipTextActive]}>{type}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Descrição</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Ex: Roupas usadas em bom estado"
            placeholderTextColor={colors.muted}
            style={styles.input}
            multiline
            numberOfLines={3}
          />

          <Text style={styles.label}>Quantidade</Text>
          <TextInput
            value={quantity}
            onChangeText={setQuantity}
            placeholder="Ex: 10"
            placeholderTextColor={colors.muted}
            style={styles.input}
            keyboardType="numeric"
          />

          <Button title={editingItem ? 'Salvar Alterações' : 'Adicionar Item'} onPress={save} disabled={saving} />
        </View>
      ) : null}
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
        data={items}
        keyExtractor={(item) => String(item.id)}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: spacing.lg }}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemType}>{item.itemType}</Text>
                {item.quantity ? (
                  <Text style={styles.quantityBadge}>Qtd: {item.quantity}</Text>
                ) : null}
              </View>
              <View style={[styles.statusBadge, getStatusStyle(item.status)]}>
                <Text style={styles.statusText}>{getStatusLabel(item.status)}</Text>
              </View>
            </View>
            {item.description ? <Text style={styles.description}>{item.description}</Text> : null}
            <Text style={styles.date}>
              {new Date(item.createdAt).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </Text>
            <View style={styles.actions}>
              <Pressable onPress={() => editItem(item)} style={styles.actionBtn}>
                <Text style={styles.actionText}>✏️ Editar</Text>
              </Pressable>
              <Pressable onPress={() => deleteItem(item.id)} style={[styles.actionBtn, styles.deleteBtn]}>
                <Text style={[styles.actionText, styles.deleteText]}>🗑️ Excluir</Text>
              </Pressable>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {statusFilter !== 'all' ? 'Nenhum item encontrado com este filtro.' : 'Nenhum item cadastrado.'}
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

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.lg },
  title: { color: colors.text, fontSize: 24, fontWeight: '900' },
  subtitle: { color: colors.muted, fontSize: 13, fontWeight: '700', marginTop: spacing.xs },
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
  skeletonCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.small
  },
  form: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadows.medium
  },
  label: { color: colors.text, fontWeight: '800', marginBottom: spacing.sm, marginTop: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
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
  input: {
    backgroundColor: colors.card2,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.small
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  itemType: { color: colors.text, fontSize: 18, fontWeight: '900', textTransform: 'capitalize' },
  statusBadge: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full
  },
  statusText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  quantityBadge: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    marginTop: spacing.xs
  },
  description: { color: colors.textSecondary, marginBottom: spacing.sm },
  date: { color: colors.muted, fontSize: 12, marginBottom: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  actionBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.card2,
    borderWidth: 1,
    borderColor: colors.border
  },
  deleteBtn: { backgroundColor: colors.warning },
  actionText: { color: colors.text, fontWeight: '800', fontSize: 13 },
  deleteText: { color: '#fff' },
  empty: { padding: spacing.xl, alignItems: 'center' },
  emptyText: { color: colors.muted, fontWeight: '800' },
  quantityBadge: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    marginTop: spacing.xs
  }
});

function getStatusLabel(status: string) {
  switch (status) {
    case 'available':
      return 'Disponível';
    case 'unavailable':
      return 'Indisponível';
    case 'donated':
      return 'Doado';
    default:
      return status;
  }
}

function getStatusStyle(status: string) {
  switch (status) {
    case 'available':
      return { backgroundColor: colors.success };
    case 'unavailable':
      return { backgroundColor: colors.warning };
    case 'donated':
      return { backgroundColor: colors.primary };
    default:
      return { backgroundColor: colors.card2 };
  }
}
