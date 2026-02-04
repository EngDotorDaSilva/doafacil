import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View, Share } from 'react-native';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useChat } from '../../chat/ChatContext';
import { consumeFeedRefresh } from '../../feed/feedRefresh';
import { Skeleton } from '../../ui/Skeleton';
import { Screen } from '../../ui/Screen';
import { colors, shadows, borderRadius, spacing } from '../../ui/theme';
import { PostCard } from './PostCard';
import { DateRangePicker } from '../../ui/DateRangePicker';

type Post = {
  id: number;
  text: string;
  category: string;
  imageUrl?: string | null;
  imageUrls?: string[] | null;
  commentCount: number;
  reactions?: { like: number; love: number; dislike: number };
  myReaction?: 'like' | 'love' | 'dislike' | null;
  isSaved?: boolean;
  createdAt: string;
  author: { id: number; name: string; role: 'donor' | 'center' | 'admin'; avatarUrl?: string | null };
  center: null | { id: number; displayName: string; address: string; lat: number | null; lng: number | null };
  distanceKm?: number | null;
};

const CATEGORIES = ['todas', 'roupa', 'alimento', 'livros', 'higiene', 'brinquedos', 'outros'];
const FEED_FILTERS_KEY = 'doafacil_feed_filters_v1';

type SavedFeedFilters = {
  v: 1;
  category: string;
  useGeo: boolean;
  radiusKm: number;
};

export function FeedScreen({ navigation }: any) {
  const { user } = useAuth();
  const { socket } = useChat();
  const listRef = useRef<FlatList<Post>>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [category, setCategory] = useState('todas');
  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'reactions' | 'comments'>('recent');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [radiusKm, setRadiusKm] = useState(10);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [useGeo, setUseGeo] = useState(false); // Always false by default - show all posts
  const [filtersReady, setFiltersReady] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [initialLoading, setInitialLoading] = useState(false);
  const [cursor, setCursor] = useState<{ beforeCreatedAt: string; beforeId: number } | null>(null);
  const [showTop, setShowTop] = useState(false);
  const [hasNewPosts, setHasNewPosts] = useState(false);
  const showTopRef = useRef(false);
  // Track posts added via Socket.IO to preserve them during resets
  const socketPostsRef = useRef<Set<number>>(new Set());

  const canGeoFilter = useMemo(() => useGeo && pos != null, [useGeo, pos]);
  const limit = 20;

  async function loadMyLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão negada', 'Permita localização para filtrar por proximidade.');
      return false;
    }
    const loc = await Location.getCurrentPositionAsync({});
    setPos({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    return true;
  }

  const hasActiveFilters = useMemo(() => category !== 'todas' || useGeo || searchText.trim().length > 0 || sortBy !== 'recent' || dateFilter !== 'all' || dateFrom || dateTo, [category, useGeo, searchText, sortBy, dateFilter, dateFrom, dateTo]);

  const clearFilters = useCallback(async () => {
    setCategory('todas');
    setSearchText('');
    setSortBy('recent');
    setDateFilter('all');
    setDateFrom(null);
    setDateTo(null);
    setRadiusKm(10);
    setUseGeo(false);
    setPos(null);
    try {
      await SecureStore.deleteItemAsync(FEED_FILTERS_KEY);
    } catch {
      // ignore
    }
  }, []);

  const fetchPage = useCallback(
    async ({ reset }: { reset: boolean }) => {
      const useGeoNow = !!pos && useGeo;
      const nextOffset = reset ? 0 : posts.length;
      if (!reset && (!hasMore || loadingMore)) return;

      if (reset) setRefreshing(true);
      else setLoadingMore(true);
      if (reset && posts.length === 0) setInitialLoading(true);

    try {
      const params: any = {};
      // Only apply filters if user explicitly set them
      if (category !== 'todas') params.category = category;
      if (searchText.trim().length > 0) params.search = searchText.trim();
      if (sortBy !== 'recent') params.sortBy = sortBy;
      // Custom date range takes priority over dateFilter
      if (dateFrom || dateTo) {
        if (dateFrom) params.dateFrom = dateFrom;
        if (dateTo) params.dateTo = dateTo;
      } else if (dateFilter !== 'all') {
        params.dateFilter = dateFilter;
      }
      params.limit = limit;

      // Only apply geo filter if user explicitly enabled it
      if (useGeoNow) {
        params.lat = pos!.lat;
        params.lng = pos!.lng;
        params.radiusKm = radiusKm;
        params.offset = nextOffset;
      } else {
        // No geo filter - show all posts
        if (!reset && cursor) {
          params.beforeCreatedAt = cursor.beforeCreatedAt;
          params.beforeId = cursor.beforeId;
        }
      }

      console.log('[FeedScreen] Fetching posts with params:', params);
      const resp = await api.get('/posts', { params });
      const nextPosts = resp.data.posts as Post[];
      console.log('[FeedScreen] Received', nextPosts.length, 'posts from API');
      setPosts((prev) => {
        if (reset) {
          // When resetting, preserve posts that were added via Socket.IO
          // These are posts that may not match current filters but should still be visible
          const socketPosts = prev.filter((p) => socketPostsRef.current.has(p.id));
          const apiPostIds = new Set(nextPosts.map((p) => p.id));
          // Merge: API posts first, then Socket.IO posts that aren't in API response
          const merged = [...nextPosts, ...socketPosts.filter((p) => !apiPostIds.has(p.id))];
          const seen = new Set<number>();
          return merged.filter((p) => {
            if (seen.has(p.id)) return false;
            seen.add(p.id);
            return true;
          });
        } else {
          // When loading more, just append
          const merged = [...prev, ...nextPosts];
          const seen = new Set<number>();
          return merged.filter((p) => {
            if (seen.has(p.id)) return false;
            seen.add(p.id);
            return true;
          });
        }
      });
        setHasMore(!!resp.data.hasMore && nextPosts.length > 0);
        if (!useGeoNow) {
          setCursor(resp.data.nextCursor || null);
        }
        if (reset) setHasNewPosts(false);
    } catch (e: any) {
      Alert.alert('Erro', e?.response?.data?.error || 'Falha ao carregar feed.');
    } finally {
      setRefreshing(false);
      setLoadingMore(false);
      setInitialLoading(false);
    }
    },
    [category, searchText, sortBy, dateFilter, dateFrom, dateTo, radiusKm, pos?.lat, pos?.lng, useGeo, hasMore, loadingMore, posts.length, cursor]
  );

  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(FEED_FILTERS_KEY);
        if (!raw) {
          // No saved filters - show all posts by default
          setFiltersReady(true);
          return;
        }
        const parsed = JSON.parse(raw) as SavedFeedFilters;
        if (parsed?.v !== 1) {
          setFiltersReady(true);
          return;
        }
        // Only restore category if it's not 'todas' (user had a filter)
        if (typeof parsed.category === 'string' && CATEGORIES.includes(parsed.category) && parsed.category !== 'todas') {
          setCategory(parsed.category);
        }
        if (typeof parsed.radiusKm === 'number' && Number.isFinite(parsed.radiusKm)) {
          setRadiusKm(parsed.radiusKm);
        }
        // Only load location if user explicitly enabled geo filter
        // Don't force location permission if user hasn't enabled it
        if (parsed.useGeo) {
          const ok = await loadMyLocation();
          if (ok) {
            setUseGeo(true);
          } else {
            // If location permission denied, disable geo filter - show all posts
            setUseGeo(false);
          }
        } else {
          // Explicitly disable geo filter if not saved - show all posts
          setUseGeo(false);
        }
      } catch {
        // ignore errors - show all posts by default
      } finally {
        setFiltersReady(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!filtersReady) return;
    // Reset when filters change
    console.log('[FeedScreen] Filters ready, loading posts...', { category, searchText, sortBy, dateFilter });
    setHasMore(true);
    setCursor(null);
    fetchPage({ reset: true }).finally(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersReady, category, searchText, sortBy, dateFilter, dateFrom, dateTo, radiusKm, pos?.lat, pos?.lng, useGeo]);

  useEffect(() => {
    if (!filtersReady) return;
    const saved: SavedFeedFilters = { v: 1, category, useGeo, radiusKm };
    SecureStore.setItemAsync(FEED_FILTERS_KEY, JSON.stringify(saved)).catch(() => {});
  }, [filtersReady, category, useGeo, radiusKm]);

  useEffect(() => {
    if (!socket) {
      console.log('[FeedScreen] Socket not available, cannot listen to post events');
      return;
    }
    console.log('[FeedScreen] Setting up socket listeners for post events. Socket connected:', socket.connected);
    
    // Ensure socket is connected
    if (!socket.connected) {
      console.log('[FeedScreen] Socket not connected, waiting for connection...');
      const onConnect = () => {
        console.log('[FeedScreen] Socket connected, setting up listeners');
        socket.off('connect', onConnect);
      };
      socket.on('connect', onConnect);
    }
    
    const onCommentCount = (payload: any) => {
      const postId = Number(payload?.postId);
      const commentCount = Number(payload?.commentCount);
      if (!Number.isFinite(postId) || !Number.isFinite(commentCount)) return;
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, commentCount } : p)));
    };
    
    const onPostNew = (payload: any) => {
      console.log('[FeedScreen] Received post:new event:', payload);
      const post = payload?.post as Post | undefined;
      if (post?.id) {
        // Always add new post to the beginning of the list if it's not already there
        setPosts((prev) => {
          const exists = prev.some((p) => p.id === post.id);
          if (exists) {
            console.log('[FeedScreen] Post already exists in list, skipping:', post.id);
            return prev;
          }
          
          // Only add if center is approved or post has no center
          const centerApproved = post.center ? (post.center.approved === true || post.center.approved === 1) : true;
          if (!post.center || centerApproved) {
            console.log('[FeedScreen] Adding new post to feed:', post.id, 'Category:', post.category);
            // Mark this post as added via Socket.IO so it's preserved during resets
            socketPostsRef.current.add(post.id);
            // Add post at the beginning, regardless of current filters
            // This ensures new posts are always visible to users
            const newList = [post, ...prev];
            console.log('[FeedScreen] New posts list length:', newList.length);
            return newList;
          } else {
            console.log('[FeedScreen] Post center not approved, skipping:', post.id);
          }
          return prev;
        });
        // Show indicator that there are new posts
        setHasNewPosts(true);
      } else {
        console.warn('[FeedScreen] Received post:new event without valid post:', payload);
        setHasNewPosts(true);
      }
    };
    const onPostUpdated = (payload: any) => {
      const post = payload?.post as Post | undefined;
      if (!post?.id) return;
      setPosts((prev) => {
        const idx = prev.findIndex((p) => p.id === post.id);
        if (idx === -1) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], ...post };
        return next;
      });
    };
    const onPostDeleted = (payload: any) => {
      const postId = Number(payload?.postId);
      if (!Number.isFinite(postId)) return;
      // Remove from Socket.IO tracking
      socketPostsRef.current.delete(postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    };
    const onPostRestored = (_payload: any) => {
      setHasNewPosts(true);
    };

    socket.on('post:commentCount', onCommentCount);
    socket.on('post:new', onPostNew);
    socket.on('post:updated', onPostUpdated);
    socket.on('post:deleted', onPostDeleted);
    socket.on('post:restored', onPostRestored);
    
    // Log when socket connects/disconnects
    const onConnect = () => {
      console.log('[FeedScreen] Socket connected, ready to receive post events');
    };
    const onDisconnect = () => {
      console.log('[FeedScreen] Socket disconnected');
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    
    return () => {
      socket.off('post:commentCount', onCommentCount);
      socket.off('post:new', onPostNew);
      socket.off('post:updated', onPostUpdated);
      socket.off('post:deleted', onPostDeleted);
      socket.off('post:restored', onPostRestored);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [socket]);

  useFocusEffect(
    useCallback(() => {
      if (consumeFeedRefresh()) {
        fetchPage({ reset: true }).finally(() => {});
      }
    }, [fetchPage])
  );

  const deletePost = useCallback(
    async (postId: number) => {
      try {
        await api.delete(`/posts/${postId}`);
        await fetchPage({ reset: true });
      } catch (e: any) {
        Alert.alert('Erro', e?.response?.data?.error || 'Falha ao apagar publicação.');
      }
    },
    [fetchPage]
  );

  const handleReaction = useCallback(
    async (postId: number, type: 'like' | 'love' | 'dislike' | null) => {
      try {
        if (type === null) {
          await api.delete(`/posts/${postId}/reactions`);
        } else {
          await api.post(`/posts/${postId}/reactions`, { type });
        }
        // Update local state optimistically
        setPosts((prev) =>
          prev.map((p) => {
            if (p.id !== postId) return p;
            const currentReactions = p.reactions || { like: 0, love: 0, dislike: 0 };
            const currentMyReaction = p.myReaction;
            let newReactions = { ...currentReactions };
            let newMyReaction: 'like' | 'love' | 'dislike' | null = type;

            // Remove old reaction count
            if (currentMyReaction) {
              newReactions[currentMyReaction] = Math.max(0, newReactions[currentMyReaction] - 1);
            }

            // Add new reaction count
            if (type) {
              newReactions[type] = (newReactions[type] || 0) + 1;
            }

            return { ...p, reactions: newReactions, myReaction: newMyReaction };
          })
        );
      } catch (e: any) {
        Alert.alert('Erro', e?.response?.data?.error || 'Falha ao reagir.');
      }
    },
    []
  );

  const handleSave = useCallback(
    async (postId: number, isCurrentlySaved: boolean) => {
      try {
        if (isCurrentlySaved) {
          await api.delete(`/posts/${postId}/save`);
        } else {
          await api.post(`/posts/${postId}/save`);
        }
        setPosts((prev) =>
          prev.map((p) => (p.id === postId ? { ...p, isSaved: !isCurrentlySaved } : p))
        );
      } catch (e: any) {
        Alert.alert('Erro', e?.response?.data?.error || 'Falha ao salvar publicação.');
      }
    },
    []
  );

  const handleShare = useCallback(async (post: Post) => {
    try {
      const message = `${post.text}\n\n${post.center ? `Centro: ${post.center.displayName}` : `Por: ${post.author.name}`}`;
      await Share.share({
        message,
        title: 'Publicação DoaFácil'
      });
      // Create share in backend
      try {
        await api.post(`/posts/${post.id}/share`);
      } catch (e: any) {
        // Ignore errors - share might already exist
      }
    } catch (e: any) {
      // User cancelled or error
    }
  }, []);

  const Header = useMemo(
    () => (
    <View style={styles.stickyWrap}>
      <View style={styles.filters}>
        {user?.role === 'center' ? (
          <Pressable onPress={() => navigation.navigate('PostEditor')} style={styles.publishBtn}>
            <Text style={styles.publishBtnText}>+ Publicar necessidade</Text>
          </Pressable>
        ) : null}
        {hasNewPosts ? (
          <Pressable
            onPress={() => {
              listRef.current?.scrollToOffset({ offset: 0, animated: true });
              fetchPage({ reset: true }).finally(() => {});
            }}
            style={styles.newPill}
          >
            <Text style={styles.newPillText}>Novas publicações • tocar para atualizar</Text>
          </Pressable>
        ) : null}

        <View style={styles.searchRow}>
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Buscar publicações..."
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            onSubmitEditing={() => fetchPage({ reset: true })}
          />
          <Pressable
            onPress={() => setShowFilters(!showFilters)}
            style={[styles.filterToggle, showFilters && styles.filterToggleActive]}
          >
            <Text style={styles.filterToggleText}>⚙️</Text>
          </Pressable>
        </View>

        {showFilters ? (
          <View style={styles.advancedFilters}>
            <Text style={styles.filterLabel}>Ordenar por:</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {(['recent', 'reactions', 'comments'] as const).map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setSortBy(s)}
                  style={[styles.chip, sortBy === s && styles.chipActive]}
                >
                  <Text style={[styles.chipText, sortBy === s && styles.chipTextActive]}>
                    {s === 'recent' ? '📅 Recente' : s === 'reactions' ? '👍 Reações' : '💬 Comentários'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.filterLabel}>Período:</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              {(['all', 'today', 'week', 'month'] as const).map((d) => (
                <Pressable
                  key={d}
                  onPress={() => {
                    setDateFilter(d);
                    if (d !== 'all') {
                      setDateFrom(null);
                      setDateTo(null);
                    }
                  }}
                  style={[styles.chip, dateFilter === d && !dateFrom && !dateTo && styles.chipActive]}
                >
                  <Text style={[styles.chipText, dateFilter === d && !dateFrom && !dateTo && styles.chipTextActive]}>
                    {d === 'all' ? 'Tudo' : d === 'today' ? 'Hoje' : d === 'week' ? 'Semana' : 'Mês'}
                  </Text>
                </Pressable>
              ))}
            </View>
            <DateRangePicker
              dateFrom={dateFrom}
              dateTo={dateTo}
              onSelect={(from, to) => {
                setDateFrom(from);
                setDateTo(to);
                if (from || to) {
                  setDateFilter('all');
                }
              }}
              onClear={() => {
                setDateFrom(null);
                setDateTo(null);
              }}
            />
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {CATEGORIES.map((c) => {
            const active = c === category;
            return (
              <Pressable key={c} onPress={() => setCategory(c)} style={[styles.chip, active && styles.chipActive]}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{c}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.geoRow}>
          <Text style={styles.geoText}>
            Localização:{' '}
            <Text style={{ color: colors.text }}>
              {useGeo && canGeoFilter ? `📍 Perto de mim (${radiusKm}km)` : '📍 Todas as publicações'}
            </Text>
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {hasActiveFilters ? (
              <Pressable onPress={clearFilters} style={[styles.smallBtn, { backgroundColor: '#2a2a2a' }]}>
                <Text style={styles.smallBtnText}>Limpar</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={async () => {
                if (!useGeo) {
                  // Ask for location permission only when user wants to enable it
                  const ok = await loadMyLocation();
                  if (ok) {
                    setUseGeo(true);
                  } else {
                    // If permission denied, keep it off
                    setUseGeo(false);
                    Alert.alert('Localização', 'Permissão de localização negada. O feed mostrará todas as publicações.');
                  }
                } else {
                  // Disable geo filter
                  setUseGeo(false);
                }
              }}
              style={[styles.smallBtn, useGeo && { backgroundColor: colors.primary, borderColor: colors.primary }]}
            >
              <Text style={[styles.smallBtnText, useGeo && { color: '#fff' }]}>{useGeo ? '📍 Ligado' : '📍 Desligado'}</Text>
            </Pressable>
            <Pressable onPress={() => setRadiusKm(5)} style={styles.smallBtn} disabled={!useGeo}>
              <Text style={[styles.smallBtnText, !useGeo && { opacity: 0.5 }]}>5km</Text>
            </Pressable>
            <Pressable onPress={() => setRadiusKm(10)} style={styles.smallBtn} disabled={!useGeo}>
              <Text style={[styles.smallBtnText, !useGeo && { opacity: 0.5 }]}>10km</Text>
            </Pressable>
            <Pressable onPress={() => setRadiusKm(25)} style={styles.smallBtn} disabled={!useGeo}>
              <Text style={[styles.smallBtnText, !useGeo && { opacity: 0.5 }]}>25km</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.hint}>{initialLoading ? 'Carregando...' : `${posts.length} publicações`}</Text>
      </View>
    </View>
    ),
    [user?.role, navigation, category, radiusKm, canGeoFilter, useGeo, hasNewPosts, initialLoading, posts.length, fetchPage, hasActiveFilters, clearFilters, searchText, showFilters, sortBy, dateFilter, dateFrom, dateTo]
  );

  const renderItem = useCallback(
    ({ item }: { item: Post }) => {
      const showActions = user?.role === 'center' && item.author.id === user.id;
      return (
        <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
          <PostCard
            post={item}
            onPress={() => navigation.navigate('PostDetail', { post: item })}
            onPressAuthor={() => navigation.navigate('UserProfile', { userId: item.author.id })}
            showActions={!!showActions}
            onEdit={() => navigation.navigate('PostEditor', { post: item })}
            onDelete={() => deletePost(item.id)}
            onReaction={user ? (type) => handleReaction(item.id, type) : undefined}
            onSave={user ? () => handleSave(item.id, item.isSaved || false) : undefined}
            onShare={() => handleShare(item)}
            onReport={user && item.author.id !== user.id ? () => navigation.navigate('Report', { targetType: 'post', targetId: item.id }) : undefined}
          />
        </View>
      );
    },
    [user?.id, user?.role, navigation, deletePost, handleReaction, handleSave, handleShare, user]
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        ref={listRef}
        data={posts}
        keyExtractor={(p) => String(p.id)}
        ListHeaderComponent={Header}
        stickyHeaderIndices={[0]}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshing={refreshing}
        onRefresh={() => fetchPage({ reset: true })}
        onEndReachedThreshold={0.4}
        onEndReached={() => fetchPage({ reset: false })}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          const next = y > 700;
          if (showTopRef.current !== next) {
            showTopRef.current = next;
            setShowTop(next);
          }
        }}
        scrollEventThrottle={16}
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        removeClippedSubviews
        ListEmptyComponent={
          initialLoading ? (
            <View style={{ padding: 16 }}>
              <View style={{ gap: 12 }}>
                {Array.from({ length: 4 }).map((_, idx) => (
                  <View key={idx} style={[styles.card, { marginHorizontal: 0 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Skeleton width={34} height={34} radius={17} />
                      <View style={{ flex: 1, gap: 8 }}>
                        <Skeleton width="60%" height={14} radius={8} />
                        <Skeleton width="35%" height={12} radius={8} />
                      </View>
                      <Skeleton width={70} height={16} radius={8} />
                    </View>
                    <Skeleton width="100%" height={14} radius={8} />
                    <Skeleton width="92%" height={14} radius={8} />
                    <Skeleton width="70%" height={14} radius={8} />
                    <Skeleton width="100%" height={180} radius={14} />
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <View style={{ padding: 24, alignItems: 'center', gap: 12 }}>
              <Text style={{ color: colors.muted, fontWeight: '800', fontSize: 16, textAlign: 'center' }}>
                Nenhuma publicação encontrada.
              </Text>
              {hasActiveFilters ? (
                <Pressable onPress={clearFilters} style={{ paddingVertical: 8, paddingHorizontal: 16, backgroundColor: colors.primary, borderRadius: 8 }}>
                  <Text style={{ color: '#fff', fontWeight: '800' }}>Limpar filtros</Text>
                </Pressable>
              ) : null}
            </View>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={{ padding: 16 }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : !hasMore && posts.length ? (
            <View style={{ padding: 16 }}>
              <Text style={{ color: colors.muted, fontWeight: '800' }}>Fim do feed.</Text>
            </View>
          ) : null
        }
        renderItem={renderItem}
      />

      {showTop ? (
        <Pressable
          onPress={() => {
            listRef.current?.scrollToOffset({ offset: 0, animated: true });
          }}
          style={styles.topBtn}
        >
          <Text style={styles.topBtnText}>Topo</Text>
        </Pressable>
      ) : null}

      {user?.role === 'center' ? (
        <Pressable onPress={() => navigation.navigate('PostEditor')} style={styles.fab}>
          <Text style={styles.fabText}>+</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  filters: { gap: spacing.sm },
  stickyWrap: {
    backgroundColor: colors.card,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    ...shadows.medium
  },
  newPill: {
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: colors.primaryDark,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    ...shadows.small
  },
  newPillText: { color: '#fff', fontWeight: '900', fontSize: 13 },
  publishBtn: {
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: colors.primaryDark,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    ...shadows.medium
  },
  publishBtnText: { color: '#fff', fontWeight: '900', fontSize: 15 },
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
  geoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  geoText: { color: colors.textSecondary, fontWeight: '800', fontSize: 13 },
  smallBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.card2,
    borderWidth: 1.5,
    borderColor: colors.border,
    ...shadows.small
  },
  smallBtnText: { color: colors.text, fontWeight: '800', fontSize: 12 },
  hint: { color: colors.muted, fontWeight: '800', fontSize: 12 },
  searchRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  searchInput: {
    flex: 1,
    backgroundColor: colors.card2,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    ...shadows.small
  },
  filterToggle: {
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.card2,
    borderWidth: 1.5,
    borderColor: colors.border,
    ...shadows.small
  },
  filterToggleActive: { backgroundColor: colors.primary, borderColor: colors.primaryDark },
  filterToggleText: { fontSize: 18 },
  advancedFilters: {
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.card2,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    ...shadows.small
  },
  filterLabel: { color: colors.text, fontWeight: '800', fontSize: 13, marginBottom: spacing.xs },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.medium
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  authorName: { color: colors.text, fontWeight: '900', fontSize: 15 },
  metaSmall: { color: colors.muted, fontWeight: '700', fontSize: 11 },
  category: {
    color: colors.primary,
    fontWeight: '900',
    textTransform: 'uppercase',
    fontSize: 11,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.primary + '20',
    borderRadius: borderRadius.sm,
    overflow: 'hidden'
  },
  text: { color: colors.textSecondary, fontSize: 15, fontWeight: '600', lineHeight: 22 },
  meta: { color: colors.muted, fontWeight: '700', fontSize: 12 },
  image: { width: '100%', height: 240, borderRadius: borderRadius.md, backgroundColor: colors.card2 },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  actionBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.card2,
    borderWidth: 1,
    borderColor: colors.border
  },
  actionText: { color: '#fff', fontWeight: '900', fontSize: 13 },
  topBtn: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.xl,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primaryDark,
    ...shadows.large
  },
  topBtnText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: 80,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.primaryDark,
    ...shadows.large
  },
  fabText: { color: '#fff', fontWeight: '900', fontSize: 28, lineHeight: 28 }
});

