import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Screen } from '../../ui/Screen';
import { colors } from '../../ui/theme';

type ModLog = {
  id: number;
  admin: { id: number; name: string; email: string };
  action: string;
  targetType: string;
  targetId: number | null;
  reason: string | null;
  meta: any;
  createdAt: string;
};

export function AdminLogsScreen() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<ModLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 100;

  async function load(reset = false) {
    setLoading(true);
    try {
      const params: any = { limit, offset: reset ? 0 : offset };
      if (action.trim()) params.action = action.trim();
      if (targetType.trim()) params.targetType = targetType.trim();
      const resp = await api.get('/admin/moderation/logs', { params });
      const next = resp.data.logs as ModLog[];
      setLogs((prev) => (reset ? next : [...prev, ...next]));
      setOffset((reset ? 0 : offset) + next.length);
    } catch (e: any) {
      Alert.alert('Erro', e?.response?.data?.error || 'Falha ao carregar logs.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user?.role === 'admin') load(true).finally(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  if (user?.role !== 'admin') {
    return (
      <Screen>
        <Text style={{ color: colors.muted }}>Apenas administradores.</Text>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Text style={styles.hint}>{loading ? 'Carregando...' : `Logs (${logs.length})`}</Text>

      <View style={{ gap: 10 }}>
        <TextInput
          value={action}
          onChangeText={setAction}
          placeholder="Filtro action (ex: user.block)"
          placeholderTextColor={colors.muted}
          style={styles.input}
          autoCapitalize="none"
        />
        <TextInput
          value={targetType}
          onChangeText={setTargetType}
          placeholder="Filtro targetType (ex: user/post/comment/center)"
          placeholderTextColor={colors.muted}
          style={styles.input}
          autoCapitalize="none"
        />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable onPress={() => { setOffset(0); load(true).finally(() => {}); }} style={styles.btn}>
            <Text style={styles.btnText}>Aplicar</Text>
          </Pressable>
          <Pressable onPress={() => { setAction(''); setTargetType(''); setOffset(0); load(true).finally(() => {}); }} style={styles.btnSecondary}>
            <Text style={styles.btnText}>Limpar</Text>
          </Pressable>
        </View>
      </View>

      <View style={{ gap: 12 }}>
        {logs.map((l) => (
          <View key={l.id} style={styles.card}>
            <Text style={styles.title}>
              {l.action}{' '}
              <Text style={styles.meta}>
                • {l.targetType}
                {l.targetId != null ? `#${l.targetId}` : ''}
              </Text>
            </Text>
            <Text style={styles.meta}>
              {new Date(l.createdAt).toLocaleString()} • Admin: {l.admin.name} ({l.admin.email})
            </Text>
            {l.reason ? <Text style={styles.reason}>Motivo: {l.reason}</Text> : null}
            {l.meta ? <Text style={styles.metaSmall}>Meta: {JSON.stringify(l.meta)}</Text> : null}
          </View>
        ))}

        <Pressable disabled={loading} onPress={() => load(false).finally(() => {})} style={[styles.btn, loading && { opacity: 0.6 }]}>
          <Text style={styles.btnText}>Carregar mais</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hint: { color: colors.muted, fontWeight: '800' },
  input: { backgroundColor: colors.card2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: colors.text },
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 6 },
  title: { color: colors.text, fontWeight: '900' },
  meta: { color: colors.muted, fontWeight: '700', fontSize: 12 },
  metaSmall: { color: colors.muted, fontWeight: '700', fontSize: 11 },
  reason: { color: colors.text, fontWeight: '700' },
  btn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 10, alignItems: 'center', flex: 1 },
  btnSecondary: { backgroundColor: colors.card2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 10, alignItems: 'center', flex: 1 },
  btnText: { color: '#fff', fontWeight: '900' }
});

