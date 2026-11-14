/**
 * Comprobaciones de formato de identificadores fiscales españoles: los datos
 * públicos del vendedor persona física y el NIF/NIE/CIF de los clientes que
 * contratan el SaaS.
 *
 * Solo validan la forma (letra o dígito de control, código postal). No
 * consultan a la AEAT ni acreditan el alta: eso sigue siendo una revisión
 * humana.
 */

const CONTROL_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";
const NIE_PREFIX: Record<string, string> = { X: "0", Y: "1", Z: "2" };
/** Letras de forma jurídica vigentes del NIF de entidades (antiguo CIF). */
const ORGANIZATION_LETTERS = "ABCDEFGHJNPQRSUVW";
/** Control en letra: 0 → J, 1 → A … 9 → I. */
const ORGANIZATION_CONTROL_LETTERS = "JABCDEFGHI";
/** Organismos públicos, Iglesia, entidades no residentes: control en letra. */
const ORGANIZATION_LETTER_CONTROL = "NPQRSW";
/** Sociedades anónimas y limitadas, comunidades de bienes y de propietarios: control en cifra. */
const ORGANIZATION_DIGIT_CONTROL = "ABEH";

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

export type SpanishTaxIdKind =
  /** DNI: 8 cifras + letra. */
  | "dni"
  /** NIE: X/Y/Z + 7 cifras + letra. */
  | "nie"
  /** NIF de persona física sin DNI ni NIE: K, L o M + 7 cifras + letra. */
  | "nif_klm"
  /** NIF de persona jurídica o entidad (antiguo CIF). */
  | "cif";

export type SpanishTaxIdCheck =
  | { valid: true; kind: SpanishTaxIdKind; value: string }
  | {
      valid: false;
      /** empty: vacío; format: no encaja con ningún tipo; control: falla el carácter de control. */
      reason: "empty" | "format" | "control";
    };

/** Carácter de control del NIF de entidad para sus 7 cifras centrales. */
function organizationControlDigit(digits: string): number {
  let sum = 0;
  for (let index = 0; index < 7; index += 1) {
    const digit = Number(digits[index]);
    if (index % 2 === 1) {
      sum += digit;
    } else {
      const doubled = digit * 2;
      sum += Math.floor(doubled / 10) + (doubled % 10);
    }
  }
  return (10 - (sum % 10)) % 10;
}

function isValidOrganizationControl(letter: string, digits: string, control: string): boolean {
  const expectedDigit = organizationControlDigit(digits);
  const digitMatches = control === String(expectedDigit);
  const letterMatches = control === ORGANIZATION_CONTROL_LETTERS[expectedDigit];
  if (ORGANIZATION_LETTER_CONTROL.includes(letter)) return letterMatches;
  if (ORGANIZATION_DIGIT_CONTROL.includes(letter)) return digitMatches;
  return digitMatches || letterMatches;
}

/**
 * Valida un NIF español de cliente: DNI, NIE, NIF K/L/M o NIF de entidad
 * (antiguo CIF). Acepta espacios, puntos, guiones, minúsculas y el prefijo
 * «ES» del NIF-IVA, y devuelve la forma canónica sin prefijo.
 *
 * NIF de entidad: letra de forma jurídica + 7 cifras + control. P, Q, R, S,
 * W y N exigen letra; A, B, E y H exigen cifra; C, D, F, G, J, U y V admiten
 * cualquiera de las dos.
 */
export function checkSpanishTaxId(value: string): SpanishTaxIdCheck {
  let normalized = normalizeSpanishTaxId(value);
  if (normalized.length === 0) return { valid: false, reason: "empty" };
  if (normalized.length === 11 && normalized.startsWith("ES")) {
    normalized = normalized.slice(2);
  }

  const dni = /^(\d{8})([A-Z])$/u.exec(normalized);
  if (dni) {
    return CONTROL_LETTERS[Number(dni[1]) % 23] === dni[2]
      ? { valid: true, kind: "dni", value: normalized }
      : { valid: false, reason: "control" };
  }
  const nie = /^([XYZ])(\d{7})([A-Z])$/u.exec(normalized);
  if (nie) {
    return CONTROL_LETTERS[Number(`${NIE_PREFIX[nie[1]!]}${nie[2]}`) % 23] === nie[3]
      ? { valid: true, kind: "nie", value: normalized }
      : { valid: false, reason: "control" };
  }
  const klm = /^([KLM])(\d{7})([A-Z])$/u.exec(normalized);
  if (klm) {
    return CONTROL_LETTERS[Number(klm[2]) % 23] === klm[3]
      ? { valid: true, kind: "nif_klm", value: normalized }
      : { valid: false, reason: "control" };
  }
  const organization = /^([A-Z])(\d{7})([0-9A-J])$/u.exec(normalized);
  if (organization && ORGANIZATION_LETTERS.includes(organization[1]!)) {
    return isValidOrganizationControl(organization[1]!, organization[2]!, organization[3]!)
      ? { valid: true, kind: "cif", value: normalized }
      : { valid: false, reason: "control" };
  }
  return { valid: false, reason: "format" };
}

/** Cualquier NIF español de cliente con su carácter de control correcto. */
export function isValidSpanishTaxId(value: string): boolean {
  return checkSpanishTaxId(value).valid;
}

/** Solo NIF de persona jurídica o entidad (antiguo CIF). */
export function isValidSpanishOrganizationTaxId(value: string): boolean {
  const check = checkSpanishTaxId(value);
  return check.valid && check.kind === "cif";
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
