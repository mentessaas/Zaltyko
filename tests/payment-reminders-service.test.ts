import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OperationalError } from "@/modules/shared/domain/operational-error";

const ORG = "a0000000-0000-4000-8000-000000000001";
const MEMBER = "b0000000-0000-4000-8000-000000000001";
const USER = "c0000000-0000-4000-8000-000000000001";
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-20T10:00:00Z");

const mocks = vi.hoisted(() => ({
  dbExecute: vi.fn(),
  txExecute: vi.fn(),
  resolveOwnerScope: vi.fn(),
  send: vi.fn(),
  assertAvailable: vi.fn(),
  loadCandidates: vi.fn(),
  loadOrganization: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/db", () => ({ db: { execute: mocks.dbExecute } }));
vi.mock("@/lib/db-transactions", () => ({
  withTransaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({ execute: mocks.txExecute }),
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/email/email-service", () => ({ sendEmailWithLogging: mocks.send }));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({ resolveOwnerScope: mocks.resolveOwnerScope }));
vi.mock("@/modules/shared/infrastructure/transactional-records", () => ({ appendAuditEntry: mocks.audit }));
vi.mock("@/modules/payment-reminders/application/storage", async (importActual) => ({
  ...(await importActual<typeof import("@/modules/payment-reminders/application/storage")>()),
  assertPaymentRemindersAvailable: mocks.assertAvailable,
}));
vi.mock("@/modules/payment-reminders/application/candidates", async (importActual) => ({
  ...(await importActual<typeof import("@/modules/payment-reminders/application/candidates")>()),
  loadReminderCandidates: mocks.loadCandidates,
  loadOrganizationProfile: mocks.loadOrganization,
  lockCharges: vi.fn(),
}));

import type { ReminderCandidate } from "@/modules/payment-reminders/application/candidates";
import {
  previewPaymentReminders,
  runAutomaticPaymentReminders,
  sendPaymentReminders,
} from "@/modules/payment-reminders/application/service";
import {
  ReminderValidationError,
  updatePaymentReminderSettings,
} from "@/modules/payment-reminders/application/settings";

const dialect = new PgDialect();
const queryOf = (call: unknown[]) => dialect.sqlToQuery(call[0] as Parameters<PgDialect["sqlToQuery"]>[0]);

function scope(overrides: { role?: string; canViewOrganizationAggregate?: boolean } = {}) {
  return {
    organization: { id: ORG, name: "Gimnasia Sol", defaultCurrency: "EUR" },
    member: { id: MEMBER, role: overrides.role ?? "owner", locationScopeMode: "all" },
    locations: [{ id: "d0000000-0000-4000-8000-000000000001", name: "Sede" }],
    selectedLocationId: null,
    canViewOrganizationAggregate: overrides.canViewOrganizationAggregate ?? true,
  };
}

function settingsRow(overrides: Record<string, unknown> = {}) {
  return {
    subject_template: null,
    body_template: null,
    payment_instructions: "Bizum al 600 000 000",
    reply_to_email: "club@example.invalid",
    min_interval_days: 7,
    is_auto_enabled: false,
    auto_after_days: 3,
    version: 1,
    ...overrides,
  };
}

let nextId = 1;
function candidate(overrides: Partial<ReminderCandidate> = {}): ReminderCandidate {
  const n = nextId++;
  return {
    chargeId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    familyId: "f0000000-0000-4000-8000-000000000001",
    locationId: "d0000000-0000-4000-8000-000000000001",
    locationName: "Sede",
    locationTimezone: "Europe/Madrid",
    invoiceReference: `MENSUAL-${n}`,
    currency: "EUR",
    dueAt: new Date(Date.now() - 5 * DAY),
    servicePeriodStart: "2026-11-01",
    outstandingCents: 4500,
    guardianId: "90000000-0000-4000-8000-000000000001",
    payerFirstName: "María",
    payerEmail: "maria@example.invalid",
    lastSentAt: null,
    sentCount: 0,
    hasPendingReservation: false,
    ...overrides,
  };
}

const manualAll = { userId: USER, organizationId: ORG, selection: { kind: "overdue" } as const };

beforeEach(() => {
  vi.resetAllMocks();
  nextId = 1;
  mocks.assertAvailable.mockResolvedValue(undefined);
  mocks.resolveOwnerScope.mockResolvedValue(scope());
  mocks.dbExecute.mockResolvedValue({ rows: [settingsRow()] });
  mocks.txExecute.mockResolvedValue({ rows: [] });
  mocks.loadOrganization.mockResolvedValue({ name: "Gimnasia Sol", countryCode: "ES", status: "active" });
  mocks.send.mockResolvedValue(true);
});

describe("autorización y bandera", () => {
  it.each(["manager", "coach", "viewer"])("el rol %s no puede enviar, previsualizar ni cambiar la plantilla", async (role) => {
    mocks.resolveOwnerScope.mockResolvedValue(scope({ role }));
    await expect(sendPaymentReminders(manualAll)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(previewPaymentReminders(manualAll)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      updatePaymentReminderSettings({
        userId: USER,
        organizationId: ORG,
        settings: { minIntervalDays: 7, autoEnabled: false, autoAfterDays: 3 },
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.txExecute).not.toHaveBeenCalled();
    expect(mocks.loadCandidates).not.toHaveBeenCalled();
  });

  it("administración sí puede enviar", async () => {
    mocks.resolveOwnerScope.mockResolvedValue(scope({ role: "admin" }));
    mocks.loadCandidates.mockResolvedValue([]);
    await expect(sendPaymentReminders(manualAll)).resolves.toMatchObject({ sent: 0 });
  });

  it("con la bandera apagada o sin tablas responde 503 sin tocar la academia", async () => {
    mocks.assertAvailable.mockRejectedValue(new OperationalError("FEATURE_NOT_AVAILABLE", "no disponible", 503));
    await expect(sendPaymentReminders(manualAll)).rejects.toMatchObject({ code: "FEATURE_NOT_AVAILABLE", status: 503 });
    expect(mocks.resolveOwnerScope).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("una academia suspendida no envía correos", async () => {
    mocks.loadOrganization.mockResolvedValue({ name: "Gimnasia Sol", countryCode: "ES", status: "suspended" });
    await expect(sendPaymentReminders(manualAll)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("cambiar la plantilla exige acceso a todas las sedes", async () => {
    mocks.resolveOwnerScope.mockResolvedValue(scope({ canViewOrganizationAggregate: false }));
    await expect(
      updatePaymentReminderSettings({
        userId: USER,
        organizationId: ORG,
        settings: { minIntervalDays: 7, autoEnabled: false, autoAfterDays: 3 },
      })
    ).rejects.toMatchObject({ code: "LOCATION_SCOPE_DENIED" });
    expect(mocks.txExecute).not.toHaveBeenCalled();
  });
});

describe("envío manual", () => {
  it("manda un correo por tutor pagador, solo a su correo, con la plantilla de la academia", async () => {
    const maria1 = candidate();
    const maria2 = candidate({ servicePeriodStart: "2026-10-01", dueAt: new Date(Date.now() - 35 * DAY) });
    const luis = candidate({ guardianId: "90000000-0000-4000-8000-000000000002", payerEmail: "luis@example.invalid", payerFirstName: "Luis" });
    const recent = candidate({ lastSentAt: new Date(Date.now() - 2 * DAY), sentCount: 1 });
    const noEmail = candidate({ payerEmail: null });
    const all = [maria1, maria2, luis, recent, noEmail];
    mocks.loadCandidates.mockResolvedValue(all);

    const result = await sendPaymentReminders(manualAll);

    expect(result).toMatchObject({ sent: 3, emails: 2, failed: 0, skipped: 2, remaining: 0 });
    expect(mocks.send).toHaveBeenCalledTimes(2);
    const recipients = mocks.send.mock.calls.map(([options]) => options.to).sort();
    expect(recipients).toEqual(["luis@example.invalid", "maria@example.invalid"]);
    const [first] = mocks.send.mock.calls.map(([options]) => options).filter((options) => options.to === "maria@example.invalid");
    expect(first).toMatchObject({
      purpose: "transactional",
      template: "payment-reminder",
      tenantId: ORG,
      replyTo: "club@example.invalid",
    });
    // El emisor común liga academyId a la tabla antigua: no se le pasa.
    expect(first).not.toHaveProperty("academyId");
    expect(first.dedupeKey).toMatch(/^payment-reminder:[0-9a-f-]{36}$/);
    expect(first.text).toContain("Bizum al 600 000 000");
    expect(first.text).toContain("Cuota de octubre de 2026 y Cuota de noviembre de 2026");
    expect(first.text).not.toContain("luis");

    const outcomes = Object.fromEntries(result.outcomes.map((item) => [item.chargeId, item]));
    expect(outcomes[recent.chargeId]).toMatchObject({ outcome: "skipped", reason: "recently_reminded" });
    expect(outcomes[noEmail.chargeId]).toMatchObject({ outcome: "skipped", reason: "no_email" });
  });

  it("reserva una fila por cuota apta antes de enviar y la deja en sent; no reserva las omitidas", async () => {
    mocks.loadCandidates.mockResolvedValue([candidate(), candidate({ lastSentAt: new Date(Date.now() - DAY), sentCount: 1 })]);
    await sendPaymentReminders(manualAll);

    const queries = mocks.txExecute.mock.calls.map(queryOf);
    const inserts = queries.filter((query) => query.sql.includes("insert into zaltyko.payment_reminders"));
    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.params).toContain("manual");
    expect(inserts[0]!.params).toContain(MEMBER);
    const updates = queries.filter((query) => query.sql.includes("update zaltyko.payment_reminders"));
    expect(updates).toHaveLength(1);
    expect(updates[0]!.params).toContain("sent");
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "payment_reminder.sent",
        organizationId: ORG,
        // Sin correo, nombre ni texto del mensaje en la auditoría.
        after: { origin: "manual", chargeCount: 1, status: "sent" },
      })
    );
    const audited = JSON.stringify(mocks.audit.mock.calls);
    expect(audited).not.toContain("maria@example.invalid");
    expect(audited).not.toContain("Bizum");
  });

  it("si el proveedor no confirma, la cuota queda failed y no cuenta para el límite", async () => {
    mocks.loadCandidates.mockResolvedValue([candidate()]);
    mocks.send.mockResolvedValue(false);
    const result = await sendPaymentReminders(manualAll);
    expect(result).toMatchObject({ sent: 0, emails: 0, failed: 1 });
    expect(result.outcomes[0]).toMatchObject({ outcome: "failed", reason: "not_delivered" });
    const updates = mocks.txExecute.mock.calls.map(queryOf).filter((query) => query.sql.includes("update zaltyko.payment_reminders"));
    expect(updates[0]!.params).toContain("failed");
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "payment_reminder.failed" }));
  });

  it("un error de transporte en un correo no impide los demás ni rompe el envío", async () => {
    const maria = candidate();
    const luis = candidate({ guardianId: "90000000-0000-4000-8000-000000000002", payerEmail: "luis@example.invalid" });
    mocks.loadCandidates.mockResolvedValue([maria, luis]);
    mocks.send.mockRejectedValueOnce(new Error("BREVO_API_ERROR: 500")).mockResolvedValueOnce(true);
    const result = await sendPaymentReminders(manualAll);
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ sent: 1, emails: 1, failed: 1 });
  });

  it("respeta el intervalo configurado por la academia", async () => {
    mocks.dbExecute.mockResolvedValue({ rows: [settingsRow({ min_interval_days: 14 })] });
    mocks.loadCandidates.mockResolvedValue([candidate({ lastSentAt: new Date(Date.now() - 10 * DAY), sentCount: 1 })]);
    const result = await sendPaymentReminders(manualAll);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(result.outcomes[0]).toMatchObject({ outcome: "skipped", reason: "recently_reminded" });
  });

  it("dedupe: si otro envío reservó la cuota entre la primera lectura y el bloqueo, no se envía nada", async () => {
    const charge = candidate();
    mocks.loadCandidates
      .mockResolvedValueOnce([charge])
      .mockResolvedValueOnce([{ ...charge, hasPendingReservation: true }]);
    const result = await sendPaymentReminders(manualAll);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.txExecute).not.toHaveBeenCalled();
    expect(result.outcomes[0]).toMatchObject({ outcome: "skipped", reason: "in_progress" });
  });

  it("una cuota concreta que no existe o ya está saldada se informa, no se envía", async () => {
    mocks.loadCandidates.mockResolvedValue([]);
    const missing = "00000000-0000-4000-8000-0000000000ff";
    const result = await sendPaymentReminders({ ...manualAll, selection: { kind: "charges", chargeIds: [missing] } });
    expect(result.outcomes).toEqual([{ chargeId: missing, outcome: "skipped", reason: "not_found" }]);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

describe("vista previa", () => {
  it("muestra el texto exacto con el destinatario enmascarado y no reserva ni envía nada", async () => {
    mocks.loadCandidates.mockResolvedValue([candidate()]);
    const preview = await previewPaymentReminders(manualAll);
    expect(preview).toMatchObject({ totalEmails: 1, totalCharges: 1 });
    expect(preview.samples[0]!.recipient).toBe("m***@example.invalid");
    expect(preview.samples[0]!.text).toContain("Hola María:");
    expect(JSON.stringify(preview)).not.toContain("maria@example.invalid");
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.txExecute).not.toHaveBeenCalled();
  });

  it("usa los cambios sin guardar y rechaza un tono agresivo", async () => {
    mocks.loadCandidates.mockResolvedValue([candidate()]);
    const preview = await previewPaymentReminders({ ...manualAll, draft: { subject: "Cuota de {{nombre}}", body: "Hola {{nombre}}" } });
    expect(preview.samples[0]!.subject).toBe("Cuota de María");
    await expect(
      previewPaymentReminders({ ...manualAll, draft: { body: "Iniciaremos acciones legales" } })
    ).rejects.toBeInstanceOf(ReminderValidationError);
  });
});

describe("ajustes", () => {
  it("rechaza plantillas con variables desconocidas o tono agresivo sin escribir nada", async () => {
    await expect(
      updatePaymentReminderSettings({
        userId: USER,
        organizationId: ORG,
        settings: { bodyTemplate: "Sois morosos {{telefono}}", minIntervalDays: 7, autoEnabled: false, autoAfterDays: 3 },
      })
    ).rejects.toBeInstanceOf(ReminderValidationError);
    expect(mocks.txExecute).not.toHaveBeenCalled();
  });

  it("guarda plantilla y límites y audita solo la configuración, no el texto", async () => {
    await updatePaymentReminderSettings({
      userId: USER,
      organizationId: ORG,
      settings: {
        subjectTemplate: "Cuota pendiente",
        bodyTemplate: "Hola {{nombre}}, quedan {{importe}}.",
        paymentInstructions: "IBAN ES00 0000",
        replyToEmail: "Club@Example.invalid",
        minIntervalDays: 10,
        autoEnabled: true,
        autoAfterDays: 5,
      },
    });
    const [upsert] = mocks.txExecute.mock.calls.map(queryOf);
    expect(upsert!.sql).toContain("insert into zaltyko.payment_reminder_settings");
    expect(upsert!.params).toEqual(expect.arrayContaining([ORG, "Cuota pendiente", "club@example.invalid", 10, true, 5, MEMBER]));
    const audited = JSON.stringify(mocks.audit.mock.calls);
    expect(audited).toContain("payment_reminder_settings.updated");
    expect(audited).not.toContain("IBAN");
    expect(audited).not.toContain("quedan");
  });
});

describe("recordatorio automático", () => {
  it("apagado por defecto: sin bandera no consulta nada ni envía", async () => {
    vi.stubEnv("ZALTYKO_PAYMENT_REMINDERS_ENABLED", "true");
    vi.stubEnv("ZALTYKO_PAYMENT_REMINDERS_AUTO_ENABLED", "");
    await expect(runAutomaticPaymentReminders(NOW)).resolves.toEqual({ enabled: false, organizations: 0, sent: 0, failed: 0 });
    expect(mocks.dbExecute).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("con las dos banderas y la academia activada, manda un único aviso a las vencidas sin avisar", async () => {
    vi.stubEnv("ZALTYKO_PAYMENT_REMINDERS_ENABLED", "true");
    vi.stubEnv("ZALTYKO_PAYMENT_REMINDERS_AUTO_ENABLED", "true");
    mocks.dbExecute
      .mockResolvedValueOnce({ rows: [{ organizationId: ORG }] })
      .mockResolvedValueOnce({ rows: [settingsRow({ is_auto_enabled: true })] })
      .mockResolvedValueOnce({ rows: [{ id: "d0000000-0000-4000-8000-000000000001" }] });
    const dueAt = new Date(NOW.getTime() - 4 * DAY);
    mocks.loadCandidates.mockResolvedValue([
      candidate({ dueAt }),
      candidate({ dueAt: new Date(NOW.getTime() - 1 * DAY) }),
      candidate({ dueAt, lastSentAt: new Date(NOW.getTime() - 2 * DAY), sentCount: 1 }),
    ]);

    const result = await runAutomaticPaymentReminders(NOW);

    expect(result).toEqual({ enabled: true, organizations: 1, sent: 1, failed: 0 });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send.mock.calls[0]![0].metadata).toMatchObject({ origin: "automatic" });
    const insert = mocks.txExecute.mock.calls.map(queryOf).find((query) => query.sql.includes("insert into zaltyko.payment_reminders"))!;
    expect(insert.params).toContain("automatic");
    expect(insert.params).not.toContain(MEMBER);
    vi.unstubAllEnvs();
  });

  it("una academia que falla no frena a las demás", async () => {
    vi.stubEnv("ZALTYKO_PAYMENT_REMINDERS_ENABLED", "true");
    vi.stubEnv("ZALTYKO_PAYMENT_REMINDERS_AUTO_ENABLED", "true");
    mocks.dbExecute.mockResolvedValueOnce({ rows: [{ organizationId: ORG }, { organizationId: "a0000000-0000-4000-8000-000000000002" }] });
    mocks.dbExecute.mockRejectedValueOnce(new Error("boom"));
    mocks.dbExecute
      .mockResolvedValueOnce({ rows: [settingsRow({ is_auto_enabled: true })] })
      .mockResolvedValueOnce({ rows: [{ id: "d0000000-0000-4000-8000-000000000001" }] });
    mocks.loadCandidates.mockResolvedValue([]);
    await expect(runAutomaticPaymentReminders(NOW)).resolves.toMatchObject({ enabled: true, organizations: 1 });
    vi.unstubAllEnvs();
  });
});
