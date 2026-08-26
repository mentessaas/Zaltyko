// Fila de atleta con toggle de estado de asistencia. 4 botones en
// una sola fila para que sea rápido marcar desde el móvil. La fila
// entera también se memoiza para no re-renderizar al cambiar otra.

import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radii, spacing, typography } from '@/lib/theme';
import type { AttendanceStatus } from '@/lib/api/endpoints';

interface Props {
  athleteId: string;
  name: string;
  groupName: string | null;
  status: AttendanceStatus | null;
<<<<<<< HEAD
  /**
   * Si true, el cambio aún no se guardó en el backend (status override
   * pendiente). ZAL-622 Phase 1: pista visual sutil de "dirty" para
   * distinguir confirmado vs pendiente sin inventar un estado nuevo.
   */
  dirty?: boolean;
=======
>>>>>>> origin/main
  onChange: (athleteId: string, status: AttendanceStatus) => void;
  onEvaluate?: (athleteId: string, name: string) => void;
}

const OPTIONS: { value: AttendanceStatus; label: string; short: string; color: string }[] = [
  { value: 'present', label: 'Asistió', short: 'A', color: colors.success },
  { value: 'late', label: 'Tarde', short: 'T', color: colors.warning },
  { value: 'absent', label: 'Faltó', short: 'F', color: colors.danger },
  { value: 'excused', label: 'Justif.', short: 'J', color: colors.info },
];

<<<<<<< HEAD
function StudentRowImpl({ athleteId, name, groupName, status, dirty, onChange, onEvaluate }: Props) {
  const initial = name.trim().charAt(0).toUpperCase();

  return (
    <View
      style={[styles.row, dirty && styles.rowDirty]}
      accessibilityLabel={`${name}${dirty ? ', cambio sin guardar' : ''}`}
    >
=======
function StudentRowImpl({ athleteId, name, groupName, status, onChange, onEvaluate }: Props) {
  const initial = name.trim().charAt(0).toUpperCase();

  return (
    <View style={styles.row}>
>>>>>>> origin/main
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initial}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.name}>{name}</Text>
        {groupName ? <Text style={styles.group}>{groupName}</Text> : null}
      </View>
      {onEvaluate ? (
        <Pressable
          onPress={() => onEvaluate(athleteId, name)}
          accessibilityRole="button"
          accessibilityLabel={`Registrar progreso de ${name}`}
          style={styles.evaluateBtn}
        >
          <Ionicons name="ribbon-outline" size={18} color={colors.primary} />
        </Pressable>
      ) : null}
<<<<<<< HEAD
      {/* actions: ver styles.btn abajo — width 36 + hitSlop={4} = 44dp efectivos (WCAG 2.5.5) */}
=======
>>>>>>> origin/main
      <View style={styles.actions}>
        {OPTIONS.map((opt) => {
          const active = status === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onChange(athleteId, opt.value)}
              accessibilityRole="button"
              accessibilityLabel={`${opt.label} ${name}`}
              accessibilityState={{ selected: active }}
<<<<<<< HEAD
              hitSlop={4}
=======
>>>>>>> origin/main
              style={[
                styles.btn,
                { borderColor: opt.color },
                active && { backgroundColor: opt.color },
              ]}
            >
              <Text
                style={[
                  styles.btnText,
                  { color: active ? '#FFFFFF' : opt.color },
                ]}
              >
                {opt.short}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export const StudentRow = memo(StudentRowImpl);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
<<<<<<< HEAD
  rowDirty: {
    borderColor: colors.warning,
    borderWidth: 1.5,
  },
=======
>>>>>>> origin/main
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...typography.label, color: colors.primaryFg, fontWeight: '700' },
  body: { flex: 1, gap: 2 },
  evaluateBtn: {
<<<<<<< HEAD
    width: 44,
    height: 44,
=======
    width: 32,
    height: 32,
>>>>>>> origin/main
    borderRadius: radii.full,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { ...typography.body, color: colors.text, fontWeight: '600' },
  group: { ...typography.caption, color: colors.textMuted },
  actions: { flexDirection: 'row', gap: spacing.xs },
  btn: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { ...typography.caption, fontWeight: '700' },
});