import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, shadows, borderRadius, spacing } from './theme';

export const Input = React.forwardRef<TextInput, {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'numeric';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  multiline?: boolean;
  maxLength?: number;
  editable?: boolean;
}>(({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize = 'none',
  multiline,
  maxLength,
  editable = true
}, ref) => {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        multiline={multiline}
        maxLength={maxLength}
        editable={editable}
        style={[styles.input, multiline && styles.multiline]}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: { color: colors.textSecondary, fontSize: 13, fontWeight: '800', marginBottom: 2 },
  input: {
    backgroundColor: colors.card2,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    ...shadows.small
  },
  multiline: { minHeight: 96, textAlignVertical: 'top' }
});

