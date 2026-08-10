// Pantalla "Legal y privacidad". Concentra los enlaces a documentos
// legales (privacy policy, términos) y al flujo de eliminación de
// cuenta (Apple Guideline 5.1.1). El borrado requiere escribir la
// frase literal de confirmación para evitar acciones accidentales.

import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useMutation } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { useSession } from '@/lib/auth/use-session';
import { deleteMyAccount } from '@/lib/api/endpoints';
import { webBaseUrl } from '@/lib/api/client';
import { colors, radii, spacing, typography } from '@/lib/theme';

export default function LegalScreen() {
  const router = useRouter();
  const { signOut } = useSession();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const onOpenPrivacy = () => {
    WebBrowser.openBrowserAsync(`${webBaseUrl()}/politica-privacidad`, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
    });
  };

  const onOpenTerms = () => {
    WebBrowser.openBrowserAsync(`${webBaseUrl()}/terminos`, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
    });
  };

  const deleteMutation = useMutation({
    mutationFn: () => deleteMyAccount(),
    onSuccess: async () => {
      setShowDeleteModal(false);
      Alert.alert(
        'Cuenta eliminada',
        'Hemos eliminado tu cuenta y todos tus datos personales.'
      );
      await signOut();
      router.replace('/(auth)/login');
    },
  });

  return (
    <>
      <Stack.Screen options={{ title: 'Legal y privacidad' }} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <Card
          title="Documentos legales"
          subtitle="Se abren en el navegador web"
        >
          <Button
            title="Política de privacidad"
            variant="secondary"
            fullWidth
            onPress={onOpenPrivacy}
          />
          <Button
            title="Términos del servicio"
            variant="secondary"
            fullWidth
            onPress={onOpenTerms}
          />
        </Card>

        <Card
          title="Eliminar mi cuenta"
          subtitle="Borra tu perfil, datos personales y tokens push. Los registros financieros históricos se conservan por obligación legal."
        >
          <Button
            title="Eliminar cuenta…"
            variant="danger"
            fullWidth
            onPress={() => setShowDeleteModal(true)}
          />
        </Card>
      </ScrollView>

      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!deleteMutation.isPending) setShowDeleteModal(false);
        }}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>¿Eliminar tu cuenta?</Text>
            <Text style={styles.modalBody}>
              Esta acción no se puede deshacer. Se borrarán tu perfil,
              datos personales, atletas vinculados y dispositivos con
              notificaciones activas. Los registros financieros se
              conservan por obligación legal.
            </Text>
            <Text style={styles.confirmLabel}>
              Escribe <Text style={styles.confirmPhrase}>ELIMINAR MI CUENTA</Text> para continuar:
            </Text>
            <TextInput
              value={confirmText}
              onChangeText={setConfirmText}
              autoCapitalize="characters"
              autoCorrect={false}
              style={styles.confirmInput}
              placeholder="ELIMINAR MI CUENTA"
              placeholderTextColor={colors.textMuted}
            />
            {deleteMutation.error ? (
              <ErrorBanner
                message={
                  deleteMutation.error instanceof Error
                    ? deleteMutation.error.message
                    : 'No se pudo eliminar la cuenta'
                }
                onRetry={() => deleteMutation.mutate()}
              />
            ) : null}
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => {
                  if (!deleteMutation.isPending) setShowDeleteModal(false);
                }}
                style={styles.modalCancel}
                disabled={deleteMutation.isPending}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </Pressable>
              <Button
                title={deleteMutation.isPending ? 'Eliminando…' : 'Eliminar definitivamente'}
                variant="danger"
                disabled={confirmText !== 'ELIMINAR MI CUENTA' || deleteMutation.isPending}
                onPress={() => deleteMutation.mutate()}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.lg },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalTitle: { ...typography.title, color: colors.text },
  modalBody: { ...typography.body, color: colors.textMuted, lineHeight: 22 },
  confirmLabel: { ...typography.caption, color: colors.textMuted },
  confirmPhrase: { color: colors.danger, fontWeight: '700' },
  confirmInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    ...typography.body,
    color: colors.text,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  modalCancel: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  modalCancelText: { ...typography.label, color: colors.textMuted },
});