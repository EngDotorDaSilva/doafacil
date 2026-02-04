import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../../ui/Avatar';
import { ReactionButtons } from '../../ui/ReactionButtons';
import { colors, shadows, borderRadius, spacing } from '../../ui/theme';

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

export const PostCard = React.memo(function PostCard({
  post,
  onPress,
  onPressAuthor,
  showActions,
  onEdit,
  onDelete,
  onReaction,
  onSave,
  onShare,
  onReport
}: {
  post: Post;
  onPress: () => void;
  onPressAuthor?: () => void;
  showActions: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onReaction?: (type: 'like' | 'love' | 'dislike' | null) => void;
  onSave?: () => void;
  onShare?: () => void;
  onReport?: () => void;
}) {
  const cover = (post.imageUrls && post.imageUrls.length ? post.imageUrls[0] : post.imageUrl) || null;
  return (
    <Pressable onPress={onPress} style={styles.card}>
      <View style={{ gap: 6 }}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onPressAuthor?.();
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}
          >
            <Avatar name={post.author.name} url={(post.author.avatarUrl as any) || null} size={34} />
            <View style={{ flex: 1 }}>
              <Text style={styles.authorName}>{post.author.name}</Text>
              <Text style={styles.metaSmall}>{new Date(post.createdAt).toLocaleString()}</Text>
            </View>
          </Pressable>
          <Text style={styles.category}>{post.category}</Text>
        </View>

        <Text style={styles.text}>{post.text}</Text>
        {post.center ? (
          <Text style={styles.meta}>
            {post.center.displayName} • {post.center.address}
            {post.distanceKm != null ? ` • ${post.distanceKm.toFixed(1)}km` : ''}
          </Text>
        ) : null}
        <Text style={styles.meta}>Comentários: {post.commentCount}</Text>

        {post.reactions && onReaction ? (
          <View style={styles.reactionsContainer}>
            <ReactionButtons
              counts={post.reactions}
              myReaction={post.myReaction || null}
              onReaction={onReaction}
            />
          </View>
        ) : null}

        {(onSave || onShare || onReport) ? (
          <View style={styles.actionsRow}>
            {onSave ? (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  onSave();
                }}
                style={[styles.iconBtn, post.isSaved && styles.iconBtnActive]}
              >
                <Text style={styles.iconBtnText}>{post.isSaved ? '🔖' : '📌'}</Text>
                <Text style={styles.iconBtnLabel}>{post.isSaved ? 'Salvo' : 'Salvar'}</Text>
              </Pressable>
            ) : null}
            {onShare ? (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  onShare();
                }}
                style={styles.iconBtn}
              >
                <Text style={styles.iconBtnText}>📤</Text>
                <Text style={styles.iconBtnLabel}>Compartilhar</Text>
              </Pressable>
            ) : null}
            {onReport ? (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  onReport();
                }}
                style={styles.iconBtn}
              >
                <Text style={styles.iconBtnText}>🚨</Text>
                <Text style={styles.iconBtnLabel}>Denunciar</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {showActions ? (
          <View style={styles.actionsRow}>
            <Pressable onPress={onEdit} style={styles.actionBtn}>
              <Text style={styles.actionText}>Editar</Text>
            </Pressable>
            <Pressable onPress={onDelete} style={[styles.actionBtn, { backgroundColor: colors.danger, borderColor: colors.danger }]}>
              <Text style={styles.actionText}>Apagar</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {cover ? <Image source={{ uri: cover }} style={styles.image} /> : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.md,
    ...shadows.medium
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md
  },
  authorName: {
    color: colors.text,
    fontWeight: '900',
    fontSize: 15
  },
  metaSmall: {
    color: colors.muted,
    fontWeight: '700',
    fontSize: 11
  },
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
  text: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22
  },
  meta: {
    color: colors.muted,
    fontWeight: '700',
    fontSize: 12
  },
  reactionsContainer: {
    marginTop: spacing.sm
  },
  image: {
    width: '100%',
    height: 240,
    borderRadius: borderRadius.md,
    backgroundColor: colors.card2,
    marginTop: spacing.sm
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm
  },
  iconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.card2,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.small
  },
  iconBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryDark
  },
  iconBtnText: {
    fontSize: 16
  },
  iconBtnLabel: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 12
  },
  actionBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.card2,
    borderWidth: 1,
    borderColor: colors.border,
    flex: 1,
    alignItems: 'center'
  },
  actionText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 14
  }
});

