import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Screen } from '../../ui/Screen';
import { colors } from '../../ui/theme';
import { API_BASE_URL } from '../../config';

export function LoginScreen({ navigation }: any) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Campos obrigatórios', 'Por favor, preencha email e senha.');
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (e: any) {
      const code = e?.response?.data?.error;
      const reason = e?.response?.data?.reason;
      const details = e?.response?.data?.details;
      console.error('[LoginScreen] Login error:', { code, reason, details, error: e });
      if (code === 'UserBlocked') {
        Alert.alert('Conta bloqueada', reason || 'Entre em contato com o administrador.');
      } else if (code === 'UserDeleted') {
        Alert.alert('Conta removida', reason || 'Entre em contato com o administrador.');
      } else if (code === 'Invalid body') {
        Alert.alert('Dados inválidos', details ? JSON.stringify(details) : 'Verifique se o email está correto.');
      } else {
        Alert.alert('Falha no login', code || 'Verifique email e senha.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen scroll contentStyle={{ paddingTop: 32 }}>
      <View style={styles.hero}>
        <Text style={styles.title}>DoaFácil</Text>
        <Text style={styles.subtitle}>Conectando doadores a centros de doação</Text>
        <Text style={styles.hint}>API: {API_BASE_URL}</Text>
      </View>

      <Input label="Email" value={email} onChangeText={setEmail} placeholder="ex: ana@email.com" keyboardType="email-address" />
      <Input label="Senha" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry />

      <Button title={loading ? 'Entrando...' : 'Entrar'} onPress={onSubmit} disabled={loading} />

      <Pressable 
        onPress={() => navigation.navigate('ForgotPassword')} 
        style={styles.forgotPasswordButton}
        disabled={loading}
      >
        <Text style={styles.link}>🔐 Esqueci minha senha</Text>
      </Pressable>

      <Button title="Criar conta" variant="secondary" onPress={() => navigation.navigate('Register')} />

      <View style={{ marginTop: 8 }}>
        <Text style={styles.small}>
          Admin padrão: <Text style={styles.mono}>admin@doafacil.local</Text> / <Text style={styles.mono}>admin123</Text>
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 6, marginBottom: 12 },
  title: { color: colors.text, fontSize: 34, fontWeight: '900' },
  subtitle: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  hint: { color: colors.muted, fontSize: 12, marginTop: 6 },
  small: { color: colors.muted, fontSize: 12 },
  mono: { color: colors.text, fontFamily: 'monospace' },
  forgotPasswordButton: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  link: { 
    color: colors.primary, 
    fontWeight: '800',
    fontSize: 15,
    textDecorationLine: 'underline'
  }
});

