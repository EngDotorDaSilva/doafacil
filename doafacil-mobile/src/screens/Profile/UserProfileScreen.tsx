import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Screen } from '../../ui/Screen';
import { colors } from '../../ui/theme';

type PublicUser = {
  id: number;
  name: string;
  email: string;
  role: 'donor' | 'center' | 'admin';
  phone?: string | null;
  avatarUrl?: string | null;
  createdAt: string;
};

type CenterProfile = {
  id: number;
  userId: number;
  displayName: string;
  address: string;
  lat: number | null;
  lng: number | null;
  hours?: string | null;
  acceptedItemTypes: string[];
  approved: number | boolean;
  createdAt: string;
  updatedAt: string;
};

export function UserProfileScreen({ route, navigation }: any) {
  const { user: me } = useAuth();
  const userId = Number(route.params?.userId);
  const [loading, setLoading] = useState(true);
  const [u, setU] = useState<PublicUser | null>(null);
  const [center, setCenter] = useState<CenterProfile | null>(null);

  const isMe = useMemo(() => !!me && me.id === userId, [me?.id, userId]);

  useEffect(() => {
    if (!Number.isFinite(userId)) {
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const resp = await api.get(`/users/${userId}`);
        setU(resp.data.user);
        setCenter(resp.data.center || null);
      } catch (e: any) {
        Alert.alert('Erro', e?.response?.data?.error || 'Falha ao carregar perfil.');
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  return (
    <Screen scroll>
      {loading ? (
        <View style={{ padding: 16 }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !u ? (
        <View style={{ padding: 16 }}>
          <Text style={{ color: colors.muted, fontWeight: '800' }}>Perfil não encontrado.</Text>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar name={u.name} url={(u.avatarUrl as any) || null} size={58} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.name}>{u.name}</Text>
                <Text style={styles.meta}>
                  <Text style={{ color: colors.text }}>{u.role}</Text> • {u.email}
                </Text>
              </View>
            </View>
            <Text style={styles.meta}>
              Contato: <Text style={{ color: colors.text }}>{u.phone || '—'}</Text>
            </Text>
          </View>

          {center ? (
            <View style={styles.card}>
              <Text style={styles.section}>Centro</Text>
              <Text style={styles.meta}>
                Nome: <Text style={{ color: colors.text }}>{center.displayName}</Text>
              </Text>
              <Text style={styles.meta}>
                Endereço: <Text style={{ color: colors.text }}>{center.address}</Text>
              </Text>
              <Text style={styles.meta}>
                Horário: <Text style={{ color: colors.text }}>{center.hours || '—'}</Text>
              </Text>
              <Text style={styles.meta}>
                Itens aceites: <Text style={{ color: colors.text }}>{(center.acceptedItemTypes || []).join(', ') || '—'}</Text>
              </Text>
            </View>
          ) : null}

          {isMe ? (
            <Pressable onPress={() => navigation.navigate('ProfileHome')} style={{ paddingHorizontal: 2 }}>
              <Text style={styles.link}>Abrir meu perfil</Text>
            </Pressable>
          ) : null}

          {/* Placeholder for future: start chat directly from here */}
          {u.role !== 'admin' && !isMe ? <Button title="Mensagem (em breve)" variant="secondary" onPress={() => {}} /> : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 10 },
  name: { color: colors.text, fontSize: 18, fontWeight: '900' },
  meta: { color: colors.muted, fontWeight: '800' },
  section: { color: colors.text, fontWeight: '900' },
  link: { color: colors.primary, fontWeight: '900' }
});

