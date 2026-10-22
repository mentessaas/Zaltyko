/**
 * Validación y formateo de números de teléfono internacionales
 */

/**
 * Valida un número de teléfono internacional
 * Acepta formatos como: +34 600 000 000, +1-555-123-4567, etc.
 */
export function validatePhoneNumber(phone: string): { valid: boolean; error?: string; formatted?: string } {
  if (!phone || phone.trim().length === 0) {
    return { valid: true }; // Teléfono opcional
  }

  const cleaned = phone.replace(/\s+/g, "").replace(/-/g, "");

  // Debe empezar con +
  if (!cleaned.startsWith("+")) {
    return {
      valid: false,
      error: "El teléfono debe incluir el código de país (ej: +34, +1, +52)",
    };
  }

  // Debe tener al menos 8 dígitos después del +
  const digits = cleaned.slice(1).replace(/\D/g, "");
  if (digits.length < 8) {
    return {
      valid: false,
      error: "El número de teléfono es demasiado corto",
    };
  }

  if (digits.length > 15) {
    return {
      valid: false,
      error: "El número de teléfono es demasiado largo (máximo 15 dígitos)",
    };
  }

  // Formatear: +XX XXX XXX XXX
  const countryCode = digits.slice(0, 2);
  const rest = digits.slice(2);
  let formatted = `+${countryCode}`;

  if (rest.length > 0) {
    // Agrupar en bloques de 3
    const chunks = rest.match(/.{1,3}/g) || [];
    formatted += " " + chunks.join(" ");
  }

  return {
    valid: true,
    formatted: formatted.trim(),
  };
}

/**
 * Normaliza un número de teléfono para almacenamiento
 */
export function normalizePhoneNumber(phone: string): string | null {
  if (!phone || phone.trim().length === 0) {
    return null;
  }

  const result = validatePhoneNumber(phone);
  if (!result.valid) {
    return null;
  }

  // Almacenar en formato E.164: +34600000000
  return phone.replace(/\s+/g, "").replace(/-/g, "");
}

/**
 * Formatea un número de teléfono para mostrar
 */
export function formatPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return "";

  // Si ya está formateado, devolverlo
  if (phone.includes(" ")) {
    return phone;
  }

  // Formatear desde E.164
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length < 8) {
    return phone;
  }

  const countryCode = cleaned.slice(0, 2);
  const rest = cleaned.slice(2);
  const chunks = rest.match(/.{1,3}/g) || [];

  return `+${countryCode} ${chunks.join(" ")}`;
}

