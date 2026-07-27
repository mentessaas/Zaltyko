// Pantalla nativa de aceptación de invitación, para cuando el usuario
// abre el link de invitación (zaltyko://invite/:type?token=... o el
// universal link https://zaltyko.com/invite/:type?token=...) con la
// app ya instalada.
//
// Alcance a propósito acotado: si el usuario YA tiene sesión con el
// mismo email de la invitación, acepta nativo (POST /api/invitations/complete,
// ya Bearer-compatible). Si no tiene cuenta todavía, el alta completa
// sigue en la web — coherente con login.tsx ("Crear cuenta" abre el
// navegador) — no reimplementamos el formulario de registro aquí.

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useMutation, useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { SkeletonGroup } from '@/components/ui/Skeleton';
import { useSession } from '@/lib/auth/use-session';
import { webBaseUrl } from '@/lib/api/client';
import { getInvitationPreview, acceptInvitation } from '@/lib/api/endpoints';
import { colors, spacing, typography } from '@/lib/theme';

const ROLE_LABEL: Record<string, string> = {
  owner: 'Propietario/a',
  admin: 'Administrador/a',
  coach: 'Entrenador/a',
  athlete: 'Atleta',
  parent: 'Tutor/a',
};

export default function InviteScreen() {
  const { token } = useLocalSearchParams<{ type: string; token?: string }>();
  const { status, profile, refresh } = useSession();
  const router = useRouter();

  const previewQuery = useQuery({
    queryKey: ['invite', token],
    queryFn: () => getInvitationPreview(token ?? ''),
    enabled: !!token,
    retry: false,
    staleTime: 0,
  });

  const acceptMutation = useMutation({
    mutationFn: () => acceptInvitation(token ?? ''),
    onSuccess: async () => {
      await refresh();
      router.replace('/(tabs)');
    },
  });

  const webInviteUrl = useMemo(() => {
    const base = webBaseUrl();
    const path = previewQuery.data?.role ? `/invite/${previewQuery.data.role}` : '/invite/accept';
    return `${base}${path}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  }, [token, previewQuery.data?.role]);

  const openInWeb = () =>
    WebBrowser.openBrowserAsync(webInviteUrl, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
    });

  if (!token) {
    return (
      <View style={styles.flex}>
        <Card>
          <EmptyState icon="link-outline" title="Link de invitación inválido" />
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <View style={styles.content}>
        <Text style={styles.title}>Invitación a Zaltyko</Text>

        {previewQuery.isLoading ? (
          <Card>
            <SkeletonGroup count={2} />
          </Card>
        ) : previewQuery.error || !previewQuery.data || previewQuery.data.expired ? (
          <Card>
            <EmptyState
              icon="alert-circle-outline"
              title="Esta invitación ya no es válida"
              description="Puede haber expirado o ya haberse usado. Pide a tu academia que te envíe una nueva."
            />
          </Card>
        ) : (
          <>
            <Card
              title={`Te invitan como ${ROLE_LABEL[previewQuery.data.role] ?? previewQuery.data.role}`}
              subtitle={previewQuery.data.academyNames.join(', ') || undefined}
            >
              <Text style={styles.email}>{previewQuery.data.email}</Text>
            </Card>

            {status === 'authenticated' && profile ? (
              profile.email.toLowerCase() === previewQuery.data.email.toLowerCase() ? (
                <Card title="Aceptar invitación">
                  {acceptMutation.error ? (
                    <ErrorBanner
                      message={
                        acceptMutation.error instanceof Error
                          ? acceptMutation.error.message
                          : 'No se pudo aceptar la invitación'
                      }
                      onRetry={() => acceptMutation.mutate()}
                    />
                  ) : null}
                  <Button
                    title={acceptMutation.isPending ? 'Procesando…' : 'Aceptar invitación'}
                    variant="primary"
                    fullWidth
                    disabled={acceptMutation.isPending}
                    onPress={() => acceptMutation.mutate()}
                  />
                </Card>
              ) : (
                <Card title="Estás con otra cuenta">
                  <Text style={styles.body}>
                    La invitación es para {previewQuery.data.email}, pero tu sesión activa es{' '}
                    {profile.email}.
                  </Text>
                  <Button title="Continuar en la web" variant="secondary" fullWidth onPress={openInWeb} />
                </Card>
              )
            ) : (
              <Card title="Crea tu cuenta">
                <Text style={styles.body}>
                  Todavía no tienes cuenta con este email. Termina el registro en la web y vuelve
                  a iniciar sesión aquí.
                </Text>
                <Button title="Crear cuenta en la web" variant="primary" fullWidth onPress={openInWeb} />
              </Card>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, padding: spacing.lg, gap: spacing.lg, justifyContent: 'center' },
  title: { ...typography.display, color: colors.textInverse, textAlign: 'center' },
  email: { ...typography.body, color: colors.textMuted },
  body: { ...typography.body, color: colors.textMuted },
});
