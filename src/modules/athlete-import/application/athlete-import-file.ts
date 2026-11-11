/**
 * Reads the uploaded spreadsheet in memory, on the server. Nothing is written
 * to disk. CSV (UTF-8 or Windows-1252, separated by `;`, `,` or tabs) and XLSX
 * (first sheet) are accepted. Formulas are never evaluated: an XLSX cell gives
 * only the value the spreadsheet stored, and a CSV cell is plain text.
 */
import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";

import { OperationalError } from "@/modules/shared/domain/operational-error";

/** 2 MiB: a 1,000-row sheet with every column fits in a fraction of it. */
export const ATHLETE_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
/** Data rows, without the header. */
export const ATHLETE_IMPORT_MAX_ROWS = 1000;
export const ATHLETE_IMPORT_MAX_COLUMNS = 50;

export type ImportFileRow = Readonly<{ row: number; cells: string[] }>;

export type ParsedImportFile = Readonly<{
  format: "csv" | "xlsx";
  headers: string[];
  rows: ImportFileRow[];
}>;

function invalidFile(message: string, reason: string): OperationalError {
  return new OperationalError("IMPORT_FILE_INVALID", message, 422, { reason });
}

function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function isLegacyExcel(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
}

function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // Excel in Spanish saves "CSV" in Windows-1252 unless UTF-8 is chosen.
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** The separator that appears most often in the header line, outside quotes. */
export function detectDelimiter(text: string): ";" | "," | "\t" {
  const firstLine = text.replace(/^﻿/u, "").split(/\r?\n/u, 1)[0] ?? "";
  const counts = { ";": 0, ",": 0, "\t": 0 };
  let quoted = false;
  for (const char of firstLine) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && char in counts) counts[char as keyof typeof counts] += 1;
  }
  const [best] = (Object.entries(counts) as Array<[";" | "," | "\t", number]>).sort(
    (left, right) => right[1] - left[1]
  );
  return best![1] > 0 ? best![0] : ";";
}

/**
 * Builds the result from the raw table. `headerRow` is the spreadsheet number
 * of the header row, so every data row keeps the number the user sees.
 */
function finish(format: ParsedImportFile["format"], table: string[][], headerRow: number): ParsedImportFile {
  const [rawHeaders, ...data] = table;
  const headers = (rawHeaders ?? []).map((header) => header.trim());
  if (headers.length === 0 || headers.every((header) => !header)) {
    throw invalidFile("El fichero está vacío o no tiene una fila de títulos.", "EMPTY");
  }
  if (headers.length > ATHLETE_IMPORT_MAX_COLUMNS) {
    throw invalidFile(
      `El fichero tiene más de ${ATHLETE_IMPORT_MAX_COLUMNS} columnas. Deja solo las de la plantilla.`,
      "TOO_MANY_COLUMNS"
    );
  }
  const rows = data
    .map((cells, index) => ({
      row: headerRow + index + 1,
      cells: headers.map((_header, column) => String(cells[column] ?? "")),
    }))
    .filter((item) => item.cells.some((cell) => cell.trim()));
  if (rows.length === 0) {
    throw invalidFile("El fichero no tiene filas de gimnastas debajo de los títulos.", "NO_ROWS");
  }
  if (rows.length > ATHLETE_IMPORT_MAX_ROWS) {
    throw invalidFile(
      `El fichero tiene más de ${ATHLETE_IMPORT_MAX_ROWS} filas. Divídelo en varios ficheros.`,
      "TOO_MANY_ROWS"
    );
  }
  return { format, headers, rows };
}

function parseCsv(bytes: Uint8Array): ParsedImportFile {
  const text = decodeText(bytes);
  let table: string[][];
  try {
    table = parse(text, {
      bom: true,
      delimiter: detectDelimiter(text),
      relax_column_count: true,
      // A quote inside an unquoted cell (O"Neil, =HYPERLINK("…")) stays as
      // text; a quoted cell that never closes is still refused.
      relax_quotes: true,
      // Blank lines stay as records so row numbers match the file; finish()
      // drops rows whose cells are all empty.
      skip_empty_lines: false,
      // Header plus the maximum, plus one row to detect the excess.
      to_line: ATHLETE_IMPORT_MAX_ROWS + 50,
    }) as string[][];
  } catch {
    throw invalidFile(
      "No se pudo leer el CSV: revisa que las comillas estén cerradas o guárdalo de nuevo desde Excel.",
      "CSV_MALFORMED"
    );
  }
  return finish("csv", table, 1);
}

function cellText(cell: XLSX.CellObject | undefined): string {
  if (!cell) return "";
  if (cell.t === "n" && typeof cell.v === "number") {
    if (cell.z && XLSX.SSF.is_date(cell.z)) {
      const date = XLSX.SSF.parse_date_code(cell.v);
      if (!date) return "";
      return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
    }
    return Number.isInteger(cell.v) ? String(cell.v) : (cell.w ?? String(cell.v));
  }
  if (cell.t === "s") return String(cell.v ?? "");
  if (cell.t === "b") return cell.v ? "VERDADERO" : "FALSO";
  // Error cells (#N/A, #REF!...) and stubs carry no usable value.
  return "";
}

function parseXlsx(bytes: Uint8Array): ParsedImportFile {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(bytes, {
      type: "array",
      cellFormula: false,
      cellHTML: false,
      cellNF: true,
      cellDates: false,
      bookVBA: false,
      // Never parse more rows than the limit needs.
      sheetRows: ATHLETE_IMPORT_MAX_ROWS + 50,
    });
  } catch {
    throw invalidFile("No se pudo abrir el Excel. Guárdalo de nuevo como .xlsx o como CSV.", "XLSX_MALFORMED");
  }
  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet || !sheet["!ref"]) {
    throw invalidFile("La primera hoja del Excel está vacía.", "EMPTY");
  }
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  if (range.e.c - range.s.c + 1 > ATHLETE_IMPORT_MAX_COLUMNS) {
    throw invalidFile(
      `El fichero tiene más de ${ATHLETE_IMPORT_MAX_COLUMNS} columnas. Deja solo las de la plantilla.`,
      "TOO_MANY_COLUMNS"
    );
  }
  const table: string[][] = [];
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    const cells: string[] = [];
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      cells.push(cellText(sheet[XLSX.utils.encode_cell({ r: row, c: column })] as XLSX.CellObject | undefined));
    }
    table.push(cells);
  }
  return finish("xlsx", table, range.s.r + 1);
}

/**
 * Parses an upload. The type is decided by the content, not the file name: an
 * XLSX is a ZIP container; anything else is read as CSV text.
 */
export function parseAthleteImportFile(bytes: Uint8Array): ParsedImportFile {
  if (bytes.length === 0) {
    throw invalidFile("El fichero está vacío.", "EMPTY");
  }
  if (bytes.length > ATHLETE_IMPORT_MAX_BYTES) {
    throw invalidFile("El fichero supera los 2 MB. Divídelo en varios ficheros.", "TOO_LARGE");
  }
  if (isLegacyExcel(bytes)) {
    throw invalidFile("Los Excel antiguos (.xls) no se admiten. Guárdalo como .xlsx o como CSV.", "XLS_UNSUPPORTED");
  }
  if (isZip(bytes)) return parseXlsx(bytes);
  if (bytes.includes(0)) {
    throw invalidFile("El fichero no es un CSV ni un Excel .xlsx.", "BINARY");
  }
  return parseCsv(bytes);
}
