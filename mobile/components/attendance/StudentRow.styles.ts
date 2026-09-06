import { StyleSheet } from 'react-native';
import { colors, radii, spacing, typography } from '@/lib/theme';

export const styles = StyleSheet.create({
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
  rowDirty: {
    borderColor: colors.warning,
    borderWidth: 1.5,
  },
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
    width: 44,
    height: 44,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { ...typography.body, color: colors.text, fontWeight: '600' },
  group: { ...typography.caption, color: colors.textMuted },
  actions: { flexDirection: 'row', gap: spacing.xs },
  btn: {
    width: 44,
    height: 44,
    minWidth: 44,
    minHeight: 44,
    borderRadius: radii.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { ...typography.caption, fontWeight: '700' },
});
