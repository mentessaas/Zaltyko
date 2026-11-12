import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  decodeLegacyAthleteCsv,
  detectLegacyCsvDelimiter,
  formatLegacyAthleteCsvErrors,
  normalizeLegacyAthleteCsvHeader,
  normalizeLegacyCsvDob,
  parseLegacyAthleteCsv,
} from "@/lib/athletes/legacy-import-csv";

// La plantilla se lee del propio panel para que el test falle si alguien la
// cambia sin mantener la importación compatible.
function officialTemplateCsv() {
  const panel = readFileSync(
    new URL("../src/components/athletes/ImportExportPanel.tsx", import.meta.url),
    "utf8",
  );
  const block = /const templateCsv = \[([\s\S]*?)\]/.exec(panel)?.[1];
  expect(block, "ImportExportPanel define templateCsv").toBeTruthy();
  const lines = Array.from(block!.matchAll(/"([^"]*)"/g), (match) => match[1]);
  expect(lines.length).toBeGreaterThanOrEqual(2);
  return lines.join("\n");
}

const ACADEMY_ID = "6f9619ff-8b86-4d11-b42d-00c04fc964ff";

describe("parseLegacyAthleteCsv", () => {
  it("acepta la plantilla oficial (sin columna academyId) con academyId undefined", () => {
    const template = officialTemplateCsv();
    expect(template.split("\n")[0]).not.toMatch(/academy/i);

    const result = parseLegacyAthleteCsv(template);

    expect(result.fileError).toBeNull();
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      rowNumber: 2,
      name: "Lucía Márquez",
      dob: "2010-05-14",
      status: "active",
      groupName: "Artística Femenina Base 3",
      sportConfigCode: "ES:artistic_female",
    });
    expect(result.rows[0].academyId).toBeUndefined();
    expect(result.rows[0].groupId).toBeUndefined();
    expect(result.rows[1]).toMatchObject({ rowNumber: 3, name: "Martín Ortega" });
    expect(result.rows[1].academyId).toBeUndefined();
    expect(result.rows[1].levelCode).toBeUndefined();
  });

  it("lee exportaciones de Excel con `;`, BOM UTF-8 y cabeceras en español", () => {
    const csv = [
      "﻿Nombre;Fecha de nacimiento;NIVEL;Estado;Grupo",
      "Márquez, Lucía;14/05/2010;Base 3;Activa;Base 3",
      "Ortega Martín;2011-09-02;Iniciación;;",
    ].join("\r\n");

    const result = parseLegacyAthleteCsv(csv);

    expect(result.delimiter).toBe(";");
    expect(result.fileError).toBeNull();
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      {
        rowNumber: 2,
        name: "Márquez, Lucía",
        dob: "2010-05-14",
        level: "Base 3",
        status: "active",
        groupName: "Base 3",
      },
      {
        rowNumber: 3,
        name: "Ortega Martín",
        dob: "2011-09-02",
        level: "Iniciación",
      },
    ]);
  });

  it("acepta tabulador como separador y alias como fecha_nacimiento", () => {
    const csv = "nombre\tfecha_nacimiento\tnivel\nAna Ruiz\t2012-03-04\tBase 1\n";
    const result = parseLegacyAthleteCsv(csv);
    expect(result.delimiter).toBe("\t");
    expect(result.rows).toEqual([
      { rowNumber: 2, name: "Ana Ruiz", dob: "2012-03-04", level: "Base 1" },
    ]);
  });

  it("ignora filas vacías o solo con separadores sin descolocar los números de fila", () => {
    const csv = ["name,dob,level,status,groupName", "Ana,,,,", ",,,,", "", " , , , , ", "Bea,,,,"].join(
      "\n",
    );

    const result = parseLegacyAthleteCsv(csv);

    expect(result.errors).toEqual([]);
    expect(result.rows.map((row) => [row.rowNumber, row.name])).toEqual([
      [2, "Ana"],
      [6, "Bea"],
    ]);
  });

  it("devuelve errores por fila con el número de línea humano (cabecera = 1)", () => {
    const csv = [
      "name,academyId,status",
      "Ana,,active",
      ",,active",
      "Bea,,",
      "Carla,no-es-un-uuid,",
      "Dana,,desconocido",
    ].join("\n");

    const result = parseLegacyAthleteCsv(csv);

    expect(result.fileError).toBeNull();
    expect(result.rows.map((row) => row.name)).toEqual(["Ana", "Bea"]);
    expect(result.errors).toEqual([
      { row: 3, field: "name", message: "falta el nombre" },
      { row: 5, field: "academyId", message: expect.stringMatching(/^academia no válida/) },
      { row: 6, field: "status", message: expect.stringMatching(/^estado no válido/) },
    ]);
    // Ningún mensaje repite valores de la fila (datos personales).
    expect(JSON.stringify(result.errors)).not.toContain("Carla");
    expect(JSON.stringify(result.errors)).not.toContain("no-es-un-uuid");

    const message = formatLegacyAthleteCsvErrors(result.errors);
    expect(message).toMatch(
      /^Revisa 3 filas: Fila 3: falta el nombre; Fila 5: academia no válida.*; Fila 6: estado no válido/,
    );
  });

  it("usa la columna academia solo si contiene un UUID", () => {
    const csv = ["nombre,academia", "Ana,Club Norte", `Bea,${ACADEMY_ID}`].join("\n");
    const result = parseLegacyAthleteCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows[0].academyId).toBeUndefined();
    expect(result.rows[1].academyId).toBe(ACADEMY_ID);
  });

  it("explica qué columnas se esperan si falta la de nombre", () => {
    const result = parseLegacyAthleteCsv("apellido,dob\nRuiz,2010-01-01\n");
    expect(result.rows).toEqual([]);
    expect(result.fileError?.code).toBe("MISSING_NAME_COLUMN");
    expect(result.fileError?.message).toMatch(/Falta la columna de nombre/);
    expect(result.fileError?.message).toMatch(/Columnas esperadas: nombre \(o name\)/);
    expect(result.fileError?.message).toMatch(/fecha de nacimiento/);
  });

  it("devuelve un error de archivo en español si el CSV no se puede leer", () => {
    const result = parseLegacyAthleteCsv('name,dob\n"Ana,2010-01-01\n');
    expect(result.rows).toEqual([]);
    expect(result.fileError?.code).toBe("INVALID_CSV");
    expect(result.fileError?.message).toMatch(/^No pudimos leer el archivo\. Guárdalo como CSV/);
  });

  it("valida fechas DD/MM/AAAA sin intercambiar día y mes", () => {
    expect(normalizeLegacyCsvDob("05/04/2010")).toEqual({ value: "2010-04-05" });
    expect(normalizeLegacyCsvDob("2010-04-05")).toEqual({ value: "2010-04-05" });
    expect(normalizeLegacyCsvDob("31/02/2010")).toHaveProperty("error");
    expect(normalizeLegacyCsvDob("05/04/10")).toHaveProperty("error");

    const result = parseLegacyAthleteCsv("nombre;nacimiento\nAna;31/02/2010\n");
    expect(result.errors).toEqual([
      { row: 2, field: "dob", message: expect.stringMatching(/^fecha de nacimiento no válida/) },
    ]);
  });
});

describe("helpers de la importación clásica", () => {
  it.each([
    ["name", "name"],
    ["Nombre", "name"],
    [" NOMBRE ", "name"],
    ["Fecha de nacimiento", "dob"],
    ["fecha_nacimiento", "dob"],
    ["Nacimiento", "dob"],
    ["DOB", "dob"],
    ["birthdate", "dob"],
    ["Nivel", "level"],
    ["Estado", "status"],
    ["Grupo", "groupName"],
    ["group_name", "groupName"],
    ["Academia", "academyId"],
    ["academy", "academyId"],
    ["academy_id", "academyId"],
    ["﻿name", "name"],
    ["columna desconocida", null],
  ])("normaliza la cabecera %j", (header, field) => {
    expect(normalizeLegacyAthleteCsvHeader(header)).toBe(field);
  });

  it("detecta el separador por la cabecera, ignorando comas entre comillas", () => {
    expect(detectLegacyCsvDelimiter("name,dob\n")).toBe(",");
    expect(detectLegacyCsvDelimiter("﻿nombre;fecha\n")).toBe(";");
    expect(detectLegacyCsvDelimiter('"apellidos, nombre";fecha\n')).toBe(";");
    expect(detectLegacyCsvDelimiter("nombre\tfecha\n")).toBe("\t");
    expect(detectLegacyCsvDelimiter("nombre\n")).toBe(",");
  });

  it("lee CSV guardados por Excel en Latin-1 sin estropear tildes", () => {
    const latin1 = Buffer.from("nombre\nLucía Núñez\n", "latin1");
    expect(decodeLegacyAthleteCsv(latin1)).toContain("Lucía Núñez");
    const utf8 = Buffer.from("nombre\nLucía Núñez\n", "utf8");
    expect(decodeLegacyAthleteCsv(utf8)).toContain("Lucía Núñez");
  });

  it("resume pocas filas y cuenta el resto", () => {
    const errors = Array.from({ length: 7 }, (_, index) => ({
      row: index + 2,
      field: "name" as const,
      message: "falta el nombre",
    }));
    const message = formatLegacyAthleteCsvErrors(errors);
    expect(message).toMatch(/^Revisa 7 filas: Fila 2: falta el nombre;/);
    expect(message).toContain("y 2 filas más");
    expect(formatLegacyAthleteCsvErrors(errors.slice(0, 1))).toMatch(/^Revisa 1 fila: Fila 2/);
  });
});
