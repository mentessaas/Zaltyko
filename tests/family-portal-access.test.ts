/**
 * P2 #16 · Portal de familias: matriz pura de autorización.
 *
 * buildFamilyPortalAccess es una de las dos barreras (la otra es el `exists`
 * de cada consulta): aunque una consulta devolviera filas de más, solo quedan
 * visibles las gimnastas unidas a la cuenta por tutor activo → vínculo activo
 * con permiso → familia activa → miembro vigente → gimnasta activa, y las
 * cuotas de las familias en las que el tutor es pagador vigente. Todo dentro
 * de la misma academia, en trial o active.
 */
import { describe, expect, it } from "vitest";

import {
  buildFamilyPortalAccess,
  familyAthleteDisplayName,
  hasFamilyPortalData,
  isOpenOn,
  localIsoDate,
  requireVisibleFamilyAthlete,
  type FamilyPortalGuardianRow,
  type FamilyPortalLinkRow,
  type FamilyPortalPayerRow,
} from "@/modules/family-portal/domain/family-portal-access";

const ORG = "a2000000-0000-4000-8000-000000000001";
const OTHER_ORG = "b2000000-0000-4000-8000-000000000001";
const GUARDIAN = "a2000000-0000-4000-8000-000000000021";
const OTHER_GUARDIAN = "a2000000-0000-4000-8000-000000000022";
const FAMILY = "a2000000-0000-4000-8000-000000000031";
const SECOND_FAMILY = "a2000000-0000-4000-8000-000000000032";
const ATHLETE = "a2000000-0000-4000-8000-000000000041";
const USER = "f2000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-11-10T09:00:00.000Z");

const guardian: FamilyPortalGuardianRow = {
  guardianId: GUARDIAN,
  organizationId: ORG,
  organizationName: "Club Sintético",
  organizationStatus: "active",
  organizationTimezone: "Europe/Madrid",
  defaultCurrency: "EUR",
  guardianActive: true,
};

const payer: FamilyPortalPayerRow = {
  organizationId: ORG,
  guardianId: GUARDIAN,
  familyId: FAMILY,
  startsOn: "2026-09-01",
  endsOn: null,
};

type MemberOverrides = Partial<NonNullable<FamilyPortalLinkRow["member"]>> | null;

function link(
  overrides: Partial<Omit<FamilyPortalLinkRow, "member">> = {},
  member: MemberOverrides = {}
): FamilyPortalLinkRow {
  return {
    organizationId: ORG,
    guardianId: GUARDIAN,
    familyId: FAMILY,
    linkActive: true,
    canViewAthletes: true,
    familyActive: true,
    ...overrides,
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
  };
}

function access(
  links: FamilyPortalLinkRow[],
  options: { guardians?: FamilyPortalGuardianRow[]; payers?: FamilyPortalPayerRow[]; now?: Date } = {}
) {
  return buildFamilyPortalAccess({
    userId: USER,
    guardians: options.guardians ?? [guardian],
    links,
    payers: options.payers ?? [payer],
    now: options.now ?? NOW,
  });
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

function visibleAthleteIds(result: ReturnType<typeof access>) {
  return result.academies.flatMap((item) => item.athletes.map((athlete) => athlete.athleteId));
}

function visibleFeeFamilies(result: ReturnType<typeof access>) {
  return result.academies.flatMap((item) => item.feeFamilyIds);
}

describe("buildFamilyPortalAccess · gimnastas", () => {
  it("muestra a la gimnasta con la cadena completa, con su fecha de inicio", () => {
    const result = access([link()]);
    expect(result.academies).toEqual([
      expect.objectContaining({
        organizationId: ORG,
        feeFamilyIds: [FAMILY],
        athletes: [{ athleteId: ATHLETE, displayName: "Ana Sintética", visibleSince: "2026-09-01" }],
      }),
    ]);
    expect(hasFamilyPortalData(result)).toBe(true);
  });

  it.each([
    ["tutor inactivo", [link()], { guardians: [{ ...guardian, guardianActive: false }] }],
    ["academia suspendida", [link()], { guardians: [{ ...guardian, organizationStatus: "suspended" }] }],
    ["academia cerrada", [link()], { guardians: [{ ...guardian, organizationStatus: "closed" }] }],
    ["vínculo inactivo", [link({ linkActive: false })], {}],
    ["familia inactiva", [link({ familyActive: false })], {}],
    ["sin permiso para ver gimnastas", [link({ canViewAthletes: false })], {}],
    ["miembro con baja", [link({}, { endsOn: "2026-11-09" })], {}],
    ["miembro que empieza mañana", [link({}, { startsOn: "2026-11-11" })], {}],
    ["gimnasta archivada", [link({}, { athleteActive: false })], {}],
    ["familia sin gimnastas", [link({}, null)], {}],
    ["vínculo de otro tutor", [link({ guardianId: OTHER_GUARDIAN })], {}],
    ["vínculo de otra academia", [link({ organizationId: OTHER_ORG })], {}],
    ["miembro de otra academia", [link({}, { organizationId: OTHER_ORG })], {}],
  ] as const)("%s: no muestra la gimnasta y su id responde 404", (_label, links, options) => {
    const result = access([...links], options as Parameters<typeof access>[1]);
    expect(visibleAthleteIds(result)).not.toContain(ATHLETE);
    expectNotFound(() => requireVisibleFamilyAthlete(result, ATHLETE));
  });

  it("un miembro que termina hoy sigue visible hoy (fecha local de la academia)", () => {
    // 2026-11-09T23:30Z ya es día 10 en Madrid.
    const result = access([link({}, { endsOn: "2026-11-10" })], {
      now: new Date("2026-11-09T23:30:00.000Z"),
    });
    expect(visibleAthleteIds(result)).toEqual([ATHLETE]);
  });

  it("una gimnasta compartida por dos familias aparece una vez, visible desde el inicio más antiguo", () => {
    const result = access([
      link({}, { startsOn: "2026-10-15" }),
      link({ familyId: SECOND_FAMILY }, { startsOn: "2026-09-20" }),
    ]);
    expect(result.academies[0].athletes).toEqual([
      expect.objectContaining({ athleteId: ATHLETE, visibleSince: "2026-09-20" }),
    ]);
  });
});

describe("buildFamilyPortalAccess · cuotas (regla provisional: solo pagadores)", () => {
  it.each([
    ["pagador vigente", [link()], [payer], [FAMILY]],
    ["pagador sin permiso para ver gimnastas", [link({ canViewAthletes: false })], [payer], [FAMILY]],
    ["tutor que no es pagador", [link()], [], []],
    ["pagador con baja", [link()], [{ ...payer, endsOn: "2026-11-09" }], []],
    ["pagador que empieza mañana", [link()], [{ ...payer, startsOn: "2026-11-11" }], []],
    ["pagador con vínculo inactivo", [link({ linkActive: false })], [payer], []],
    ["pagador de familia inactiva", [link({ familyActive: false })], [payer], []],
    ["pagador de otra familia sin vínculo", [link()], [{ ...payer, familyId: SECOND_FAMILY }], []],
    ["pagador de otro tutor", [link()], [{ ...payer, guardianId: OTHER_GUARDIAN }], []],
    ["pagador en otra academia", [link()], [{ ...payer, organizationId: OTHER_ORG }], []],
  ] as const)("%s", (_label, links, payers, expected) => {
    expect(visibleFeeFamilies(access([...links], { payers: [...payers] }))).toEqual(expected);
  });

  it("oculta la academia si el tutor ni ve gimnastas ni es pagador", () => {
    const result = access([link({ canViewAthletes: false })], { payers: [] });
    expect(result.academies).toEqual([]);
    expect(hasFamilyPortalData(result)).toBe(false);
  });

  it("muestra la academia solo con cuotas si es pagador sin permiso de ver gimnastas", () => {
    const result = access([link({ canViewAthletes: false })]);
    expect(result.academies).toEqual([
      expect.objectContaining({ feeFamilyIds: [FAMILY], athletes: [] }),
    ]);
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
    expect(isOpenOn({ startsOn: "2026-11-10", endsOn: null }, "2026-11-10")).toBe(true);
    expect(isOpenOn({ startsOn: "2026-11-11", endsOn: null }, "2026-11-10")).toBe(false);
    expect(isOpenOn({ startsOn: "2026-01-01", endsOn: "2026-11-09" }, "2026-11-10")).toBe(false);
  });
});
