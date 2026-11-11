import { z } from "zod";

/**
 * Normalization of a guardian contact, shared by the contact editor and the
 * athlete import so both accept exactly the same values. Pure: safe to load
 * in the browser.
 */
export type NormalizedOwnerGuardianContact =
  | { success: true; value: string; normalizedValue: string }
  | { success: false; message: string };

/**
 * Contact writes do not trigger delivery or verification. Email is normalized
 * for matching; phone numbers must already be explicit E.164 values rather
 * than guessing a country code from an academy or browser locale.
 */
export function normalizeOwnerGuardianContact(
  kind: "email" | "phone",
  value: string
): NormalizedOwnerGuardianContact {
  const trimmed = value.trim();
  if (kind === "email") {
    const normalizedValue = trimmed.toLowerCase();
    if (
      normalizedValue.length > 254 ||
      !z.string().email().safeParse(normalizedValue).success
    ) {
      return { success: false, message: "Indica un correo válido de hasta 254 caracteres." };
    }
    return { success: true, value: normalizedValue, normalizedValue };
  }

  if (!/^\+[1-9]\d{7,14}$/u.test(trimmed)) {
    return {
      success: false,
      message: "Indica el teléfono completo con prefijo internacional en formato E.164.",
    };
  }
  return { success: true, value: trimmed, normalizedValue: trimmed };
}
