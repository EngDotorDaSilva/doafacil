import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import MapView, { Marker } from 'react-native-maps';
import * as ImagePicker from 'expo-image-picker';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../ui/Button';
import { Avatar } from '../../ui/Avatar';
import { Input } from '../../ui/Input';
import { Screen } from '../../ui/Screen';
import { colors } from '../../ui/theme';

type Role = 'donor' | 'center';

const CATEGORIES = ['roupa', 'alimento', 'livros', 'higiene', 'brinquedos', 'outros'];

export function RegisterScreen({ navigation }: any) {
  const { register } = useAuth();
  const [role, setRole] = useState<Role>('donor');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Center fields
  const [displayName, setDisplayName] = useState('');
  const [address, setAddress] = useState('');
  const [hours, setHours] = useState('');
  const [accepted, setAccepted] = useState<string[]>(['roupa', 'alimento']);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [userPin, setUserPin] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(false);

  async function pickAvatar() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão negada', 'Permita acesso às fotos para escolher uma imagem.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8
    });
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

  async function useMyLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão negada', 'Ative a localização para marcar o centro no mapa.');
      return;
    }
    const loc = await Location.getCurrentPositionAsync({});
    setPin({ lat: loc.coords.latitude, lng: loc.coords.longitude });
  }

  async function useMyLocationForUser() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão negada', 'Ative a localização para definir sua localização.');
      return;
    }
    const loc = await Location.getCurrentPositionAsync({});
    setUserPin({ lat: loc.coords.latitude, lng: loc.coords.longitude });
  }

  function toggleAccepted(cat: string) {
    setAccepted((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  }

  async function onSubmit() {
    const phoneValue = phone.trim();
    if (phoneValue && !/^\+244\s?9\d{8}$/.test(phoneValue)) {
      Alert.alert('Contato inválido', 'Use o formato: +244 9xxxxxxxx');
      return;
    }
    setLoading(true);
    try {
      if (role === 'donor') {
        await register({
          role: 'donor',
          name: name.trim(),
          email: email.trim(),
          password,
          phone: phoneValue || undefined,
          avatarUrl: avatarUrl || undefined,
          lat: userPin?.lat,
          lng: userPin?.lng
        });
      } else {
        const effectiveUserPin = userPin ?? pin;
        await register({
          role: 'center',
          name: name.trim(),
          email: email.trim(),
          password,
          phone: phoneValue || undefined,
          avatarUrl: avatarUrl || undefined,
          lat: effectiveUserPin?.lat,
          lng: effectiveUserPin?.lng,
          center: {
            displayName: displayName.trim() || name.trim(),
            address: address.trim(),
            lat: pin?.lat,
            lng: pin?.lng,
            hours: hours.trim() || undefined,
            acceptedItemTypes: accepted
          }
        });
      }
    } catch (e: any) {
      Alert.alert('Falha no cadastro', e?.response?.data?.error || 'Verifique os campos.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen scroll>
      <Text style={styles.title}>Criar conta</Text>

      <View style={styles.roleRow}>
        <Pressable onPress={() => setRole('donor')} style={[styles.rolePill, role === 'donor' && styles.rolePillActive]}>
          <Text style={[styles.roleText, role === 'donor' && styles.roleTextActive]}>Doador</Text>
        </Pressable>
        <Pressable
          onPress={() => setRole('center')}
          style={[styles.rolePill, role === 'center' && styles.rolePillActive]}
        >
          <Text style={[styles.roleText, role === 'center' && styles.roleTextActive]}>Centro</Text>
        </Pressable>
      </View>

      <Input label="Nome" value={name} onChangeText={setName} placeholder="Seu nome" autoCapitalize="words" />
      <Input label="Email" value={email} onChangeText={setEmail} placeholder="ex: centro@email.com" keyboardType="email-address" />
      <Input label="Contato (telefone)" value={phone} onChangeText={setPhone} placeholder="ex: +244 9xxxxxxxx" />
      <Input label="Senha" value={password} onChangeText={setPassword} placeholder="mín 6 caracteres" secureTextEntry />

      <View style={{ gap: 10 }}>
        <Text style={styles.section}>Foto de perfil (opcional)</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar name={name} url={avatarUrl} size={54} />
          <Button title={avatarUrl ? 'Trocar foto' : 'Escolher foto'} variant="secondary" onPress={pickAvatar} />
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={styles.section}>Sua localização (opcional)</Text>
        <Button title="Usar minha localização" variant="secondary" onPress={useMyLocationForUser} />
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
          {!userPin ? <Text style={styles.mapHint}>Toque no mapa para marcar sua localização</Text> : null}
        </View>
      </View>

      {role === 'center' ? (
        <>
          <Text style={styles.section}>Dados do centro (precisa aprovação do Admin)</Text>
          <Input label="Nome público do centro" value={displayName} onChangeText={setDisplayName} placeholder="ex: Casa Solidária" />
          <Input label="Endereço" value={address} onChangeText={setAddress} placeholder="Rua, Nº, Cidade" />
          <Input label="Horário de funcionamento" value={hours} onChangeText={setHours} placeholder="ex: Seg-Sex 9h-17h" />

          <View style={{ gap: 10 }}>
            <Text style={styles.section}>Tipos de itens aceites</Text>
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
          </View>

          <View style={{ gap: 8 }}>
            <Text style={styles.section}>Localização no mapa</Text>
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
              {!pin ? <Text style={styles.mapHint}>Toque no mapa para marcar o ponto</Text> : null}
            </View>
          </View>
        </>
      ) : null}

      <Button title={loading ? 'Criando...' : 'Criar conta'} onPress={onSubmit} disabled={loading} />
      <Button title="Já tenho conta" variant="secondary" onPress={() => navigation.goBack()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 24, fontWeight: '900' },
  roleRow: { flexDirection: 'row', gap: 10 },
  rolePill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card2,
    alignItems: 'center'
  },
  rolePillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  roleText: { color: colors.text, fontWeight: '800' },
  roleTextActive: { color: '#fff' },
  section: { color: colors.muted, fontWeight: '800', marginTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontWeight: '700' },
  chipTextActive: { color: '#fff' },
  mapWrap: { height: 240, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  mapHint: { position: 'absolute', bottom: 10, left: 10, color: colors.text, backgroundColor: 'rgba(0,0,0,0.4)', padding: 8, borderRadius: 10 }
});

