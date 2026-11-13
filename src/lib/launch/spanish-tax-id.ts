/**
 * Comprobaciones de formato de los datos públicos del vendedor persona física.
 *
 * Solo validan la forma (letra de control, código postal). No consultan a la
 * AEAT ni acreditan el alta: eso sigue siendo una revisión humana.
 */

const CONTROL_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";
const NIE_PREFIX: Record<string, string> = { X: "0", Y: "1", Z: "2" };

/** Forma canónica: mayúsculas, sin espacios, puntos ni guiones. */
export function normalizeSpanishTaxId(value: string): string {
  return value.toUpperCase().replace(/[\s.-]/gu, "");
}

/**
 * NIF de persona física (DNI: 8 cifras + letra) o NIE (X/Y/Z + 7 cifras +
 * letra), con la letra de control calculada como resto de dividir entre 23.
 */
export function isValidSpanishPersonalTaxId(value: string): boolean {
  const normalized = normalizeSpanishTaxId(value);
  const dni = /^(\d{8})([A-Z])$/u.exec(normalized);
  if (dni) return CONTROL_LETTERS[Number(dni[1]) % 23] === dni[2];
  const nie = /^([XYZ])(\d{7})([A-Z])$/u.exec(normalized);
  if (nie) {
    return CONTROL_LETTERS[Number(`${NIE_PREFIX[nie[1]!]}${nie[2]}`) % 23] === nie[3];
  }
  return false;
}

/** El perfil debe guardar el NIF ya en forma canónica y con letra correcta. */
export function isCanonicalSpanishPersonalTaxId(value: string): boolean {
  return value === normalizeSpanishTaxId(value) && isValidSpanishPersonalTaxId(value);
}

/** Primer código postal español (01000–52999) que aparece en la dirección. */
export function spanishPostalCodeOf(address: string): string | null {
  for (const match of address.matchAll(/(?:^|\D)(\d{5})(?=\D|$)/gu)) {
    const code = match[1]!;
    const province = Number(code.slice(0, 2));
    if (province >= 1 && province <= 52) return code;
  }
  return null;
}

/**
 * Dirección postal publicable mínimamente completa: vía y número, código
 * postal español y localidad. No comprueba que exista.
 */
export function isPublishableSpanishPostalAddress(address: string): boolean {
  const trimmed = address.trim();
  return trimmed.length >= 15 && trimmed.includes(",") && spanishPostalCodeOf(trimmed) !== null;
}

/**
 * Canarias (35, 38), Ceuta (51) y Melilla (52) quedan fuera del territorio de
 * aplicación del IVA. Un vendedor establecido allí no puede usar el contrato
 * de IVA peninsular sin una revisión fiscal específica.
 */
export function isSpanishPostalCodeOutsideVatTerritory(postalCode: string): boolean {
  return ["35", "38", "51", "52"].includes(postalCode.slice(0, 2));
}
