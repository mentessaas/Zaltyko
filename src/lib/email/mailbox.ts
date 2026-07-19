import { isValidEmail, normalizeEmail } from "@/lib/validation/email-utils";

export interface Mailbox {
  email: string;
  name?: string;
}

/**
 * Accepts either a plain email address or the common display-name form:
 * "Equipo Zaltyko <hola@zaltyko.com>".
 *
 * Returns null for malformed or ambiguous input. This keeps provider-specific
 * payload formatting outside callers and prevents invalid Reply-To values from
 * breaking scheduled email jobs.
 */
export function parseMailbox(value: string): Mailbox | null {
  if (!value || typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  // The generic email validator intentionally handles common addresses, but it
  // is not a mailbox parser and may accept angle brackets as local-part text.
  // Only use the plain-address branch when no mailbox delimiters are present.
  if (!trimmed.includes("<") && !trimmed.includes(">") && isValidEmail(trimmed)) {
    const email = normalizeEmail(trimmed);
    return email ? { email } : null;
  }

  const match = trimmed.match(/^([^<>]+?)\s*<([^<>]+)>$/);
  if (!match) {
    return null;
  }

  const name = match[1].trim().replace(/^["']|["']$/g, "").trim();
  const rawEmail = match[2].trim();

  if (!name || !isValidEmail(rawEmail)) {
    return null;
  }

  const email = normalizeEmail(rawEmail);
  return email ? { email, name } : null;
}
