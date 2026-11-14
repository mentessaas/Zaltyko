import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), send: vi.fn() }));

vi.mock("@/db", () => ({ db: { execute: mocks.execute } }));
vi.mock("@/lib/email/email-service", () => ({ sendEmailWithLogging: mocks.send }));

import { runAtRiskAlert } from "@/modules/habitual-use/application/at-risk-alert";
import { resetUsageStorageCache } from "@/modules/habitual-use/application/storage";
import { recordFamilyPortalView, recordStaffVisit } from "@/modules/habitual-use/application/usage-events";
import {
  AT_RISK_INACTIVE_DAYS,
  atRiskAlertDedupeKey,
  buildAtRiskAlertMessage,
  familyWeekPseudonym,
  newlyAtRisk,
  selectAtRiskAcademies,
  type AcademyActivitySnapshot,
} from "@/modules/habitual-use/domain/usage";

const NOW = new Date("2026-11-16T09:00:00Z");
const DAY = 86_400_000;
const ORG = "11111111-1111-4111-8111-111111111111";
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);

function academy(overrides: Partial<AcademyActivitySnapshot> = {}): AcademyActivitySnapshot {
  return {
    organizationId: ORG,
    name: "Club Prueba",
    status: "active",
    countryCode: "ES",
    createdAt: daysAgo(60),
    lastActivityAt: daysAgo(10),
    ...overrides,
  };
}

describe("academias en riesgo", () => {
  it("marca las que llevan 7 días o más sin actividad del equipo", () => {
    expect(selectAtRiskAcademies([academy({ lastActivityAt: daysAgo(6) })], NOW)).toEqual([]);
    const [risk] = selectAtRiskAcademies([academy({ lastActivityAt: daysAgo(AT_RISK_INACTIVE_DAYS) })], NOW);
    expect(risk?.inactiveDays).toBe(7);
  });

  it("ignora las cerradas, las suspendidas y las recién creadas", () => {
    expect(selectAtRiskAcademies([academy({ status: "closed" })], NOW)).toEqual([]);
    expect(selectAtRiskAcademies([academy({ status: "suspended" })], NOW)).toEqual([]);
    expect(selectAtRiskAcademies([academy({ createdAt: daysAgo(3), lastActivityAt: null })], NOW)).toEqual([]);
  });

  it("una academia que nunca arrancó entra y va la primera", () => {
    const list = selectAtRiskAcademies(
      [
        academy({ organizationId: "a", name: "Parada", lastActivityAt: daysAgo(30) }),
        academy({ organizationId: "b", name: "Nunca", lastActivityAt: null, status: "trial" }),
      ],
      NOW
    );
    expect(list.map((item) => item.name)).toEqual(["Nunca", "Parada"]);
    expect(list[0]?.alertKey).toBe("b:never");
  });

  it("solo se avisa una vez por episodio de inactividad", () => {
    const risk = selectAtRiskAcademies([academy()], NOW);
    expect(newlyAtRisk(risk, new Set())).toHaveLength(1);
    expect(newlyAtRisk(risk, new Set([risk[0]!.alertKey]))).toHaveLength(0);
    // Si vuelve a tener actividad y se para otra vez, la clave es otra.
    const later = selectAtRiskAcademies([academy({ lastActivityAt: daysAgo(8) })], NOW);
    expect(later[0]!.alertKey).not.toBe(risk[0]!.alertKey);
  });

  it("el mensaje solo lista las nuevas, escapa los nombres y se omite si no hay ninguna", () => {
    const risk = selectAtRiskAcademies([academy({ name: "<Club>" })], NOW);
    const message = buildAtRiskAlertMessage({ newlyAtRisk: risk, stillAtRiskCount: 3, viewUrl: "https://zaltyko.com/super-admin/uso" });
    expect(message?.subject).toBe("1 academia en riesgo: sin actividad en 7 días");
    expect(message?.html).toContain("&lt;Club&gt;");
    expect(message?.text).toContain("Otras 2 siguen en riesgo");
    expect(buildAtRiskAlertMessage({ newlyAtRisk: [], stillAtRiskCount: 3, viewUrl: "x" })).toBeNull();
    expect(atRiskAlertDedupeKey(["b", "a"])).toBe(atRiskAlertDedupeKey(["a", "b"]));
  });
});

describe("seudónimo de familia", () => {
  const secret = "s".repeat(32);
  it("es estable en la semana, cambia de semana y no contiene la cuenta", () => {
    const a = familyWeekPseudonym({ userId: "user-1", weekKey: "2026-W47", secret });
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(familyWeekPseudonym({ userId: "user-1", weekKey: "2026-W47", secret })).toBe(a);
    expect(familyWeekPseudonym({ userId: "user-1", weekKey: "2026-W48", secret })).not.toBe(a);
    expect(familyWeekPseudonym({ userId: "user-2", weekKey: "2026-W47", secret })).not.toBe(a);
  });
  it("depende del secreto: otro secreto da otro seudónimo", () => {
    const base = { userId: "user-1", weekKey: "2026-W47" };
    expect(familyWeekPseudonym({ ...base, secret })).not.toBe(familyWeekPseudonym({ ...base, secret: "t".repeat(32) }));
  });
  it("sin secreto suficiente no se registra nada", () => {
    expect(familyWeekPseudonym({ userId: "u", weekKey: "2026-W47", secret: null })).toBeNull();
    expect(familyWeekPseudonym({ userId: "u", weekKey: "2026-W47", secret: "corto" })).toBeNull();
  });
});

describe("registro de eventos de uso", () => {
  const previous = { ...process.env };
  beforeEach(() => {
    vi.clearAllMocks();
    resetUsageStorageCache();
  });
  afterEach(() => {
    process.env = { ...previous };
  });

  it("con la bandera apagada no toca la base de datos", async () => {
    expect(await recordStaffVisit({ organizationId: ORG, role: "owner" })).toBe(false);
    expect(await recordFamilyPortalView({ organizationId: ORG, userId: "u" })).toBe(false);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("sin la tabla instalada no registra", async () => {
    process.env.ZALTYKO_HABITUAL_USE_ENABLED = "true";
    process.env.ZALTYKO_USAGE_METRICS_ENABLED = "true";
    mocks.execute.mockResolvedValue({ rows: [{ available: false }] });
    expect(await recordStaffVisit({ organizationId: ORG, role: "coach" })).toBe(false);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it("registra una visita del equipo sin ningún dato de persona", async () => {
    process.env.ZALTYKO_HABITUAL_USE_ENABLED = "true";
    process.env.ZALTYKO_USAGE_METRICS_ENABLED = "true";
    mocks.execute.mockResolvedValue({ rows: [{ available: true }] });
    expect(await recordStaffVisit({ organizationId: ORG, role: "coach", now: NOW })).toBe(true);
    expect(mocks.execute).toHaveBeenCalledTimes(2);
  });

  it("rechaza roles y academias inválidos y no lanza ante un error de base de datos", async () => {
    process.env.ZALTYKO_HABITUAL_USE_ENABLED = "true";
    process.env.ZALTYKO_USAGE_METRICS_ENABLED = "true";
    expect(await recordStaffVisit({ organizationId: ORG, role: "family" })).toBe(false);
    expect(await recordStaffVisit({ organizationId: "no-es-uuid", role: "owner" })).toBe(false);
    mocks.execute.mockRejectedValue(new Error("db caída"));
    expect(await recordStaffVisit({ organizationId: ORG, role: "owner" })).toBe(false);
  });

  it("las familias no se registran sin secreto de seudónimo", async () => {
    process.env.ZALTYKO_HABITUAL_USE_ENABLED = "true";
    process.env.ZALTYKO_USAGE_METRICS_ENABLED = "true";
    delete process.env.ZALTYKO_USAGE_PSEUDONYM_SECRET;
    // Los secretos de los enlaces de baja no sirven para el seudónimo.
    process.env.UNSUBSCRIBE_HMAC_SECRET = "s".repeat(32);
    process.env.INTERNAL_AUTH_SECRET = "s".repeat(32);
    expect(await recordFamilyPortalView({ organizationId: ORG, userId: "u" })).toBe(false);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});

describe("aviso a Elvis (cron)", () => {
  const previous = { ...process.env };
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.send.mockResolvedValue(true);
  });
  afterEach(() => {
    process.env = { ...previous };
  });
  const enable = () => {
    process.env.ZALTYKO_HABITUAL_USE_ENABLED = "true";
    process.env.ZALTYKO_USAGE_METRICS_ENABLED = "true";
    process.env.ZALTYKO_AT_RISK_ALERTS_ENABLED = "true";
    process.env.ZALTYKO_AT_RISK_ALERT_EMAIL = "elvis@ejemplo.test";
  };
  const risk = () => selectAtRiskAcademies([academy()], NOW);

  it("apagado o sin destinatario no hace nada", async () => {
    expect((await runAtRiskAlert({ now: NOW })).enabled).toBe(false);
    enable();
    delete process.env.ZALTYKO_AT_RISK_ALERT_EMAIL;
    expect(await runAtRiskAlert({ now: NOW })).toMatchObject({ enabled: true, recipientConfigured: false, sent: false });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("envía solo las novedades y no repite", async () => {
    enable();
    const options = { now: NOW, appUrl: "https://zaltyko.com", loadAtRisk: async () => ({ atRisk: risk() }) };
    const first = await runAtRiskAlert({ ...options, loadAlertedKeys: async () => new Set<string>() });
    expect(first).toMatchObject({ atRisk: 1, newlyAtRisk: 1, sent: true });
    expect(mocks.send.mock.calls[0]?.[0]).toMatchObject({
      to: "elvis@ejemplo.test",
      template: "usage-at-risk-alert",
      metadata: { alertedKeys: [risk()[0]!.alertKey] },
    });
    const again = await runAtRiskAlert({ ...options, loadAlertedKeys: async () => new Set(risk().map((item) => item.alertKey)) });
    expect(again).toMatchObject({ newlyAtRisk: 0, sent: false });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
});
