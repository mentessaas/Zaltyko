// Modal para enviar un aviso a todas las familias/atletas de la sesión
// actual, sin salir del flujo de asistencia. Crea (o reutiliza) la
// conversación de grupo de la clase — ver /api/messages/group-alert.

import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { sendGroupAlert } from '@/lib/api/endpoints';
import { colors, radii, spacing, typography } from '@/lib/theme';

interface Props {
  visible: boolean;
  academyId: string;
  sessionId: string;
  onClose: () => void;
  onSent: (recipientCount: number) => void;
}

export function GroupAlertModal({ visible, academyId, sessionId, onClose, onSent }: Props) {
  const [content, setContent] = useState('');

  const sendMutation = useMutation({
    mutationFn: () => sendGroupAlert(academyId, sessionId, content.trim()),
    onSuccess: (res) => {
      setContent('');
      onSent(res.recipientCount);
      onClose();
    },
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!sendMutation.isPending) onClose();
      }}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.card}>
          <Text style={styles.title}>Aviso al grupo</Text>
          <Text style={styles.subtitle}>
            Se enviará a las familias y atletas de esta clase, con notificación push.
          </Text>

          <Input
            label="Mensaje"
            value={content}
            onChangeText={setContent}
            placeholder="Ej: mañana no hay clase por mantenimiento del gimnasio"
            multiline
            numberOfLines={4}
          />

          {sendMutation.error ? (
            <ErrorBanner
              message={
                sendMutation.error instanceof Error
                  ? sendMutation.error.message
                  : 'No se pudo enviar el aviso'
              }
              onRetry={() => sendMutation.mutate()}
            />
          ) : null}

          <View style={styles.actions}>
            <Button
              title="Cancelar"
              variant="ghost"
              onPress={onClose}
              disabled={sendMutation.isPending}
            />
            <Button
              title={sendMutation.isPending ? 'Enviando…' : 'Enviar aviso'}
              variant="primary"
              disabled={!content.trim() || sendMutation.isPending}
              onPress={() => sendMutation.mutate()}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: { ...typography.title, color: colors.text },
  subtitle: { ...typography.caption, color: colors.textMuted },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
});
