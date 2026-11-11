/**
 * Athlete import from a spreadsheet (O4): columns, header mapping and row
 * validation. Pure functions with no database or file access, shared by the
 * preview and the confirmation so both judge every row the same way. The
 * rules follow the manual intake: date of birth optional, contacts normalized
 * exactly like the guardian contact editor, no payer.
 */
import { normalizeOwnerGuardianContact } from "@/modules/families/domain/guardian-contact-normalization";

export const ATHLETE_IMPORT_FIELDS = [
  "givenName",
  "familyName",
  "dateOfBirth",
  "group",
  "guardianGivenName",
  "guardianFamilyName",
  "guardianEmail",
  "guardianPhone",
  "guardianRelationship",
] as const;

export type AthleteImportField = (typeof ATHLETE_IMPORT_FIELDS)[number];

/** The manual intake asks only for the name; the date of birth is optional. */
export const REQUIRED_IMPORT_FIELDS: readonly AthleteImportField[] = ["givenName", "familyName"];

/** Column titles of the downloadable template, in this order. */
export const ATHLETE_IMPORT_FIELD_LABELS: Readonly<Record<AthleteImportField, string>> = {
  givenName: "Nombre",
  familyName: "Apellidos",
  dateOfBirth: "Fecha de nacimiento",
  group: "Grupo",
  guardianGivenName: "Nombre del tutor",
  guardianFamilyName: "Apellidos del tutor",
  guardianEmail: "Email del tutor",
  guardianPhone: "Teléfono del tutor",
  guardianRelationship: "Parentesco",
};

/**
 * Column titles of the downloadable templates: the label plus the format the
 * value must follow where it is easy to get wrong. The import recognises them
 * because the text in brackets is ignored when matching titles.
 */
export const ATHLETE_IMPORT_TEMPLATE_HEADERS: Readonly<Record<AthleteImportField, string>> = {
  ...ATHLETE_IMPORT_FIELD_LABELS,
  dateOfBirth: "Fecha de nacimiento (DD/MM/AAAA)",
  guardianPhone: "Teléfono del tutor (+34600000000, sin espacios)",
};

/** Header spellings recognised for each field, already normalised. */
const HEADER_SYNONYMS: Readonly<Record<AthleteImportField, readonly string[]>> = {
  givenName: ["nombre", "nombre gimnasta", "nombre de la gimnasta", "nombre del gimnasta", "first name"],
  familyName: ["apellidos", "apellido", "apellidos gimnasta", "apellidos de la gimnasta", "last name", "surname"],
  dateOfBirth: [
    "fecha de nacimiento",
    "fecha nacimiento",
    "nacimiento",
    "f nacimiento",
    "fecha nac",
    "date of birth",
    "birth date",
  ],
  group: ["grupo", "grupo de entrenamiento", "group"],
  guardianGivenName: ["nombre del tutor", "nombre tutor", "tutor", "nombre de la tutora", "nombre tutora", "tutora"],
  guardianFamilyName: ["apellidos del tutor", "apellidos tutor", "apellidos de la tutora", "apellidos tutora"],
  guardianEmail: ["email del tutor", "email tutor", "email", "correo", "correo electronico", "e mail", "mail"],
  guardianPhone: ["telefono del tutor", "telefono tutor", "telefono", "movil", "tel"],
  guardianRelationship: ["parentesco", "relacion", "relacion con la gimnasta"],
};

export type AthleteImportMapping = Readonly<Record<AthleteImportField, number | null>>;

export type Relationship = "parent" | "legal_guardian" | "foster_guardian" | "other";

export type ImportIssue = Readonly<{
  severity: "error" | "warning";
  field: AthleteImportField | null;
  code: string;
  message: string;
}>;

export type NormalizedImportRow = Readonly<{
  /** Row number as the spreadsheet shows it (the header is row 1). */
  row: number;
  givenName: string;
  familyName: string;
  dateOfBirth: string | null;
  group: string | null;
  guardian: Readonly<{
    givenName: string;
    familyName: string;
    email: string | null;
    phone: string | null;
    relationship: Relationship;
  }> | null;
  issues: readonly ImportIssue[];
}>;

/** Lower case, no accents, no punctuation, single spaces. */
export function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

/**
 * Maps each field to the first header that names it. A header is used at
 * most once; unknown headers are left unmapped.
 */
export function deriveImportMapping(headers: readonly string[]): AthleteImportMapping {
  const used = new Set<number>();
  // "Teléfono del tutor (+34600000000, sin espacios)" matches "teléfono del tutor".
  const normalized = headers.map((header) => normalizeHeader(header.replace(/\([^)]*\)/gu, " ")));
  const mapping = {} as Record<AthleteImportField, number | null>;
  for (const field of ATHLETE_IMPORT_FIELDS) {
    const synonyms = new Set([normalizeHeader(ATHLETE_IMPORT_FIELD_LABELS[field]), ...HEADER_SYNONYMS[field]]);
    const index = normalized.findIndex((header, position) => !used.has(position) && synonyms.has(header));
    mapping[field] = index >= 0 ? index : null;
    if (index >= 0) used.add(index);
  }
  return mapping;
}

/** Problems that stop the whole preview: missing required columns, reused columns. */
export function mappingProblems(
  mapping: AthleteImportMapping,
  headerCount: number
): string[] {
  const problems: string[] = [];
  const seen = new Map<number, AthleteImportField>();
  for (const field of ATHLETE_IMPORT_FIELDS) {
    const index = mapping[field];
    if (index === null) continue;
    if (!Number.isInteger(index) || index < 0 || index >= headerCount) {
      problems.push(`La columna elegida para «${ATHLETE_IMPORT_FIELD_LABELS[field]}» no existe en el fichero.`);
      continue;
    }
    const previous = seen.get(index);
    if (previous) {
      problems.push(
        `La misma columna no puede ser «${ATHLETE_IMPORT_FIELD_LABELS[previous]}» y «${ATHLETE_IMPORT_FIELD_LABELS[field]}».`
      );
    }
    seen.set(index, field);
  }
  for (const field of REQUIRED_IMPORT_FIELDS) {
    if (mapping[field] === null) {
      problems.push(`Falta la columna obligatoria «${ATHLETE_IMPORT_FIELD_LABELS[field]}».`);
    }
  }
  return problems;
}

/**
 * Characters that make a spreadsheet read a cell as a formula when the value
 * is exported again (CSV injection). Names starting with them are refused, so
 * the import never stores one.
 */
const FORMULA_PREFIX = /^[=+\-@\t\r|\uFF1D\uFF0B\uFF0D\uFF20\uFF5C]/u;

/** Quotes a cell for CSV and neutralises formula prefixes with a leading apostrophe. */
export function escapeCsvCell(value: string): string {
  const safe = FORMULA_PREFIX.test(value) ? `'${value}` : value;
  return /[";\n\r,]/u.test(safe) ? `"${safe.replace(/"/gu, '""')}"` : safe;
}

function cleanText(value: string): string {
  return value
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * Comparison key of a person name: compatibility forms folded, no accents, no
 * punctuation, lower case. Letters of any script are kept, so a name written
 * in Cyrillic or Chinese never collapses to an empty key.
 */
export function nameKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("es")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Exact duplicate key: same academy (implicit), same given name and family
 * name compared with nameKey, and same date of birth.
 */
export function athleteDuplicateKey(input: {
  givenName: string;
  familyName: string;
  dateOfBirth: string | null;
}): string {
  return `${nameKey(input.givenName)}|${nameKey(input.familyName)}|${input.dateOfBirth ?? ""}`;
}

/** Same person by name only, for academy records that have no date of birth. */
export function athleteNameKey(input: { givenName: string; familyName: string }): string {
  return `${nameKey(input.givenName)}|${nameKey(input.familyName)}`;
}

function isCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * Accepts `AAAA-MM-DD` and day-first `DD/MM/AAAA` (also with `-` or `.`).
 * Two-digit years are refused: 05/03/12 could be 1912 or 2012.
 */
export function parseImportDate(
  value: string,
  today: string
): { ok: true; value: string } | { ok: false; code: string; message: string } {
  const text = value.trim();
  let year: number;
  let month: number;
  let day: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/u.exec(text);
  const dayFirst = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/u.exec(text);
  if (iso) {
    [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (dayFirst) {
    if (dayFirst[3]!.length !== 4) {
      return {
        ok: false,
        code: "DATE_YEAR_AMBIGUOUS",
        message: "Escribe el año con cuatro cifras (por ejemplo 15/03/2016).",
      };
    }
    [day, month, year] = [Number(dayFirst[1]), Number(dayFirst[2]), Number(dayFirst[3])];
  } else {
    return {
      ok: false,
      code: "DATE_INVALID",
      message: "La fecha no se entiende. Usa el formato DD/MM/AAAA.",
    };
  }
  if (!isCalendarDate(year, month, day)) {
    return { ok: false, code: "DATE_INVALID", message: "Esa fecha no existe en el calendario." };
  }
  const iso8601 = `${year}-${pad(month)}-${pad(day)}`;
  if (year < 1900) {
    return { ok: false, code: "DATE_OUT_OF_RANGE", message: "La fecha de nacimiento es anterior a 1900." };
  }
  if (iso8601 > today) {
    return { ok: false, code: "DATE_IN_FUTURE", message: "La fecha de nacimiento es posterior a hoy." };
  }
  return { ok: true, value: iso8601 };
}

/** Exactly the rule of the guardian contact editor; formula-like values are refused too. */
export function parseImportEmail(value: string): string | null {
  if (FORMULA_PREFIX.test(value.trim())) return null;
  const normalized = normalizeOwnerGuardianContact("email", value);
  return normalized.success ? normalized.normalizedValue : null;
}

/**
 * Exactly the rule of the guardian contact editor: an E.164 value as written,
 * with its international prefix. No prefix is guessed and nothing is rewritten.
 */
export function parseImportPhone(value: string): string | null {
  const normalized = normalizeOwnerGuardianContact("phone", value);
  return normalized.success ? normalized.normalizedValue : null;
}

const RELATIONSHIPS: ReadonlyArray<readonly [Relationship, readonly string[]]> = [
  ["parent", ["madre", "padre", "madre padre", "padre madre", "progenitor", "progenitora", "mama", "papa"]],
  ["legal_guardian", ["tutor legal", "tutora legal", "tutor", "tutora"]],
  ["foster_guardian", ["acogida", "familia de acogida", "acogedor", "acogedora"]],
  ["other", ["otro", "otra", "abuelo", "abuela", "tio", "tia", "hermano", "hermana"]],
];

export function parseRelationship(value: string): Relationship | null {
  const key = normalizeHeader(value);
  for (const [relationship, spellings] of RELATIONSHIPS) {
    if (spellings.includes(key)) return relationship;
  }
  return null;
}

function issue(
  severity: ImportIssue["severity"],
  field: AthleteImportField | null,
  code: string,
  message: string
): ImportIssue {
  return { severity, field, code, message };
}

function validateName(
  value: string,
  field: AthleteImportField,
  label: string,
  issues: ImportIssue[]
): string {
  const text = cleanText(value);
  if (!text) {
    issues.push(issue("error", field, "REQUIRED", `Falta ${label}.`));
  } else if (text.length > 100) {
    issues.push(issue("error", field, "TOO_LONG", `${label} supera los 100 caracteres.`));
  } else if (FORMULA_PREFIX.test(text)) {
    issues.push(
      issue("error", field, "FORMULA_LIKE", `${label} no puede empezar por =, +, - ni @.`)
    );
  }
  return text;
}

/**
 * Normalises and validates one data row. `cells` is the row as text, `row` its
 * spreadsheet number and `today` the civil date used to refuse future dates.
 */
export function validateImportRow(
  cells: readonly string[],
  mapping: AthleteImportMapping,
  row: number,
  today: string
): NormalizedImportRow {
  const issues: ImportIssue[] = [];
  const read = (field: AthleteImportField) => {
    const index = mapping[field];
    return index === null ? "" : cleanText(cells[index] ?? "");
  };

  const givenName = validateName(read("givenName"), "givenName", "el nombre", issues);
  const familyName = validateName(read("familyName"), "familyName", "los apellidos", issues);

  let dateOfBirth: string | null = null;
  const rawDate = read("dateOfBirth");
  if (!rawDate) {
    issues.push(
      issue(
        "warning",
        "dateOfBirth",
        "DATE_MISSING",
        "Sin fecha de nacimiento: para evitar duplicados se compara solo por nombre."
      )
    );
  } else {
    const parsed = parseImportDate(rawDate, today);
    if (parsed.ok) dateOfBirth = parsed.value;
    else issues.push(issue("error", "dateOfBirth", parsed.code, parsed.message));
  }

  const group = read("group") || null;

  const guardianFields = {
    givenName: read("guardianGivenName"),
    familyName: read("guardianFamilyName"),
    email: read("guardianEmail"),
    phone: read("guardianPhone"),
    relationship: read("guardianRelationship"),
  };
  let guardian: NormalizedImportRow["guardian"] = null;
  if (Object.values(guardianFields).some(Boolean)) {
    let tutorGiven = guardianFields.givenName;
    let tutorFamily = guardianFields.familyName;
    if (tutorGiven && !tutorFamily) {
      const parts = tutorGiven.split(" ");
      if (parts.length >= 2) {
        tutorGiven = parts[0]!;
        tutorFamily = parts.slice(1).join(" ");
        issues.push(
          issue(
            "warning",
            "guardianFamilyName",
            "GUARDIAN_NAME_SPLIT",
            `Sin apellidos del tutor: se toma «${tutorGiven}» como nombre y «${tutorFamily}» como apellidos.`
          )
        );
      }
    }
    tutorGiven = validateName(tutorGiven, "guardianGivenName", "el nombre del tutor", issues);
    tutorFamily = validateName(tutorFamily, "guardianFamilyName", "los apellidos del tutor", issues);

    let email: string | null = null;
    if (guardianFields.email) {
      email = parseImportEmail(guardianFields.email);
      if (!email) {
        issues.push(
          issue("error", "guardianEmail", "EMAIL_INVALID", "Indica un correo válido de hasta 254 caracteres.")
        );
      }
    }
    let phone: string | null = null;
    if (guardianFields.phone) {
      phone = parseImportPhone(guardianFields.phone);
      if (!phone) {
        issues.push(
          issue(
            "error",
            "guardianPhone",
            "PHONE_INVALID",
            "Escribe el teléfono completo con prefijo internacional y sin espacios, por ejemplo +34600000000."
          )
        );
      }
    }
    let relationship: Relationship = "parent";
    if (!guardianFields.relationship) {
      issues.push(
        issue("warning", "guardianRelationship", "RELATIONSHIP_DEFAULT", "Sin parentesco: se registra como madre o padre.")
      );
    } else {
      const parsed = parseRelationship(guardianFields.relationship);
      if (parsed) relationship = parsed;
      else {
        relationship = "other";
        issues.push(
          issue(
            "warning",
            "guardianRelationship",
            "RELATIONSHIP_OTHER",
            `Parentesco «${guardianFields.relationship}» no reconocido: se registra como «otro».`
          )
        );
      }
    }
    guardian = { givenName: tutorGiven, familyName: tutorFamily, email, phone, relationship };
  }

  return { row, givenName, familyName, dateOfBirth, group, guardian, issues };
}

/** Rows whose text is empty in every mapped column are not data rows. */
export function isBlankRow(cells: readonly string[]): boolean {
  return cells.every((cell) => !cleanText(cell));
}

/**
 * Template to download: the column titles only, separated by `;` (Excel in
 * Spanish) and with a UTF-8 BOM so accents open correctly. No example row, so
 * a forgotten example can never be imported as a real athlete.
 */
export function athleteImportTemplateCsv(): string {
  const headers = ATHLETE_IMPORT_FIELDS.map((field) => escapeCsvCell(ATHLETE_IMPORT_TEMPLATE_HEADERS[field]));
  return `\uFEFF${headers.join(";")}\r\n`;
}

/** CSV of the rows to fix, safe to open in a spreadsheet (no formula can run). */
export function athleteImportIssuesCsv(
  rows: ReadonlyArray<{ row: number; values: Readonly<Record<string, string | null>>; messages: readonly string[] }>
): string {
  const header = ["Fila", "Nombre", "Apellidos", "Fecha de nacimiento", "Grupo", "Problema"];
  const lines = rows.map((item) =>
    [
      String(item.row),
      item.values.givenName ?? "",
      item.values.familyName ?? "",
      item.values.dateOfBirth ?? "",
      item.values.group ?? "",
      item.messages.join(" "),
    ]
      .map(escapeCsvCell)
      .join(";")
  );
  return `\uFEFF${[header.join(";"), ...lines].join("\r\n")}\r\n`;
}
