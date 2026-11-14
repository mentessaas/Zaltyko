import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), send: vi.fn() }));

vi.mock("@/db", () => ({ db: { execute: mocks.execute } }));
vi.mock("@/lib/email/email-service", () => ({ sendEmailWithLogging: mocks.send }));

import {
  runOwnerWeeklyDigest,
  type DigestRecipient,
} from "@/modules/habitual-use/application/owner-weekly-digest";
import {
  attendanceRate,
  buildDigestLinks,
  buildOwnerDigestItems,
  buildOwnerWeeklyDigestMessage,
  ownerDigestDedupeKey,
  type OwnerDigestMetrics,
} from "@/modules/habitual-use/domain/owner-weekly-digest";
import type { OwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const ORG = "11111111-1111-4111-8111-111111111111";
const LOC = "22222222-2222-4222-8222-222222222222";
const MEMBER = "44444444-4444-4444-8444-444444444444";
const USER = "55555555-5555-4555-8555-555555555555";

const links = buildDigestLinks("https://zaltyko.com", { organizationId: ORG });
const week = (sessions: number, records: number, present: number) => ({
  sessionsWithAttendance: sessions,
  records,
  present,
});
const quiet: OwnerDigestMetrics = {
  attendance: { current: week(10, 100, 90), previous: week(10, 100, 92) },
  overdueInvoices: 0,
  newTrialRequests: 0,
  inactiveAthletes: 0,
  unrecordedSessions: 0,
};

describe("puntos del resumen semanal", () => {
  it("sin nada accionable no hay puntos ni mensaje", () => {
    expect(buildOwnerDigestItems(quiet, links)).toEqual([]);
    expect(buildOwnerWeeklyDigestMessage({ organizationName: "Club", items: [], preferencesUrl: null })).toBeNull();
  });

  it("cada punto lleva el botón a su pantalla de Zaltyko", () => {
    const items = buildOwnerDigestItems(
      {
        ...quiet,
        overdueInvoices: 3,
        newTrialRequests: 1,
        inactiveAthletes: 2,
        unrecordedSessions: 4,
      },
      links
    );
    expect(items.map((item) => item.key)).toEqual([
      "unrecorded_sessions",
      "overdue_invoices",
      "trial_requests",
      "inactive_athletes",
    ]);
    expect(items.find((item) => item.key === "overdue_invoices")?.href).toContain("/owner/monthly-invoices?");
    expect(items.find((item) => item.key === "trial_requests")?.href).toContain("/owner/requests?");
    expect(items.find((item) => item.key === "unrecorded_sessions")?.title).toBe("4 sesiones sin lista");
    expect(items.find((item) => item.key === "trial_requests")?.title).toBe("1 solicitud de prueba sin responder");
  });

  it("quien no ve finanzas no recibe el punto de cuotas", () => {
    const items = buildOwnerDigestItems({ ...quiet, overdueInvoices: null, unrecordedSessions: 1 }, links);
    expect(items.map((item) => item.key)).toEqual(["unrecorded_sessions"]);
  });

  it("la asistencia solo se señala con una bajada clara y datos suficientes", () => {
    const drop = (current: ReturnType<typeof week>, previous: ReturnType<typeof week>) =>
      buildOwnerDigestItems({ ...quiet, attendance: { current, previous } }, links).filter(
        (item) => item.key === "attendance_drop"
      );
    expect(attendanceRate(week(1, 40, 30))).toBe(75);
    expect(attendanceRate(week(0, 0, 0))).toBeNull();
    expect(drop(week(10, 100, 85), week(10, 100, 92))).toHaveLength(1); // -7 puntos
    expect(drop(week(10, 100, 88), week(10, 100, 92))).toHaveLength(0); // -4 puntos
    expect(drop(week(2, 6, 1), week(2, 6, 6))).toHaveLength(0); // pocos registros
    expect(drop(week(0, 0, 0), week(5, 50, 45))[0]?.title).toBe("Esta semana no se pasó lista en ninguna sesión");
    expect(drop(week(0, 0, 0), week(0, 0, 0))).toHaveLength(0);
  });

  it("el correo está en lenguaje llano, escapa el nombre y lleva el enlace de baja", () => {
    const items = buildOwnerDigestItems({ ...quiet, overdueInvoices: 2 }, links);
    const message = buildOwnerWeeklyDigestMessage({
      organizationName: "Club <Estrella>",
      items,
      preferencesUrl: "https://zaltyko.com/api/habitual-use/preferences?kind=owner_weekly_digest&token=t",
    });
    expect(message?.subject).toBe("Club <Estrella>: 1 cosa por mirar esta semana");
    expect(message?.html).toContain("Club &lt;Estrella&gt;");
    expect(message?.html).not.toContain("<Estrella>");
    expect(message?.text).toContain("2 cuotas vencidas");
    expect(message?.text).toContain("Si prefieres no recibir este resumen semanal");
  });

  it("la clave de deduplicación cambia solo con la semana", () => {
    expect(ownerDigestDedupeKey(ORG, MEMBER, "2026-W47")).toBe(`owner-weekly-digest:${ORG}:${MEMBER}:2026-W47`);
    expect(ownerDigestDedupeKey(ORG, MEMBER, "2026-W48")).not.toBe(ownerDigestDedupeKey(ORG, MEMBER, "2026-W47"));
  });
});

const recipient = (overrides: Partial<DigestRecipient> = {}): DigestRecipient => ({
  memberId: MEMBER,
  userId: USER,
  role: "owner",
  email: "direccion@ejemplo.test",
  organizationId: ORG,
  organizationName: "Club Prueba",
  timezone: "Europe/Madrid",
  ...overrides,
});

const scope: OwnerScope = {
  organization: { id: ORG, name: "Club Prueba", defaultCurrency: "EUR" },
  member: { id: MEMBER, role: "owner", locationScopeMode: "all" },
  locations: [{ id: LOC, name: "Sede", timezone: "Europe/Madrid" }],
  selectedLocationId: null,
  canViewOrganizationAggregate: true,
};

// Lunes 16-11-2026, 08:30 en Madrid.
const MONDAY = new Date("2026-11-16T07:30:00Z");

describe("disparo del resumen semanal (cron)", () => {
  const previous = { ...process.env };
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ZALTYKO_HABITUAL_USE_ENABLED = "true";
    process.env.ZALTYKO_OWNER_WEEKLY_DIGEST_ENABLED = "true";
    process.env.UNSUBSCRIBE_HMAC_SECRET = "s".repeat(32);
    mocks.execute.mockResolvedValue({ rows: [] });
    mocks.send.mockResolvedValue(true);
  });
  afterEach(() => {
    process.env = { ...previous };
  });

  const run = (
    options: {
      recipients?: DigestRecipient[];
      metrics?: OwnerDigestMetrics;
      now?: Date;
      resolveScope?: () => Promise<OwnerScope>;
    } = {}
  ) =>
    runOwnerWeeklyDigest({
      now: options.now ?? MONDAY,
      appUrl: "https://zaltyko.com",
      loadRecipients: async () => options.recipients ?? [recipient()],
      resolveScope: options.resolveScope ?? (async () => scope),
      loadMetrics: async () => options.metrics ?? { ...quiet, overdueInvoices: 2 },
    });

  it("con la bandera apagada no hace nada", async () => {
    delete process.env.ZALTYKO_OWNER_WEEKLY_DIGEST_ENABLED;
    const loadRecipients = vi.fn(async () => [recipient()]);
    const summary = await runOwnerWeeklyDigest({ now: MONDAY, loadRecipients });
    expect(summary.enabled).toBe(false);
    expect(loadRecipients).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("envía el lunes por la mañana con el emisor común y la clave de la semana", async () => {
    const summary = await run();
    expect(summary).toMatchObject({ enabled: true, inWindow: 1, sent: 1, empty: 0 });
    expect(mocks.send.mock.calls[0]?.[0]).toMatchObject({
      purpose: "transactional",
      to: "direccion@ejemplo.test",
      template: "owner-weekly-digest",
      tenantId: ORG,
      dedupeKey: ownerDigestDedupeKey(ORG, MEMBER, "2026-W47"),
    });
  });

  it("no envía fuera de la mañana del lunes de la sede", async () => {
    expect((await run({ now: new Date("2026-11-17T07:30:00Z") })).inWindow).toBe(0); // martes
    expect((await run({ now: new Date("2026-11-16T05:00:00Z") })).inWindow).toBe(0); // 06:00 local
    // Ciudad de México: a las 07:30 UTC aún es de madrugada.
    const mexico = recipient({ timezone: "America/Mexico_City" });
    expect((await run({ recipients: [mexico] })).inWindow).toBe(0);
    expect((await run({ recipients: [mexico], now: new Date("2026-11-16T15:00:00Z") })).sent).toBe(1);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("si no hay nada accionable no se envía", async () => {
    const summary = await run({ metrics: quiet });
    expect(summary).toMatchObject({ inWindow: 1, empty: 1, sent: 0 });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("no repite el resumen de la semana si ya salió", async () => {
    mocks.execute.mockResolvedValue({ rows: [{ found: 1 }] });
    const summary = await run();
    expect(summary).toMatchObject({ alreadySent: 1, sent: 0 });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("respeta la preferencia de quien lo desactivó", async () => {
    // Primera consulta: ya enviado (no); segunda: preferencia desactivada.
    mocks.execute.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ enabled: "false" }] });
    const summary = await run();
    expect(summary).toMatchObject({ optedOut: 1, sent: 0 });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("sin acceso a la superficie de dirección no calcula ni envía nada", async () => {
    const summary = await run({
      recipients: [recipient({ role: "manager" })],
      resolveScope: async () => {
        throw new OperationalError("LOCATION_SCOPE_DENIED", "Sin sedes asignadas", 403);
      },
    });
    expect(summary).toMatchObject({ noAccess: 1, sent: 0 });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("cada persona recibe lo suyo y un fallo no frena a las demás", async () => {
    const other = recipient({ memberId: "66666666-6666-4666-8666-666666666666", email: "otra@ejemplo.test" });
    mocks.send.mockRejectedValueOnce(new Error("BREVO_API_ERROR: 500")).mockResolvedValueOnce(true);
    const summary = await run({ recipients: [recipient(), other] });
    expect(summary).toMatchObject({ inWindow: 2, failed: 1, sent: 1 });
  });
});
