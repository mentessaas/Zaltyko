/**
 * O4 · Qué hace la importación con cada fila frente a lo que ya hay en la
 * academia. La clasificación es pura y la comparten la vista previa y la
 * confirmación. Datos sintéticos.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

import { classifyImportRows } from "@/modules/athlete-import/application/athlete-import-service";
import {
  deriveImportMapping,
  validateImportRow,
} from "@/modules/athlete-import/domain/athlete-import-rows";

const mapping = deriveImportMapping([
  "Nombre",
  "Apellidos",
  "Fecha de nacimiento",
  "Grupo",
  "Nombre del tutor",
  "Apellidos del tutor",
  "Email del tutor",
  "Teléfono del tutor",
  "Parentesco",
]);

function rows(...cells: string[][]) {
  return cells.map((row, index) => validateImportRow(row, mapping, index + 2, "2026-11-11"));
}

const site = "10000000-0000-4000-8000-000000000001";
const otherSite = "10000000-0000-4000-8000-000000000002";
const group = (overrides: Record<string, unknown> = {}) => ({
  groupId: "20000000-0000-4000-8000-000000000001",
  name: "Iniciación",
  locationId: site,
  capacity: null as number | null,
  occupancy: 0,
  localDate: "2026-11-11",
  ...overrides,
});

const emptyContext = {
  groups: [group()],
  athletes: [] as Array<{ givenName: string; familyName: string; dateOfBirth: string | null; isActive: boolean }>,
  contacts: [] as Array<{ guardianId: string; kind: "email" | "phone"; value: string; familyIds: string[] }>,
  usage: { current: 0, limit: 30 as number | null, readOnly: false },
};
const everySite = { allLocations: true, locationIds: new Set<string>() };

function summary(result: ReturnType<typeof classifyImportRows>) {
  return result.map((item) => ({
    row: item.preview.row,
    status: item.preview.status,
    codes: item.preview.issues.map((entry) => entry.code),
  }));
}

describe("duplicados", () => {
  it("salta la segunda aparición en el fichero y lo que ya existe en la academia, archivado o sin fecha", () => {
    const result = classifyImportRows(
      rows(
        ["Lucía", "Prueba", "15/03/2016"],
        ["LUCIA", "prueba", "2016-03-15"],
        ["Ana", "Sintética", "01/02/2015"],
        ["Bea", "Sintética", "01/02/2015"],
        ["Carla", "Sintética", "02/02/2015"]
      ),
      {
        ...emptyContext,
        athletes: [
          { givenName: "Ana", familyName: "Sintética", dateOfBirth: "2015-02-01", isActive: true },
          { givenName: "Bea", familyName: "Sintética", dateOfBirth: "2015-02-01", isActive: false },
          { givenName: "Carla", familyName: "Sintética", dateOfBirth: null, isActive: true },
        ],
      },
      everySite
    );
    expect(summary(result)).toEqual([
      { row: 2, status: "create", codes: [] },
      { row: 3, status: "duplicate", codes: ["DUPLICATE_IN_FILE"] },
      { row: 4, status: "duplicate", codes: ["DUPLICATE_EXISTING"] },
      { row: 5, status: "duplicate", codes: ["DUPLICATE_EXISTING"] },
      { row: 6, status: "duplicate", codes: ["DUPLICATE_POSSIBLE"] },
    ]);
    expect(result[3]!.preview.issues[0]!.message).toContain("archivada");
    expect(result[1]!.plan).toBeNull();
  });

  it("no considera duplicada a otra gimnasta con el mismo nombre y otra fecha", () => {
    const result = classifyImportRows(rows(["Lucía", "Prueba", "15/03/2016"]), {
      ...emptyContext,
      athletes: [{ givenName: "Lucía", familyName: "Prueba", dateOfBirth: "2017-03-15", isActive: true }],
    }, everySite);
    expect(summary(result)).toEqual([{ row: 2, status: "create", codes: [] }]);
  });
});

describe("grupos y sedes", () => {
  it("encuentra el grupo sin mayúsculas ni tildes y rechaza los desconocidos o repetidos", () => {
    const result = classifyImportRows(
      rows(
        ["Lucía", "Prueba", "15/03/2016", "iniciacion"],
        ["Ana", "Prueba", "15/03/2016", "Competición"],
        ["Bea", "Prueba", "15/03/2016", "Base"]
      ),
      {
        ...emptyContext,
        groups: [
          group(),
          group({ groupId: "20000000-0000-4000-8000-000000000002", name: "Base" }),
          group({ groupId: "20000000-0000-4000-8000-000000000003", name: "BASE", locationId: otherSite }),
        ],
      },
      everySite
    );
    expect(summary(result)).toEqual([
      { row: 2, status: "create", codes: [] },
      { row: 3, status: "error", codes: ["GROUP_NOT_FOUND"] },
      { row: 4, status: "error", codes: ["GROUP_AMBIGUOUS"] },
    ]);
    expect(result[0]!.plan?.group?.groupId).toBe("20000000-0000-4000-8000-000000000001");
  });

  it("con acceso a algunas sedes solo ve sus grupos y exige grupo en cada fila", () => {
    const result = classifyImportRows(
      rows(
        ["Lucía", "Prueba", "15/03/2016", "Iniciación"],
        ["Ana", "Prueba", "15/03/2016", "Otra sede"],
        ["Bea", "Prueba", "15/03/2016", ""]
      ),
      {
        ...emptyContext,
        groups: [group(), group({ groupId: "20000000-0000-4000-8000-000000000004", name: "Otra sede", locationId: otherSite })],
      },
      { allLocations: false, locationIds: new Set([site]) }
    );
    expect(summary(result)).toEqual([
      { row: 2, status: "create", codes: [] },
      { row: 3, status: "error", codes: ["GROUP_NOT_FOUND"] },
      { row: 4, status: "error", codes: ["GROUP_REQUIRED"] },
    ]);
  });

  it("no llena un grupo por encima de su capacidad", () => {
    const result = classifyImportRows(
      rows(
        ["Lucía", "Prueba", "15/03/2016", "Iniciación"],
        ["Ana", "Prueba", "15/03/2016", "Iniciación"],
        ["Bea", "Prueba", "15/03/2016", ""]
      ),
      { ...emptyContext, groups: [group({ capacity: 3, occupancy: 2 })] },
      everySite
    );
    expect(summary(result)).toEqual([
      { row: 2, status: "create", codes: [] },
      { row: 3, status: "skipped", codes: ["GROUP_FULL"] },
      { row: 4, status: "create", codes: [] },
    ]);
  });
});

describe("tutores y familias", () => {
  it("agrupa a las hermanas por email o teléfono del tutor y reutiliza la familia de un tutor existente", () => {
    const result = classifyImportRows(
      rows(
        ["Lucía", "Prueba", "15/03/2016", "", "Marta", "Prueba", "marta@example.invalid", "", "Madre"],
        ["Ana", "Prueba", "16/03/2016", "", "Marta", "Prueba", "", "", "Madre"],
        ["Bea", "Prueba", "17/03/2016", "", "Marta", "Prueba", "MARTA@example.invalid", "+34600000001", "Madre"],
        ["Carla", "Prueba", "18/03/2016", "", "Pilar", "Prueba", "", "+34600000001", "Madre"],
        ["Dana", "Prueba", "19/03/2016", "", "Rosa", "Prueba", "rosa@example.invalid", "", "Madre"]
      ),
      {
        ...emptyContext,
        contacts: [
          {
            guardianId: "30000000-0000-4000-8000-000000000001",
            kind: "email",
            value: "rosa@example.invalid",
            familyIds: ["40000000-0000-4000-8000-000000000001"],
          },
        ],
      },
      everySite
    );
    expect(summary(result)).toEqual([
      { row: 2, status: "create", codes: [] },
      { row: 3, status: "create", codes: [] },
      { row: 4, status: "create", codes: ["SIBLING"] },
      { row: 5, status: "create", codes: ["SIBLING"] },
      { row: 6, status: "create", codes: ["GUARDIAN_EXISTING"] },
    ]);
    const plans = result.map((item) => item.plan!);
    // Without email or phone, a tutor is never merged with another row.
    expect(plans[1]!.newFamilyKey).not.toBe(plans[0]!.newFamilyKey);
    expect(plans[2]!.newFamilyKey).toBe(plans[0]!.newFamilyKey);
    // Same phone as row 4: the same new family.
    expect(plans[3]!.newFamilyKey).toBe(plans[0]!.newFamilyKey);
    expect(plans[4]!.existingFamilyId).toBe("40000000-0000-4000-8000-000000000001");
  });

  it("no adivina la familia de un tutor existente con varias familias o con contactos de dos tutores", () => {
    const result = classifyImportRows(
      rows(
        ["Lucía", "Prueba", "15/03/2016", "", "Marta", "Prueba", "marta@example.invalid", "", "Madre"],
        ["Ana", "Prueba", "16/03/2016", "", "Rosa", "Prueba", "rosa@example.invalid", "+34600000009", "Madre"]
      ),
      {
        ...emptyContext,
        contacts: [
          { guardianId: "g1", kind: "email", value: "marta@example.invalid", familyIds: ["f1", "f2"] },
          { guardianId: "g2", kind: "email", value: "rosa@example.invalid", familyIds: ["f3"] },
          { guardianId: "g3", kind: "phone", value: "+34600000009", familyIds: ["f4"] },
        ],
      },
      everySite
    );
    expect(summary(result)).toEqual([
      { row: 2, status: "error", codes: ["GUARDIAN_FAMILY_UNCLEAR"] },
      { row: 3, status: "error", codes: ["GUARDIAN_CONFLICT"] },
    ]);
  });
});

describe("límite del plan", () => {
  it("crea solo hasta el límite y salta el resto en el orden del fichero", () => {
    const result = classifyImportRows(
      rows(
        ["Lucía", "Prueba", "15/03/2016"],
        ["Ana", "Prueba", "15/03/2016"],
        ["Ana", "Prueba", "15/03/2016"],
        ["Bea", "Prueba", "15/03/2016"]
      ),
      { ...emptyContext, usage: { current: 28, limit: 30, readOnly: false } },
      everySite
    );
    expect(summary(result)).toEqual([
      { row: 2, status: "create", codes: [] },
      { row: 3, status: "create", codes: [] },
      { row: 4, status: "duplicate", codes: ["DUPLICATE_IN_FILE"] },
      { row: 5, status: "skipped", codes: ["PLAN_LIMIT"] },
    ]);
    expect(result[3]!.preview.issues[0]!.message).toBe(
      "Supera el límite de 30 gimnastas de tu plan. Amplía el plan para importarla."
    );
  });

  it("sin límite crea todas las filas válidas", () => {
    const result = classifyImportRows(
      rows(["Lucía", "Prueba", "15/03/2016"], ["Ana", "Prueba", "15/03/2016"]),
      { ...emptyContext, usage: { current: 500, limit: null, readOnly: false } },
      everySite
    );
    expect(result.every((item) => item.preview.status === "create")).toBe(true);
  });
});
