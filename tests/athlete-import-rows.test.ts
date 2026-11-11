/**
 * O4 · Importación de gimnastas: columnas, mapeo y validación fila a fila.
 * Todos los datos son sintéticos.
 */
import { describe, expect, it } from "vitest";

import {
  athleteDuplicateKey,
  athleteImportIssuesCsv,
  athleteImportTemplateCsv,
  deriveImportMapping,
  escapeCsvCell,
  mappingProblems,
  parseImportDate,
  parseImportEmail,
  parseImportPhone,
  parseRelationship,
  validateImportRow,
} from "@/modules/athlete-import/domain/athlete-import-rows";

const TODAY = "2026-11-11";
const TEMPLATE_HEADERS = [
  "Nombre",
  "Apellidos",
  "Fecha de nacimiento",
  "Grupo",
  "Nombre del tutor",
  "Apellidos del tutor",
  "Email del tutor",
  "Teléfono del tutor",
  "Parentesco",
];

describe("mapeo de columnas", () => {
  it("reconoce la plantilla tal cual", () => {
    expect(deriveImportMapping(TEMPLATE_HEADERS)).toEqual({
      givenName: 0,
      familyName: 1,
      dateOfBirth: 2,
      group: 3,
      guardianGivenName: 4,
      guardianFamilyName: 5,
      guardianEmail: 6,
      guardianPhone: 7,
      guardianRelationship: 8,
    });
  });

  it("reconoce variantes sin tildes, en mayúsculas y en otro orden, y deja fuera lo desconocido", () => {
    const mapping = deriveImportMapping(["APELLIDOS", "  nombre ", "F. Nacimiento", "Observaciones", "Móvil", "Correo"]);
    expect(mapping).toMatchObject({
      givenName: 1,
      familyName: 0,
      dateOfBirth: 2,
      group: null,
      guardianPhone: 4,
      guardianEmail: 5,
    });
  });

  it("explica las columnas obligatorias que faltan y las repetidas", () => {
    const mapping = deriveImportMapping(["Nombre", "Grupo"]);
    expect(mappingProblems(mapping, 2)).toEqual([
      "Falta la columna obligatoria «Apellidos».",
      "Falta la columna obligatoria «Fecha de nacimiento».",
    ]);
    expect(mappingProblems({ ...mapping, familyName: 0, dateOfBirth: 1 }, 2)).toEqual([
      "La misma columna no puede ser «Nombre» y «Apellidos».",
      "La misma columna no puede ser «Fecha de nacimiento» y «Grupo».",
    ]);
    expect(mappingProblems({ ...mapping, familyName: 7, dateOfBirth: 1, group: null }, 2)).toEqual([
      "La columna elegida para «Apellidos» no existe en el fichero.",
    ]);
  });
});

describe("fechas, emails, teléfonos y parentesco", () => {
  it.each([
    ["15/03/2016", "2016-03-15"],
    ["5/3/2016", "2016-03-05"],
    ["05-03-2016", "2016-03-05"],
    ["05.03.2016", "2016-03-05"],
    ["2016-03-05", "2016-03-05"],
  ])("acepta %s", (value, expected) => {
    expect(parseImportDate(value, TODAY)).toEqual({ ok: true, value: expected });
  });

  it.each([
    ["05/03/16", "DATE_YEAR_AMBIGUOUS"],
    ["31/02/2016", "DATE_INVALID"],
    ["marzo 2016", "DATE_INVALID"],
    ["01/01/1899", "DATE_OUT_OF_RANGE"],
    ["12/11/2026", "DATE_IN_FUTURE"],
  ])("rechaza %s con %s", (value, code) => {
    expect(parseImportDate(value, TODAY)).toMatchObject({ ok: false, code });
  });

  it("normaliza el email y rechaza los inválidos o con prefijo de fórmula", () => {
    expect(parseImportEmail("  Tutora@Example.INVALID ")).toBe("tutora@example.invalid");
    expect(parseImportEmail("sin-arroba")).toBeNull();
    expect(parseImportEmail("=cmd@example.invalid")).toBeNull();
  });

  it("exige el teléfono en E.164 sin adivinar el prefijo", () => {
    expect(parseImportPhone("+34 600 000 000")).toBe("+34600000000");
    expect(parseImportPhone("0034 600-000-000")).toBe("+34600000000");
    expect(parseImportPhone("(+34) 600.000.000")).toBe("+34600000000");
    expect(parseImportPhone("600 000 000")).toBeNull();
  });

  it("traduce el parentesco escrito en español", () => {
    expect(parseRelationship("Madre")).toBe("parent");
    expect(parseRelationship("PADRE")).toBe("parent");
    expect(parseRelationship("Tutora legal")).toBe("legal_guardian");
    expect(parseRelationship("Familia de acogida")).toBe("foster_guardian");
    expect(parseRelationship("Abuela")).toBe("other");
    expect(parseRelationship("Vecina")).toBeNull();
  });
});

describe("validación de una fila", () => {
  const mapping = deriveImportMapping(TEMPLATE_HEADERS);

  it("normaliza una fila completa sin avisos", () => {
    const row = validateImportRow(
      ["  Lucía ", "Sintética  Prueba", "15/03/2016", "Iniciación", "Marta", "Prueba", "Marta@Example.invalid", "+34 600 111 222", "Madre"],
      mapping,
      2,
      TODAY
    );
    expect(row).toEqual({
      row: 2,
      givenName: "Lucía",
      familyName: "Sintética Prueba",
      dateOfBirth: "2016-03-15",
      group: "Iniciación",
      guardian: {
        givenName: "Marta",
        familyName: "Prueba",
        email: "marta@example.invalid",
        phone: "+34600111222",
        relationship: "parent",
      },
      issues: [],
    });
  });

  it("señala cada campo que falta o no es válido, con mensajes en español", () => {
    const row = validateImportRow(["", "=HYPERLINK(\"x\")", "32/01/2016", "", "", "", "no-es-email", "600", ""], mapping, 7, TODAY);
    expect(row.issues.map((item) => [item.severity, item.field, item.code])).toEqual([
      ["error", "givenName", "REQUIRED"],
      ["error", "familyName", "FORMULA_LIKE"],
      ["error", "dateOfBirth", "DATE_INVALID"],
      ["error", "guardianGivenName", "REQUIRED"],
      ["error", "guardianFamilyName", "REQUIRED"],
      ["error", "guardianEmail", "EMAIL_INVALID"],
      ["error", "guardianPhone", "PHONE_INVALID"],
      ["warning", "guardianRelationship", "RELATIONSHIP_DEFAULT"],
    ]);
    expect(row.issues[0]!.message).toBe("Falta el nombre.");
  });

  it("parte el nombre completo del tutor si no hay columna de apellidos, con aviso", () => {
    const row = validateImportRow(
      ["Ana", "Prueba", "2015-01-20", "", "Marta Prueba Sintética", "", "", "", "Vecina"],
      mapping,
      3,
      TODAY
    );
    expect(row.guardian).toMatchObject({ givenName: "Marta", familyName: "Prueba Sintética", relationship: "other" });
    expect(row.issues.map((item) => item.code)).toEqual(["GUARDIAN_NAME_SPLIT", "RELATIONSHIP_OTHER"]);
    expect(row.issues.every((item) => item.severity === "warning")).toBe(true);
  });

  it("sin datos de tutor no crea tutor", () => {
    const row = validateImportRow(["Ana", "Prueba", "2015-01-20", "", "", "", "", "", ""], mapping, 4, TODAY);
    expect(row.guardian).toBeNull();
    expect(row.issues).toEqual([]);
  });

  it("compara duplicados sin mayúsculas, tildes ni signos", () => {
    expect(athleteDuplicateKey({ givenName: "Lucía", familyName: "Sintética-Prueba", dateOfBirth: "2016-03-15" })).toBe(
      athleteDuplicateKey({ givenName: "LUCIA", familyName: "sintetica prueba", dateOfBirth: "2016-03-15" })
    );
    expect(athleteDuplicateKey({ givenName: "Lucía", familyName: "Prueba", dateOfBirth: "2016-03-15" })).not.toBe(
      athleteDuplicateKey({ givenName: "Lucía", familyName: "Prueba", dateOfBirth: "2016-03-16" })
    );
  });
});

describe("ficheros que genera la pantalla", () => {
  it("la plantilla solo trae los títulos, con BOM y separada por punto y coma", () => {
    expect(athleteImportTemplateCsv()).toBe(`﻿${TEMPLATE_HEADERS.join(";")}\r\n`);
  });

  it("neutraliza las fórmulas al reexportar y entrecomilla separadores", () => {
    expect(escapeCsvCell("=1+1")).toBe("'=1+1");
    expect(escapeCsvCell("+34600000000")).toBe("'+34600000000");
    expect(escapeCsvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(escapeCsvCell("Pérez; García")).toBe('"Pérez; García"');
    expect(escapeCsvCell('Dice "hola"')).toBe('"Dice ""hola"""');
    const report = athleteImportIssuesCsv([
      { row: 5, values: { givenName: "=cmd", familyName: "Prueba", dateOfBirth: null, group: null }, messages: ["Error"] },
    ]);
    expect(report).toContain("5;'=cmd;Prueba;;;Error");
  });
});
