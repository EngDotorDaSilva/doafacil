import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../ui/Button';
import { Screen } from '../../ui/Screen';
import { colors, shadows, borderRadius, spacing } from '../../ui/theme';

const REASONS = [
  { value: 'spam', label: 'Spam', icon: '📧' },
  { value: 'inappropriate', label: 'Conteúdo Inadequado', icon: '🚫' },
  { value: 'harassment', label: 'Assédio', icon: '⚠️' },
  { value: 'fake', label: 'Informação Falsa', icon: '❌' },
  { value: 'other', label: 'Outro', icon: '📝' }
];

export function ReportScreen({ route, navigation }: any) {
  const { user } = useAuth();
  const { targetType, targetId } = route.params || {};
  const [reason, setReason] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!targetType || !targetId) {
    return (
      <Screen>
        <Text style={{ color: colors.muted }}>Parâmetros inválidos.</Text>
      </Screen>
    );
  }

  async function submitReport() {
    if (!reason) {
      Alert.alert('Selecione um motivo', 'Por favor, escolha o motivo da denúncia.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/reports', {
        targetType,
        targetId,
        reason,
        description: description.trim() || undefined
      });
      Alert.alert('Denúncia enviada', 'Sua denúncia foi registrada e será analisada pela equipe de moderação.', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (e: any) {
      if (e?.response?.status === 409) {
        Alert.alert('Já denunciado', 'Você já denunciou este item anteriormente.');
      } else {
        Alert.alert('Erro', e?.response?.data?.error || 'Falha ao enviar denúncia.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const targetLabel = targetType === 'post' ? 'Publicação' : targetType === 'comment' ? 'Comentário' : 'Usuário';

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Text style={styles.title}>Denunciar {targetLabel}</Text>
        <Text style={styles.subtitle}>
          Ajude-nos a manter a comunidade segura. Sua denúncia será analisada pela equipe de moderação.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Motivo da Denúncia *</Text>
        <View style={styles.reasonsGrid}>
          {REASONS.map((r) => (
            <Pressable
              key={r.value}
              onPress={() => setReason(r.value)}
              style={[styles.reasonCard, reason === r.value && styles.reasonCardActive]}
            >
              <Text style={styles.reasonIcon}>{r.icon}</Text>
              <Text style={[styles.reasonText, reason === r.value && styles.reasonTextActive]}>{r.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Descrição Adicional (Opcional)</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Forneça mais detalhes sobre a denúncia..."
          placeholderTextColor={colors.muted}
          style={styles.textInput}
          multiline
          numberOfLines={4}
          maxLength={500}
        />
        <Text style={styles.charCount}>{description.length}/500</Text>
      </View>

      <Button
        title={submitting ? 'Enviando...' : 'Enviar Denúncia'}
        onPress={submitReport}
        disabled={submitting || !reason}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: spacing.xl,
    gap: spacing.sm
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900'
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20
  },
  section: {
    marginBottom: spacing.xl
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: spacing.md
  },
  reasonsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md
  },
  reasonCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 2,
    borderColor: colors.border,
    ...shadows.small
  },
  reasonCardActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  reasonIcon: {
    fontSize: 32
  },
  reasonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center'
  },
  reasonTextActive: {
    color: '#fff'
  },
  textInput: {
    backgroundColor: colors.card2,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    color: colors.text,
    fontSize: 14,
    minHeight: 100,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: colors.border
  },
  charCount: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: spacing.xs,
    textAlign: 'right'
  }
});
