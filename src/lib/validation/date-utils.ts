/**
 * Utilidades para validación y conversión de fechas
 */

/**
 * Valida si un string es una fecha válida
 * @param dateString - String a validar
 * @returns true si la fecha es válida, false en caso contrario
 */
export function isValidDateString(dateString: string): boolean {
  if (!dateString || typeof dateString !== "string") {
    return false;
  }
  
  const trimmed = dateString.trim();
  if (!trimmed) {
    return false;
  }
  
  // Intentar parsear la fecha
  const parsed = new Date(trimmed);
  
  // Verificar que la fecha es válida y que el string original coincide con el parseado
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  
  // Verificar que el string no es solo un número (ej: "12345")
  // Debe tener al menos un separador o formato reconocible
  if (!/[-/]/.test(trimmed) && trimmed.length < 8) {
    return false;
  }
  
  return true;
}

/**
 * Valida y parsea un string de fecha a Date
 * Soporta formatos: ISO 8601, YYYY-MM-DD, DD/MM/YYYY
 * @param dateString - String de fecha a validar y parsear
 * @returns Date si es válida, null en caso contrario
 */
export function validateAndParseDate(dateString: string): Date | null {
  if (!isValidDateString(dateString)) {
    return null;
  }
  
  const trimmed = dateString.trim();
  const parsed = new Date(trimmed);
  
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  
  return parsed;
}

/**
 * Valida y parsea un string de fecha, retornando error descriptivo si falla
 * @param dateString - String de fecha a validar
 * @param fieldName - Nombre del campo (para mensajes de error)
 * @returns Objeto con success, date y error
 */
export function validateDateWithError(
  dateString: string,
  fieldName: string = "fecha"
): { success: boolean; date: Date | null; error: string | null } {
  if (!dateString || typeof dateString !== "string" || !dateString.trim()) {
    return {
      success: false,
      date: null,
      error: `El campo ${fieldName} no puede estar vacío`,
    };
  }
  
  const trimmed = dateString.trim();
  const parsed = new Date(trimmed);
  
  if (Number.isNaN(parsed.getTime())) {
    return {
      success: false,
      date: null,
      error: `El formato de ${fieldName} no es válido. Use formato YYYY-MM-DD o ISO 8601`,
    };
  }
  
  // Verificar que la fecha no sea demasiado antigua o futura (validación de sentido común)
  const year = parsed.getFullYear();
  if (year < 1900 || year > 2100) {
    return {
      success: false,
      date: null,
      error: `El año de ${fieldName} debe estar entre 1900 y 2100`,
    };
  }
  
  return {
    success: true,
    date: parsed,
    error: null,
  };
}

/**
 * Convierte una fecha a formato YYYY-MM-DD para almacenamiento en DB
 * @param date - Date object o string de fecha
 * @returns String en formato YYYY-MM-DD o null si la fecha es inválida
 */
export function formatDateForDB(date: Date | string | null | undefined): string | null {
  if (!date) {
    return null;
  }
  
  const dateObj = date instanceof Date ? date : validateAndParseDate(date);
  if (!dateObj) {
    return null;
  }
  
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  
  return `${year}-${month}-${day}`;
}

