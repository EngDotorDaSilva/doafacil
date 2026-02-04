import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { requestFeedRefresh } from '../../feed/feedRefresh';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Screen } from '../../ui/Screen';
import { colors } from '../../ui/theme';

const CATEGORIES = ['roupa', 'alimento', 'livros', 'higiene', 'brinquedos', 'outros'];

export function CenterPostEditorScreen({ route, navigation }: any) {
  const { user, center } = useAuth();
  const existingPost = route.params?.post || null;

  const [text, setText] = useState(existingPost?.text || '');
  const [category, setCategory] = useState(existingPost?.category || 'roupa');
  const initialExistingUrls = useMemo(() => {
    const urls = Array.isArray(existingPost?.imageUrls) ? existingPost.imageUrls : [];
    const legacy = existingPost?.imageUrl ? [existingPost.imageUrl] : [];
    const merged = [...urls];
    for (const u of legacy) if (u && !merged.includes(u)) merged.unshift(u);
    return merged;
  }, [existingPost?.id]);
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>(initialExistingUrls);
  const [localImageUris, setLocalImageUris] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const canUse = user?.role === 'center' && !!center?.approved;

  async function pickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão negada', 'Permita acesso às fotos para anexar uma imagem.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (result.canceled) return;
    const uri = result.assets?.[0]?.uri;
    if (!uri) return;
    setLocalImageUris((prev) => [...prev, uri]);
  }

  async function uploadAllIfNeeded() {
    if (!localImageUris.length) return [];
    const urls: string[] = [];
    for (const uri of localImageUris) {
      const form = new FormData();
      form.append('file', { uri, name: 'upload.jpg', type: 'image/jpeg' } as any);
      const resp = await api.post('/uploads', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      urls.push(resp.data.url as string);
    }
    return urls;
  }

  async function save() {
    if (!canUse) {
      Alert.alert('Centro não aprovado', 'Aguarde a aprovação do administrador para publicar.');
      return;
    }
    if (!text.trim()) {
      Alert.alert('Texto obrigatório', 'Por favor, preencha o texto da publicação.');
      return;
    }
    setSaving(true);
    try {
      const uploadedUrls = await uploadAllIfNeeded();
      const imageUrls = [...existingImageUrls, ...uploadedUrls].filter((url) => url && url.trim());
      const payload: any = { text: text.trim(), category };
      if (imageUrls.length > 0) {
        payload.imageUrls = imageUrls;
      }
      
      console.log('[CenterPostEditor] Saving post with payload:', { ...payload, imageUrls: imageUrls.length });
      
      if (existingPost) {
        await api.put(`/posts/${existingPost.id}`, payload);
      } else {
        await api.post('/posts', payload);
      }
      requestFeedRefresh();
      navigation.goBack();
    } catch (e: any) {
      console.error('Error saving post:', e);
      let errorMsg = 'Falha ao salvar publicação.';
      
      if (e?.code === 'ERR_NETWORK' || e?.message === 'Network Error') {
        errorMsg = 'Erro de conexão. Verifique sua internet e tente novamente.';
      } else if (e?.response?.status === 400) {
        errorMsg = e?.response?.data?.error || 'Dados inválidos. Verifique os campos preenchidos.';
      } else if (e?.response?.status === 403) {
        errorMsg = 'Centro não aprovado. Aguarde a aprovação do administrador.';
      } else if (e?.response?.status === 404) {
        errorMsg = 'Centro não encontrado.';
      } else if (e?.response?.data?.error) {
        errorMsg = e.response.data.error;
      } else if (e?.response?.data?.details?.[0]?.message) {
        errorMsg = e.response.data.details[0].message;
      }
      
      Alert.alert('Erro', errorMsg);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!existingPost) return;
    try {
      await api.delete(`/posts/${existingPost.id}`);
      requestFeedRefresh();
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Erro', e?.response?.data?.error || 'Falha ao apagar.');
    }
  }

  return (
    <Screen scroll>
      <Text style={styles.hint}>Publicar necessidade do centro</Text>

      <View style={styles.chips}>
        {CATEGORIES.map((c) => {
          const active = c === category;
          return (
            <Pressable key={c} onPress={() => setCategory(c)} style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{c}</Text>
            </Pressable>
          );
        })}
      </View>

      <Input label="Texto" value={text} onChangeText={setText} placeholder="Descreva a necessidade atual..." multiline />

      <Button title="Adicionar imagem" variant="secondary" onPress={pickImage} />

      {existingImageUrls.length || localImageUris.length ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.muted, fontWeight: '800' }}>Imagens</Text>
          <FlatList
            data={[...existingImageUrls.map((u) => ({ kind: 'remote' as const, uri: u })), ...localImageUris.map((u) => ({ kind: 'local' as const, uri: u }))]}
            keyExtractor={(x, idx) => `${x.kind}:${x.uri}:${idx}`}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10 }}
            renderItem={({ item }) => (
              <View style={{ position: 'relative' }}>
                <Image source={{ uri: item.uri }} style={styles.thumb} />
                <Pressable
                  onPress={() => {
                    if (item.kind === 'remote') setExistingImageUrls((prev) => prev.filter((x) => x !== item.uri));
                    else setLocalImageUris((prev) => prev.filter((x) => x !== item.uri));
                  }}
                  style={styles.removeBtn}
                >
                  <Text style={styles.removeBtnText}>×</Text>
                </Pressable>
              </View>
            )}
          />
        </View>
      ) : null}

      <Button title={saving ? 'Salvando...' : 'Salvar'} onPress={save} disabled={saving} />
      {existingPost ? <Button title="Apagar" variant="danger" onPress={remove} /> : null}

      {!canUse ? <Text style={styles.warn}>Seu centro ainda não foi aprovado pelo administrador.</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hint: { color: colors.muted, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontWeight: '700' },
  chipTextActive: { color: '#fff' },
  thumb: { width: 120, height: 120, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card2 },
  removeBtn: { position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  removeBtnText: { color: '#fff', fontWeight: '900', fontSize: 18, lineHeight: 18 },
  warn: { color: colors.muted, fontWeight: '800' }
});

