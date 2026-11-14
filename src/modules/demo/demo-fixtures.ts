/**
 * Datos de la demo pública: una academia de gimnasia inventada.
 *
 * Todo es ficticio. Las gimnastas y las familias llevan apellidos que son
 * palabras de prueba (Ejemplo, Muestra, Prueba, Ensayo…) y no apellidos reales,
 * para que nadie confunda un nombre con una persona. No hay fotos ni datos de contacto.
 *
 * Los datos son estáticos: se calculan en memoria a partir de la fecha de hoy
 * (para que «Hoy» siempre tenga sesiones) y no salen de ninguna tabla. Este
 * módulo no importa la base de datos, Supabase ni ninguna sesión: solo tipos,
 * que se borran al compilar.
 */
import type { OwnerClassesManager } from "@/components/owner-dashboard/OwnerClassesManager";
import type { OpenManualPaymentCharge } from "@/modules/billing/application/manual-payments";
import type {
  FamilyAcademyFees,
  FamilyAthleteOverview,
  FamilyAttendanceEntry,
  FamilyFee,
  FamilyScheduleClass,
  FamilyUpcomingSession,
} from "@/modules/family-portal/application/family-portal-reads";
import type { FamilyPortalAcademy } from "@/modules/family-portal/domain/family-portal-access";
import type { OwnerAttentionItems } from "@/modules/owner-dashboard/application/attention-items";
import type { OwnerOperationalSummary } from "@/modules/owner-dashboard/application/operational-summary";
import type { OwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import type {
  OwnerTodaySession,
  OwnerTodaySessions,
} from "@/modules/owner-dashboard/application/today-sessions";

import type { DemoApiResponder } from "./demo-guard";

export const DEMO_TIMEZONE = "Europe/Madrid";
export const DEMO_ORGANIZATION_NAME = "Club Demo Cinta Azul";

const id = (n: number) => `de000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const DEMO_ORGANIZATION_ID = id(1);
export const DEMO_ACTOR_ID = id(22);
const MEMBER_ID = id(21);
const LOCATION = { centro: id(2), norte: id(3) } as const;
const LOCATION_NAME = { centro: "Sede Centro", norte: "Sede Norte" } as const;
const PROGRAM = { artistica: id(11), ritmica: id(12) } as const;
const PROGRAM_NAME = { artistica: "Gimnasia artística", ritmica: "Gimnasia rítmica" } as const;

/* ─────────────────────────────── Calendario ─────────────────────────────── */

function tzOffsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(read("year"), read("month") - 1, read("day"), read("hour"), read("minute"), read("second"));
  return (asUtc - at.getTime()) / 60_000;
}

/** Fecha civil de la demo (AAAA-MM-DD) en la zona horaria de la academia. */
export function demoLocalDate(now: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: DEMO_TIMEZONE }).format(now);
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function isoWeekdayOf(date: string): number {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Instante UTC (sin milisegundos) de una hora local de la academia. */
function localToIso(date: string, time: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const offset = tzOffsetMinutes(new Date(guess), DEMO_TIMEZONE);
  return new Date(guess - offset * 60_000).toISOString().replace(".000Z", "Z");
}

/* ───────────────────────────── Gimnastas y clases ───────────────────────── */

const ATHLETE_NAMES: ReadonlyArray<readonly [string, string]> = [
  ["Lucía", "Ejemplo"], ["Martina", "Muestra"], ["Vera", "Prueba"], ["Noa", "Ensayo"],
  ["Irene", "Boceto"], ["Carla", "Maqueta"], ["Alba", "Modelo"], ["Sofía", "Esbozo"],
  ["Paula", "Borrador"], ["Emma", "Simulacro"], ["Julia", "Ficticia"], ["Marta", "Tanteo"],
  ["Aitana", "Ejemplo"], ["Nora", "Muestra"], ["Elena", "Prueba"], ["Claudia", "Ensayo"],
  ["Valeria", "Boceto"], ["Lola", "Maqueta"], ["Inés", "Modelo"], ["Mía", "Esbozo"],
  ["Triana", "Borrador"], ["Abril", "Simulacro"], ["Daniela", "Ficticia"], ["Candela", "Tanteo"],
];
const SURNAMES = ["Ejemplo", "Muestra", "Prueba", "Ensayo", "Boceto", "Maqueta", "Modelo", "Esbozo", "Borrador", "Simulacro", "Ficticia", "Tanteo"];

const athleteId = (index: number) => id(300 + index);
const familyId = (surname: string) => id(500 + SURNAMES.indexOf(surname));
const fullName = (index: number) => `${ATHLETE_NAMES[index][0]} ${ATHLETE_NAMES[index][1]}`;

type DemoClass = {
  n: number;
  name: string;
  place: keyof typeof LOCATION;
  program: keyof typeof PROGRAM;
  capacity: number;
  /** [día ISO de la semana, inicio, fin] */
  slots: ReadonlyArray<readonly [number, string, string]>;
  roster: readonly number[];
};

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

const CLASSES: readonly DemoClass[] = [
  { n: 1, name: "Iniciación artística", place: "centro", program: "artistica", capacity: 14, slots: [[1, "17:00", "18:30"], [3, "17:00", "18:30"]], roster: range(0, 9) },
  { n: 2, name: "Base 3 artística", place: "centro", program: "artistica", capacity: 12, slots: [[2, "17:30", "19:00"], [4, "17:30", "19:00"]], roster: range(4, 15) },
  { n: 3, name: "Tecnificación competición", place: "centro", program: "artistica", capacity: 12, slots: [[1, "18:30", "20:30"], [3, "18:30", "20:30"], [5, "18:00", "20:00"], [7, "10:00", "12:00"]], roster: range(10, 19) },
  { n: 4, name: "Rítmica iniciación", place: "norte", program: "ritmica", capacity: 14, slots: [[2, "17:00", "18:00"], [4, "17:00", "18:00"]], roster: range(12, 21) },
  { n: 5, name: "Rítmica base", place: "norte", program: "ritmica", capacity: 12, slots: [[1, "18:00", "19:30"], [3, "18:00", "19:30"]], roster: [...range(16, 23), 0, 1] },
  { n: 6, name: "Rítmica conjunto", place: "norte", program: "ritmica", capacity: 12, slots: [[5, "17:30", "19:30"], [6, "10:00", "12:00"]], roster: [...range(18, 23), ...range(6, 9)] },
  { n: 7, name: "Baby gym", place: "centro", program: "artistica", capacity: 12, slots: [[6, "10:00", "11:00"]], roster: range(0, 7) },
];

const classId = (n: number) => id(100 + n);
const enrollmentId = (classN: number, athlete: number) => id(4000 + classN * 100 + athlete);
const sessionId = (classN: number, daysAgo: number) => id(10_000 + classN * 100 + daysAgo);

type DemoSession = {
  id: string;
  cls: DemoClass;
  date: string;
  daysAgo: number;
  startsAt: string;
  endsAt: string;
};

/** Sesiones de los últimos 7 días (hoy incluido), de la más reciente a la más antigua. */
function recentSessions(now: Date): DemoSession[] {
  const today = demoLocalDate(now);
  const sessions: DemoSession[] = [];
  for (let daysAgo = 0; daysAgo <= 6; daysAgo += 1) {
    const date = addDays(today, -daysAgo);
    const weekday = isoWeekdayOf(date);
    for (const cls of CLASSES) {
      for (const [slotWeekday, start, end] of cls.slots) {
        if (slotWeekday !== weekday) continue;
        sessions.push({ id: sessionId(cls.n, daysAgo), cls, date, daysAgo, startsAt: localToIso(date, start), endsAt: localToIso(date, end) });
      }
    }
  }
  return sessions.sort((a, b) => b.startsAt.localeCompare(a.startsAt));
}

/** Sesiones de los próximos 14 días a partir de mañana. */
function upcomingSessions(now: Date): DemoSession[] {
  const today = demoLocalDate(now);
  const sessions: DemoSession[] = [];
  for (let ahead = 1; ahead <= 14; ahead += 1) {
    const date = addDays(today, ahead);
    const weekday = isoWeekdayOf(date);
    for (const cls of CLASSES) {
      for (const [slotWeekday, start, end] of cls.slots) {
        if (slotWeekday !== weekday) continue;
        sessions.push({ id: sessionId(cls.n, 100 + ahead), cls, date, daysAgo: -ahead, startsAt: localToIso(date, start), endsAt: localToIso(date, end) });
      }
    }
  }
  return sessions.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

type AttendanceStatus = "present" | "absent" | "excused" | "late";

/** Patrón fijo de asistencia: casi todas presentes, alguna falta y algún retraso. */
function recordedStatus(session: DemoSession, athlete: number): AttendanceStatus {
  const key = (athlete * 7 + session.cls.n * 3 + Math.abs(session.daysAgo)) % 11;
  if (key === 0) return "absent";
  if (key === 1) return "excused";
  if (key === 2) return "late";
  return "present";
}

function sessionState(session: DemoSession, now: Date): "future" | "live" | "done" {
  const start = new Date(session.startsAt);
  const end = new Date(session.endsAt);
  if (now < start) return "future";
  if (now < end) return "live";
  return "done";
}

function rosterFor(session: DemoSession, now: Date) {
  const state = sessionState(session, now);
  const liveCutoff = Math.ceil(session.cls.roster.length * 0.6);
  return session.cls.roster.map((athlete, position) => {
    let attendanceStatus: AttendanceStatus | null = null;
    if (state === "done") attendanceStatus = recordedStatus(session, athlete);
    else if (state === "live" && position < liveCutoff) attendanceStatus = "present";
    return { enrollmentId: enrollmentId(session.cls.n, athlete), athleteName: fullName(athlete), attendanceStatus };
  });
}

/* ───────────────────────────────── Panel ────────────────────────────────── */

const SCOPE_LOCATIONS = [
  { id: LOCATION.centro, name: LOCATION_NAME.centro, timezone: DEMO_TIMEZONE },
  { id: LOCATION.norte, name: LOCATION_NAME.norte, timezone: DEMO_TIMEZONE },
];

export function demoOwnerScope(): OwnerScope {
  return {
    organization: { id: DEMO_ORGANIZATION_ID, name: DEMO_ORGANIZATION_NAME, defaultCurrency: "EUR" },
    member: { id: MEMBER_ID, role: "owner", locationScopeMode: "all" },
    locations: SCOPE_LOCATIONS,
    selectedLocationId: null,
    canViewOrganizationAggregate: true,
  };
}

export function demoOperationalSummary(now = new Date()): OwnerOperationalSummary {
  const today = demoLocalDate(now);
  return {
    scope: {
      organizationId: DEMO_ORGANIZATION_ID,
      kind: "organization",
      label: "Todas las sedes",
      locationId: null,
      locationIds: [LOCATION.centro, LOCATION.norte],
      timezone: DEMO_TIMEZONE,
      timezoneMode: "organization_default",
    },
    period: { from: `${today.slice(0, 8)}01`, to: today, timezone: DEMO_TIMEZONE, defaulted: true },
    metrics: {
      activeAthletes: 64,
      activeGroups: 6,
      attendanceRecords: 312,
      paymentsReceived: {
        state: "available",
        count: 41,
        grossByCurrency: [{ currency: "EUR", amountCents: 186_500 }],
        label: "Bruto recibido sin netear devoluciones",
      },
    },
  };
}

export function demoTodaySessions(now = new Date()): OwnerTodaySessions {
  const sessions: OwnerTodaySession[] = recentSessions(now)
    .filter((session) => session.daysAgo === 0)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((session) => {
      const state = sessionState(session, now);
      return {
        id: session.id,
        status: state === "done" ? "completed" : "scheduled",
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        timezone: DEMO_TIMEZONE,
        locationId: LOCATION[session.cls.place],
        locationName: LOCATION_NAME[session.cls.place],
        className: session.cls.name,
        programName: PROGRAM_NAME[session.cls.program],
        capacity: session.cls.capacity,
        expectedAthletes: session.cls.roster.length,
        recordedAttendance: state === "done" ? session.cls.roster.length : 0,
      };
    });
  return { sessions, truncated: false };
}

export function demoAttentionItems(): OwnerAttentionItems {
  return {
    unrecordedSessions: { count: 1, latest: { id: sessionId(2, 1), locationId: LOCATION.centro, className: "Base 3 artística" } },
    fullClasses: 1,
    overdueInvoices: 3,
    newTrialRequests: 2,
  };
}

/* ───────────────────────────────── Clases ───────────────────────────────── */

type ClassesBundle = Parameters<typeof OwnerClassesManager>[0]["bundle"];

export function demoClassesBundle(now = new Date()): ClassesBundle {
  const today = demoLocalDate(now);
  return {
    organization: { id: DEMO_ORGANIZATION_ID, name: DEMO_ORGANIZATION_NAME, defaultCurrency: "EUR" },
    member: { id: MEMBER_ID, role: "owner", locationScopeMode: "all" },
    locations: SCOPE_LOCATIONS,
    programs: [
      { id: PROGRAM.artistica, name: PROGRAM_NAME.artistica, kind: "gymnastics_sport" },
      { id: PROGRAM.ritmica, name: PROGRAM_NAME.ritmica, kind: "gymnastics_sport" },
    ],
    classes: CLASSES.map((cls) => ({
      id: classId(cls.n),
      name: cls.name,
      capacity: cls.capacity,
      effectiveFrom: "2025-09-15",
      effectiveTo: null,
      locationId: LOCATION[cls.place],
      locationName: LOCATION_NAME[cls.place],
      programId: PROGRAM[cls.program],
      programName: PROGRAM_NAME[cls.program],
      schedule: [...cls.slots]
        .sort((a, b) => a[0] - b[0])
        .map(([isoWeekday, start, end]) => ({
          classTemplateId: classId(cls.n),
          isoWeekday,
          startsAtLocal: `${start}:00`,
          endsAtLocal: `${end}:00`,
        })),
    })),
    selectedLocationId: LOCATION.centro,
    localTodayByLocation: { [LOCATION.centro]: today, [LOCATION.norte]: today },
  };
}

/* ─────────────────────────────── Asistencia ─────────────────────────────── */

export function demoAttendanceView(now = new Date()) {
  const sessions = recentSessions(now);
  const options = sessions.slice(0, 12).map((session) => ({
    id: session.id,
    className: session.cls.name,
    startsAt: session.startsAt,
    timezone: DEMO_TIMEZONE,
  }));
  // Se abre la sesión más reciente que ya empezó, con su lista a la vista.
  const opened = sessions.find((session) => sessionState(session, now) !== "future") ?? sessions[0];
  return {
    organizationId: DEMO_ORGANIZATION_ID,
    locationId: LOCATION.centro,
    sessions: options,
    initialSessionId: opened ? opened.id : null,
    selectedSession: opened
      ? { id: opened.id, className: opened.cls.name, startsAt: opened.startsAt, timezone: DEMO_TIMEZONE }
      : null,
  };
}

/* ─────────────────────────────── Gimnastas ──────────────────────────────── */

const FAMILY_STARTS_ON = "2026-09-14";
const UNASSIGNED: ReadonlyArray<{ givenName: string; familyName: string; incomplete: boolean }> = [
  { givenName: "Gala", familyName: "Ejemplo", incomplete: false },
  { givenName: "Leyre", familyName: "Muestra", incomplete: false },
  { givenName: "Olivia", familyName: "Prueba", incomplete: false },
  { givenName: "Zoe", familyName: "Ensayo", incomplete: true },
  { givenName: "Bianca", familyName: "Boceto", incomplete: true },
];

function intakePage(page: number) {
  return {
    items: UNASSIGNED.map((athlete, index) => ({
      athleteId: athleteId(100 + index),
      givenName: athlete.givenName,
      familyName: athlete.familyName,
      familySummaries: athlete.incomplete
        ? []
        : [{ familyId: familyId(athlete.familyName), relationship: "parent" as const, startsOn: FAMILY_STARTS_ON, incompleteFamily: false }],
      incompleteFamily: athlete.incomplete,
    })),
    eligibleGroups: [
      { groupId: id(201), groupName: "Iniciación artística · tarde", locationId: LOCATION.centro, locationName: LOCATION_NAME.centro, capacity: 14, occupancy: 10, availablePlaces: 4 },
      { groupId: id(202), groupName: "Base 3 artística · tarde", locationId: LOCATION.centro, locationName: LOCATION_NAME.centro, capacity: 12, occupancy: 12, availablePlaces: 0 },
      { groupId: id(203), groupName: "Rítmica iniciación · tarde", locationId: LOCATION.norte, locationName: LOCATION_NAME.norte, capacity: 14, occupancy: 10, availablePlaces: 4 },
    ],
    total: UNASSIGNED.length,
    page,
    pageSize: 50,
    hasMore: false,
  };
}

/* ────────────────────────────────── Cobros ──────────────────────────────── */

export function demoOpenCharges(now = new Date()): OpenManualPaymentCharge[] {
  const today = demoLocalDate(now);
  const rows: Array<{ n: number; surname: string; place: keyof typeof LOCATION; due: number; total: number; allocated: number }> = [
    { n: 1, surname: "Ejemplo", place: "centro", due: -18, total: 9_000, allocated: 0 },
    { n: 2, surname: "Muestra", place: "norte", due: -12, total: 4_500, allocated: 0 },
    { n: 3, surname: "Prueba", place: "norte", due: -6, total: 4_500, allocated: 2_000 },
    { n: 4, surname: "Ensayo", place: "centro", due: 3, total: 5_500, allocated: 0 },
    { n: 5, surname: "Boceto", place: "centro", due: 5, total: 4_500, allocated: 0 },
    { n: 6, surname: "Maqueta", place: "centro", due: 9, total: 9_000, allocated: 4_500 },
  ];
  const month = today.slice(0, 7);
  return rows.map((row) => ({
    chargeId: id(700 + row.n),
    familyId: familyId(row.surname),
    locationId: LOCATION[row.place],
    locationName: LOCATION_NAME[row.place],
    locationTimezone: DEMO_TIMEZONE,
    invoiceReference: `CD-${month}-${String(row.n).padStart(3, "0")}`,
    payerName: `Familia ${row.surname}`,
    currency: "EUR",
    dueAt: localToIso(addDays(today, row.due), "23:59"),
    totalCents: row.total,
    allocatedCents: row.allocated,
    outstandingCents: row.total - row.allocated,
  }));
}

/* ────────────────────────── Portal de la familia ────────────────────────── */

/** La demo del portal enseña a la «Familia Cinta»: Lucía y Aitana. */
const FAMILY_SURNAME = "Ejemplo";
const FAMILY_ATHLETES = [0, 12] as const;

export function demoFamilyAcademy(): FamilyPortalAcademy {
  return {
    organizationId: DEMO_ORGANIZATION_ID,
    organizationName: DEMO_ORGANIZATION_NAME,
    timezone: DEMO_TIMEZONE,
    defaultCurrency: "EUR",
    feeFamilyIds: [familyId(FAMILY_SURNAME)],
    athletes: FAMILY_ATHLETES.map((index) => ({
      athleteId: athleteId(index),
      displayName: fullName(index),
      visibleSince: "2025-09-15",
    })),
  };
}

export function isDemoFamilyAthlete(value: string): boolean {
  return FAMILY_ATHLETES.some((index) => athleteId(index) === value);
}

export function demoFamilyAthleteOverview(athlete: string, now = new Date()): FamilyAthleteOverview | null {
  const index = FAMILY_ATHLETES.find((candidate) => athleteId(candidate) === athlete);
  if (index === undefined) return null;
  const classes: FamilyScheduleClass[] = CLASSES.filter((cls) => cls.roster.includes(index)).map((cls) => ({
    enrollmentId: enrollmentId(cls.n, index),
    classTemplateId: classId(cls.n),
    className: cls.name,
    locationName: LOCATION_NAME[cls.place],
    timezone: DEMO_TIMEZONE,
    status: "active",
    startsOn: "2025-09-15",
    endsOn: null,
    weekdays: [...cls.slots]
      .sort((a, b) => a[0] - b[0])
      .map(([isoWeekday, start, end]) => ({ isoWeekday, startsAtLocal: `${start}:00`, endsAtLocal: `${end}:00` })),
  }));
  const upcoming: FamilyUpcomingSession[] = upcomingSessions(now)
    .filter((session) => session.cls.roster.includes(index))
    .map((session) => ({
      sessionId: session.id,
      className: session.cls.name,
      locationName: LOCATION_NAME[session.cls.place],
      timezone: DEMO_TIMEZONE,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      status: "scheduled",
    }));
  const attendance: FamilyAttendanceEntry[] = recentSessions(now)
    .filter((session) => session.cls.roster.includes(index) && sessionState(session, now) === "done")
    .map((session) => ({
      recordId: id(20_000 + session.cls.n * 100 + session.daysAgo),
      className: session.cls.name,
      locationName: LOCATION_NAME[session.cls.place],
      timezone: DEMO_TIMEZONE,
      sessionStartsAt: session.startsAt,
      status: recordedStatus(session, index),
    }));
  return {
    organizationId: DEMO_ORGANIZATION_ID,
    organizationName: DEMO_ORGANIZATION_NAME,
    athlete: { athleteId: athleteId(index), displayName: fullName(index), visibleSince: "2025-09-15" },
    classes,
    upcomingSessions: upcoming,
    attendance,
  };
}

export function demoFamilyFees(now = new Date()): FamilyAcademyFees[] {
  const today = demoLocalDate(now);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const monthStart = (offset: number) => {
    const date = new Date(Date.UTC(year, month - 1 + offset, 1));
    return date.toISOString().slice(0, 10);
  };
  const monthEnd = (offset: number) => addDays(monthStart(offset + 1), -1);
  const fee = (n: number, offset: number, status: FamilyFee["status"], paidCents: number): FamilyFee => {
    const totalCents = 9_000;
    return {
      invoiceId: id(600 + n),
      reference: `CD-${monthStart(offset).slice(0, 7)}-C${n}`,
      status,
      currency: "EUR",
      totalCents,
      paidCents,
      refundedCents: 0,
      pendingCents: totalCents - paidCents,
      dueAt: localToIso(addDays(monthStart(offset), 4), "23:59"),
      periodStart: monthStart(offset),
      periodEnd: monthEnd(offset),
    };
  };
  return [
    {
      organizationId: DEMO_ORGANIZATION_ID,
      organizationName: DEMO_ORGANIZATION_NAME,
      timezone: DEMO_TIMEZONE,
      fees: [fee(3, 0, "issued", 0), fee(2, -1, "paid", 9_000), fee(1, -2, "paid", 9_000)],
    },
  ];
}

/* ───────────────────────── Respuestas de la API simulada ─────────────────── */

const usageResponder: DemoApiResponder = ({ pathname }) =>
  pathname === "/api/v1/owner/saas/usage"
    ? {
        ok: true,
        data: {
          readOnly: false,
          planCode: "starter",
          resources: [
            { resource: "athletes", current: 64, limit: 75, excess: 0 },
            { resource: "classes", current: CLASSES.length, limit: null, excess: 0 },
            { resource: "groups", current: 6, limit: null, excess: 0 },
          ],
          items: [],
          next: null,
        },
      }
    : undefined;

const intakeResponder: DemoApiResponder = ({ pathname, searchParams }) =>
  pathname === "/api/v1/owner/athlete-intake"
    ? { ok: true, data: intakePage(Number(searchParams.get("page") ?? "1") || 1) }
    : undefined;

const attendanceResponder: DemoApiResponder = ({ pathname }) => {
  const match = /^\/api\/v1\/owner\/sessions\/([^/]+)\/attendance$/.exec(pathname);
  if (!match) return undefined;
  const now = new Date();
  const session = recentSessions(now).find((candidate) => candidate.id === decodeURIComponent(match[1]));
  return session ? { ok: true, data: { items: rosterFor(session, now) } } : undefined;
};

/** Lecturas de la API que la demo contesta sin red. Todo lo demás es «no disponible». */
export const demoApiResponders: readonly DemoApiResponder[] = [usageResponder, intakeResponder, attendanceResponder];

/** Plan que la demo publica en el almacén de política del plan: nunca en solo lectura. */
export const DEMO_PLAN_POLICY = { readOnly: false, planCode: "starter" } as const;
