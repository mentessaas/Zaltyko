import { parse } from "csv-parse/sync";
import { z } from "zod";

import { athleteStatusOptions, type AthleteStatus } from "@/lib/athletes/constants";

/**
 * Lectura del CSV de la importación clásica de gimnastas
 * (`/api/athletes/import`, panel de /app/[academyId]/athletes).
 *
 * Es una función pura: no toca base de datos ni logger, para poder probarla
 * sin entorno. Nunca incluye valores de las filas en los mensajes de error
 * (son datos personales de menores); solo número de fila, campo y motivo.
 */

const optionalUuid = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined))
  .pipe(z.guid().optional());

const LegacyAthleteCsvRowSchema = z.object({
  name: z.string().trim().min(1).max(120),
  academyId: optionalUuid,
  dob: z.string().optional(),
  level: z.string().optional(),
  status: z.enum(athleteStatusOptions).optional(),
  groupId: optionalUuid,
  groupName: z.string().optional(),
  sportConfigId: optionalUuid,
  sportConfigCode: z.string().optional(),
  programCode: z.string().optional(),
  levelCode: z.string().optional(),
  categoryCode: z.string().optional(),
});

export type LegacyAthleteCsvField = keyof z.input<typeof LegacyAthleteCsvRowSchema>;

export type LegacyAthleteCsvRow = z.output<typeof LegacyAthleteCsvRowSchema> & {
  /** Línea del archivo (la cabecera es la 1). */
  rowNumber: number;
};

export type LegacyAthleteCsvRowError = {
  /** Línea del archivo (la cabecera es la 1). */
  row: number;
  field: LegacyAthleteCsvField | "file";
  message: string;
};

export type LegacyAthleteCsvFileError = {
  code: "INVALID_CSV" | "MISSING_NAME_COLUMN";
  message: string;
};

export type LegacyAthleteCsvParseResult = {
  rows: LegacyAthleteCsvRow[];
  errors: LegacyAthleteCsvRowError[];
  /** Error que impide leer el archivo completo (no es de una fila concreta). */
  fileError: LegacyAthleteCsvFileError | null;
  delimiter: string;
};

/**
 * Cabeceras aceptadas, ya normalizadas con `normalizeHeaderKey` (sin
 * mayúsculas, acentos, espacios, guiones ni guiones bajos).
 */
const HEADER_ALIASES: Record<string, LegacyAthleteCsvField> = {
  name: "name",
  nombre: "name",
  nombrecompleto: "name",
  nombreyapellidos: "name",

  academyid: "academyId",
  academy: "academyId",
  academia: "academyId",
  idacademia: "academyId",

  dob: "dob",
  birthdate: "dob",
  dateofbirth: "dob",
  fechadenacimiento: "dob",
  fechanacimiento: "dob",
  nacimiento: "dob",

  level: "level",
  nivel: "level",

  status: "status",
  estado: "status",

  groupid: "groupId",
  idgrupo: "groupId",

  groupname: "groupName",
  group: "groupName",
  grupo: "groupName",

  sportconfigid: "sportConfigId",
  sportconfigcode: "sportConfigCode",
  programcode: "programCode",
  levelcode: "levelCode",
  categorycode: "categoryCode",
};

/**
 * "Academia"/"academy" pueden contener el nombre de la academia en vez de su
 * identificador. En esas columnas solo se usa el valor si es un UUID; si no,
 * se deja vacío y la ruta infiere la academia (la del panel o la única del
 * tenant). Las columnas explícitas de ID sí validan el formato.
 */
const LENIENT_ACADEMY_HEADERS = new Set(["academy", "academia"]);

const STATUS_ALIASES: Record<string, AthleteStatus> = {
  active: "active",
  activo: "active",
  activa: "active",
  trial: "trial",
  prueba: "trial",
  enprueba: "trial",
  inactive: "inactive",
  inactivo: "inactive",
  inactiva: "inactive",
  paused: "paused",
  pausado: "paused",
  pausada: "paused",
  archived: "archived",
  archivado: "archived",
  archivada: "archived",
};

const UUID_CHECK = z.guid();

const FIELD_LABELS: Record<LegacyAthleteCsvField, string> = {
  name: "nombre",
  academyId: "academia",
  dob: "fecha de nacimiento",
  level: "nivel",
  status: "estado",
  groupId: "grupo",
  groupName: "grupo",
  sportConfigId: "configuración deportiva",
  sportConfigCode: "configuración deportiva",
  programCode: "programa",
  levelCode: "código de nivel",
  categoryCode: "categoría",
};

export const LEGACY_ATHLETE_CSV_EXPECTED_COLUMNS =
  "nombre (o name) obligatoria; opcionales: fecha de nacimiento (dob), nivel (level), estado (status), grupo (groupName), groupId, academia (academyId), sportConfigCode, programCode, levelCode y categoryCode";

const UNREADABLE_FILE_MESSAGE =
  "No pudimos leer el archivo. Guárdalo como CSV (separado por comas o punto y coma) con una fila de cabecera y vuelve a intentarlo.";

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function normalizeHeaderKey(header: string) {
  return stripAccents(String(header ?? "").replace(/^﻿/, ""))
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Convierte una cabecera del CSV (en inglés o español, con o sin acentos,
 * mayúsculas, espacios o guiones bajos) en el campo interno, o `null` si la
 * columna no se usa.
 */
export function normalizeLegacyAthleteCsvHeader(header: string): LegacyAthleteCsvField | null {
  return HEADER_ALIASES[normalizeHeaderKey(header)] ?? null;
}

/**
 * Detecta el separador mirando la primera línea con contenido (la cabecera):
 * gana el carácter más frecuente fuera de comillas entre `,`, `;` y tabulador.
 * Excel en España y México exporta con `;`. Detectarlo por cabecera evita
 * partir nombres como "Márquez, Lucía" en archivos separados por `;`.
 */
export function detectLegacyCsvDelimiter(text: string): "," | ";" | "\t" {
  const source = text.replace(/^﻿/, "");
  const firstLine = source.split(/\r\n|\n|\r/).find((line) => line.trim().length > 0) ?? "";
  const counts: Record<"," | ";" | "\t", number> = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;
  for (const char of firstLine) {
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && (char === "," || char === ";" || char === "\t")) {
      counts[char] += 1;
    }
  }
  if (counts[";"] > counts[","] && counts[";"] >= counts["\t"]) return ";";
  if (counts["\t"] > counts[","] && counts["\t"] > counts[";"]) return "\t";
  return ",";
}

/**
 * Decodifica el archivo subido. Excel en Windows suele guardar "CSV" en
 * Windows-1252/Latin-1 en vez de UTF-8; si el contenido no es UTF-8 válido,
 * se lee como Latin-1 para no estropear tildes y eñes en los nombres.
 */
export function decodeLegacyAthleteCsv(buffer: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return Buffer.from(buffer).toString("latin1");
  }
}

function emptyToUndefined(value: string | undefined) {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

const DAY_FIRST_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;
const TWO_DIGIT_YEAR_DATE = /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2}$/;
const INVALID_DOB_MESSAGE =
  "fecha de nacimiento no válida (usa DD/MM/AAAA o AAAA-MM-DD, con el año en 4 cifras)";

/**
 * Excel en España y México exporta fechas como DD/MM/AAAA. `new Date()` las
 * interpretaría como MM/DD (o las rechazaría), así que se convierten aquí a
 * AAAA-MM-DD. Otros formatos se dejan intactos para la validación de la ruta.
 */
export function normalizeLegacyCsvDob(value: string): { value: string } | { error: string } {
  if (TWO_DIGIT_YEAR_DATE.test(value)) return { error: INVALID_DOB_MESSAGE };
  const match = DAY_FIRST_DATE.exec(value);
  if (!match) return { value };
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return { error: INVALID_DOB_MESSAGE };
  }
  return {
    value: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

function rowErrorMessage(field: LegacyAthleteCsvField, issueCode: string): string {
  switch (field) {
    case "name":
      return issueCode === "too_big" ? "el nombre supera 120 caracteres" : "falta el nombre";
    case "academyId":
      return "academia no válida (usa el identificador de la academia o deja la columna vacía)";
    case "status":
      return "estado no válido (usa activo, prueba, inactivo, pausado o archivado)";
    case "groupId":
      return "identificador de grupo no válido";
    case "sportConfigId":
      return "identificador de configuración deportiva no válido";
    default:
      return `${FIELD_LABELS[field]} no válido`;
  }
}

/**
 * Lee el CSV de la importación clásica y devuelve las filas válidas y los
 * errores por fila. Las líneas vacías o solo con separadores se ignoran.
 */
export function parseLegacyAthleteCsv(text: string): LegacyAthleteCsvParseResult {
  const delimiter = detectLegacyCsvDelimiter(text);
  const result: LegacyAthleteCsvParseResult = {
    rows: [],
    errors: [],
    fileError: null,
    delimiter,
  };

  let records: Array<{ record: string[]; info: { lines: number } }>;
  try {
    records = parse(text, {
      bom: true,
      delimiter,
      columns: false,
      info: true,
      relax_column_count: true,
      skip_empty_lines: true,
      skip_records_with_empty_values: true,
      trim: true,
    }) as unknown as Array<{ record: string[]; info: { lines: number } }>;
  } catch {
    result.fileError = { code: "INVALID_CSV", message: UNREADABLE_FILE_MESSAGE };
    return result;
  }

  if (records.length === 0) {
    result.fileError = { code: "INVALID_CSV", message: UNREADABLE_FILE_MESSAGE };
    return result;
  }

  const [headerRecord, ...dataRecords] = records;
  // Primera columna que corresponda a cada campo; columnas desconocidas se
  // ignoran como hasta ahora.
  const columnFields: Array<{ field: LegacyAthleteCsvField; lenientAcademy: boolean } | null> = [];
  const seenFields = new Set<LegacyAthleteCsvField>();
  for (const header of headerRecord.record) {
    const field = normalizeLegacyAthleteCsvHeader(header);
    if (!field || seenFields.has(field)) {
      columnFields.push(null);
      continue;
    }
    seenFields.add(field);
    columnFields.push({
      field,
      lenientAcademy: field === "academyId" && LENIENT_ACADEMY_HEADERS.has(normalizeHeaderKey(header)),
    });
  }

  if (!seenFields.has("name")) {
    result.fileError = {
      code: "MISSING_NAME_COLUMN",
      message: `Falta la columna de nombre en la primera fila. Columnas esperadas: ${LEGACY_ATHLETE_CSV_EXPECTED_COLUMNS}.`,
    };
    return result;
  }

  for (const { record, info } of dataRecords) {
    const rowNumber = info.lines;
    const values: Partial<Record<LegacyAthleteCsvField, string | undefined>> = {};
    const preErrors: LegacyAthleteCsvRowError[] = [];
    columnFields.forEach((column, index) => {
      if (!column) return;
      let value = emptyToUndefined(record[index]);
      if (value !== undefined && column.lenientAcademy && !UUID_CHECK.safeParse(value).success) {
        value = undefined;
      }
      if (value !== undefined && column.field === "status") {
        value = STATUS_ALIASES[normalizeHeaderKey(value)] ?? value;
      }
      if (value !== undefined && column.field === "dob") {
        const dob = normalizeLegacyCsvDob(value);
        if ("error" in dob) {
          preErrors.push({ row: rowNumber, field: "dob", message: dob.error });
          value = undefined;
        } else {
          value = dob.value;
        }
      }
      values[column.field] = value;
    });

    const parsed = LegacyAthleteCsvRowSchema.safeParse({ ...values, name: values.name ?? "" });
    if (!parsed.success || preErrors.length > 0) {
      const reported = new Set<string>();
      for (const issue of parsed.success ? [] : parsed.error.issues) {
        const field = (issue.path[0] as LegacyAthleteCsvField | undefined) ?? "name";
        if (reported.has(field)) continue;
        reported.add(field);
        result.errors.push({ row: rowNumber, field, message: rowErrorMessage(field, issue.code) });
      }
      result.errors.push(...preErrors);
      continue;
    }

    result.rows.push({ ...parsed.data, rowNumber });
  }

  return result;
}

/**
 * Resumen legible de los errores por fila, p. ej.
 * "Revisa 2 filas: Fila 3: falta el nombre; Fila 5: academia no válida".
 */
export function formatLegacyAthleteCsvErrors(
  errors: LegacyAthleteCsvRowError[],
  maxRowsInMessage = 5,
): string {
  const byRow = new Map<number, string[]>();
  for (const error of errors) {
    const messages = byRow.get(error.row) ?? [];
    messages.push(error.message);
    byRow.set(error.row, messages);
  }
  const rows = Array.from(byRow.entries());
  const shown = rows
    .slice(0, maxRowsInMessage)
    .map(([row, messages]) => `Fila ${row}: ${messages.join(", ")}`)
    .join("; ");
  const remaining = rows.length - Math.min(rows.length, maxRowsInMessage);
  const suffix = remaining > 0 ? `; y ${remaining} fila${remaining === 1 ? "" : "s"} más` : "";
  return `Revisa ${rows.length} fila${rows.length === 1 ? "" : "s"}: ${shown}${suffix}. Corrige el archivo y vuelve a previsualizarlo.`;
}
