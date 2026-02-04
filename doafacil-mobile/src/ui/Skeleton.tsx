import React from 'react';
import { DimensionValue, StyleSheet, View } from 'react-native';
import { colors } from './theme';

export function Skeleton({ height, width, radius = 12 }: { height: number; width: DimensionValue; radius?: number }) {
  return <View style={[styles.base, { height, width, borderRadius: radius }]} />;
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.card2,
    borderWidth: 1,
    borderColor: colors.border
  }
});

