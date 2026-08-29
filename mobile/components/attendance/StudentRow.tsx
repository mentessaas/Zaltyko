// Fila de atleta con toggle de estado de asistencia. 4 botones en
// una sola fila para que sea rápido marcar desde el móvil. La fila
// entera también se memoiza para no re-renderizar al cambiar otra.

import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { styles } from '@/components/attendance/StudentRow.styles';
import { colors } from '@/lib/theme';
import type { AttendanceStatus } from '@/lib/api/endpoints';

interface Props {
  athleteId: string;
  name: string;
  groupName: string | null;
  status: AttendanceStatus | null;
  /**
   * Si true, el cambio aún no se guardó en el backend (status override
   * pendiente). ZAL-622 Phase 1: pista visual sutil de "dirty" para
   * distinguir confirmado vs pendiente sin inventar un estado nuevo.
   */
  dirty?: boolean;
  onChange: (athleteId: string, status: AttendanceStatus) => void;
  onEvaluate?: (athleteId: string, name: string) => void;
}

const OPTIONS: { value: AttendanceStatus; label: string; short: string; color: string }[] = [
  { value: 'present', label: 'Asistió', short: 'A', color: colors.success },
  { value: 'late', label: 'Tarde', short: 'T', color: colors.warning },
  { value: 'absent', label: 'Faltó', short: 'F', color: colors.danger },
  { value: 'excused', label: 'Justif.', short: 'J', color: colors.info },
];

function StudentRowImpl({ athleteId, name, groupName, status, dirty, onChange, onEvaluate }: Props) {
  const initial = name.trim().charAt(0).toUpperCase();

  return (
    <View
      style={[styles.row, dirty && styles.rowDirty]}
      accessibilityLabel={`${name}${dirty ? ', cambio sin guardar' : ''}`}
    >
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
      {/* actions: styles.btn 44x44dp visibles (WCAG 2.5.5 Target Size Enhanced) +
          hitSlop=4 para un area tactil efectiva 52x52dp en pantallas de alta densidad. */}
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
              hitSlop={4}
              style={[
                styles.btn,
                { borderColor: opt.color },
                active && { backgroundColor: opt.color },
              ]}
            >
              <Text
                style={[
                  styles.btnText,
                  {
                    color: active
                      ? // Texto oscuro sobre fondo semántico para cumplir WCAG AA 1.4.3 (≥4.5:1).
                        // danger (#DC2626) sí pasa con blanco (4.83:1) — solo
                        // success/warning/info necesitan texto oscuro para pasar.
                        ['success', 'warning', 'info'].includes(opt.value)
                        ? colors.text
                        : '#FFFFFF'
                      : opt.color,
                  },
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
