import { describe, expect, it } from "vitest";

import {
  apparatusBelongsToDiscipline,
  athleteProgressQuerySchema,
  canChangeObjectiveStatus,
  canEditObservation,
  changeObjectiveStatusCommandSchema,
  createObjectiveCommandSchema,
  createObservationCommandSchema,
  FAMILY_PORTAL_SHOWS_OBSERVATIONS,
  isManagementRole,
  isObservationShareableWithFamily,
  isValidObjectiveTransition,
  localDateInTimeZone,
  sessionAthleteProgressQuerySchema,
  sessionObservationCommandSchema,
  updateObservationCommandSchema,
} from "@/modules/athlete-progress/domain/athlete-progress";

const organizationId = "a0000000-0000-4000-8000-000000000001";
const locationId = "a0000000-0000-4000-8000-000000000002";
const clientRequestId = "a0000000-0000-4000-8000-000000000003";
const scope = { organizationId, locationId };

describe("consulta de la ficha", () => {
  it("acepta parámetros opcionales ausentes como null (URLSearchParams.get)", () => {
    expect(athleteProgressQuerySchema.safeParse({ ...scope, objectiveStatus: null }).success).toBe(true);
    expect(athleteProgressQuerySchema.safeParse({ ...scope }).success).toBe(true);
    expect(athleteProgressQuerySchema.safeParse({ ...scope, objectiveStatus: "achieved" }).success).toBe(true);
  });

  it("desde Pasar lista exige la inscripción y acepta el filtro ausente como null", () => {
    expect(sessionAthleteProgressQuerySchema.safeParse({ ...scope, enrollmentId: clientRequestId, objectiveStatus: null }).success).toBe(true);
    expect(sessionAthleteProgressQuerySchema.safeParse({ ...scope }).success).toBe(false);
    expect(sessionAthleteProgressQuerySchema.safeParse({ ...scope, enrollmentId: clientRequestId, athleteId: clientRequestId }).success).toBe(false);
  });

  it("exige academia y sede válidas y rechaza filtros desconocidos", () => {
    expect(athleteProgressQuerySchema.safeParse({ organizationId }).success).toBe(false);
    expect(athleteProgressQuerySchema.safeParse({ ...scope, locationId: null }).success).toBe(false);
    expect(athleteProgressQuerySchema.safeParse({ ...scope, objectiveStatus: "paused" }).success).toBe(false);
    expect(athleteProgressQuerySchema.safeParse({ ...scope, tenantId: organizationId }).success).toBe(false);
  });
});

describe("objetivos", () => {
  const base = { ...scope, clientRequestId, title: "  Rueda   sin manos  " };

  it("normaliza el título y acepta los opcionales como null", () => {
    const parsed = createObjectiveCommandSchema.parse({
      ...base,
      discipline: null,
      apparatus: null,
      targetDate: null,
    });
    expect(parsed.title).toBe("Rueda sin manos");
    expect(parsed.discipline).toBeNull();
  });

  it("valida título, aparato de su disciplina y fecha civil", () => {
    expect(createObjectiveCommandSchema.safeParse({ ...base, title: "a" }).success).toBe(false);
    expect(createObjectiveCommandSchema.safeParse({ ...base, title: "x".repeat(121) }).success).toBe(false);
    expect(createObjectiveCommandSchema.safeParse({ ...base, title: "Línea\nnueva" }).success).toBe(false);
    expect(createObjectiveCommandSchema.safeParse({ ...base, discipline: "gaf", apparatus: "beam" }).success).toBe(true);
    expect(createObjectiveCommandSchema.safeParse({ ...base, discipline: "gam", apparatus: "beam" }).success).toBe(false);
    expect(createObjectiveCommandSchema.safeParse({ ...base, apparatus: "rings" }).success).toBe(false);
    expect(createObjectiveCommandSchema.safeParse({ ...base, discipline: "gr" }).success).toBe(false);
    expect(createObjectiveCommandSchema.safeParse({ ...base, targetDate: "2027-02-30" }).success).toBe(false);
    expect(createObjectiveCommandSchema.safeParse({ ...base, targetDate: "2027-06-15" }).success).toBe(true);
    expect(createObjectiveCommandSchema.safeParse({ ...base, clientRequestId: "otra" }).success).toBe(false);
  });

  it("el aparato pertenece a la disciplina: GAF tiene cuatro y GAM seis", () => {
    expect(apparatusBelongsToDiscipline("gaf", "uneven_bars")).toBe(true);
    expect(apparatusBelongsToDiscipline("gaf", "pommel_horse")).toBe(false);
    expect(apparatusBelongsToDiscipline("gam", "high_bar")).toBe(true);
    expect(apparatusBelongsToDiscipline("gam", "vault")).toBe(true);
    expect(apparatusBelongsToDiscipline(null, null)).toBe(true);
    expect(apparatusBelongsToDiscipline(null, "floor")).toBe(false);
  });

  it("el cambio de estado exige revisión positiva y un estado conocido", () => {
    expect(changeObjectiveStatusCommandSchema.safeParse({ ...scope, expectedRevision: 1, status: "achieved" }).success).toBe(true);
    expect(changeObjectiveStatusCommandSchema.safeParse({ ...scope, expectedRevision: 0, status: "achieved" }).success).toBe(false);
    expect(changeObjectiveStatusCommandSchema.safeParse({ ...scope, expectedRevision: 1, status: "done" }).success).toBe(false);
    expect(isValidObjectiveTransition("in_progress", "achieved")).toBe(true);
    expect(isValidObjectiveTransition("achieved", "in_progress")).toBe(true);
    expect(isValidObjectiveTransition("discarded", "discarded")).toBe(false);
  });
});

describe("observaciones", () => {
  it("es interna del equipo por defecto y admite opcionales null", () => {
    const parsed = createObservationCommandSchema.parse({
      ...scope,
      clientRequestId,
      body: " Buena entrada \r\n en barra ",
      observedOn: null,
      sessionId: null,
      objectiveId: null,
    });
    expect(parsed.visibility).toBe("team");
    expect(parsed.body).toBe("Buena entrada \n en barra");
  });

  it("limita el texto a 1000 caracteres y rechaza visibilidades desconocidas", () => {
    const base = { ...scope, clientRequestId };
    expect(createObservationCommandSchema.safeParse({ ...base, body: "   " }).success).toBe(false);
    expect(createObservationCommandSchema.safeParse({ ...base, body: "x".repeat(1001) }).success).toBe(false);
    expect(createObservationCommandSchema.safeParse({ ...base, body: "ok", visibility: "public" }).success).toBe(false);
    expect(createObservationCommandSchema.safeParse({ ...base, body: "ok", visibility: "family" }).success).toBe(true);
    expect(createObservationCommandSchema.safeParse({ ...base, body: "ok", athleteId: organizationId }).success).toBe(false);
  });

  it("la edición exige revisión y visibilidad; el acceso rápido exige inscripción", () => {
    expect(updateObservationCommandSchema.safeParse({ ...scope, expectedRevision: 2, body: "ok", visibility: "team" }).success).toBe(true);
    expect(updateObservationCommandSchema.safeParse({ ...scope, body: "ok", visibility: "team" }).success).toBe(false);
    expect(sessionObservationCommandSchema.safeParse({ ...scope, clientRequestId, body: "ok" }).success).toBe(false);
    expect(
      sessionObservationCommandSchema.safeParse({ ...scope, clientRequestId, body: "ok", enrollmentId: clientRequestId }).success
    ).toBe(true);
  });
});

describe("permisos", () => {
  const me = "m-1";
  const other = "m-2";

  it("la dirección, administración y coordinación gestionan; el entrenador no", () => {
    expect(isManagementRole("owner")).toBe(true);
    expect(isManagementRole("admin")).toBe(true);
    expect(isManagementRole("manager")).toBe(true);
    expect(isManagementRole("coach")).toBe(false);
  });

  it("el entrenador solo edita sus observaciones y cambia sus objetivos (decisión conservadora)", () => {
    expect(canEditObservation({ role: "coach", memberId: me, authorMemberId: me })).toBe(true);
    expect(canEditObservation({ role: "coach", memberId: me, authorMemberId: other })).toBe(false);
    expect(canEditObservation({ role: "manager", memberId: me, authorMemberId: other })).toBe(true);
    expect(canChangeObjectiveStatus({ role: "coach", memberId: me, createdByMemberId: other })).toBe(false);
    expect(canChangeObjectiveStatus({ role: "coach", memberId: me, createdByMemberId: me })).toBe(true);
    expect(canChangeObjectiveStatus({ role: "owner", memberId: me, createdByMemberId: other })).toBe(true);
  });

  it("el portal de familias no muestra observaciones todavía, ni las compartibles", () => {
    expect(FAMILY_PORTAL_SHOWS_OBSERVATIONS).toBe(false);
    expect(isObservationShareableWithFamily({ visibility: "family" })).toBe(false);
    expect(isObservationShareableWithFamily({ visibility: "team" })).toBe(false);
  });
});

describe("fecha civil de la sede", () => {
  it("usa la zona de la sede y cae a Europa/Madrid si es inválida", () => {
    const lateNightUtc = new Date("2026-11-11T23:30:00.000Z");
    expect(localDateInTimeZone(lateNightUtc, "Europe/Madrid")).toBe("2026-11-12");
    expect(localDateInTimeZone(lateNightUtc, "America/Mexico_City")).toBe("2026-11-11");
    expect(localDateInTimeZone(lateNightUtc, "Zona/Inventada")).toBe("2026-11-12");
    expect(localDateInTimeZone(lateNightUtc, null)).toBe("2026-11-12");
  });
});
