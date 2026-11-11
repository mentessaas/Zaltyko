/**
 * O4 · Qué hace la importación con cada fila frente a lo que ya hay en la
 * academia. La clasificación es pura y la comparten la vista previa y la
 * confirmación. Excepción revisada de la frontera athlete-import
 * (eslint.internal-boundaries.json). Datos sintéticos.
 */
import { describe, expect, it } from "vitest";

import { classifyImportRows } from "@/modules/athlete-import/application/athlete-import/classify";
import type { ExistingContact } from "@/modules/athlete-import/application/athlete-import/model";
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
const contact = (overrides: Partial<ExistingContact>): ExistingContact => ({
  guardianId: "g1",
  kind: "email",
  value: "marta@example.invalid",
  givenName: "Marta",
  familyName: "Prueba",
  familyIds: ["f1"],
  ...overrides,
});

const emptyContext = {
  groups: [group()],
  athletes: [] as Array<{ givenName: string; familyName: string; dateOfBirth: string | null; isActive: boolean }>,
  contacts: [] as ExistingContact[],
  usage: { current: 0, limit: 30 as number | null, readOnly: false },
};

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
      }
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

  it("sin fecha de nacimiento compara solo por nombre, en el fichero y en la academia", () => {
    const result = classifyImportRows(
      rows(
        ["Lucía", "Prueba", "15/03/2016"],
        ["Lucía", "Prueba", ""],
        ["Ana", "Prueba", ""],
        ["Ana", "Prueba", "2017-01-01"],
        ["Dana", "Prueba", ""],
        ["Eva", "Prueba", ""]
      ),
      {
        ...emptyContext,
        athletes: [{ givenName: "Dana", familyName: "Prueba", dateOfBirth: "2014-04-04", isActive: true }],
      }
    );
    expect(summary(result)).toEqual([
      { row: 2, status: "create", codes: [] },
      { row: 3, status: "duplicate", codes: ["DATE_MISSING", "DUPLICATE_IN_FILE_POSSIBLE"] },
      { row: 4, status: "create", codes: ["DATE_MISSING"] },
      { row: 5, status: "duplicate", codes: ["DUPLICATE_IN_FILE_POSSIBLE"] },
      { row: 6, status: "duplicate", codes: ["DATE_MISSING", "DUPLICATE_POSSIBLE"] },
      { row: 7, status: "create", codes: ["DATE_MISSING"] },
    ]);
  });

  it("no considera duplicada a otra gimnasta con el mismo nombre y otra fecha", () => {
    const result = classifyImportRows(rows(["Lucía", "Prueba", "15/03/2016"], ["Lucía", "Prueba", "16/03/2016"]), {
      ...emptyContext,
      athletes: [{ givenName: "Lucía", familyName: "Prueba", dateOfBirth: "2017-03-15", isActive: true }],
    });
    expect(summary(result)).toEqual([
      { row: 2, status: "create", codes: [] },
      { row: 3, status: "create", codes: [] },
    ]);
  });
});

describe("grupos", () => {
  it("encuentra el grupo sin mayúsculas ni tildes en cualquier sede y rechaza los desconocidos o repetidos", () => {
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
      }
    );
    expect(summary(result)).toEqual([
      { row: 2, status: "create", codes: [] },
      { row: 3, status: "error", codes: ["GROUP_NOT_FOUND"] },
      { row: 4, status: "error", codes: ["GROUP_AMBIGUOUS"] },
    ]);
    expect(result[0]!.plan?.group?.groupId).toBe("20000000-0000-4000-8000-000000000001");
  });

  it("no llena un grupo por encima de su capacidad", () => {
    const result = classifyImportRows(
      rows(
        ["Lucía", "Prueba", "15/03/2016", "Iniciación"],
        ["Ana", "Prueba", "15/03/2016", "Iniciación"],
        ["Bea", "Prueba", "15/03/2016", ""]
      ),
      { ...emptyContext, groups: [group({ capacity: 3, occupancy: 2 })] }
    );
    expect(summary(result)).toEqual([
      { row: 2, status: "create", codes: [] },
      { row: 3, status: "skipped", codes: ["GROUP_FULL"] },
      { row: 4, status: "create", codes: [] },
    ]);
  });
});

describe("tutores y familias", () => {
  it("agrupa a las hermanas por email o teléfono del tutor y reutiliza la familia de un tutor existente con el mismo nombre", () => {
    const result = classifyImportRows(
      rows(
        ["Lucía", "Prueba", "15/03/2016", "", "Marta", "Prueba", "marta@example.invalid", "", "Madre"],
        ["Ana", "Prueba", "16/03/2016", "", "Marta", "Prueba", "", "", "Madre"],
        ["Bea", "Prueba", "17/03/2016", "", "Marta", "Prueba", "MARTA@example.invalid", "+34600000001", "Madre"],
        ["Carla", "Prueba", "18/03/2016", "", "MARTA", "prueba", "", "+34600000001", "Madre"],
        ["Dana", "Prueba", "19/03/2016", "", "Rosa", "Sintética", "rosa@example.invalid", "", "Madre"]
      ),
      {
        ...emptyContext,
        contacts: [contact({ guardianId: "g9", value: "rosa@example.invalid", givenName: "Rosa", familyName: "Sintética", familyIds: ["f9"] })],
      }
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
    expect(plans[4]!.existingFamilyId).toBe("f9");
  });

  it("nunca elige: contacto compartido, contactos de dos tutores, otro nombre o varias familias son errores de fila", () => {
    const result = classifyImportRows(
      rows(
        ["Lucía", "Prueba", "15/03/2016", "", "Marta", "Prueba", "compartido@example.invalid", "", "Madre"],
        ["Ana", "Prueba", "16/03/2016", "", "Rosa", "Prueba", "rosa@example.invalid", "+34600000009", "Madre"],
        ["Bea", "Prueba", "17/03/2016", "", "Pilar", "Otra", "nora@example.invalid", "", "Madre"],
        ["Carla", "Prueba", "18/03/2016", "", "Inés", "Prueba", "ines@example.invalid", "", "Madre"]
      ),
      {
        ...emptyContext,
        contacts: [
          contact({ guardianId: "g1", value: "compartido@example.invalid" }),
          contact({ guardianId: "g2", value: "compartido@example.invalid", givenName: "Elena" }),
          contact({ guardianId: "g3", value: "rosa@example.invalid", givenName: "Rosa" }),
          contact({ guardianId: "g4", kind: "phone", value: "+34600000009", givenName: "Rosa" }),
          contact({ guardianId: "g5", value: "nora@example.invalid", givenName: "Nora", familyName: "Prueba" }),
          contact({ guardianId: "g6", value: "ines@example.invalid", givenName: "Inés", familyIds: ["f1", "f2"] }),
        ],
      }
    );
    expect(summary(result)).toEqual([
      { row: 2, status: "error", codes: ["GUARDIAN_AMBIGUOUS"] },
      { row: 3, status: "error", codes: ["GUARDIAN_CONFLICT"] },
      { row: 4, status: "error", codes: ["GUARDIAN_NAME_MISMATCH"] },
      { row: 5, status: "error", codes: ["GUARDIAN_FAMILY_UNCLEAR"] },
    ]);
    expect(result.every((item) => item.plan === null)).toBe(true);
  });

  it("no une a dos tutores distintos del fichero que comparten email", () => {
    const result = classifyImportRows(
      rows(
        ["Lucía", "Prueba", "15/03/2016", "", "Marta", "Prueba", "familia@example.invalid", "", "Madre"],
        ["Ana", "Prueba", "16/03/2016", "", "Jorge", "Prueba", "familia@example.invalid", "", "Padre"]
      ),
      emptyContext
    );
    expect(summary(result)).toEqual([
      { row: 2, status: "create", codes: [] },
      { row: 3, status: "error", codes: ["GUARDIAN_NAME_MISMATCH_IN_FILE"] },
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
      { ...emptyContext, usage: { current: 28, limit: 30, readOnly: false } }
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
    const result = classifyImportRows(rows(["Lucía", "Prueba", "15/03/2016"], ["Ana", "Prueba", "15/03/2016"]), {
      ...emptyContext,
      usage: { current: 500, limit: null, readOnly: false },
    });
    expect(result.every((item) => item.preview.status === "create")).toBe(true);
  });
});
