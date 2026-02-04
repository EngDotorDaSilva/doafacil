import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import MapView, { Marker } from 'react-native-maps';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../ui/Button';
import { Avatar } from '../../ui/Avatar';
import { Input } from '../../ui/Input';
import { Screen } from '../../ui/Screen';
import { PostCard } from '../Feed/PostCard';
import { colors, shadows, borderRadius, spacing } from '../../ui/theme';

const CATEGORIES = ['roupa', 'alimento', 'livros', 'higiene', 'brinquedos', 'outros'];

export function ProfileScreen({ navigation }: any) {
  const { user, center, refreshMe, logout } = useAuth();
  const [profileEditMode, setProfileEditMode] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>((user?.avatarUrl as any) || null);
  const [userPin, setUserPin] = useState<{ lat: number; lng: number } | null>(
    user?.lat != null && user?.lng != null ? { lat: user.lat, lng: user.lng } : null
  );

  const [displayName, setDisplayName] = useState(center?.displayName || '');
  const [address, setAddress] = useState(center?.address || '');
  const [hours, setHours] = useState(center?.hours || '');
  const [accepted, setAccepted] = useState<string[]>(center?.acceptedItemTypes || []);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(
    center?.lat != null && center?.lng != null ? { lat: center.lat, lng: center.lng } : null
  );
  const [saving, setSaving] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [sharedPosts, setSharedPosts] = useState<any[]>([]);
  const [loadingShared, setLoadingShared] = useState(false);

  useEffect(() => {
    setName(user?.name || '');
    setPhone((user?.phone as any) || '');
    setAvatarUrl((user?.avatarUrl as any) || null);
    setUserPin(user?.lat != null && user?.lng != null ? { lat: user.lat, lng: user.lng } : null);
    setDisplayName(center?.displayName || '');
    setAddress(center?.address || '');
    setHours(center?.hours || '');
    setAccepted(center?.acceptedItemTypes || []);
    setPin(center?.lat != null && center?.lng != null ? { lat: center.lat, lng: center.lng } : null);
  }, [center?.updatedAt, user?.id, user?.name, user?.phone, user?.avatarUrl, user?.lat, user?.lng]);

  function toggleAccepted(cat: string) {
    setAccepted((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  }

  async function useMyLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const loc = await Location.getCurrentPositionAsync({});
    setPin({ lat: loc.coords.latitude, lng: loc.coords.longitude });
  }

  async function useMyLocationForProfile() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const loc = await Location.getCurrentPositionAsync({});
    setUserPin({ lat: loc.coords.latitude, lng: loc.coords.longitude });
  }

  async function pickAvatar() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão negada', 'Permita acesso às fotos para escolher uma imagem.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (result.canceled) return;
    const uri = result.assets?.[0]?.uri;
    if (!uri) return;
    const form = new FormData();
    form.append('file', { uri, name: 'avatar.jpg', type: 'image/jpeg' } as any);
    try {
      const resp = await api.post('/uploads', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setAvatarUrl(resp.data.url);
    } catch (e: any) {
      Alert.alert('Erro', e?.response?.data?.error || 'Falha ao enviar imagem.');
    }
  }

  async function saveProfile() {
    const phoneValue = phone.trim();
    if (phoneValue && !/^\+244\s?9\d{8}$/.test(phoneValue)) {
      Alert.alert('Contato inválido', 'Use o formato: +244 9xxxxxxxx');
      return;
    }
    setSavingProfile(true);
    try {
      await api.put('/me/profile', {
        name: name.trim(),
        phone: phoneValue || null,
        avatarUrl: avatarUrl || null,
        lat: userPin?.lat ?? null,
        lng: userPin?.lng ?? null
      });
      await refreshMe();
      setProfileEditMode(false);
    } catch (e: any) {
      Alert.alert('Erro', e?.response?.data?.error || 'Falha ao atualizar perfil.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveCenter() {
    setSaving(true);
    try {
      await api.put('/centers/me', {
        displayName: displayName.trim(),
        address: address.trim(),
        hours: hours.trim() || null,
        acceptedItemTypes: accepted,
        lat: pin?.lat ?? null,
        lng: pin?.lng ?? null
      });
      await refreshMe();
      setEditMode(false);
    } catch (e: any) {
      Alert.alert('Erro', e?.response?.data?.error || 'Falha ao atualizar centro.');
    } finally {
      setSaving(false);
    }
  }

  async function onLogout() {
    await logout();
  }

  const loadSharedPosts = useCallback(async () => {
    setLoadingShared(true);
    try {
      const resp = await api.get('/posts/shared');
      setSharedPosts(resp.data?.posts || []);
    } catch (e: any) {
      // Only ignore 404 errors, log others
      if (e?.response?.status !== 404) {
        console.error('Error loading shared posts:', e?.response?.data || e?.message);
      }
      setSharedPosts([]);
    } finally {
      setLoadingShared(false);
    }
  }, []);

  useEffect(() => {
    loadSharedPosts();
  }, [loadSharedPosts]);

  return (
    <Screen scroll>
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar name={user?.name} url={avatarUrl} size={54} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.name}>{user?.name}</Text>
            <Text style={styles.meta}>
              {user?.email} • <Text style={{ color: colors.text }}>{user?.role}</Text>
            </Text>
          </View>
        </View>
        <Text style={styles.meta}>
          Contato: <Text style={{ color: colors.text }}>{user?.phone || '—'}</Text>
        </Text>
        {user?.role === 'center' ? (
          <Text style={styles.meta}>
            Centro: <Text style={{ color: colors.text }}>{center?.displayName || '—'}</Text> •{' '}
            <Text style={{ color: center?.approved ? '#78FFB7' : colors.danger }}>
              {center?.approved ? 'aprovado' : 'pendente'}
            </Text>
          </Text>
        ) : null}
      </View>

      <Button
        title={profileEditMode ? 'Cancelar edição do perfil' : 'Editar perfil'}
        variant="secondary"
        onPress={() => setProfileEditMode((v) => !v)}
      />

      {profileEditMode ? (
        <View style={{ gap: 12 }}>
          <Text style={styles.section}>Dados pessoais</Text>
          <Input label="Nome" value={name} onChangeText={setName} placeholder="Seu nome" autoCapitalize="words" />
          <Input label="Contato (telefone)" value={phone} onChangeText={setPhone} placeholder="ex: +351 9xx xxx xxx" />
          <Button title="Trocar foto de perfil" variant="secondary" onPress={pickAvatar} />

          <Text style={styles.section}>Localização do utilizador</Text>
          <Button title="Usar minha localização" variant="secondary" onPress={useMyLocationForProfile} />
          <View style={styles.mapWrap}>
            <MapView
              style={StyleSheet.absoluteFill}
              initialRegion={{
                latitude: userPin?.lat ?? -23.55052,
                longitude: userPin?.lng ?? -46.633308,
                latitudeDelta: 0.06,
                longitudeDelta: 0.06
              }}
              onPress={(e) => setUserPin({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })}
            >
              {userPin ? <Marker coordinate={{ latitude: userPin.lat, longitude: userPin.lng }} /> : null}
            </MapView>
          </View>

          <Button title={savingProfile ? 'Salvando...' : 'Salvar perfil'} onPress={saveProfile} disabled={savingProfile} />
        </View>
      ) : null}

      {user?.role === 'center' ? (
        <>
          <View style={styles.row}>
            <Button title="Nova publicação" onPress={() => navigation.navigate('PostEditor')} />
            <Button
              title="Minhas publicações"
              variant="secondary"
              onPress={() => navigation.navigate('MyPosts')}
            />
          </View>
          <View style={styles.row}>
            <Button
              title="Gerenciar Itens"
              variant="secondary"
              onPress={() => navigation.navigate('Items')}
            />
            <Button
              title="Pedidos de Doação"
              variant="secondary"
              onPress={() => navigation.navigate('DonationRequests')}
            />
          </View>
          <Button
            title={editMode ? 'Cancelar edição do centro' : 'Editar centro'}
            variant="secondary"
            onPress={() => setEditMode((v) => !v)}
          />

          {editMode ? (
            <View style={{ gap: 12 }}>
              <Input label="Nome público" value={displayName} onChangeText={setDisplayName} placeholder="ex: Casa Solidária" />
              <Input label="Endereço" value={address} onChangeText={setAddress} placeholder="Rua, Nº, Cidade" />
              <Input label="Horário" value={hours} onChangeText={setHours} placeholder="ex: Seg-Sex 9h-17h" />

              <Text style={styles.section}>Itens aceites</Text>
              <View style={styles.chips}>
                {CATEGORIES.map((c) => {
                  const active = accepted.includes(c);
                  return (
                    <Pressable key={c} onPress={() => toggleAccepted(c)} style={[styles.chip, active && styles.chipActive]}>
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{c}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.section}>Localização (toque no mapa)</Text>
              <Button title="Usar minha localização" variant="secondary" onPress={useMyLocation} />
              <View style={styles.mapWrap}>
                <MapView
                  style={StyleSheet.absoluteFill}
                  initialRegion={{
                    latitude: pin?.lat ?? -23.55052,
                    longitude: pin?.lng ?? -46.633308,
                    latitudeDelta: 0.06,
                    longitudeDelta: 0.06
                  }}
                  onPress={(e) => setPin({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })}
                >
                  {pin ? <Marker coordinate={{ latitude: pin.lat, longitude: pin.lng }} /> : null}
                </MapView>
              </View>

              <Button title={saving ? 'Salvando...' : 'Salvar dados do centro'} onPress={saveCenter} disabled={saving} />
            </View>
          ) : null}
        </>
      ) : null}

      {user?.role === 'donor' ? (
        <View style={{ gap: 12 }}>
          <Button
            title="Ver Itens Disponíveis"
            onPress={() => navigation.navigate('AvailableItems')}
          />
          <Button
            title="Meus Pedidos de Doação"
            variant="secondary"
            onPress={() => navigation.navigate('DonationRequests')}
          />
        </View>
      ) : null}

      {user?.role === 'admin' ? (
        <Button title="Aprovar centros" onPress={() => navigation.navigate('AdminPendingCenters')} />
      ) : null}

      <Button title="Mudar senha" variant="secondary" onPress={() => navigation.navigate('ChangePassword')} />

      <View style={styles.sectionContainer}>
        <Text style={styles.sectionTitle}>📤 Publicações Compartilhadas</Text>
        {loadingShared ? (
          <View style={{ padding: 16, alignItems: 'center' }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : sharedPosts.length > 0 ? (
          <FlatList
            data={sharedPosts}
            keyExtractor={(p) => String(p.id)}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <View style={{ marginBottom: 12 }}>
                <PostCard
                  post={item}
                  onPress={() => navigation.navigate('PostDetail', { post: item })}
                  onPressAuthor={() => navigation.navigate('UserProfile', { userId: item.author.id })}
                  showActions={false}
                  onReaction={user ? (type) => {
                    // Handle reaction if needed
                  } : undefined}
                />
              </View>
            )}
          />
        ) : (
          <View style={{ padding: 16 }}>
            <Text style={{ color: colors.muted, fontWeight: '700' }}>
              Você ainda não compartilhou nenhuma publicação.
            </Text>
          </View>
        )}
      </View>

      <Button title="Sair" variant="danger" onPress={onLogout} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.medium
  },
  name: { color: colors.text, fontWeight: '900', fontSize: 20, marginBottom: spacing.xs },
  meta: { color: colors.textSecondary, fontWeight: '700', fontSize: 13 },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  section: { color: colors.muted, fontWeight: '800', marginTop: spacing.md, fontSize: 12, textTransform: 'uppercase' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card2,
    ...shadows.small
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primaryDark },
  chipText: { color: colors.text, fontWeight: '800', fontSize: 13 },
  chipTextActive: { color: '#fff', fontWeight: '900' },
  mapWrap: {
    height: 240,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: colors.border,
    marginTop: spacing.sm,
    ...shadows.medium
  },
  sectionContainer: { marginTop: spacing.lg, gap: spacing.md },
  sectionTitle: { color: colors.text, fontWeight: '900', fontSize: 18, marginBottom: spacing.sm }
});

