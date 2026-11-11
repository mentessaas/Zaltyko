/**
 * Reads the uploaded spreadsheet in memory, on the server. Nothing is written
 * to disk. CSV (UTF-8 or Windows-1252, separated by `;`, `,` or tabs) and XLSX
 * (first sheet only) are accepted. Formulas are never evaluated: an XLSX cell
 * gives only the value the spreadsheet stored, and a CSV cell is plain text.
 *
 * Nothing is cut silently. Every logical row is read (a CSV record with a
 * multi-line cell is one row; blank rows do not count) and a file with more
 * than ATHLETE_IMPORT_MAX_ROWS data rows is refused as a whole.
 */
import { inflateRawSync } from "node:zlib";

import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";

import { OperationalError } from "@/modules/shared/domain/operational-error";

/** 2 MiB: a 1,000-row sheet with every column fits in a fraction of it. */
export const ATHLETE_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
/** Data rows, without the header. */
export const ATHLETE_IMPORT_MAX_ROWS = 1000;
export const ATHLETE_IMPORT_MAX_COLUMNS = 50;
/** Sum of the uncompressed sizes an XLSX declares, checked before opening it. */
export const ATHLETE_IMPORT_MAX_UNZIPPED_BYTES = 20 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 1000;

export type ImportFileRow = Readonly<{ row: number; cells: string[] }>;

export type ParsedImportFile = Readonly<{
  format: "csv" | "xlsx";
  headers: string[];
  rows: ImportFileRow[];
  /** Spreadsheet numbers of hidden or filtered rows, which are not imported. */
  hiddenRows: number[];
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

const tooLargeUnzipped = () =>
  invalidFile(
    "El Excel ocupa demasiado al descomprimirlo. Guarda solo la hoja de gimnastas o expórtala como CSV.",
    "XLSX_TOO_LARGE"
  );
const brokenZip = () =>
  invalidFile("No se pudo abrir el Excel. Guárdalo de nuevo como .xlsx o como CSV.", "XLSX_MALFORMED");

/** Shared strings (all the text of the sheet) may use at most half the budget. */
export const ATHLETE_IMPORT_MAX_SHARED_STRINGS_BYTES = 10 * 1024 * 1024;

const inconsistentZip = () =>
  invalidFile(
    "El Excel tiene un formato interno incoherente. Guárdalo de nuevo como .xlsx o como CSV.",
    "XLSX_INCONSISTENT"
  );

/**
 * ZIP bomb guard, before the XLSX reader touches the file:
 *
 * 1. adds up the uncompressed sizes the central directory declares and
 *    refuses more than 20 MB, more than 1,000 entries, ZIP64 or encryption;
 * 2. checks every local header against its central entry (name, method and,
 *    unless the sizes come in a data descriptor, both sizes);
 * 3. inflates every entry itself with a hard output cap equal to the size it
 *    declares, so an archive that lies about its sizes is refused instead of
 *    trusted. After this, SheetJS inflates the same bytes to the same sizes.
 */
export function assertZipWithinLimits(bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const lowest = Math.max(0, bytes.length - 22 - 0xffff);
  let end = -1;
  for (let offset = bytes.length - 22; offset >= lowest; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      end = offset;
      break;
    }
  }
  if (end < 0) throw brokenZip();
  const entries = view.getUint16(end + 10, true);
  const directorySize = view.getUint32(end + 12, true);
  const directoryOffset = view.getUint32(end + 16, true);
  if (entries === 0xffff || directoryOffset === 0xffffffff || directorySize === 0xffffffff) {
    throw tooLargeUnzipped();
  }
  if (entries > MAX_ZIP_ENTRIES) throw tooLargeUnzipped();
  if (directoryOffset + directorySize > end) throw brokenZip();

  type Entry = { name: string; flags: number; method: number; compressed: number; uncompressed: number; localOffset: number };
  const list: Entry[] = [];
  let total = 0;
  let offset = directoryOffset;
  for (let entry = 0; entry < entries; entry += 1) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) throw brokenZip();
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressed = view.getUint32(offset + 20, true);
    const uncompressed = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const localOffset = view.getUint32(offset + 42, true);
    if (compressed === 0xffffffff || uncompressed === 0xffffffff || localOffset === 0xffffffff) {
      throw tooLargeUnzipped();
    }
    if (flags & 0x1) throw inconsistentZip();
    total += uncompressed;
    if (total > ATHLETE_IMPORT_MAX_UNZIPPED_BYTES) throw tooLargeUnzipped();
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (name === "xl/sharedStrings.xml" && uncompressed > ATHLETE_IMPORT_MAX_SHARED_STRINGS_BYTES) {
      throw tooLargeUnzipped();
    }
    list.push({ name, flags, method, compressed, uncompressed, localOffset });
    offset += 46 + nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }

  for (const entry of list) {
    const local = entry.localOffset;
    if (local + 30 > directoryOffset || view.getUint32(local, true) !== 0x04034b50) throw inconsistentZip();
    const localFlags = view.getUint16(local + 6, true);
    const localMethod = view.getUint16(local + 8, true);
    const localNameLength = view.getUint16(local + 26, true);
    const dataStart = local + 30 + localNameLength + view.getUint16(local + 28, true);
    const localName = new TextDecoder().decode(bytes.subarray(local + 30, local + 30 + localNameLength));
    if (localName !== entry.name || localMethod !== entry.method || (localFlags & 0x1) !== 0) throw inconsistentZip();
    if (
      !(entry.flags & 0x8) &&
      (view.getUint32(local + 18, true) !== entry.compressed || view.getUint32(local + 22, true) !== entry.uncompressed)
    ) {
      throw inconsistentZip();
    }
    if (dataStart + entry.compressed > directoryOffset) throw inconsistentZip();
    const data = bytes.subarray(dataStart, dataStart + entry.compressed);
    let produced: number;
    if (entry.method === 0) {
      produced = data.length;
    } else if (entry.method === 8) {
      try {
        produced = inflateRawSync(data, { maxOutputLength: Math.max(1, entry.uncompressed) }).length;
      } catch {
        // Either more output than declared (the cap) or corrupt data.
        throw inconsistentZip();
      }
    } else {
      throw inconsistentZip();
    }
    if (produced !== entry.uncompressed) throw inconsistentZip();
  }
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

type SourceRecord = { row: number; cells: string[] };

const isBlank = (cells: readonly string[]) => cells.every((cell) => !cell.trim());

/**
 * `records` are the non-blank rows in file order with their spreadsheet
 * number. The first one is the header.
 */
function finish(
  format: ParsedImportFile["format"],
  records: SourceRecord[],
  hidden: ReadonlySet<number>
): ParsedImportFile {
  const [header, ...data] = records;
  const headers = (header?.cells ?? []).map((cell) => cell.trim());
  if (!header || headers.every((cell) => !cell)) {
    throw invalidFile("El fichero está vacío o no tiene una fila de títulos.", "EMPTY");
  }
  const width = Math.max(headers.length, ...data.map((record) => record.cells.length));
  if (width > ATHLETE_IMPORT_MAX_COLUMNS) {
    throw invalidFile(
      `El fichero tiene más de ${ATHLETE_IMPORT_MAX_COLUMNS} columnas. Deja solo las de la plantilla.`,
      "TOO_MANY_COLUMNS"
    );
  }
  if (data.length === 0) {
    throw invalidFile("El fichero no tiene filas de gimnastas debajo de los títulos.", "NO_ROWS");
  }
  if (data.length > ATHLETE_IMPORT_MAX_ROWS) {
    throw invalidFile(
      `El fichero tiene ${data.length} filas y el máximo es ${ATHLETE_IMPORT_MAX_ROWS}. Divídelo en varios ficheros: no se ha importado ninguna fila.`,
      "TOO_MANY_ROWS"
    );
  }
  const rows: ImportFileRow[] = [];
  const hiddenRows: number[] = [];
  for (const record of data) {
    if (hidden.has(record.row)) {
      hiddenRows.push(record.row);
      continue;
    }
    rows.push({ row: record.row, cells: headers.map((_header, column) => record.cells[column] ?? "") });
  }
  if (rows.length === 0) {
    throw invalidFile("Todas las filas del fichero están ocultas o filtradas.", "NO_ROWS");
  }
  return { format, headers, rows, hiddenRows };
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
      // Blank lines stay as records so row numbers match the spreadsheet;
      // finish() only receives the non-blank ones.
      skip_empty_lines: false,
    }) as string[][];
  } catch {
    throw invalidFile(
      "No se pudo leer el CSV: revisa que las comillas estén cerradas o guárdalo de nuevo desde Excel.",
      "CSV_MALFORMED"
    );
  }
  const records = table
    .map((cells, index) => ({ row: index + 1, cells: cells.map(String) }))
    .filter((record) => !isBlank(record.cells));
  return finish("csv", records, new Set());
}

function cellText(cell: XLSX.CellObject | undefined, date1904: boolean): string {
  if (!cell) return "";
  if (cell.t === "n" && typeof cell.v === "number") {
    if (cell.z && XLSX.SSF.is_date(cell.z)) {
      const date = XLSX.SSF.parse_date_code(cell.v, { date1904 });
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

type DenseSheet = {
  "!data"?: Array<Array<XLSX.CellObject | undefined> | undefined>;
  "!rows"?: Array<{ hidden?: boolean } | undefined>;
};

function parseXlsx(bytes: Uint8Array): ParsedImportFile {
  assertZipWithinLimits(bytes);
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(bytes, {
      type: "array",
      // Only the first sheet is parsed.
      sheets: 0,
      dense: true,
      cellFormula: false,
      cellHTML: false,
      cellNF: true,
      cellDates: false,
      // Needed for the row properties that mark hidden and filtered rows.
      cellStyles: true,
      bookVBA: false,
    });
  } catch {
    throw brokenZip();
  }
  const sheetName = workbook.SheetNames[0];
  const sheet = (sheetName ? workbook.Sheets[sheetName] : undefined) as (XLSX.WorkSheet & DenseSheet) | undefined;
  if (!sheet) throw invalidFile("La primera hoja del Excel está vacía.", "EMPTY");
  const date1904 = Boolean(workbook.Workbook?.WBProps?.date1904);

  // Only the cells that exist are visited, whatever range the sheet declares.
  const records: SourceRecord[] = [];
  (sheet["!data"] ?? []).forEach((rowCells, rowIndex) => {
    if (!rowCells) return;
    const cells: string[] = [];
    rowCells.forEach((cell, column) => {
      cells[column] = cellText(cell, date1904);
    });
    const filled = Array.from(cells, (cell) => cell ?? "");
    if (!isBlank(filled)) records.push({ row: rowIndex + 1, cells: filled });
  });
  const hidden = new Set<number>();
  (sheet["!rows"] ?? []).forEach((properties, rowIndex) => {
    if (properties?.hidden) hidden.add(rowIndex + 1);
  });
  return finish("xlsx", records, hidden);
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
