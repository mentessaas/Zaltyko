import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  send: vi.fn(),
}));

vi.mock("@/db", () => ({ db: { execute: mocks.execute } }));
vi.mock("@/lib/email/email-service", () => ({ sendEmailWithLogging: mocks.send }));

import { escapeHtml } from "@/lib/email/escape-html";
import {
  createEmailCoachReminderChannel,
  runCoachSessionReminders,
} from "@/modules/habitual-use/application/coach-reminders";
import {
  attendanceLink,
  buildCoachReminderMessage,
  coachReminderDedupeKey,
  planCoachReminders,
  type CoachReminderChannel,
  type CoachSessionCandidate,
} from "@/modules/habitual-use/domain/coach-reminders";

const ORG = "11111111-1111-4111-8111-111111111111";
const LOC = "22222222-2222-4222-8222-222222222222";
const SESSION = "33333333-3333-4333-8333-333333333333";
const MEMBER = "44444444-4444-4444-8444-444444444444";
const USER = "55555555-5555-4555-8555-555555555555";

// Lunes 16-11-2026, 17:00 UTC = 18:00 en Madrid y 11:00 en Ciudad de México.
const START = new Date("2026-11-16T17:00:00Z");
const END = new Date("2026-11-16T18:00:00Z");

function candidate(overrides: Partial<CoachSessionCandidate> = {}): CoachSessionCandidate {
  return {
    organizationId: ORG,
    organizationName: "Club Prueba",
    locationId: LOC,
    locationName: "Sede Centro",
    timezone: "Europe/Madrid",
    sessionId: SESSION,
    className: "Iniciación",
    status: "scheduled",
    startsAt: START,
    endsAt: END,
    expectedAthletes: 8,
    hasAttendance: false,
    recipientMemberId: MEMBER,
    recipientUserId: USER,
    recipientEmail: "entrenadora@ejemplo.test",
    ...overrides,
  };
}

const minutes = (value: number) => value * 60_000;

describe("selección de avisos a entrenadoras", () => {
  it("avisa unos 15 minutos antes y no antes de la ventana", () => {
    const at = (offset: number) => new Date(START.getTime() - minutes(offset));
    expect(planCoachReminders([candidate()], at(15)).map((item) => item.kind)).toEqual(["soon"]);
    expect(planCoachReminders([candidate()], at(20)).map((item) => item.kind)).toEqual(["soon"]);
    expect(planCoachReminders([candidate()], at(21))).toEqual([]);
    expect(planCoachReminders([candidate()], at(60))).toEqual([]);
    // Una vez empezada ya no es «pronto».
    expect(planCoachReminders([candidate()], new Date(START.getTime() + minutes(1)))).toEqual([]);
  });

  it("recuerda una sola vez la lista que falta, pasado un margen y dentro de 24 horas", () => {
    const at = (afterEnd: number) => new Date(END.getTime() + minutes(afterEnd));
    expect(planCoachReminders([candidate()], at(5))).toEqual([]);
    expect(planCoachReminders([candidate()], at(10)).map((item) => item.kind)).toEqual(["missing_attendance"]);
    expect(planCoachReminders([candidate()], at(120)).map((item) => item.kind)).toEqual(["missing_attendance"]);
    // Pasadas 24 horas lo recoge «listas sin pasar» de Resumen.
    expect(planCoachReminders([candidate()], at(24 * 60 + 1))).toEqual([]);
  });

  it("no recuerda la lista si ya existe, si no hay gimnastas esperadas o si se canceló", () => {
    const now = new Date(END.getTime() + minutes(30));
    expect(planCoachReminders([candidate({ hasAttendance: true })], now)).toEqual([]);
    expect(planCoachReminders([candidate({ expectedAthletes: 0 })], now)).toEqual([]);
    expect(planCoachReminders([candidate({ status: "cancelled" })], now)).toEqual([]);
    const before = new Date(START.getTime() - minutes(10));
    expect(planCoachReminders([candidate({ status: "cancelled" })], before)).toEqual([]);
  });

  it("de madrugada en la sede no manda el recordatorio de lista; el aviso previo sí", () => {
    // Sesión de 20:30 a 21:30 en Madrid: a las 22:10 locales es hora de silencio.
    const lateEnd = new Date("2026-11-16T20:30:00Z"); // 21:30 local
    const lateStart = new Date("2026-11-16T19:30:00Z"); // 20:30 local
    const late = candidate({ startsAt: lateStart, endsAt: lateEnd });
    expect(planCoachReminders([late], new Date("2026-11-16T21:05:00Z"))).toEqual([]); // 22:05 local
    // A las 21:40 locales todavía se puede.
    expect(planCoachReminders([late], new Date("2026-11-16T20:40:00Z")).map((item) => item.kind)).toEqual([
      "missing_attendance",
    ]);
    // Una clase de las 06:30 locales se avisa a las 06:15: es el aviso previo, no se silencia.
    const early = candidate({
      startsAt: new Date("2026-11-16T05:30:00Z"),
      endsAt: new Date("2026-11-16T06:30:00Z"),
    });
    expect(planCoachReminders([early], new Date("2026-11-16T05:15:00Z")).map((item) => item.kind)).toEqual(["soon"]);
  });

  it("la misma sesión y persona producen un solo aviso aunque la fila se repita", () => {
    const now = new Date(START.getTime() - minutes(10));
    const planned = planCoachReminders([candidate(), candidate()], now);
    expect(planned).toHaveLength(1);
    expect(planned[0]?.dedupeKey).toBe(coachReminderDedupeKey("soon", SESSION, MEMBER));
  });

  it("dos personas asignadas a la misma sesión reciben cada una el suyo", () => {
    const now = new Date(START.getTime() - minutes(10));
    const other = candidate({ recipientMemberId: "66666666-6666-4666-8666-666666666666", recipientEmail: "otra@ejemplo.test" });
    const planned = planCoachReminders([candidate(), other], now);
    expect(planned.map((item) => item.candidate.recipientEmail).sort()).toEqual([
      "entrenadora@ejemplo.test",
      "otra@ejemplo.test",
    ]);
    expect(new Set(planned.map((item) => item.dedupeKey)).size).toBe(2);
  });

  it("ignora filas sin correo", () => {
    const now = new Date(START.getTime() - minutes(10));
    expect(planCoachReminders([candidate({ recipientEmail: "  " })], now)).toEqual([]);
  });
});

describe("mensaje a la entrenadora", () => {
  it("dice la hora local de la sede y enlaza a la asistencia de esa sesión", () => {
    const message = buildCoachReminderMessage({
      kind: "soon",
      candidate: candidate(),
      appUrl: "https://zaltyko.com/",
      preferencesUrl: "https://zaltyko.com/api/habitual-use/preferences?kind=coach_session_reminders&token=t",
    });
    expect(message.subject).toBe("Tu clase de las 18:00 empieza pronto: pasa lista");
    expect(message.url).toBe(
      `https://zaltyko.com/owner/attendance?organizationId=${ORG}&locationId=${LOC}&sessionId=${SESSION}`
    );
    expect(message.html).toContain(escapeHtml(message.url));
    expect(message.text).toContain(message.url);
    expect(message.text).toContain("Si no quieres recibir estos avisos de clase");

    const mexico = buildCoachReminderMessage({
      kind: "soon",
      candidate: candidate({ timezone: "America/Mexico_City" }),
      appUrl: "https://zaltyko.com",
      preferencesUrl: null,
    });
    expect(mexico.subject).toBe("Tu clase de las 11:00 empieza pronto: pasa lista");
    expect(mexico.text).not.toContain("Si no quieres recibir");
  });

  it("el recordatorio de lista pendiente es distinto y escapa el contenido", () => {
    const message = buildCoachReminderMessage({
      kind: "missing_attendance",
      candidate: candidate({ className: "<b>Élite</b> & co" }),
      appUrl: "https://zaltyko.com",
      preferencesUrl: null,
    });
    expect(message.subject).toBe("Falta la lista de tu clase de las 18:00");
    expect(message.html).not.toContain("<b>Élite</b>");
    expect(message.html).toContain("&lt;b&gt;Élite&lt;/b&gt; &amp; co");
    expect(message.text).toContain("único recordatorio");
  });

  it("el enlace directo se construye con parámetros codificados", () => {
    expect(attendanceLink("https://zaltyko.com", { organizationId: "a b", locationId: "c&d", sessionId: "e" })).toBe(
      "https://zaltyko.com/owner/attendance?organizationId=a+b&locationId=c%26d&sessionId=e"
    );
  });
});

describe("disparo de los avisos (cron)", () => {
  const previous = { ...process.env };
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ZALTYKO_HABITUAL_USE_ENABLED = "true";
    process.env.ZALTYKO_COACH_REMINDERS_ENABLED = "true";
    process.env.UNSUBSCRIBE_HMAC_SECRET = "s".repeat(32);
    // Sin preferencia guardada: los avisos están activados.
    mocks.execute.mockResolvedValue({ rows: [] });
  });
  afterEach(() => {
    process.env = { ...previous };
  });

  const now = new Date(START.getTime() - minutes(12));
  const load = async () => [candidate()];

  it("con la bandera apagada no toca la base de datos ni envía nada", async () => {
    delete process.env.ZALTYKO_COACH_REMINDERS_ENABLED;
    const loadSpy = vi.fn(load);
    const summary = await runCoachSessionReminders({ now, load: loadSpy });
    expect(summary.enabled).toBe(false);
    expect(loadSpy).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("sin el interruptor general tampoco actúa, aunque la bandera de avisos esté encendida", async () => {
    delete process.env.ZALTYKO_HABITUAL_USE_ENABLED;
    const summary = await runCoachSessionReminders({ now, load });
    expect(summary.enabled).toBe(false);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("envía por correo con el emisor común, deduplicado y sin datos personales en la traza", async () => {
    mocks.send.mockResolvedValue(true);
    const summary = await runCoachSessionReminders({ now, load, appUrl: "https://zaltyko.com" });
    expect(summary).toMatchObject({ enabled: true, planned: 1, sent: 1, notSent: 0, optedOut: 0, failed: 0 });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    const options = mocks.send.mock.calls[0]?.[0];
    expect(options).toMatchObject({
      purpose: "transactional",
      to: "entrenadora@ejemplo.test",
      template: "coach-session-soon",
      tenantId: ORG,
      dedupeKey: `coach-session-soon:${SESSION}:${MEMBER}`,
    });
    // El correo canónico no se enlaza con la tabla antigua de academias.
    expect(options).not.toHaveProperty("academyId");
    expect(JSON.stringify(options.metadata)).not.toContain("entrenadora@ejemplo.test");
    expect(options.html).toContain("/api/habitual-use/preferences?kind=coach_session_reminders");
  });

  it("si el emisor rechaza el envío (duplicado o baja) no cuenta como enviado", async () => {
    mocks.send.mockResolvedValue(false);
    const summary = await runCoachSessionReminders({ now, load, appUrl: "https://zaltyko.com" });
    expect(summary).toMatchObject({ planned: 1, sent: 0, notSent: 1 });
  });

  it("respeta la preferencia: quien desactivó los avisos no recibe nada", async () => {
    // La única consulta previa al envío es la de la preferencia guardada.
    mocks.execute.mockResolvedValue({ rows: [{ enabled: "false" }] });
    const summary = await runCoachSessionReminders({ now, load, appUrl: "https://zaltyko.com" });
    expect(summary).toMatchObject({ planned: 1, optedOut: 1, sent: 0 });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("sin enlace firmado para desactivarlo no se envía", async () => {
    delete process.env.UNSUBSCRIBE_HMAC_SECRET;
    delete process.env.INTERNAL_AUTH_SECRET;
    const summary = await runCoachSessionReminders({ now, load, appUrl: "https://zaltyko.com" });
    expect(summary).toMatchObject({ planned: 1, withoutPreferencesLink: 1, sent: 0 });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("un fallo de envío de una persona no impide el de las demás", async () => {
    const second = candidate({
      recipientMemberId: "66666666-6666-4666-8666-666666666666",
      recipientEmail: "otra@ejemplo.test",
    });
    mocks.send.mockRejectedValueOnce(new Error("BREVO_API_ERROR: 500")).mockResolvedValueOnce(true);
    const summary = await runCoachSessionReminders({
      now,
      load: async () => [candidate(), second],
      appUrl: "https://zaltyko.com",
    });
    expect(summary).toMatchObject({ planned: 2, sent: 1, failed: 1 });
  });

  it("entrega por todos los canales configurados: el punto de extensión de push", async () => {
    const push: CoachReminderChannel = { name: "push", deliver: vi.fn(async () => "sent" as const) };
    mocks.send.mockResolvedValue(true);
    const summary = await runCoachSessionReminders({
      now,
      load,
      appUrl: "https://zaltyko.com",
      channels: [createEmailCoachReminderChannel(), push],
    });
    expect(summary.sent).toBe(1);
    expect(push.deliver).toHaveBeenCalledTimes(1);
    const delivery = vi.mocked(push.deliver).mock.calls[0]?.[0];
    expect(delivery?.message.url).toContain("/owner/attendance?");
    expect(delivery?.recipient.userId).toBe(USER);
  });
});
