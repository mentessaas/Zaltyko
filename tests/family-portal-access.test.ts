/**
 * P2 #16 · Portal de familias: matriz pura de autorización.
 *
 * buildFamilyPortalAccess es la última barrera: aunque una consulta devolviera
 * filas de más, solo quedan visibles las gimnastas unidas a la cuenta por
 * tutor activo → vínculo activo con permiso → familia activa → miembro
 * vigente → gimnasta activa, todo dentro de la misma academia.
 */
import { describe, expect, it } from "vitest";

import {
  buildFamilyPortalAccess,
  familyAthleteDisplayName,
  hasFamilyPortalData,
  isMemberOpenOn,
  localIsoDate,
  requireVisibleFamilyAthlete,
  type FamilyPortalGuardianRow,
  type FamilyPortalLinkRow,
} from "@/modules/family-portal/domain/family-portal-access";

const ORG = "a2000000-0000-4000-8000-000000000001";
const OTHER_ORG = "b2000000-0000-4000-8000-000000000001";
const GUARDIAN = "a2000000-0000-4000-8000-000000000021";
const OTHER_GUARDIAN = "a2000000-0000-4000-8000-000000000022";
const FAMILY = "a2000000-0000-4000-8000-000000000031";
const ATHLETE = "a2000000-0000-4000-8000-000000000041";
const USER = "f2000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-11-10T09:00:00.000Z");

const guardian: FamilyPortalGuardianRow = {
  guardianId: GUARDIAN,
  organizationId: ORG,
  organizationName: "Club Sintético",
  organizationTimezone: "Europe/Madrid",
  defaultCurrency: "EUR",
  guardianActive: true,
};

function link(overrides: Partial<FamilyPortalLinkRow> = {}, member: Partial<NonNullable<FamilyPortalLinkRow["member"]>> | null = {}): FamilyPortalLinkRow {
  return {
    organizationId: ORG,
    guardianId: GUARDIAN,
    familyId: FAMILY,
    linkActive: true,
    canViewAthletes: true,
    familyActive: true,
    member:
      member === null
        ? null
        : {
            organizationId: ORG,
            athleteId: ATHLETE,
            startsOn: "2026-09-01",
            endsOn: null,
            athleteActive: true,
            givenName: "Ana",
            familyName: "Sintética Prueba",
            preferredName: null,
            ...member,
          },
    ...overrides,
  };
}

function expectNotFound(run: () => unknown) {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toMatchObject({ code: "NOT_FOUND", status: 404 });
}

function access(links: FamilyPortalLinkRow[], guardians = [guardian]) {
  return buildFamilyPortalAccess({ userId: USER, guardians, links, now: NOW });
}

describe("buildFamilyPortalAccess", () => {
  it("muestra a la gimnasta con la cadena completa y la familia para las cuotas", () => {
    const result = access([link()]);
    expect(result.academies).toHaveLength(1);
    expect(result.academies[0]).toMatchObject({
      organizationId: ORG,
      familyIds: [FAMILY],
      athletes: [{ athleteId: ATHLETE, displayName: "Ana Sintética" }],
    });
    expect(hasFamilyPortalData(result)).toBe(true);
  });

  it.each([
    ["tutor inactivo", [link()], [{ ...guardian, guardianActive: false }], false, false],
    ["vínculo inactivo", [link({ linkActive: false })], [guardian], false, false],
    ["familia inactiva", [link({ familyActive: false })], [guardian], false, false],
    ["sin permiso para ver gimnastas", [link({ canViewAthletes: false })], [guardian], false, true],
    ["miembro con baja", [link({}, { endsOn: "2026-11-09" })], [guardian], false, true],
    ["miembro que empieza mañana", [link({}, { startsOn: "2026-11-11" })], [guardian], false, true],
    ["gimnasta archivada", [link({}, { athleteActive: false })], [guardian], false, true],
    ["familia sin gimnastas", [link({}, null)], [guardian], false, true],
    ["vínculo de otro tutor", [link({ guardianId: OTHER_GUARDIAN })], [guardian], false, false],
    ["vínculo de otra academia", [link({ organizationId: OTHER_ORG })], [guardian], false, false],
    ["miembro de otra academia", [link({}, { organizationId: OTHER_ORG })], [guardian], false, true],
  ])("%s: no muestra la gimnasta", (_label, links, guardians, athleteVisible, familyVisible) => {
    const result = access(links, guardians);
    const athletes = result.academies.flatMap((item) => item.athletes);
    const familyIds = result.academies.flatMap((item) => item.familyIds);
    expect(athletes.some((item) => item.athleteId === ATHLETE)).toBe(athleteVisible);
    expect(familyIds.includes(FAMILY)).toBe(familyVisible);
    expectNotFound(() => requireVisibleFamilyAthlete(result, ATHLETE));
  });

  it("un miembro que termina hoy sigue visible hoy (fecha local de la academia)", () => {
    // 2026-11-09T23:30Z ya es día 10 en Madrid.
    const result = buildFamilyPortalAccess({
      userId: USER,
      guardians: [guardian],
      links: [link({}, { endsOn: "2026-11-10" })],
      now: new Date("2026-11-09T23:30:00.000Z"),
    });
    expect(result.academies[0].athletes).toHaveLength(1);
  });

  it("no duplica una gimnasta que llega por dos familias", () => {
    const second = "a2000000-0000-4000-8000-000000000032";
    const result = access([link(), link({ familyId: second })]);
    expect(result.academies[0].athletes).toHaveLength(1);
    expect(result.academies[0].familyIds).toEqual([FAMILY, second].sort());
  });

  it("sin tutores no hay academias ni datos", () => {
    const result = access([link()], []);
    expect(result.academies).toEqual([]);
    expect(hasFamilyPortalData(result)).toBe(false);
  });
});

describe("requireVisibleFamilyAthlete", () => {
  const result = access([link()]);

  it("devuelve la academia y la gimnasta propias", () => {
    expect(requireVisibleFamilyAthlete(result, ATHLETE).academy.organizationId).toBe(ORG);
    expect(requireVisibleFamilyAthlete(result, ATHLETE.toUpperCase()).athlete.athleteId).toBe(ATHLETE);
  });

  it.each([
    ["id ajeno", "a2000000-0000-4000-8000-000000000099"],
    ["id mal formado", "no-es-un-uuid"],
    ["cadena vacía", ""],
    ["inyección", `${ATHLETE}' or '1'='1`],
  ])("%s responde 404", (_label, athleteId) => {
    expectNotFound(() => requireVisibleFamilyAthlete(result, athleteId));
  });
});

describe("datos mínimos y fechas", () => {
  it("muestra el nombre preferido y solo el primer apellido", () => {
    expect(
      familyAthleteDisplayName({ givenName: "Daniela", familyName: "Pérez López", preferredName: "Dani" })
    ).toBe("Dani Pérez");
    expect(
      familyAthleteDisplayName({ givenName: " Ana ", familyName: "Ruiz", preferredName: "  " })
    ).toBe("Ana Ruiz");
  });

  it("calcula la fecha local y la vigencia", () => {
    expect(localIsoDate(new Date("2026-11-09T23:30:00.000Z"), "Europe/Madrid")).toBe("2026-11-10");
    expect(localIsoDate(new Date("2026-11-10T03:00:00.000Z"), "America/Mexico_City")).toBe("2026-11-09");
    expect(localIsoDate(new Date("2026-11-10T03:00:00.000Z"), "Zona/Inexistente")).toBe("2026-11-10");
    expect(isMemberOpenOn({ startsOn: "2026-11-10", endsOn: null }, "2026-11-10")).toBe(true);
    expect(isMemberOpenOn({ startsOn: "2026-11-11", endsOn: null }, "2026-11-10")).toBe(false);
    expect(isMemberOpenOn({ startsOn: "2026-01-01", endsOn: "2026-11-09" }, "2026-11-10")).toBe(false);
  });
});
