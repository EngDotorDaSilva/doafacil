import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors, shadows } from './theme';

export function Avatar({
  name,
  url,
  size = 44,
  online
}: {
  name?: string | null;
  url?: string | null;
  size?: number;
  online?: boolean;
}) {
  const initials = (name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  const fontSize = size * 0.4;

  if (url) {
    return (
      <View style={{ position: 'relative' }}>
        <Image
          source={{ uri: url }}
          style={[
            styles.img,
            { width: size, height: size, borderRadius: size / 2 }
          ]}
        />
        {online && <View style={[styles.onlineIndicator, { width: size * 0.3, height: size * 0.3, borderRadius: size * 0.15, borderWidth: size * 0.08 }]} />}
      </View>
    );
  }

  return (
    <View style={{ position: 'relative' }}>
      <View
        style={[
          styles.fallback,
          { width: size, height: size, borderRadius: size / 2 }
        ]}
      >
        <Text style={[styles.text, { fontSize }]}>{initials}</Text>
      </View>
      {online && <View style={[styles.onlineIndicator, { width: size * 0.3, height: size * 0.3, borderRadius: size * 0.15, borderWidth: size * 0.08 }]} />}
    </View>
  );
}

const styles = StyleSheet.create({
  img: {
    backgroundColor: colors.card2,
    borderWidth: 2,
    borderColor: colors.borderLight,
    ...shadows.small
  },
  fallback: {
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.small
  },
  text: {
    color: '#fff',
    fontWeight: '900',
    letterSpacing: 0.5
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: colors.success,
    borderColor: colors.bg
  }
});

