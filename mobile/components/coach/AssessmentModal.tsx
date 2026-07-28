// Modal para registrar una nota de progreso técnico rápida desde el
// mismo flujo de asistencia — sin salir a la web. A propósito no pide
// aparato ni rúbrica por habilidad (eso es trabajo de escritorio); solo
// un comentario libre, tipo assessmentType 'coach_feedback'.

import { useEffect, useState } from 'react';
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
import { createAssessment } from '@/lib/api/endpoints';
import { colors, radii, spacing, typography } from '@/lib/theme';

interface Props {
  athlete: { id: string; name: string } | null;
  sessionId?: string;
  onClose: () => void;
  onSaved: () => void;
}

export function AssessmentModal({ athlete, sessionId, onClose, onSaved }: Props) {
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (athlete) setComment('');
  }, [athlete]);

  const saveMutation = useMutation({
    mutationFn: () =>
      createAssessment(athlete!.id, {
        sessionId: sessionId ?? null,
        assessmentDate: new Date().toISOString().slice(0, 10),
        overallComment: comment.trim(),
      }),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });

  return (
    <Modal
      visible={!!athlete}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!saveMutation.isPending) onClose();
      }}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.card}>
          <Text style={styles.title}>Registrar progreso</Text>
          <Text style={styles.subtitle}>{athlete?.name}</Text>

          <Input
            label="Comentario"
            value={comment}
            onChangeText={setComment}
            placeholder="Ej: mejoró la entrada del salto, seguir trabajando equilibrio…"
            multiline
            numberOfLines={4}
          />

          {saveMutation.error ? (
            <ErrorBanner
              message={
                saveMutation.error instanceof Error
                  ? saveMutation.error.message
                  : 'No se pudo guardar la evaluación'
              }
              onRetry={() => saveMutation.mutate()}
            />
          ) : null}

          <View style={styles.actions}>
            <Button
              title="Cancelar"
              variant="ghost"
              onPress={onClose}
              disabled={saveMutation.isPending}
            />
            <Button
              title={saveMutation.isPending ? 'Guardando…' : 'Guardar'}
              variant="primary"
              disabled={!comment.trim() || saveMutation.isPending}
              onPress={() => saveMutation.mutate()}
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
  subtitle: { ...typography.body, color: colors.textMuted },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
});
