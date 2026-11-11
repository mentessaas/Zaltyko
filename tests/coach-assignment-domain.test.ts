import { describe, expect, it } from "vitest";

import {
  MAX_COACHES_PER_ASSIGNMENT,
  SUBSTITUTION_REASONS,
  SUBSTITUTION_REASON_LABELS,
  addedStaffProfileIds,
  classCoachesQuerySchema,
  coachDisplayName,
  isCoachAssignmentManager,
  isSubstitution,
  normalizeStaffProfileIds,
  partitionAssignedFirst,
  removedStaffProfileIds,
  sameStaffSet,
  sessionCoachesQuerySchema,
  setClassCoachesCommandSchema,
  setSessionCoachesCommandSchema,
  sortCoaches,
  substitutionReasonLabel,
} from "@/modules/coach-assignment/domain/coach-assignment";

const ORG = "a0000000-0000-4000-8000-000000000001";
const SITE = "a0000000-0000-4000-8000-000000000002";
const REQUEST = "a0000000-0000-4000-8000-000000000003";
const ANA = "b0000000-0000-4000-8000-00000000000a";
const BEA = "b0000000-0000-4000-8000-00000000000b";
const CARLA = "b0000000-0000-4000-8000-00000000000c";

describe("query params (GET)", () => {
  it("la sede de la ficha de clase es opcional y acepta null, como URLSearchParams", () => {
    expect(classCoachesQuerySchema.parse({ organizationId: ORG })).toEqual({ organizationId: ORG });
    expect(classCoachesQuerySchema.parse({ organizationId: ORG, locationId: null })).toEqual({
      organizationId: ORG,
      locationId: null,
    });
    expect(classCoachesQuerySchema.parse({ organizationId: ORG, locationId: SITE }).locationId).toBe(SITE);
  });

  it("rechaza parámetros desconocidos o mal formados", () => {
    expect(classCoachesQuerySchema.safeParse({ organizationId: ORG, extra: "1" }).success).toBe(false);
    expect(classCoachesQuerySchema.safeParse({ organizationId: "no" }).success).toBe(false);
    expect(sessionCoachesQuerySchema.safeParse({ organizationId: ORG }).success).toBe(false);
    expect(sessionCoachesQuerySchema.safeParse({ organizationId: ORG, locationId: SITE }).success).toBe(true);
  });
});

describe("órdenes de escritura", () => {
  const base = { organizationId: ORG, locationId: SITE, clientRequestId: REQUEST };

  it("acepta una lista vacía (sin titular) y hasta el máximo", () => {
    expect(setClassCoachesCommandSchema.safeParse({ ...base, staffProfileIds: [], expectedStaffProfileIds: [] }).success).toBe(true);
    const many = Array.from({ length: MAX_COACHES_PER_ASSIGNMENT }, (_, index) =>
      `c0000000-0000-4000-8000-${String(index).padStart(12, "0")}`
    );
    expect(setClassCoachesCommandSchema.safeParse({ ...base, staffProfileIds: many, expectedStaffProfileIds: [] }).success).toBe(true);
    const tooMany = [...many, "c0000000-0000-4000-8000-999999999999"];
    expect(setClassCoachesCommandSchema.safeParse({ ...base, staffProfileIds: tooMany, expectedStaffProfileIds: [] }).success).toBe(false);
  });

  it("rechaza ids repetidos, también si solo cambia la caja", () => {
    expect(
      setClassCoachesCommandSchema.safeParse({ ...base, staffProfileIds: [ANA, ANA.toUpperCase()], expectedStaffProfileIds: [] }).success
    ).toBe(false);
  });

  it("la clase admite sede null u omitida; la sesión la exige", () => {
    expect(
      setClassCoachesCommandSchema.safeParse({ ...base, locationId: null, staffProfileIds: [], expectedStaffProfileIds: [] }).success
    ).toBe(true);
    expect(
      setSessionCoachesCommandSchema.safeParse({
        organizationId: ORG,
        clientRequestId: REQUEST,
        staffProfileIds: [],
        expectedStaffProfileIds: [],
      }).success
    ).toBe(false);
  });

  it("el motivo de sustitución es un código cerrado, opcional y anulable, sin texto libre", () => {
    const command = { ...base, staffProfileIds: [ANA], expectedStaffProfileIds: [BEA] };
    for (const reason of SUBSTITUTION_REASONS) {
      expect(setSessionCoachesCommandSchema.safeParse({ ...command, reason }).success).toBe(true);
    }
    expect(setSessionCoachesCommandSchema.safeParse({ ...command, reason: null }).success).toBe(true);
    expect(setSessionCoachesCommandSchema.safeParse(command).success).toBe(true);
    expect(setSessionCoachesCommandSchema.safeParse({ ...command, reason: "Baja por lesión" }).success).toBe(false);
    expect(setSessionCoachesCommandSchema.safeParse({ ...command, note: "texto" }).success).toBe(false);
  });

  it("exige clientRequestId y la lista esperada", () => {
    expect(setSessionCoachesCommandSchema.safeParse({ organizationId: ORG, locationId: SITE, staffProfileIds: [] }).success).toBe(false);
  });
});

describe("reglas de dominio", () => {
  it("compara listas como conjuntos, sin orden ni mayúsculas", () => {
    expect(normalizeStaffProfileIds([BEA, ANA.toUpperCase(), ANA])).toEqual([ANA, BEA]);
    expect(sameStaffSet([ANA, BEA], [BEA, ANA])).toBe(true);
    expect(sameStaffSet([ANA], [ANA, BEA])).toBe(false);
    expect(sameStaffSet([], [])).toBe(true);
  });

  it("calcula altas y bajas para validar solo a quien entra", () => {
    expect(addedStaffProfileIds([ANA, BEA], [BEA, CARLA])).toEqual([CARLA]);
    expect(removedStaffProfileIds([ANA, BEA], [BEA, CARLA])).toEqual([ANA]);
    expect(addedStaffProfileIds([ANA], [ANA])).toEqual([]);
  });

  it("hay sustitución solo cuando la lista difiere de las titulares", () => {
    expect(isSubstitution([ANA], [ANA])).toBe(false);
    expect(isSubstitution([BEA], [ANA])).toBe(true);
    expect(isSubstitution([ANA, BEA], [ANA])).toBe(true);
    // Sin nadie cuando la clase tiene titular: también es una sustitución.
    expect(isSubstitution([], [ANA])).toBe(true);
    expect(isSubstitution([], [])).toBe(false);
  });

  it("solo la dirección, administración y coordinación asignan", () => {
    expect(isCoachAssignmentManager("owner")).toBe(true);
    expect(isCoachAssignmentManager("admin")).toBe(true);
    expect(isCoachAssignmentManager("manager")).toBe(true);
    expect(isCoachAssignmentManager("coach")).toBe(false);
    expect(isCoachAssignmentManager("parent")).toBe(false);
  });

  it("muestra el nombre preferido si existe y ordena por nombre visible", () => {
    expect(coachDisplayName({ givenName: "María José", familyName: "Ruiz", preferredName: "Majo" })).toBe("Majo Ruiz");
    expect(coachDisplayName({ givenName: "Ana", familyName: "López", preferredName: "  " })).toBe("Ana López");
    expect(
      sortCoaches([
        { staffProfileId: BEA, name: "Úrsula Gil" },
        { staffProfileId: ANA, name: "ana Pérez" },
      ]).map((coach) => coach.name)
    ).toEqual(["ana Pérez", "Úrsula Gil"]);
  });

  it("Hoy de la entrenadora: sus sesiones primero, sin perder ni añadir ninguna", () => {
    const sessions = [
      { id: "1", assignedToViewer: false },
      { id: "2", assignedToViewer: true },
      { id: "3" },
      { id: "4", assignedToViewer: true },
    ];
    const { assigned, others } = partitionAssignedFirst(sessions);
    expect(assigned.map((session) => session.id)).toEqual(["2", "4"]);
    expect(others.map((session) => session.id)).toEqual(["1", "3"]);
    expect(assigned.length + others.length).toBe(sessions.length);
  });

  it("traduce los motivos al español", () => {
    expect(SUBSTITUTION_REASON_LABELS).toEqual({
      absence: "Ausencia",
      reinforcement: "Refuerzo",
      one_off_change: "Cambio puntual",
      other: "Otro motivo",
    });
    expect(substitutionReasonLabel(null)).toBeNull();
    expect(substitutionReasonLabel("absence")).toBe("Ausencia");
  });
});
