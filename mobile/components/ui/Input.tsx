// Input controlado, con label y mensaje de error. Auto-crece con el contenido.
// Tipografía y bordes coherentes con Button.

import { forwardRef, useId, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { colors, radii, shadows, spacing, typography } from '@/lib/theme';

interface Props extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string | null;
  hint?: string;
  /**
   * 'light' (default): label se lee sobre superficie clara (Card, modal).
   * 'dark': para montaje directo sobre `colors.bg`. ZAL-1031 P0 a11y.
   */
  tone?: 'light' | 'dark';
}

// RN 0.86 typings no exponen `accessibilityLabelledBy`/`accessibilityDescribedBy`
// sobre `TextInput`, pero el runtime los acepta en iOS+Android. Lo tipamos
// localmente para no perder el check del resto de props.
type A11yRefAttrs = {
  accessibilityLabelledBy?: string;
  accessibilityDescribedBy?: string;
};

export const Input = forwardRef<TextInput, Props>(function Input(
  { label, error, hint, tone = 'light', onFocus, onBlur, ...rest },
  ref
) {
  const onDark = tone === 'dark';
  const [focused, setFocused] = useState(false);
  const reactId = useId();
  const labelId = `input-label-${reactId}`;
  const messageId = `input-msg-${reactId}`;
  // El error tiene prioridad sobre el hint como descripción accesible.
  const describedById = error ? messageId : hint ? messageId : undefined;

  return (
    <View style={styles.wrap}>
      {label ? (
        <Text
          nativeID={labelId}
          style={[styles.label, onDark && styles.labelOnDark]}
          importantForAccessibility="no-hide-descendants"
        >
          {label}
        </Text>
      ) : null}
      <TextInput
        ref={ref}
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          focused && styles.inputFocused,
          error ? styles.inputError : null,
        ]}
        placeholderTextColor={colors.textMuted}
        // El label llega vía nativeID (más robusto que accessibilityLabel en iOS);
        // el mensaje (error con prioridad sobre hint) llega vía describedBy.
        {...({
          accessibilityLabelledBy: label ? labelId : undefined,
          accessibilityDescribedBy: describedById,
        } as A11yRefAttrs)}
      />
      {/*
        Slot de mensaje siempre montado para que TalkBack/VoiceOver anuncien
        cambios al entrar/salir el error (p.ej. al perder foco tras un submit).
        `polite` no interrumpe; el contenido vacío se oculta de a11y y visualmente.
      */}
      <Text
        nativeID={messageId}
        accessibilityLiveRegion="polite"
        accessibilityRole="text"
        style={[
          styles.message,
          error
            ? onDark
              ? styles.errorOnDark
              : styles.error
            : hint
              ? onDark
                ? styles.hintOnDark
                : styles.hint
              : styles.messageHidden,
        ]}
        importantForAccessibility={error || hint ? 'auto' : 'no-hide-descendants'}
      >
        {error || hint || ''}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: {
    ...typography.label,
    color: colors.text,
  },
  labelOnDark: {
    color: colors.textInverse,
  },
  input: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 48,
    ...shadows.sm,
  },
  inputFocused: { borderColor: colors.primary },
  inputError: { borderColor: colors.danger },
  message: {
    ...typography.caption,
  },
  messageHidden: {
    width: 0,
    height: 0,
    overflow: 'hidden',
  },
  error: {
    ...typography.caption,
    color: colors.danger,
  },
  errorOnDark: {
    ...typography.caption,
    color: colors.onDarkDanger,
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
  },
  hintOnDark: {
    ...typography.caption,
    color: colors.onDarkMuted,
  },
});