import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { api } from '../../api/client';
import { useChat } from '../../chat/ChatContext';
import { Screen } from '../../ui/Screen';
import { Avatar } from '../../ui/Avatar';
import { colors } from '../../ui/theme';

type Center = {
  id: number;
  displayName: string;
  address: string;
  hours: string | null;
  acceptedItemTypes: string[];
  lat: number | null;
  lng: number | null;
  distanceKm?: number | null;
  phone?: string | null;
  avatarUrl?: string | null;
};

export function CentersScreen({ navigation }: any) {
  const { socket } = useChat();
  const [centers, setCenters] = useState<Center[]>([]);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [radiusKm, setRadiusKm] = useState(15);
  const [filterByLocation, setFilterByLocation] = useState(false);

  async function loadMyLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const loc = await Location.getCurrentPositionAsync({});
    setPos({ lat: loc.coords.latitude, lng: loc.coords.longitude });
  }

  async function load() {
    try {
      const params: any = {};
      if (pos && filterByLocation) {
        params.lat = pos.lat;
        params.lng = pos.lng;
        params.radiusKm = radiusKm;
        params.filterByLocation = '1';
      } else if (pos) {
        // Send location to calculate distance, but don't filter
        params.lat = pos.lat;
        params.lng = pos.lng;
      }
      const resp = await api.get('/centers', { params });
      setCenters(resp.data.centers);
    } catch (e: any) {
      Alert.alert('Erro', e?.response?.data?.error || 'Falha ao carregar centros.');
    }
  }

  useEffect(() => {
    loadMyLocation().finally(() => {});
  }, []);

  useEffect(() => {
    load().finally(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos?.lat, pos?.lng, radiusKm, filterByLocation]);

  useEffect(() => {
    if (!socket) return;
    const onCenterApproved = (payload: any) => {
      const center = payload?.center as Center | undefined;
      if (center?.id) {
        setCenters((prev) => {
          const exists = prev.some((c) => c.id === center.id);
          if (exists) {
            // Update existing center
            return prev.map((c) => (c.id === center.id ? { ...c, ...center, acceptedItemTypes: center.acceptedItemTypes || [] } : c));
          } else {
            // Add new center if approved (handle both boolean and number)
            const centerApproved = center.approved === true || center.approved === 1 || center.approved === '1';
            if (centerApproved) {
              return [center, ...prev];
            }
            return prev;
          }
        });
      } else {
        // Reload if payload doesn't have center data
        load().catch(() => {});
      }
    };
    socket.on('center:approved', onCenterApproved);
    return () => {
      socket.off('center:approved', onCenterApproved);
    };
  }, [socket]);

  return (
    <Screen scroll>
      <View style={styles.top}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text style={styles.hint}>
            {filterByLocation && pos ? `Centros perto de você (${radiusKm}km)` : 'Todos os centros'}
            {pos && !filterByLocation ? ' • Ordenados por distância' : ''}
          </Text>
          {pos ? (
            <Pressable
              onPress={() => setFilterByLocation(!filterByLocation)}
              style={[styles.filterBtn, filterByLocation && styles.filterBtnActive]}
            >
              <Text style={[styles.filterBtnText, filterByLocation && styles.filterBtnTextActive]}>
                {filterByLocation ? '📍 Filtro' : '📍 Todos'}
              </Text>
            </Pressable>
          ) : null}
        </View>
        {filterByLocation && pos ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={() => setRadiusKm(10)} style={[styles.smallBtn, radiusKm === 10 && styles.smallBtnActive]}>
              <Text style={[styles.smallBtnText, radiusKm === 10 && styles.smallBtnTextActive]}>10km</Text>
            </Pressable>
            <Pressable onPress={() => setRadiusKm(15)} style={[styles.smallBtn, radiusKm === 15 && styles.smallBtnActive]}>
              <Text style={[styles.smallBtnText, radiusKm === 15 && styles.smallBtnTextActive]}>15km</Text>
            </Pressable>
            <Pressable onPress={() => setRadiusKm(25)} style={[styles.smallBtn, radiusKm === 25 && styles.smallBtnActive]}>
              <Text style={[styles.smallBtnText, radiusKm === 25 && styles.smallBtnTextActive]}>25km</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={{ gap: 12 }}>
        {centers.map((c) => (
          <Pressable key={c.id} onPress={() => navigation.navigate('CenterDetail', { centerId: c.id })} style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar name={c.displayName} url={(c.avatarUrl as any) || null} size={44} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.title}>{c.displayName}</Text>
                {c.phone ? <Text style={styles.meta}>Contato: {c.phone}</Text> : null}
              </View>
            </View>
            <Text style={styles.addr}>{c.address}</Text>
            <Text style={styles.meta}>
              {c.hours ? `Horário: ${c.hours} • ` : ''}
              Itens: {c.acceptedItemTypes.join(', ') || '—'}
              {c.distanceKm != null ? ` • ${c.distanceKm.toFixed(1)}km` : ''}
            </Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { gap: 10 },
  hint: { color: colors.muted, fontWeight: '800', flex: 1 },
  filterBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.card2,
    borderWidth: 1,
    borderColor: colors.border
  },
  filterBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  filterBtnText: { color: colors.text, fontWeight: '800', fontSize: 12 },
  filterBtnTextActive: { color: '#fff' },
  smallBtn: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.card2, borderWidth: 1, borderColor: colors.border },
  smallBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  smallBtnText: { color: colors.text, fontWeight: '800' },
  smallBtnTextActive: { color: '#fff' },
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 6 },
  title: { color: colors.text, fontWeight: '900', fontSize: 16 },
  addr: { color: colors.text, fontWeight: '600' },
  meta: { color: colors.muted, fontWeight: '700', fontSize: 12 }
});

