// Pantalla de login con email + contraseña, más "Continuar con Google" nativo.
// "Crear cuenta nueva" sigue abriendo la web: el signup con email tiene
// fricción (selección de rol, onboarding, validación HIBP) que vive en
// /auth/signup de la web; en cambio el signup con Google puede ser nativo
// porque Google ya provee email verificado + nombre + avatar.

import { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { supabase } from '@/lib/auth/supabase';
import { signInWithGoogle } from '@/lib/auth/google-oauth';
import { webBaseUrl } from '@/lib/api/client';
import { colors, radii, shadows, spacing, typography } from '@/lib/theme';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = useCallback(async () => {
    if (!email || !password) {
      setError('Introduce email y contraseña');
      return;
    }
    setError(null);
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (signInError) {
      setError(
        signInError.message === 'Invalid login credentials'
          ? 'Email o contraseña incorrectos'
          : signInError.message
      );
      return;
    }
    // El cambio de sesión dispara redirect automático vía (auth)/_layout.
  }, [email, password]);

  const onOpenSignup = useCallback(() => {
    WebBrowser.openBrowserAsync(`${webBaseUrl()}/auth/signup`, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
    });
  }, []);

  const onOpenReset = useCallback(() => {
    WebBrowser.openBrowserAsync(`${webBaseUrl()}/auth/reset-password`, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
    });
  }, []);

  const onGoogle = useCallback(async () => {
    setError(null);
    setGoogleLoading(true);
    const result = await signInWithGoogle();
    setGoogleLoading(false);
    if (result.error) {
      setError(
        result.cancelled
          ? 'Inicio de sesión con Google cancelado'
          : result.error
      );
      return;
    }
    // Sesión creada: el cambio de estado dispara redirect vía (auth)/_layout.
  }, []);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoLetter}>Z</Text>
          </View>
          <Text style={styles.brandTitle}>Zaltyko</Text>
          <Text style={styles.brandSubtitle}>Gestiona tu academia desde el bolsillo</Text>
        </View>

        <View style={styles.form}>
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="tu@academia.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="emailAddress"
            autoComplete="email"
          />
          <Input
            label="Contraseña"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
            textContentType="password"
            autoComplete="password"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable onPress={onOpenReset} hitSlop={8} style={styles.forgotLink}>
            <Text style={styles.link}>¿Olvidaste la contraseña?</Text>
          </Pressable>

          <Button title="Entrar" onPress={onSubmit} loading={loading} fullWidth />

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>o</Text>
            <View style={styles.dividerLine} />
          </View>

          <Button
            title="Continuar con Google"
            variant="secondary"
            onPress={onGoogle}
            loading={googleLoading}
            disabled={loading}
            fullWidth
          />

          <Button title="Crear cuenta nueva" variant="secondary" onPress={onOpenSignup} fullWidth />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
    gap: spacing.xxl,
  },
  brand: { gap: spacing.xs, alignItems: 'center', marginBottom: spacing.md },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: radii.xl,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...shadows.md,
  },
  logoLetter: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
    color: colors.primaryFg,
  },
  brandTitle: {
    ...typography.display,
    color: colors.textInverse,
    textAlign: 'center',
  },
  brandSubtitle: {
    ...typography.body,
    color: '#94A3B8',
    textAlign: 'center',
  },
  form: { gap: spacing.md },
  error: {
    ...typography.caption,
    color: '#FCA5A5',
  },
  forgotLink: { alignSelf: 'flex-end', marginTop: -spacing.xs },
  link: {
    ...typography.caption,
    color: colors.primary,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginVertical: spacing.xs,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.borderDark },
  dividerText: { ...typography.caption, color: '#94A3B8' },
});