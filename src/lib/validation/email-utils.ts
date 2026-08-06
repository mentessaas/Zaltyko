/**
 * Utilidades para validación y normalización de emails
 */

/**
 * Regex robusto para validar formato de email
 * Basado en RFC 5322 (simplificado para casos comunes)
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Valida si un string es un email válido
 * @param email - String a validar
 * @returns true si el email es válido, false en caso contrario
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") {
    return false;
  }
  
  // Verificar longitud razonable (máximo 254 caracteres según RFC)
  if (email.length > 254) {
    return false;
  }
  
  return EMAIL_REGEX.test(email.trim());
}

/**
 * Normaliza un email (trim y lowercase)
 * @param email - Email a normalizar
 * @returns Email normalizado o null si el email es inválido
 */
export function normalizeEmail(email: string): string | null {
  if (!email || typeof email !== "string") {
    return null;
  }
  
  const trimmed = email.trim();
  if (!trimmed) {
    return null;
  }
  
  return trimmed.toLowerCase();
}

/**
 * Valida y normaliza un email en un solo paso
 * @param email - Email a validar y normalizar
 * @returns Email normalizado si es válido, null en caso contrario
 */
export function validateAndNormalizeEmail(email: string): string | null {
  if (!isValidEmail(email)) {
    return null;
  }
  
  return normalizeEmail(email);
}

