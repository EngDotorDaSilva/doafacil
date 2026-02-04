import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Screen } from '../../ui/Screen';
import { colors } from '../../ui/theme';

type Center = {
  id: number;
  userId: number;
  displayName: string;
  address: string;
  lat: number | null;
  lng: number | null;
  hours: string | null;
  acceptedItemTypes: string[];
  phone?: string | null;
  avatarUrl?: string | null;
};

export function CenterDetailScreen({ route, navigation }: any) {
  const { token, user } = useAuth();
  const centerId = route.params.centerId as number;
  const [center, setCenter] = useState<Center | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const resp = await api.get(`/centers/${centerId}`);
      setCenter(resp.data.center);
    } catch (e: any) {
      Alert.alert('Erro', e?.response?.data?.error || 'Falha ao carregar centro.');
    } finally {
      setLoading(false);
    }
  }

  async function startChat() {
    if (!token || user?.role !== 'donor') {
      Alert.alert('Ação restrita', 'Apenas doadores podem iniciar chat com um centro.');
      return;
    }
    if (!center) return;
    try {
      const resp = await api.post('/threads', { centerUserId: center.userId });
      navigation.navigate('Chat', { screen: 'ChatThread', params: { threadId: resp.data.threadId } });
    } catch (e: any) {
      Alert.alert('Erro', e?.response?.data?.error || 'Falha ao iniciar chat.');
    }
  }

  useEffect(() => {
    load().finally(() => {});
  }, [centerId]);

  if (!center) {
    return (
      <Screen>
        <Text style={{ color: colors.muted }}>{loading ? 'Carregando...' : 'Centro não encontrado.'}</Text>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar name={center.displayName} url={(center.avatarUrl as any) || null} size={46} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.title}>{center.displayName}</Text>
            {center.phone ? <Text style={styles.meta}>Contato: {center.phone}</Text> : null}
          </View>
        </View>
        <Text style={styles.addr}>{center.address}</Text>
        <Text style={styles.meta}>Horário: {center.hours || '—'}</Text>
        <Text style={styles.meta}>Itens aceites: {center.acceptedItemTypes.join(', ') || '—'}</Text>
      </View>

      {center.lat != null && center.lng != null ? (
        <View style={styles.mapWrap}>
          <MapView
            style={StyleSheet.absoluteFill}
            initialRegion={{
              latitude: center.lat,
              longitude: center.lng,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02
            }}
          >
            <Marker coordinate={{ latitude: center.lat, longitude: center.lng }} />
          </MapView>
        </View>
      ) : null}

      <Button title="Enviar mensagem" onPress={startChat} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 6 },
  title: { color: colors.text, fontWeight: '900', fontSize: 18 },
  addr: { color: colors.text, fontWeight: '600' },
  meta: { color: colors.muted, fontWeight: '700' },
  mapWrap: { height: 240, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }
});

