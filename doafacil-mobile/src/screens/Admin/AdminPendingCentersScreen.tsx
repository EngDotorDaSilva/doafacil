import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../ui/Button';
import { Screen } from '../../ui/Screen';
import { colors } from '../../ui/theme';

type AdminStackParamList = {
  AdminDashboard: undefined;
  AdminUsers: undefined;
  AdminPosts: undefined;
  AdminComments: undefined;
  AdminPendingCenters: undefined;
  AdminLogs: undefined;
};

type AdminNavigationProp = NativeStackNavigationProp<AdminStackParamList>;

type Center = {
  id: number;
  userId: number;
  displayName: string;
  address: string;
  hours: string | null;
  acceptedItemTypes: string[];
  createdAt: string;
};

export function AdminPendingCentersScreen() {
  const navigation = useNavigation<AdminNavigationProp>();
  const { user } = useAuth();
  const [centers, setCenters] = useState<Center[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const resp = await api.get('/admin/centers/pending');
      setCenters(resp.data.centers);
    } catch (e: any) {
      setCenters([]);
      if (user?.role === 'admin') Alert.alert('Erro', e?.response?.data?.error || 'Falha ao carregar centros pendentes.');
    } finally {
      setLoading(false);
    }
  }

  async function approve(centerId: number) {
    try {
      await api.post(`/admin/centers/${centerId}/approve`);
      await load();
    } catch (e: any) {
      Alert.alert('Erro', e?.response?.data?.error || 'Falha ao aprovar.');
    }
  }

  useEffect(() => {
    if (user?.role === 'admin') load().finally(() => {});
  }, [user?.role]);

  if (user?.role !== 'admin') {
    return (
      <Screen>
        <Text style={{ color: colors.muted }}>Apenas administradores podem acessar esta área.</Text>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title="Usuários" variant="secondary" onPress={() => navigation.push('AdminUsers')} />
        <Button title="Publicações" variant="secondary" onPress={() => navigation.push('AdminPosts')} />
        <Button title="Comentários" variant="secondary" onPress={() => navigation.push('AdminComments')} />
        <Button title="Logs" variant="secondary" onPress={() => navigation.push('AdminLogs')} />
      </View>
      <Text style={styles.hint}>{loading ? 'Carregando...' : `${centers.length} centros pendentes`}</Text>
      <View style={{ gap: 12 }}>
        {centers.map((c) => (
          <View key={c.id} style={styles.card}>
            <Text style={styles.title}>{c.displayName}</Text>
            <Text style={styles.meta}>{c.address}</Text>
            <Text style={styles.meta}>Itens: {c.acceptedItemTypes.join(', ') || '—'}</Text>
            <Text style={styles.meta}>Criado: {new Date(c.createdAt).toLocaleString()}</Text>
            <Pressable onPress={() => approve(c.id)} style={styles.approve}>
              <Text style={styles.approveText}>Aprovar</Text>
            </Pressable>
          </View>
        ))}
        {!centers.length && !loading ? (
          <Button title="Recarregar" variant="secondary" onPress={load} />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hint: { color: colors.muted, fontWeight: '800' },
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 6 },
  title: { color: colors.text, fontWeight: '900', fontSize: 16 },
  meta: { color: colors.muted, fontWeight: '700' },
  approve: { marginTop: 6, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  approveText: { color: '#fff', fontWeight: '900' }
});

