import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  coachSummaries: vi.fn(),
  rows: { profiles: [] as unknown[], sessions: [] as unknown[], groups: [] as unknown[] },
  statements: [] as Array<{ text: string; params: unknown[] }>,
}));

vi.mock("@/db", () => ({ db: { execute: mocks.execute } }));
vi.mock("@/modules/coach-assignment/application/coach-assignment-service", () => ({
  getSessionCoachSummaries: mocks.coachSummaries,
}));

import { getOwnerCalendar, ownerCalendarSessionLimit } from "@/modules/scheduling/application/calendar-sessions";
import type { OwnerScope } from "@/modules/owner-dashboard/application/owner-scope";

const dialect = new PgDialect();
const organizationId = "10000000-0000-4000-8000-000000000001";
const locationA = "20000000-0000-4000-8000-000000000002";
const locationB = "20000000-0000-4000-8000-000000000003";
const memberId = "60000000-0000-4000-8000-000000000006";
const profileId = "70000000-0000-4000-8000-000000000007";
const groupId = "30000000-0000-4000-8000-000000000004";
const range = { from: "2026-11-09", to: "2026-11-15" };

function scope(role: "owner" | "manager" | "coach", mode: "all" | "selected", selected: string | null, only?: string[]): OwnerScope {
  const all = [
    { id: locationA, name: "Norte", timezone: "Europe/Madrid" },
    { id: locationB, name: "Sur", timezone: null },
  ];
  return {
    organization: { id: organizationId, name: "QA", defaultCurrency: "EUR" },
    member: { id: memberId, role, locationScopeMode: mode },
    locations: all.filter((location) => !only || only.includes(location.id)),
    selectedLocationId: selected,
    canViewOrganizationAggregate: role !== "coach" && mode === "all",
  };
}

function sessionRow(index: number) {
  return {
    id: `40000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    status: "scheduled",
    starts_at: "2026-11-10T16:00:00Z",
    ends_at: "2026-11-10T17:00:00Z",
    timezone: "Europe/Madrid",
    location_id: locationA,
    location_name: "Norte",
    class_template_id: "50000000-0000-4000-8000-000000000001",
    class_name: "Artística base",
    program_name: "Gimnasia artística",
    capacity: 15,
    groups: [{ id: groupId, name: "Pre-equipo" }],
    expected_athletes: "12",
    recorded_attendance: "3",
  };
}

const sessionsStatement = () => mocks.statements.find((item) => item.text.includes("from zaltyko.sessions s"));
const groupsStatement = () => mocks.statements.find((item) => item.text.includes("from zaltyko.groups g"));
const profilesStatement = () => mocks.statements.find((item) => item.text.includes("from zaltyko.staff_profiles"));

beforeEach(() => {
  mocks.rows.profiles = [{ id: profileId }];
  mocks.rows.sessions = [sessionRow(1)];
  mocks.rows.groups = [{ id: groupId, name: "Pre-equipo", location_id: locationA }];
  mocks.statements.length = 0;
  mocks.execute.mockReset().mockImplementation(async (statement: SQL) => {
    const query = dialect.sqlToQuery(statement);
    const text = query.sql.replace(/\s+/g, " ").toLowerCase();
    mocks.statements.push({ text, params: query.params });
    if (text.includes("from zaltyko.staff_profiles")) return { rows: mocks.rows.profiles };
    if (text.includes("from zaltyko.sessions s")) return { rows: mocks.rows.sessions };
    if (text.includes("from zaltyko.groups g")) return { rows: mocks.rows.groups };
    throw new Error(`Consulta inesperada: ${text.slice(0, 80)}`);
  });
  mocks.coachSummaries.mockReset().mockResolvedValue(
    new Map([
      [sessionRow(1).id, { coachNames: ["Ana Pérez"], substitution: true, assignedToViewer: false }],
    ])
  );
});

describe("getOwnerCalendar · dirección", () => {
  it("lee todas las sedes del alcance, con la zona de cada una, y completa con entrenadoras y sustituciones", async () => {
    const data = await getOwnerCalendar({ scope: scope("owner", "all", null), ...range });

    expect(data.assignedOnly).toBe(false);
    expect(data.range).toEqual(range);
    expect(data.locations).toEqual([
      { id: locationA, name: "Norte", timezone: "Europe/Madrid" },
      // Sin zona guardada se usa la de España en lugar de romper.
      { id: locationB, name: "Sur", timezone: "Europe/Madrid" },
    ]);
    expect(data.groups).toEqual([{ id: groupId, name: "Pre-equipo", locationId: locationA }]);
    expect(data.sessions).toEqual([
      expect.objectContaining({
        className: "Artística base",
        capacity: 15,
        expectedAthletes: 12,
        recordedAttendance: 3,
        groups: [{ id: groupId, name: "Pre-equipo" }],
        coachNames: ["Ana Pérez"],
        substitution: true,
      }),
    ]);
    expect(data.coachesAvailable).toBe(true);
    expect(data.truncated).toBe(false);

    const sessions = sessionsStatement()!;
    expect(sessions.params).toEqual(expect.arrayContaining([organizationId, locationA, locationB, range.from, range.to]));
    // Una dirección no queda limitada a las sesiones asignadas.
    expect(sessions.text).not.toContain("session_staff");
    expect(profilesStatement()).toBeUndefined();
    expect(mocks.coachSummaries).toHaveBeenCalledWith(expect.anything(), {
      organizationId,
      viewerMemberId: memberId,
      sessionIds: [sessionRow(1).id],
    });
  });

  it("una sede pedida limita la lectura a esa sede; una fuera del alcance no lee nada", async () => {
    await getOwnerCalendar({ scope: scope("owner", "all", null), ...range, locationId: locationB });
    const sessions = sessionsStatement()!;
    expect(sessions.params).toContain(locationB);
    expect(sessions.params).not.toContain(locationA);

    mocks.statements.length = 0;
    const outside = await getOwnerCalendar({
      scope: scope("manager", "selected", locationA, [locationA]),
      ...range,
      locationId: locationB,
    });
    expect(outside.sessions).toEqual([]);
    expect(mocks.statements).toEqual([]);
  });

  it("un manager con una sola sede solo lee esa sede", async () => {
    await getOwnerCalendar({ scope: scope("manager", "selected", locationA, [locationA]), ...range });

    expect(sessionsStatement()!.params).toContain(locationA);
    expect(sessionsStatement()!.params).not.toContain(locationB);
    expect(groupsStatement()!.params).not.toContain(locationB);
  });

  it("filtra por grupo con la pertenencia de la clase al grupo", async () => {
    await getOwnerCalendar({ scope: scope("owner", "all", null), ...range, groupId });

    const sessions = sessionsStatement()!;
    expect(sessions.text).toContain("from zaltyko.class_template_groups filter_group");
    expect(sessions.params).toContain(groupId);
  });

  it("marca el recorte cuando hay más sesiones que el tope y no entrega más del tope", async () => {
    mocks.rows.sessions = Array.from({ length: ownerCalendarSessionLimit + 1 }, (_, index) => sessionRow(index + 1));
    mocks.coachSummaries.mockResolvedValue(new Map());

    const data = await getOwnerCalendar({ scope: scope("owner", "all", null), ...range });

    expect(data.truncated).toBe(true);
    expect(data.sessions).toHaveLength(ownerCalendarSessionLimit);
  });

  it("sin el candidato de titulares (o si falla) pinta las sesiones sin entrenadoras", async () => {
    mocks.coachSummaries.mockResolvedValue(null);
    const withoutStorage = await getOwnerCalendar({ scope: scope("owner", "all", null), ...range });
    expect(withoutStorage.coachesAvailable).toBe(false);
    expect(withoutStorage.sessions[0].coachNames).toBeUndefined();
    expect(withoutStorage.sessions[0].substitution).toBeUndefined();

    mocks.coachSummaries.mockRejectedValue(new Error("boom"));
    const failing = await getOwnerCalendar({ scope: scope("owner", "all", null), ...range });
    expect(failing.coachesAvailable).toBe(false);
    expect(failing.sessions).toHaveLength(1);
  });

  it("sin sesiones no consulta entrenadoras", async () => {
    mocks.rows.sessions = [];
    const data = await getOwnerCalendar({ scope: scope("owner", "all", null), ...range });

    expect(data.sessions).toEqual([]);
    expect(mocks.coachSummaries).not.toHaveBeenCalled();
  });
});

describe("getOwnerCalendar · entrenadora", () => {
  it("solo lee las sesiones en las que está asignada, de su sede seleccionada", async () => {
    const data = await getOwnerCalendar({ scope: scope("coach", "selected", locationA, [locationA]), ...range });

    expect(data.assignedOnly).toBe(true);
    expect(profilesStatement()!.params).toEqual(expect.arrayContaining([organizationId, memberId]));
    const sessions = sessionsStatement()!;
    expect(sessions.text).toContain("from zaltyko.session_staff mine");
    expect(sessions.params).toContain(profileId);
    expect(sessions.params).toContain(locationA);
    expect(groupsStatement()!.params).toContain(locationA);
    expect(data.sessions).toHaveLength(1);
  });

  it("con varias sedes lee una cada vez: la pedida o, si no, la seleccionada; nunca el agregado", async () => {
    const coach = scope("coach", "all", locationA);

    await getOwnerCalendar({ scope: coach, ...range });
    expect(sessionsStatement()!.params).toContain(locationA);
    expect(sessionsStatement()!.params).not.toContain(locationB);

    mocks.statements.length = 0;
    await getOwnerCalendar({ scope: coach, ...range, locationId: locationB });
    expect(sessionsStatement()!.params).toContain(locationB);
    expect(sessionsStatement()!.params).not.toContain(locationA);
  });

  it("sin perfil de equipo enlazado no ve ninguna sesión y no consulta sesiones", async () => {
    mocks.rows.profiles = [];

    const data = await getOwnerCalendar({ scope: scope("coach", "selected", locationA, [locationA]), ...range });

    expect(data.sessions).toEqual([]);
    expect(data.assignedOnly).toBe(true);
    expect(sessionsStatement()).toBeUndefined();
    expect(mocks.coachSummaries).not.toHaveBeenCalled();
  });

  it("si la sede pedida no es de su alcance no lee nada", async () => {
    const data = await getOwnerCalendar({
      scope: scope("coach", "selected", locationA, [locationA]),
      ...range,
      locationId: locationB,
    });

    expect(data.sessions).toEqual([]);
    expect(mocks.statements).toEqual([]);
  });
});
