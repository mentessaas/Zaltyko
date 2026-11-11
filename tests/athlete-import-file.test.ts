/**
 * O4 · Lectura del fichero subido: CSV y XLSX en memoria, con límites y sin
 * evaluar fórmulas. Ficheros sintéticos construidos en la propia prueba.
 */
import { deflateRawSync } from "node:zlib";

import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import {
  ATHLETE_IMPORT_MAX_BYTES,
  ATHLETE_IMPORT_MAX_ROWS,
  ATHLETE_IMPORT_MAX_UNZIPPED_BYTES,
  assertZipWithinLimits,
  detectDelimiter,
  parseAthleteImportFile,
} from "@/modules/athlete-import/application/athlete-import-file";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const utf8 = (text: string) => new TextEncoder().encode(text);

function failure(bytes: Uint8Array) {
  try {
    parseAthleteImportFile(bytes);
  } catch (error) {
    expect(error).toBeInstanceOf(OperationalError);
    const operational = error as OperationalError;
    return { code: operational.code, status: operational.status, reason: operational.details?.reason };
  }
  throw new Error("El fichero se aceptó y debía rechazarse");
}

describe("CSV", () => {
  it("lee punto y coma con BOM y conserva el número de fila del fichero", () => {
    const parsed = parseAthleteImportFile(
      utf8("﻿Nombre;Apellidos;Fecha de nacimiento\r\nLucía;Prueba;15/03/2016\r\n\r\nAna;\"Sintética; Dos\";01/02/2015\r\n")
    );
    expect(parsed).toEqual({
      format: "csv",
      headers: ["Nombre", "Apellidos", "Fecha de nacimiento"],
      rows: [
        { row: 2, cells: ["Lucía", "Prueba", "15/03/2016"] },
        { row: 4, cells: ["Ana", "Sintética; Dos", "01/02/2015"] },
      ],
      hiddenRows: [],
    });
  });

  it("cuenta filas lógicas: una celda de varias líneas es una fila y las vacías no cuentan", () => {
    const parsed = parseAthleteImportFile(utf8('Nombre;Apellidos\n"Lucía\nMaría";Prueba\n\n;\nAna;Prueba\n'));
    expect(parsed.rows).toEqual([
      { row: 2, cells: ["Lucía\nMaría", "Prueba"] },
      { row: 5, cells: ["Ana", "Prueba"] },
    ]);
  });

  it("lee el límite exacto aunque ocupe muchas más líneas físicas", () => {
    const rows = Array.from({ length: ATHLETE_IMPORT_MAX_ROWS }, (_, i) => `"N${i}\nsegunda línea";A${i}\n\n`);
    const parsed = parseAthleteImportFile(utf8(`Nombre;Apellidos\n${rows.join("")}`));
    expect(parsed.rows).toHaveLength(ATHLETE_IMPORT_MAX_ROWS);
    expect(parsed.rows.at(-1)!.cells[0]).toBe(`N${ATHLETE_IMPORT_MAX_ROWS - 1}\nsegunda línea`);
  });

  it("detecta coma y tabulador", () => {
    expect(detectDelimiter("Nombre,Apellidos,Fecha")).toBe(",");
    expect(detectDelimiter("Nombre\tApellidos\tFecha")).toBe("\t");
    expect(detectDelimiter('"Nombre; con punto y coma",Apellidos,Fecha')).toBe(",");
    expect(parseAthleteImportFile(utf8("Nombre,Apellidos\nLucía,Prueba\n")).rows).toEqual([
      { row: 2, cells: ["Lucía", "Prueba"] },
    ]);
  });

  it("lee el CSV de Excel en español (Windows-1252)", () => {
    const bytes = new Uint8Array(Buffer.from("Nombre;Apellidos\r\nLucía;Pérez Núñez\r\n", "latin1"));
    expect(parseAthleteImportFile(bytes).rows).toEqual([{ row: 2, cells: ["Lucía", "Pérez Núñez"] }]);
  });

  it("guarda como texto una celda con aspecto de fórmula, sin interpretarla", () => {
    const parsed = parseAthleteImportFile(utf8('Nombre;Apellidos\n=HYPERLINK("http://example.invalid");Prueba\n'));
    expect(parsed.rows[0]!.cells[0]).toBe('=HYPERLINK("http://example.invalid")');
  });

  it("completa con vacío las filas cortas", () => {
    expect(parseAthleteImportFile(utf8("Nombre;Apellidos;Grupo\nLucía\n")).rows).toEqual([
      { row: 2, cells: ["Lucía", "", ""] },
    ]);
  });
});

describe("ficheros rechazados", () => {
  it.each([
    ["vacío", new Uint8Array(), "EMPTY"],
    ["solo títulos", utf8("Nombre;Apellidos\n"), "NO_ROWS"],
    ["comillas sin cerrar", utf8('Nombre;Apellidos\n"Lucía;Prueba\n'), "CSV_MALFORMED"],
    ["Excel antiguo .xls", new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1]), "XLS_UNSUPPORTED"],
    ["binario", new Uint8Array([0x4e, 0x00, 0x6f, 0x6d]), "BINARY"],
    ["ZIP que no es un Excel", new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]), "XLSX_MALFORMED"],
  ])("rechaza un fichero %s", (_label, bytes, reason) => {
    expect(failure(bytes)).toEqual({ code: "IMPORT_FILE_INVALID", status: 422, reason });
  });

  it("rechaza más de 2 MB antes de leerlo", () => {
    expect(failure(new Uint8Array(ATHLETE_IMPORT_MAX_BYTES + 1).fill(0x61))).toMatchObject({ reason: "TOO_LARGE" });
  });

  it("rechaza más filas de las permitidas, sin importar ninguna", () => {
    const lines = ["Nombre;Apellidos", ...Array.from({ length: ATHLETE_IMPORT_MAX_ROWS + 1 }, (_, i) => `N${i};A${i}`)];
    expect(failure(utf8(lines.join("\n")))).toMatchObject({ reason: "TOO_MANY_ROWS" });
    // Rows past the old physical-line cut-off are still counted.
    const multiline = Array.from({ length: ATHLETE_IMPORT_MAX_ROWS + 1 }, (_, i) => `"N${i}\nx";A${i}`);
    expect(failure(utf8(["Nombre;Apellidos", ...multiline].join("\n")))).toMatchObject({ reason: "TOO_MANY_ROWS" });
    const atLimit = ["Nombre;Apellidos", ...Array.from({ length: ATHLETE_IMPORT_MAX_ROWS }, (_, i) => `N${i};A${i}`)];
    expect(parseAthleteImportFile(utf8(atLimit.join("\n"))).rows).toHaveLength(ATHLETE_IMPORT_MAX_ROWS);
  });

  it("rechaza demasiadas columnas", () => {
    const header = Array.from({ length: 51 }, (_, i) => `C${i}`).join(";");
    expect(failure(utf8(`${header}\nx\n`))).toMatchObject({ reason: "TOO_MANY_COLUMNS" });
  });
});

describe("XLSX", () => {
  function workbookBytes(rows: unknown[][], edit?: (sheet: XLSX.WorkSheet) => void): Uint8Array {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    edit?.(sheet);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Gimnastas");
    return new Uint8Array(XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
  }

  it("rechaza una hoja de más de 1.000 filas y acepta 1.000 con filas vacías entre medias", () => {
    const tooMany = workbookBytes([
      ["Nombre", "Apellidos"],
      ...Array.from({ length: ATHLETE_IMPORT_MAX_ROWS + 1 }, (_, i) => [`N${i}`, `A${i}`]),
    ]);
    expect(failure(tooMany)).toMatchObject({ reason: "TOO_MANY_ROWS" });
    // A blank row after every ten: 1,100 sheet rows, exactly 1,000 data rows.
    const withGaps = workbookBytes([
      ["Nombre", "Apellidos"],
      ...Array.from({ length: ATHLETE_IMPORT_MAX_ROWS }, (_, i) => [`N${i}`, `A${i}`]).flatMap((row, i) =>
        i % 10 === 9 ? [row, ["", ""]] : [row]
      ),
    ]);
    expect(parseAthleteImportFile(withGaps).rows).toHaveLength(ATHLETE_IMPORT_MAX_ROWS);
  });

  it("no importa las filas ocultas o filtradas y las señala", () => {
    const bytes = workbookBytes(
      [
        ["Nombre", "Apellidos"],
        ["Lucía", "Prueba"],
        ["Oculta", "Prueba"],
        ["Ana", "Prueba"],
      ],
      (sheet) => {
        sheet["!rows"] = [{}, {}, { hidden: true }];
      }
    );
    const parsed = parseAthleteImportFile(bytes);
    expect(parsed.rows.map((row) => row.row)).toEqual([2, 4]);
    expect(parsed.hiddenRows).toEqual([3]);
  });

  it("convierte bien las fechas de un libro con sistema de fechas 1904", () => {
    const sheet = XLSX.utils.aoa_to_sheet([["Nombre", "Apellidos", "Fecha de nacimiento"], ["Lucía", "Prueba", 40982]]);
    (sheet.C2 as XLSX.CellObject).z = "dd/mm/yyyy";
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Gimnastas");
    book.Workbook = { ...(book.Workbook ?? {}), WBProps: { date1904: true } };
    const bytes = new Uint8Array(XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
    expect(parseAthleteImportFile(bytes).rows[0]!.cells[2]).toBe("2016-03-15");
  });

  it("convierte las fechas de Excel, conserva números largos y lee el valor guardado de una fórmula", () => {
    const bytes = workbookBytes(
      [
        ["Nombre", "Apellidos", "Fecha de nacimiento", "Teléfono del tutor"],
        ["Lucía", "Prueba", 42444, 34600111222],
        ["Ana", "x", "15/03/2016", ""],
      ],
      (sheet) => {
        (sheet.C2 as XLSX.CellObject).z = "dd/mm/yyyy";
        // A formula with its stored result: the import reads only the result.
        sheet.B3 = { t: "s", v: "Valor guardado", f: 'HYPERLINK("http://example.invalid","x")' };
      }
    );
    expect(parseAthleteImportFile(bytes)).toEqual({
      format: "xlsx",
      headers: ["Nombre", "Apellidos", "Fecha de nacimiento", "Teléfono del tutor"],
      rows: [
        { row: 2, cells: ["Lucía", "Prueba", "2016-03-15", "34600111222"] },
        { row: 3, cells: ["Ana", "Valor guardado", "15/03/2016", ""] },
      ],
      hiddenRows: [],
    });
  });

  it("numera las filas según su posición real en la hoja", () => {
    const bytes = workbookBytes([], (sheet) => {
      XLSX.utils.sheet_add_aoa(sheet, [["Nombre", "Apellidos"], ["Lucía", "Prueba"]], { origin: "A3" });
    });
    expect(parseAthleteImportFile(bytes).rows).toEqual([{ row: 4, cells: ["Lucía", "Prueba"] }]);
  });
});

describe("bomba ZIP", () => {
  /** A ZIP with one entry whose declared uncompressed size is `size` bytes of zeros. */
  function zipOf(size: number): Uint8Array {
    const name = Buffer.from("xl/worksheets/sheet1.xml");
    const data = deflateRawSync(Buffer.alloc(size), { level: 9 });
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28);
    const directoryOffset = local.length + name.length + data.length;
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(1, 8);
    end.writeUInt16LE(1, 10);
    end.writeUInt32LE(central.length + name.length, 12);
    end.writeUInt32LE(directoryOffset, 16);
    return new Uint8Array(Buffer.concat([local, name, data, central, name, end]));
  }

  it("rechaza, antes de descomprimir, un Excel pequeño que declara más de 20 MB", () => {
    const bomb = zipOf(ATHLETE_IMPORT_MAX_UNZIPPED_BYTES + 1024 * 1024);
    // Small on disk: well under the 2 MB upload limit.
    expect(bomb.length).toBeLessThan(200 * 1024);
    expect(failure(bomb)).toEqual({ code: "IMPORT_FILE_INVALID", status: 422, reason: "XLSX_TOO_LARGE" });
  });

  it("deja pasar un ZIP por debajo del tope", () => {
    expect(() => assertZipWithinLimits(zipOf(1024))).not.toThrow();
  });
});
