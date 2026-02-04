import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, shadows, borderRadius, spacing } from './theme';

type ReactionType = 'like' | 'love' | 'dislike' | null;

type ReactionCounts = {
  like: number;
  love: number;
  dislike: number;
};

type Props = {
  counts: ReactionCounts;
  myReaction: ReactionType;
  onReaction: (type: ReactionType) => void;
  disabled?: boolean;
};

export function ReactionButtons({ counts, myReaction, onReaction, disabled = false }: Props) {
  const handlePress = (type: 'like' | 'love' | 'dislike') => {
    if (disabled) return;
    if (myReaction === type) {
      // Remove reaction if clicking the same
      onReaction(null);
    } else {
      // Set new reaction
      onReaction(type);
    }
  };

  const ReactionButton = ({ type, emoji, count }: { type: 'like' | 'love' | 'dislike'; emoji: string; count: number }) => {
    const isActive = myReaction === type;
    return (
      <Pressable
        onPress={() => handlePress(type)}
        disabled={disabled}
        style={[styles.button, isActive && styles.buttonActive]}
      >
        <Text style={[styles.emoji, isActive && styles.emojiActive]}>{emoji}</Text>
        {count > 0 && <Text style={[styles.count, isActive && styles.countActive]}>{count}</Text>}
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <ReactionButton type="like" emoji="👍" count={counts.like} />
      <ReactionButton type="love" emoji="❤️" count={counts.love} />
      <ReactionButton type="dislike" emoji="👎" count={counts.dislike} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center'
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: colors.card2,
    borderWidth: 1.5,
    borderColor: colors.border,
    ...shadows.small
  },
  buttonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryDark,
    transform: [{ scale: 1.05 }]
  },
  emoji: {
    fontSize: 18
  },
  emojiActive: {
    // No change needed
  },
  count: {
    color: colors.muted,
    fontWeight: '800',
    fontSize: 13,
    minWidth: 16,
    textAlign: 'center'
  },
  countActive: {
    color: '#fff',
    fontWeight: '900'
  }
});
