/**
 * O4 · Lectura del fichero subido: CSV y XLSX en memoria, con límites y sin
 * evaluar fórmulas. Ficheros sintéticos construidos en la propia prueba.
 */
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import {
  ATHLETE_IMPORT_MAX_BYTES,
  ATHLETE_IMPORT_MAX_ROWS,
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
    });
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

  it("rechaza más filas de las permitidas", () => {
    const lines = ["Nombre;Apellidos", ...Array.from({ length: ATHLETE_IMPORT_MAX_ROWS + 1 }, (_, i) => `N${i};A${i}`)];
    expect(failure(utf8(lines.join("\n")))).toMatchObject({ reason: "TOO_MANY_ROWS" });
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
    });
  });

  it("numera las filas según su posición real en la hoja", () => {
    const bytes = workbookBytes([], (sheet) => {
      XLSX.utils.sheet_add_aoa(sheet, [["Nombre", "Apellidos"], ["Lucía", "Prueba"]], { origin: "A3" });
    });
    expect(parseAthleteImportFile(bytes).rows).toEqual([{ row: 4, cells: ["Lucía", "Prueba"] }]);
  });
});
