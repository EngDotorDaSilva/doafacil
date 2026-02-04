import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../../api/client';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Screen } from '../../ui/Screen';
import { colors, shadows, borderRadius, spacing } from '../../ui/theme';

export function ForgotPasswordScreen({ navigation }: any) {
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [codeExpiresAt, setCodeExpiresAt] = useState<Date | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const codeInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const confirmPasswordInputRef = useRef<TextInput>(null);

  const canReset = useMemo(() => {
    const emailValid = email.trim().length > 0 && email.includes('@');
    const codeValid = code.trim().length >= 4; // Backend aceita mínimo 4, mas geramos 6
    const passwordValid = newPassword.length >= 6;
    const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;
    const notExpired = timeLeft === null || timeLeft > 0;
    
    return emailValid && codeValid && passwordValid && passwordsMatch && notExpired;
  }, [email, code, newPassword, confirmPassword, timeLeft]);

  const passwordStrength = useMemo(() => {
    if (newPassword.length === 0) return { level: 0, label: '', color: colors.muted };
    if (newPassword.length < 6) return { level: 1, label: 'Muito fraca', color: colors.danger };
    if (newPassword.length < 8) return { level: 2, label: 'Fraca', color: colors.warning };
    if (!/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) return { level: 3, label: 'Média', color: colors.warning };
    return { level: 4, label: 'Forte', color: colors.success };
  }, [newPassword]);

  const passwordsMatch = useMemo(() => {
    if (confirmPassword.length === 0) return null;
    return newPassword === confirmPassword;
  }, [newPassword, confirmPassword]);

  useEffect(() => {
    if (!codeExpiresAt) return;
    const interval = setInterval(() => {
      const now = new Date();
      const diff = Math.max(0, Math.floor((codeExpiresAt.getTime() - now.getTime()) / 1000));
      setTimeLeft(diff);
      if (diff === 0) {
        setCodeExpiresAt(null);
        setTimeLeft(null);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [codeExpiresAt]);

  async function requestCode() {
    if (!email.trim() || !email.includes('@')) {
      Alert.alert('Email inválido', 'Por favor, insira um email válido.');
      return;
    }
    setLoading(true);
    try {
      const resp = await api.post('/auth/forgot', { email: email.trim().toLowerCase() });
      const devCode = resp.data?.code as string | undefined;
      const expiresIn = 15 * 60; // 15 minutos em segundos
      const expiresAt = new Date(Date.now() + expiresIn * 1000);
      setCodeExpiresAt(expiresAt);
      setTimeLeft(expiresIn);
      setStep('reset');
      if (devCode) {
        setCode(devCode);
        setTimeout(() => codeInputRef.current?.focus(), 300);
      } else {
        Alert.alert('Código enviado', 'Verifique seu email. O código expira em 15 minutos.');
        setTimeout(() => codeInputRef.current?.focus(), 300);
      }
    } catch (e: any) {
      const errorMsg = e?.response?.data?.error || 'Falha ao solicitar código.';
      Alert.alert('Erro', errorMsg);
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword() {
    // Validações básicas
    if (!email.trim()) {
      Alert.alert('Email obrigatório', 'Por favor, insira seu email.');
      return;
    }
    if (!code.trim()) {
      Alert.alert('Código obrigatório', 'Por favor, insira o código de verificação.');
      codeInputRef.current?.focus();
      return;
    }
    if (code.trim().length < 4) {
      Alert.alert('Código inválido', 'O código deve ter pelo menos 4 dígitos.');
      codeInputRef.current?.focus();
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      Alert.alert('Senha muito curta', 'A senha deve ter pelo menos 6 caracteres.');
      passwordInputRef.current?.focus();
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Senhas não coincidem', 'As senhas devem ser iguais.');
      confirmPasswordInputRef.current?.focus();
      return;
    }
    if (timeLeft === 0) {
      Alert.alert('Código expirado', 'O código expirou. Por favor, solicite um novo código.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        email: email.trim().toLowerCase(),
        code: code.trim(),
        newPassword: newPassword.trim()
      };
      
      console.log('[ForgotPassword] Enviando requisição de reset:', { 
        email: payload.email, 
        codeLength: payload.code.length, 
        passwordLength: payload.newPassword.length 
      });
      
      // Tentar com timeout maior e sem headers redundantes
      const response = await api.post('/auth/reset', payload, {
        timeout: 30000, // 30 segundos
        validateStatus: (status) => status < 500 // Aceitar 4xx como resposta válida
      });
      
      console.log('[ForgotPassword] Resposta recebida:', { 
        status: response.status, 
        data: response.data 
      });
      
      if (response.data?.ok || response.status === 200) {
        Alert.alert('✅ Senha atualizada', 'Sua senha foi redefinida com sucesso. Agora você pode fazer login.', [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
        // Limpar campos após sucesso
        setCode('');
        setNewPassword('');
        setConfirmPassword('');
        setCodeExpiresAt(null);
        setTimeLeft(null);
      } else {
        Alert.alert('Erro', 'Não foi possível atualizar a senha. Tente novamente.');
      }
    } catch (e: any) {
      console.error('[ForgotPassword] Reset password error:', e);
      console.error('[ForgotPassword] Error details:', {
        message: e?.message,
        code: e?.code,
        response: e?.response?.data,
        status: e?.response?.status,
        config: e?.config?.url,
        request: e?.request
      });
      
      // Erro de rede (sem resposta do servidor)
      if (e?.code === 'ERR_NETWORK' || e?.code === 'ECONNABORTED' || e?.message === 'Network Error' || (!e?.response && e?.request)) {
        Alert.alert(
          'Erro de conexão',
          'Não foi possível conectar ao servidor. Verifique:\n\n• Sua conexão com a internet\n• Se o servidor está rodando\n• A URL da API está correta',
          [
            { text: 'Tentar novamente', onPress: () => resetPassword() },
            { text: 'Cancelar', style: 'cancel' }
          ]
        );
        return;
      }
      
      // Erro com resposta do servidor
      const codeErr = e?.response?.data?.error;
      const status = e?.response?.status;
      
      if (status === 400 && codeErr === 'InvalidResetCode') {
        Alert.alert('Código inválido ou expirado', 'Verifique o código ou solicite um novo.', [
          { text: 'Solicitar novo código', onPress: () => {
            setStep('request');
            setCode('');
            setNewPassword('');
            setConfirmPassword('');
            setCodeExpiresAt(null);
            setTimeLeft(null);
          }},
          { text: 'Tentar novamente', style: 'cancel' }
        ]);
        setCode('');
        setTimeout(() => codeInputRef.current?.focus(), 300);
      } else if (status === 400 && codeErr === 'Invalid body') {
        Alert.alert('Dados inválidos', 'Verifique se todos os campos estão preenchidos corretamente.');
      } else if (status === 403 && codeErr === 'UserDeleted') {
        Alert.alert('Conta removida', 'Esta conta foi removida. Entre em contato com o administrador.');
        navigation.goBack();
      } else if (status === 500) {
        Alert.alert('Erro no servidor', 'Ocorreu um erro no servidor. Tente novamente mais tarde.');
      } else if (status === 0 || !status) {
        // Timeout ou erro de conexão
        Alert.alert(
          'Timeout',
          'A requisição demorou muito para responder. Verifique sua conexão e tente novamente.',
          [
            { text: 'Tentar novamente', onPress: () => resetPassword() },
            { text: 'Cancelar', style: 'cancel' }
          ]
        );
      } else {
        const errorMsg = codeErr || e?.message || 'Falha ao redefinir senha. Tente novamente.';
        Alert.alert('Erro', errorMsg);
      }
    } finally {
      setLoading(false);
    }
  }

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  return (
    <Screen scroll contentStyle={{ paddingTop: spacing.xl }}>
      <View style={styles.hero}>
        <Text style={styles.emoji}>🔐</Text>
        <Text style={styles.title}>Recuperar senha</Text>
        <Text style={styles.subtitle}>
          {step === 'request'
            ? 'Digite o email cadastrado na sua conta para receber um código de verificação'
            : 'Digite o código recebido e defina uma nova senha'}
        </Text>
      </View>

      <Input
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="ex: ana@email.com"
        keyboardType="email-address"
        autoCapitalize="none"
        editable={step === 'request' && !loading}
      />

      {step === 'request' ? (
        <>
          <Button
            title={loading ? 'Enviando código...' : 'Enviar código'}
            onPress={requestCode}
            disabled={loading || !email.trim() || !email.includes('@')}
            loading={loading}
            style={{ marginTop: spacing.md }}
          />
          <View style={styles.hint}>
            <Text style={styles.hintText}>
              💡 Funciona com qualquer email cadastrado no sistema (Gmail, Outlook, Yahoo, etc.){'\n\n'}
              ⚠️ Em desenvolvimento: o código aparece automaticamente na tela{'\n'}
              📧 Em produção: o código será enviado por email
            </Text>
          </View>
        </>
      ) : (
        <>
          <View style={styles.codeContainer}>
            <Input
              ref={codeInputRef}
              label="Código de verificação"
              value={code}
              onChangeText={(text) => setCode(text.replace(/[^0-9]/g, ''))}
              placeholder="Digite o código de 6 dígitos"
              keyboardType="numeric"
              maxLength={10}
            />
            {timeLeft !== null && timeLeft > 0 && (
              <View style={styles.timerContainer}>
                <Text style={[styles.timer, timeLeft < 60 && { color: colors.danger }]}>
                  ⏱️ Expira em: {formatTime(timeLeft)}
                </Text>
              </View>
            )}
            {timeLeft === 0 && (
              <View style={styles.expiredContainer}>
                <Text style={styles.expiredText}>⏰ Código expirado</Text>
              </View>
            )}
          </View>

          <View style={styles.passwordContainer}>
            <View style={styles.passwordHeader}>
              <Text style={styles.passwordLabel}>Nova senha</Text>
              <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
                <Text style={styles.eyeText}>{showPassword ? '👁️' : '👁️‍🗨️'}</Text>
              </Pressable>
            </View>
            <TextInput
              ref={passwordInputRef}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Mínimo 6 caracteres"
              secureTextEntry={!showPassword}
              style={styles.passwordInput}
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
            />
            {newPassword.length > 0 && (
              <View style={styles.strengthContainer}>
                <View style={styles.strengthBar}>
                  <View
                    style={[
                      styles.strengthFill,
                      { width: `${(passwordStrength.level / 4) * 100}%`, backgroundColor: passwordStrength.color }
                    ]}
                  />
                </View>
                <Text style={[styles.strengthText, { color: passwordStrength.color }]}>
                  {passwordStrength.label}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.passwordContainer}>
            <View style={styles.passwordHeader}>
              <Text style={styles.passwordLabel}>Confirmar senha</Text>
              <Pressable onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeButton}>
                <Text style={styles.eyeText}>{showConfirmPassword ? '👁️' : '👁️‍🗨️'}</Text>
              </Pressable>
            </View>
            <TextInput
              ref={confirmPasswordInputRef}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Digite a senha novamente"
              secureTextEntry={!showConfirmPassword}
              style={[
                styles.passwordInput,
                confirmPassword.length > 0 && passwordsMatch !== null && {
                  borderColor: passwordsMatch ? colors.success : colors.danger
                }
              ]}
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
            />
            {confirmPassword.length > 0 && passwordsMatch !== null && (
              <Text style={[styles.matchText, { color: passwordsMatch ? colors.success : colors.danger }]}>
                {passwordsMatch ? '✅ Senhas coincidem' : '❌ Senhas não coincidem'}
              </Text>
            )}
          </View>

          <Button
            title={loading ? 'Atualizando senha...' : 'Atualizar senha'}
            onPress={resetPassword}
            disabled={loading || !canReset}
            loading={loading}
            style={{ marginTop: spacing.md }}
          />
          
          {!canReset && !loading && (
            <View style={styles.debugInfo}>
              <Text style={styles.debugText}>
                {!email.trim() || !email.includes('@') ? '❌ Email inválido' : ''}
                {email.trim() && email.includes('@') && (!code.trim() || code.trim().length < 4) ? '❌ Código inválido (mínimo 4 dígitos)' : ''}
                {code.trim().length >= 4 && newPassword.length < 6 ? '❌ Senha muito curta (mínimo 6 caracteres)' : ''}
                {newPassword.length >= 6 && newPassword !== confirmPassword ? '❌ Senhas não coincidem' : ''}
                {timeLeft === 0 ? '❌ Código expirado' : ''}
              </Text>
            </View>
          )}

          <View style={styles.footer}>
            <Pressable
              onPress={() => {
                setStep('request');
                setCode('');
                setNewPassword('');
                setConfirmPassword('');
                setCodeExpiresAt(null);
                setTimeLeft(null);
              }}
              disabled={loading}
              style={styles.linkButton}
            >
              <Text style={styles.link}>↩️ Solicitar novo código</Text>
            </Pressable>
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
    alignItems: 'center'
  },
  emoji: {
    fontSize: 48,
    marginBottom: spacing.sm
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.5
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: spacing.md
  },
  hint: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.card2,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border
  },
  hintText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18
  },
  codeContainer: {
    marginTop: spacing.sm
  },
  timerContainer: {
    marginTop: spacing.xs,
    padding: spacing.sm,
    backgroundColor: colors.card2,
    borderRadius: borderRadius.sm,
    alignItems: 'center'
  },
  timer: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: 13
  },
  expiredContainer: {
    marginTop: spacing.xs,
    padding: spacing.sm,
    backgroundColor: colors.danger + '20',
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.danger
  },
  expiredText: {
    color: colors.danger,
    fontWeight: '800',
    fontSize: 13
  },
  passwordContainer: {
    marginTop: spacing.md,
    gap: spacing.xs
  },
  passwordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  passwordLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2
  },
  eyeButton: {
    padding: spacing.xs
  },
  eyeText: {
    fontSize: 18
  },
  passwordInput: {
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
  strengthContainer: {
    marginTop: spacing.xs,
    gap: spacing.xs
  },
  strengthBar: {
    height: 4,
    backgroundColor: colors.card2,
    borderRadius: borderRadius.sm,
    overflow: 'hidden'
  },
  strengthFill: {
    height: '100%',
    borderRadius: borderRadius.sm
  },
  strengthText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  matchText: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: spacing.xs
  },
  footer: {
    marginTop: spacing.lg,
    alignItems: 'center'
  },
  linkButton: {
    padding: spacing.sm
  },
  link: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: 14
  },
  debugInfo: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.card2,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border
  },
  debugText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center'
  }
});

