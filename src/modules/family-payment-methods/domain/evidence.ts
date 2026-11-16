import { isIP } from "node:net";

/**
 * Pago automático de cuotas (cobro automático, Fase 2): datos mínimos de la
 * conexión que se guardan como evidencia del consentimiento. Nunca la IP
 * completa: IPv4 recortada a /24 e IPv6 a /48. El agente de usuario se guarda
 * recortado a 120 caracteres y sin caracteres de control.
 */

const USER_AGENT_MAX_CHARACTERS = 120;

/** IPv4 → /24: «203.0.113.77» → «203.0.113.0». */
function truncateIpv4(address: string): string {
  const [a, b, c] = address.split(".").map((part) => Number(part));
  return `${a}.${b}.${c}.0`;
}

/** Ocho grupos de 16 bits de una IPv6 ya validada (admite «::» y cola IPv4). */
function expandIpv6(address: string): number[] | null {
  let text = address;
  const lastColon = text.lastIndexOf(":");
  const tail = text.slice(lastColon + 1);
  if (tail.includes(".")) {
    if (isIP(tail) !== 4) return null;
    const [a, b, c, d] = tail.split(".").map((part) => Number(part));
    const high = ((a << 8) | b).toString(16);
    const low = ((c << 8) | d).toString(16);
    text = `${text.slice(0, lastColon + 1)}${high}:${low}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 0) return null;
  const groups = [...head, ...new Array<string>(missing).fill("0"), ...rest].map(
    (group) => parseInt(group, 16)
  );
  if (groups.length !== 8 || groups.some((group) => !Number.isInteger(group))) {
    return null;
  }
  return groups;
}

/** Forma compacta (RFC 5952): comprime con «::» la racha de ceros más larga. */
function formatIpv6(groups: number[]): string {
  let bestStart = -1;
  let bestLength = 0;
  let runStart = -1;
  for (let index = 0; index <= groups.length; index += 1) {
    if (index < groups.length && groups[index] === 0) {
      if (runStart === -1) runStart = index;
      continue;
    }
    if (runStart !== -1) {
      const runLength = index - runStart;
      if (runLength > bestLength) {
        bestStart = runStart;
        bestLength = runLength;
      }
      runStart = -1;
    }
  }
  const hex = groups.map((group) => group.toString(16));
  if (bestLength < 2) return hex.join(":");
  const before = hex.slice(0, bestStart).join(":");
  const after = hex.slice(bestStart + bestLength).join(":");
  return `${before}::${after}`;
}

/** IPv6 → /48: «2001:db8:1:2::5» → «2001:db8:1::». */
function truncateIpv6(address: string): string | null {
  const groups = expandIpv6(address);
  if (groups === null) return null;
  // IPv6 que envuelve una IPv4 (::ffff:a.b.c.d): se recorta como IPv4.
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    const a = groups[6] >> 8;
    const b = groups[6] & 0xff;
    const c = groups[7] >> 8;
    return `${a}.${b}.${c}.0`;
  }
  return formatIpv6([groups[0], groups[1], groups[2], 0, 0, 0, 0, 0]);
}

/**
 * Recorta la IP de quien acepta. Si llega una lista (cabecera
 * x-forwarded-for «a, b»), usa la primera entrada. Cualquier valor que no sea
 * una IP válida devuelve `null`.
 */
export function truncateClientIp(raw: string | null): string | null {
  if (raw === null) return null;
  let candidate = (raw.split(",")[0] ?? "").trim();
  if (candidate.startsWith("[") && candidate.endsWith("]")) {
    candidate = candidate.slice(1, -1);
  }
  // Sin identificador de zona (fe80::1%eth0): no forma parte de la dirección.
  const zoneIndex = candidate.indexOf("%");
  if (zoneIndex !== -1) candidate = candidate.slice(0, zoneIndex);
  const version = isIP(candidate);
  if (version === 4) return truncateIpv4(candidate);
  if (version === 6) return truncateIpv6(candidate.toLowerCase());
  return null;
}

/** C0 (U+0000–U+001F), DEL (U+007F) y C1 (U+0080–U+009F). */
function isControlCharacter(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
}

/**
 * Recorta el agente de usuario: cada racha de caracteres de control pasa a
 * ser un espacio, se quitan los espacios de los extremos y se corta a 120
 * caracteres (sin partir caracteres compuestos por dos unidades UTF-16).
 * Vacío → `null`.
 */
export function truncateUserAgent(raw: string | null): string | null {
  if (raw === null) return null;
  let cleaned = "";
  let previousWasControl = false;
  for (const character of Array.from(raw)) {
    if (isControlCharacter(character)) {
      if (!previousWasControl) cleaned += " ";
      previousWasControl = true;
      continue;
    }
    cleaned += character;
    previousWasControl = false;
  }
  const trimmed = Array.from(cleaned.trim())
    .slice(0, USER_AGENT_MAX_CHARACTERS)
    .join("")
    .trim();
  return trimmed.length > 0 ? trimmed : null;
}
