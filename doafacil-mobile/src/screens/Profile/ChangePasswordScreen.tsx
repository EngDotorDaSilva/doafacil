import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { api } from '../../api/client';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Screen } from '../../ui/Screen';
import { colors } from '../../ui/theme';

export function ChangePasswordScreen({ navigation }: any) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const canSave = useMemo(
    () => currentPassword.length > 0 && newPassword.length >= 6 && newPassword === confirmPassword,
    [currentPassword, newPassword, confirmPassword]
  );

  async function save() {
    if (!canSave) return;
    setLoading(true);
    try {
      await api.put('/me/password', { currentPassword, newPassword });
      Alert.alert('Senha atualizada', 'Sua senha foi alterada com sucesso.');
      navigation.goBack();
    } catch (e: any) {
      const code = e?.response?.data?.error;
      if (code === 'InvalidCurrentPassword') {
        Alert.alert('Senha atual incorreta', 'Verifique e tente novamente.');
      } else {
        Alert.alert('Erro', code || 'Falha ao atualizar senha.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen scroll contentStyle={{ paddingTop: 16 }}>
      <View style={styles.hero}>
        <Text style={styles.title}>Mudar senha</Text>
        <Text style={styles.subtitle}>Informe sua senha atual e defina uma nova.</Text>
      </View>

      <Input label="Senha atual" value={currentPassword} onChangeText={setCurrentPassword} placeholder="••••••••" secureTextEntry />
      <Input label="Nova senha" value={newPassword} onChangeText={setNewPassword} placeholder="mínimo 6 caracteres" secureTextEntry />
      <Input
        label="Confirmar nova senha"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        placeholder="••••••••"
        secureTextEntry
      />

      <Button title={loading ? 'Salvando...' : 'Salvar'} onPress={save} disabled={loading || !canSave} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 6, marginBottom: 12 },
  title: { color: colors.text, fontSize: 22, fontWeight: '900' },
  subtitle: { color: colors.muted, fontSize: 13, fontWeight: '700' }
});

