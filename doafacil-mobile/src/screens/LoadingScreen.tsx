import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors } from '../ui/theme';

export function LoadingScreen() {
  return (
    <View style={styles.root}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.text}>Carregando...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 12 },
  text: { color: colors.muted, fontWeight: '800' }
});

