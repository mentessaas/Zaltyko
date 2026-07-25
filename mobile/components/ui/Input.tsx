// Input controlado, con label y mensaje de error. Auto-crece con el contenido.
// Tipografía y bordes coherentes con Button.

import { forwardRef } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { colors, radii, spacing, typography } from '@/lib/theme';

interface Props extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string | null;
  hint?: string;
}

export const Input = forwardRef<TextInput, Props>(function Input(
  { label, error, hint, ...rest },
  ref
) {
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        ref={ref}
        {...rest}
        style={[styles.input, error ? styles.inputError : null]}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={label}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!error && hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: {
    ...typography.label,
    color: colors.text,
  },
  input: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 44,
  },
  inputError: { borderColor: colors.danger },
  error: {
    ...typography.caption,
    color: colors.danger,
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
  },
});