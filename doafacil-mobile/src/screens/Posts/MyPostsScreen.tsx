import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../ui/Button';
import { Screen } from '../../ui/Screen';
import { colors } from '../../ui/theme';

type MyPost = {
  id: number;
  text: string;
  category: string;
  imageUrl?: string | null;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
};

export function MyPostsScreen({ navigation }: any) {
  const { user, center } = useAuth();
  const [posts, setPosts] = useState<MyPost[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const resp = await api.get('/posts/mine');
      setPosts(resp.data.posts);
    } catch (e: any) {
      Alert.alert('Erro', e?.response?.data?.error || 'Falha ao carregar publicações.');
    } finally {
      setLoading(false);
    }
  }

  async function remove(postId: number) {
    try {
      await api.delete(`/posts/${postId}`);
      await load();
    } catch (e: any) {
      Alert.alert('Erro', e?.response?.data?.error || 'Falha ao apagar publicação.');
    }
  }

  useEffect(() => {
    if (user?.role === 'center') load().finally(() => {});
  }, [user?.role]);

  useFocusEffect(
    useCallback(() => {
      if (user?.role === 'center') load().finally(() => {});
    }, [user?.role])
  );

  if (user?.role !== 'center') {
    return (
      <Screen>
        <Text style={{ color: colors.muted }}>Apenas centros possuem publicações.</Text>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      {!center?.approved ? (
        <Text style={{ color: colors.muted, fontWeight: '800' }}>
          Seu centro ainda não foi aprovado — você pode rascunhar, mas só publicará após aprovação.
        </Text>
      ) : null}

      <Button title="Nova publicação" onPress={() => navigation.navigate('PostEditor')} />

      <Text style={styles.hint}>{loading ? 'Carregando...' : `${posts.length} publicações`}</Text>

      <View style={{ gap: 12 }}>
        {posts.map((p) => (
          <View key={p.id} style={styles.card}>
            <View style={{ gap: 6 }}>
              <Text style={styles.category}>{p.category}</Text>
              <Text style={styles.text} numberOfLines={3}>
                {p.text}
              </Text>
              <Text style={styles.meta}>
                Comentários: {p.commentCount} • {new Date(p.createdAt).toLocaleDateString()}
              </Text>
            </View>
            {p.imageUrl ? <Image source={{ uri: p.imageUrl }} style={styles.image} /> : null}

            <View style={styles.actionsRow}>
              <Pressable onPress={() => navigation.navigate('PostEditor', { post: p })} style={styles.actionBtn}>
                <Text style={styles.actionText}>Editar</Text>
              </Pressable>
              <Pressable
                onPress={() => remove(p.id)}
                style={[styles.actionBtn, { backgroundColor: colors.danger, borderColor: colors.danger }]}
              >
                <Text style={styles.actionText}>Apagar</Text>
              </Pressable>
            </View>
          </View>
        ))}
        {!posts.length && !loading ? <Text style={{ color: colors.muted }}>Você ainda não publicou nada.</Text> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hint: { color: colors.muted, fontWeight: '800' },
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 10 },
  category: { color: colors.primary, fontWeight: '900', textTransform: 'uppercase', fontSize: 12 },
  text: { color: colors.text, fontWeight: '700' },
  meta: { color: colors.muted, fontWeight: '700', fontSize: 12 },
  image: { width: '100%', height: 220, borderRadius: 14, backgroundColor: colors.card2 },
  actionsRow: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.card2, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  actionText: { color: '#fff', fontWeight: '900' }
});

