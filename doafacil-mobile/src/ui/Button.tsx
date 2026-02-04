import React from 'react';
import { Pressable, StyleSheet, Text, ViewStyle, ActivityIndicator } from 'react-native';
import { colors, shadows, borderRadius } from './theme';

export function Button({
  title,
  onPress,
  variant = 'primary',
  style,
  disabled,
  loading
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'outline';
  style?: ViewStyle;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'danger' && styles.danger,
        variant === 'outline' && styles.outline,
        (disabled || loading) && styles.disabled,
        pressed && !disabled && !loading && styles.pressed,
        style
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variant === 'outline' ? colors.primary : '#fff'} />
      ) : (
        <Text style={[styles.text, variant === 'outline' && styles.outlineText]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    ...shadows.small
  },
  primary: {
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: colors.primaryDark
  },
  secondary: {
    backgroundColor: colors.card2,
    borderWidth: 1,
    borderColor: colors.border
  },
  danger: {
    backgroundColor: colors.danger,
    borderWidth: 1,
    borderColor: colors.dangerDark
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: colors.primary,
    ...shadows.small
  },
  disabled: {
    opacity: 0.5
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }]
  },
  text: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3
  },
  outlineText: {
    color: colors.primary,
    fontWeight: '900'
  }
});

