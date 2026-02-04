import React from 'react';
import { ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, spacing } from './theme';

export function Screen({
  children,
  scroll = false,
  contentStyle,
  noPadding = false
}: {
  children: React.ReactNode;
  scroll?: boolean;
  contentStyle?: ViewStyle;
  noPadding?: boolean;
}) {
  if (scroll) {
    return (
      <ScrollView
        style={styles.root}
        contentContainerStyle={[!noPadding && styles.content, contentStyle]}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    );
  }
  return <View style={[styles.root, !noPadding && styles.content, contentStyle]}>{children}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md }
});

