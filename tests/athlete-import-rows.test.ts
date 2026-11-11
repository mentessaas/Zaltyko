/**
 * O4 · Importación de gimnastas: columnas, mapeo y validación fila a fila.
 * Todos los datos son sintéticos.
 */
import { describe, expect, it } from "vitest";

import {
  ATHLETE_IMPORT_TEMPLATE_HEADERS,
  athleteDuplicateKey,
  athleteImportIssuesCsv,
  athleteImportTemplateCsv,
  deriveImportMapping,
  escapeCsvCell,
  mappingProblems,
  nameKey,
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
    // Como en el alta manual, solo el nombre y los apellidos son obligatorios.
    expect(mappingProblems(mapping, 2)).toEqual(["Falta la columna obligatoria «Apellidos»."]);
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

  it("aplica exactamente la regla del editor de contactos: E.164 tal cual, sin adivinar ni reescribir", () => {
    expect(parseImportPhone("+34600000000")).toBe("+34600000000");
    expect(parseImportPhone(" +34600000000 ")).toBe("+34600000000");
    expect(parseImportPhone("+34 600 000 000")).toBeNull();
    expect(parseImportPhone("0034600000000")).toBeNull();
    expect(parseImportPhone("600000000")).toBeNull();
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
      ["  Lucía ", "Sintética  Prueba", "15/03/2016", "Iniciación", "Marta", "Prueba", "Marta@Example.invalid", "+34600111222", "Madre"],
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

  it("la fecha de nacimiento es opcional, como en el alta manual, con aviso", () => {
    const row = validateImportRow(["Ana", "Prueba", "", "", "", "", "", "", ""], mapping, 5, TODAY);
    expect(row.dateOfBirth).toBeNull();
    expect(row.issues).toEqual([
      expect.objectContaining({ severity: "warning", field: "dateOfBirth", code: "DATE_MISSING" }),
    ]);
  });

  it("rechaza nombres con prefijos de fórmula, también de ancho completo o tubería", () => {
    for (const name of ["=1+1", "+cmd", "@SUM(A1)", "-2", "|calc", "\uFF1D1+1", "\uFF0Bcmd"]) {
      const row = validateImportRow([name, "Prueba", "", "", "", "", "", "", ""], mapping, 6, TODAY);
      expect(row.issues.map((item) => item.code), name).toContain("FORMULA_LIKE");
    }
  });

  it("sin datos de tutor no crea tutor", () => {
    const row = validateImportRow(["Ana", "Prueba", "2015-01-20", "", "", "", "", "", ""], mapping, 4, TODAY);
    expect(row.guardian).toBeNull();
    expect(row.issues).toEqual([]);
  });

  it("no deja vacía la clave de nombres en otros alfabetos", () => {
    expect(nameKey("Анна")).toBe("анна");
    expect(nameKey("李 小龍")).toBe("李 小龍");
    expect(athleteDuplicateKey({ givenName: "Анна", familyName: "Петрова", dateOfBirth: "2016-03-15" })).not.toBe(
      athleteDuplicateKey({ givenName: "Мария", familyName: "Петрова", dateOfBirth: "2016-03-15" })
    );
    expect(nameKey("ＬＵＣÍＡ")).toBe("lucia");
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
  it("la plantilla solo trae los títulos, con el formato de fecha y teléfono, BOM y punto y coma", () => {
    expect(athleteImportTemplateCsv()).toBe(
      "\uFEFFNombre;Apellidos;Fecha de nacimiento (DD/MM/AAAA);Grupo;Nombre del tutor;Apellidos del tutor;" +
        'Email del tutor;"Teléfono del tutor (+34600000000, sin espacios)";Parentesco\r\n'
    );
  });

  it("los títulos de la plantilla, con su texto entre paréntesis, se reconocen al importar", () => {
    expect(deriveImportMapping(Object.values(ATHLETE_IMPORT_TEMPLATE_HEADERS))).toEqual(deriveImportMapping(TEMPLATE_HEADERS));
    expect(deriveImportMapping(["Nombre", "Apellidos", "Teléfono (móvil)"]).guardianPhone).toBe(2);
  });

  it("neutraliza las fórmulas al reexportar y entrecomilla separadores", () => {
    expect(escapeCsvCell("=1+1")).toBe("'=1+1");
    expect(escapeCsvCell("+34600000000")).toBe("'+34600000000");
    expect(escapeCsvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(escapeCsvCell("|calc")).toBe("'|calc");
    expect(escapeCsvCell("\uFF1D1+1")).toBe("'\uFF1D1+1");
    expect(escapeCsvCell("Pérez; García")).toBe('"Pérez; García"');
    expect(escapeCsvCell('Dice "hola"')).toBe('"Dice ""hola"""');
    const report = athleteImportIssuesCsv([
      { row: 5, values: { givenName: "=cmd", familyName: "Prueba", dateOfBirth: null, group: null }, messages: ["Error"] },
    ]);
    expect(report).toContain("5;'=cmd;Prueba;;;Error");
  });
});
