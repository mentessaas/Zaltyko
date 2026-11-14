import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// El correo es lo único simulado: la base de datos, la autorización y el
// límite por cuota son los reales.
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
vi.mock("@/lib/email/email-service", () => ({ sendEmailWithLogging: sendMock }));

import { db } from "@/db";
import {
  getPaymentReminderOverview,
  runAutomaticPaymentReminders,
  sendPaymentReminders,
} from "@/modules/payment-reminders/application/service";
import { updatePaymentReminderSettings } from "@/modules/payment-reminders/application/settings";
import { isPaymentRemindersStorageAvailable } from "@/modules/payment-reminders/application/storage";

/**
 * Recordatorios de impago sobre PostgreSQL desechable de GitHub. Instala el
 * candidato SQL solo aquí, después de todos los guardas, y borra sus tablas al
 * terminar; nunca en un proyecto enlazado ni con credenciales externas. Cubre
 * el SQL real que los mocks no ven: RLS/REVOKE, lista de cuotas abiertas con su
 * tutor pagador, saldo tras un pago parcial, aislamiento entre academias,
 * un correo por tutor, límite de días, doble envío simultáneo, reintento tras
 * un fallo y recordatorio automático único.
 */
const disposablePgEnabled =
  process.env.ZALTYKO_PG_INTEGRATION === "1" &&
  process.env.GITHUB_ACTIONS === "true" &&
  process.env.RUNNER_OS === "Linux" &&
  process.env.NODE_ENV === "test";
const describeDisposablePg = describe.skipIf(process.env.ZALTYKO_PG_INTEGRATION !== "1");

function assertDisposableTarget() {
  const connection = process.env.ZALTYKO_PG_INTEGRATION_DATABASE_URL;
  let target: URL;
  try {
    target = new URL(connection ?? "");
  } catch {
    throw new Error("The disposable PostgreSQL target is invalid");
  }
  if (
    !disposablePgEnabled ||
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    !["127.0.0.1", "localhost", "::1"].includes(target.hostname) ||
    target.username !== "supabase_admin" ||
    !target.password ||
    !target.port ||
    target.pathname !== "/postgres" ||
    [process.env.DATABASE_URL, process.env.DATABASE_URL_POOL, process.env.DATABASE_URL_DIRECT].some(
      (value) => value !== connection
    )
  ) {
    throw new Error("Disposable GitHub Linux loopback Postgres is required");
  }
  for (const name of [
    "SUPABASE_ACCESS_TOKEN",
    "SUPABASE_DB_PASSWORD",
    "SUPABASE_DB_URL",
    "SUPABASE_PROJECT_REF",
    "SUPABASE_SERVICE_ROLE_KEY",
    "E2E_TARGET_SUPABASE_PROJECT_REF",
    "STRIPE_SAAS_TEST_SECRET_KEY",
    "STRIPE_SAAS_LIVE_SECRET_KEY",
    "VERCEL_TOKEN",
  ]) {
    if (process.env[name]) throw new Error("External credentials are forbidden");
  }
}

const candidate = () =>
  readFileSync(resolve(process.cwd(), "docs/deployment/candidates/20261114120500_payment_reminders_candidate.sql"), "utf8");

const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY).toISOString();

type Academy = { organizationId: string; locationId: string; ownerUserId: string; ownerMemberId: string };

async function academy(label: string, status: "active" | "suspended" = "active"): Promise<Academy> {
  const organizationId = randomUUID();
  const locationId = randomUUID();
  const ownerUserId = randomUUID();
  const ownerMemberId = randomUUID();
  await db.execute(sql`
    insert into zaltyko.organizations (id, name, status, default_timezone, default_currency)
    values (${organizationId}::uuid, ${`CI recordatorios ${label}`}, ${status}::zaltyko.organization_status, 'Europe/Madrid', 'EUR')
  `);
  await db.execute(sql`
    insert into zaltyko.locations (id, organization_id, code, name, timezone)
    values (${locationId}::uuid, ${organizationId}::uuid, ${`r-${organizationId.slice(0, 8)}`}, ${`Sede ${label}`}, 'Europe/Madrid')
  `);
  await db.execute(sql`insert into auth.users (id, email) values (${ownerUserId}::uuid, ${`ci-reminders-${ownerUserId}@example.invalid`})`);
  await db.execute(sql`
    insert into zaltyko.organization_members (id, organization_id, user_id, role, status, location_scope_mode)
    values (${ownerMemberId}::uuid, ${organizationId}::uuid, ${ownerUserId}::uuid, 'owner', 'active', 'all')
  `);
  return { organizationId, locationId, ownerUserId, ownerMemberId };
}

async function otherMember(organizationId: string, role: "manager" | "coach") {
  const userId = randomUUID();
  await db.execute(sql`insert into auth.users (id, email) values (${userId}::uuid, ${`ci-reminders-${role}-${userId}@example.invalid`})`);
  await db.execute(sql`
    insert into zaltyko.organization_members (organization_id, user_id, role, status, location_scope_mode)
    values (${organizationId}::uuid, ${userId}::uuid, ${role}::zaltyko.member_role, 'active', 'all')
  `);
  return userId;
}

/** Tutor pagador con o sin correo. */
async function payer(a: Academy, givenName: string, email: string | null) {
  const familyId = randomUUID();
  const guardianId = randomUUID();
  const payerId = randomUUID();
  await db.execute(sql`insert into zaltyko.families (id, organization_id, is_active) values (${familyId}::uuid, ${a.organizationId}::uuid, true)`);
  await db.execute(sql`
    insert into zaltyko.people (id, organization_id, given_name, family_name)
    values (${guardianId}::uuid, ${a.organizationId}::uuid, ${givenName}, 'Recordatorio Prueba')
  `);
  await db.execute(sql`
    insert into zaltyko.guardians (id, organization_id, person_id, is_active)
    values (${guardianId}::uuid, ${a.organizationId}::uuid, ${guardianId}::uuid, true)
  `);
  if (email) {
    await db.execute(sql`
      insert into zaltyko.guardian_contacts (organization_id, guardian_id, kind, value, normalized_value, is_primary)
      values (${a.organizationId}::uuid, ${guardianId}::uuid, 'email', ${email}, ${email.toLowerCase()}, true)
    `);
  }
  await db.execute(sql`
    insert into zaltyko.family_guardians (organization_id, family_id, guardian_id, relationship)
    values (${a.organizationId}::uuid, ${familyId}::uuid, ${guardianId}::uuid, 'parent')
  `);
  await db.execute(sql`
    insert into zaltyko.family_payers (id, organization_id, family_id, guardian_id, is_primary, starts_on)
    values (${payerId}::uuid, ${a.organizationId}::uuid, ${familyId}::uuid, ${guardianId}::uuid, true, '2026-01-01')
  `);
  return { familyId, guardianId, payerId };
}

/** Una cuota abierta (con su factura y línea). */
async function charge(
  a: Academy,
  family: { familyId: string; payerId: string | null },
  options: { amount?: number; dueDaysAgo?: number; status?: "due" | "partially_paid" | "paid"; period?: string } = {}
) {
  const amount = options.amount ?? 4500;
  const invoiceId = randomUUID();
  const lineId = randomUUID();
  const chargeId = randomUUID();
  const period = options.period ?? "2026-11";
  const dueAt = daysAgo(options.dueDaysAgo ?? 10);
  await db.execute(sql`
    insert into zaltyko.invoices (
      id, organization_id, location_id, family_id, family_payer_id, reference, status,
      currency, total_amount_cents, issued_at, due_at, idempotency_key
    ) values (
      ${invoiceId}::uuid, ${a.organizationId}::uuid, ${a.locationId}::uuid, ${family.familyId}::uuid, ${family.payerId}::uuid,
      ${`CI-REM-${chargeId.slice(0, 8)}`}, 'issued', 'EUR', ${amount}, ${daysAgo(30)}::timestamptz, ${dueAt}::timestamptz,
      ${`ci-rem-inv-${invoiceId}`}
    )
  `);
  await db.execute(sql`
    insert into zaltyko.invoice_lines (
      id, organization_id, invoice_id, location_id, line_type, quantity,
      unit_amount_cents, amount_cents, currency, service_period_start, service_period_end
    ) values (
      ${lineId}::uuid, ${a.organizationId}::uuid, ${invoiceId}::uuid, ${a.locationId}::uuid,
      'ci_reminder_fee', 1, ${amount}, ${amount}, 'EUR', ${`${period}-01`}::date, ${`${period}-28`}::date
    )
  `);
  await db.execute(sql`
    insert into zaltyko.charges (
      id, organization_id, location_id, invoice_id, invoice_line_id, family_id, family_payer_id,
      status, amount_cents, currency, due_at, service_period_start, service_period_end, idempotency_key
    ) values (
      ${chargeId}::uuid, ${a.organizationId}::uuid, ${a.locationId}::uuid, ${invoiceId}::uuid, ${lineId}::uuid,
      ${family.familyId}::uuid, ${family.payerId}::uuid, ${options.status ?? "due"}::zaltyko.charge_status,
      ${amount}, 'EUR', ${dueAt}::timestamptz, ${`${period}-01`}::date, ${`${period}-28`}::date, ${`ci-rem-charge-${chargeId}`}
    )
  `);
  return chargeId;
}

async function partialPayment(a: Academy, familyId: string, chargeId: string, amount: number) {
  const paymentId = randomUUID();
  await db.execute(sql`
    insert into zaltyko.payments (
      id, organization_id, location_id, family_id, status, amount_cents, currency,
      processor, environment, provider_payment_id, received_at, idempotency_key
    ) values (
      ${paymentId}::uuid, ${a.organizationId}::uuid, ${a.locationId}::uuid, ${familyId}::uuid,
      'succeeded', ${amount}, 'EUR', 'local', 'sandbox', ${`ci-rem-pay-${paymentId}`}, now(), ${`ci-rem-pay-${paymentId}`}
    )
  `);
  await db.execute(sql`
    insert into zaltyko.payment_allocations (
      organization_id, payment_id, charge_id, amount_cents, currency, allocated_at, idempotency_key
    ) values (
      ${a.organizationId}::uuid, ${paymentId}::uuid, ${chargeId}::uuid, ${amount}, 'EUR', now(), ${`ci-rem-alloc-${paymentId}`}
    )
  `);
}

async function reminderRows(chargeId: string) {
  const result = await db.execute(sql`
    select status, origin, outstanding_cents::text as outstanding, guardian_id::text as guardian, sent_at is not null as has_sent_at
      from zaltyko.payment_reminders where charge_id = ${chargeId}::uuid order by created_at, id
  `);
  return result.rows as Array<{ status: string; origin: string; outstanding: string; guardian: string | null; has_sent_at: boolean }>;
}

const overdueAll = (a: Academy) => ({
  userId: a.ownerUserId,
  organizationId: a.organizationId,
  selection: { kind: "overdue" } as const,
});

describeDisposablePg("recordatorios de impago contra PostgreSQL desechable", () => {
  let a: Academy;
  let b: Academy;
  let maria: Awaited<ReturnType<typeof payer>>;
  let sinCorreo: Awaited<ReturnType<typeof payer>>;
  let sinTutor: { familyId: string; payerId: null };
  let cMaria1: string;
  let cMaria2: string;
  let cParcial: string;
  let cSinCorreo: string;
  let cSinTutor: string;
  let cPagada: string;
  let cOtraAcademia: string;

  beforeAll(async () => {
    assertDisposableTarget();
    vi.stubEnv("ZALTYKO_PAYMENT_REMINDERS_ENABLED", "true");
    // Antes del candidato la función está dormida.
    expect(await isPaymentRemindersStorageAvailable(db)).toBe(false);
    await db.execute(sql.raw(candidate()));

    a = await academy("A");
    b = await academy("B");

    maria = await payer(a, "María", "Maria.Tutora@Example.invalid");
    cMaria1 = await charge(a, maria, { period: "2026-11", dueDaysAgo: 10 });
    cMaria2 = await charge(a, maria, { period: "2026-10", dueDaysAgo: 40 });

    const luis = await payer(a, "Luis", "luis.tutor@example.invalid");
    cParcial = await charge(a, luis, { amount: 4500, status: "partially_paid", dueDaysAgo: 20 });
    await partialPayment(a, luis.familyId, cParcial, 2500);

    sinCorreo = await payer(a, "Sin", null);
    cSinCorreo = await charge(a, sinCorreo);

    const familyNoPayer = randomUUID();
    await db.execute(sql`insert into zaltyko.families (id, organization_id, is_active) values (${familyNoPayer}::uuid, ${a.organizationId}::uuid, true)`);
    sinTutor = { familyId: familyNoPayer, payerId: null };
    cSinTutor = await charge(a, sinTutor);

    const pagadora = await payer(a, "Paga", "paga@example.invalid");
    cPagada = await charge(a, pagadora, { status: "paid" });

    const otra = await payer(b, "Otra", "otra@example.invalid");
    cOtraAcademia = await charge(b, otra);
  }, 120_000);

  it("sin correo de respuesta de la academia no se envía ni se reserva nada", async () => {
    sendMock.mockReset();
    await expect(sendPaymentReminders(overdueAll(a))).rejects.toMatchObject({
      code: "INVALID_STATE_TRANSITION",
      details: { reason: "reply_to_required" },
    });
    expect(sendMock).not.toHaveBeenCalled();
    expect(await reminderRows(cMaria1)).toEqual([]);
    // La academia lo configura una vez y ya puede enviar.
    await updatePaymentReminderSettings({
      userId: a.ownerUserId,
      organizationId: a.organizationId,
      settings: { minIntervalDays: 7, autoEnabled: false, autoAfterDays: 3, replyToEmail: "club@example.invalid" },
    });
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    if (!disposablePgEnabled) return;
    // Deja la base compartida como estaba: las filas cuelgan de las tablas, que se retiran.
    await db.execute(sql`drop table if exists zaltyko.payment_reminders`);
    await db.execute(sql`drop table if exists zaltyko.payment_reminder_settings`);
  });

  it("fuerza RLS, niega el acceso directo de anon/authenticated y rechaza reinstalar", async () => {
    expect(await isPaymentRemindersStorageAvailable(db)).toBe(true);
    const inventory = await db.execute(sql`
      select c.relname, c.relrowsecurity, c.relforcerowsecurity,
        has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as anon_access,
        has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as authenticated_access
      from pg_class c
      where c.oid in ('zaltyko.payment_reminder_settings'::regclass, 'zaltyko.payment_reminders'::regclass)
    `);
    expect(inventory.rows).toHaveLength(2);
    for (const row of inventory.rows) {
      expect(row).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true, anon_access: false, authenticated_access: false });
    }
    const refused = (await db.execute(sql.raw(candidate())).then(
      () => null,
      (failure) => failure
    )) as { code?: string; message?: string; cause?: { code?: string; message?: string } } | null;
    expect(refused).not.toBeNull();
    const raised = refused?.cause ?? refused;
    expect(raised?.code).toBe("P0001");
    expect(raised?.message).toMatch(/^Payment reminders candidate requires .*; inspect existing schema before promotion$/);
  });

  it("lista las cuotas abiertas de la academia con su tutor pagador y el saldo tras un pago parcial", async () => {
    const overview = await getPaymentReminderOverview({ userId: a.ownerUserId, organizationId: a.organizationId });
    const byId = new Map(overview.items.map((item) => [item.chargeId, item]));

    // Solo cuotas abiertas de esta academia: ni la pagada ni la de otra academia.
    expect(byId.has(cPagada)).toBe(false);
    expect(byId.has(cOtraAcademia)).toBe(false);
    expect(overview.items.map((item) => item.chargeId).sort()).toEqual(
      [cMaria1, cMaria2, cParcial, cSinCorreo, cSinTutor].sort()
    );
    expect(byId.get(cParcial)!.outstandingCents).toBe(2000);
    expect(byId.get(cMaria1)).toMatchObject({
      payerFirstName: "María",
      payerEmailMasked: "m***@example.invalid",
      overdue: true,
      canRemind: true,
      reminderCount: 0,
      lastRemindedAt: null,
    });
    expect(byId.get(cSinCorreo)).toMatchObject({ canRemind: false, blockedReason: "no_email" });
    expect(byId.get(cSinTutor)).toMatchObject({ canRemind: false, blockedReason: "no_payer" });
    // Nunca se expone el correo completo.
    expect(JSON.stringify(overview)).not.toContain("tutora@example.invalid");
    expect(overview.remindableOverdueCount).toBe(3);
  });

  it("solo la propiedad o administración accede; otra academia no ve nada ajeno", async () => {
    const manager = await otherMember(a.organizationId, "manager");
    const coach = await otherMember(a.organizationId, "coach");
    for (const userId of [manager, coach]) {
      await expect(
        sendPaymentReminders({ userId, organizationId: a.organizationId, selection: { kind: "overdue" } })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    // La propietaria de B no puede actuar sobre A.
    await expect(
      sendPaymentReminders({ userId: b.ownerUserId, organizationId: a.organizationId, selection: { kind: "overdue" } })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Ni colar una cuota ajena en su propio envío.
    sendMock.mockResolvedValue(true);
    const result = await sendPaymentReminders({
      userId: a.ownerUserId,
      organizationId: a.organizationId,
      selection: { kind: "charges", chargeIds: [cOtraAcademia] },
    });
    expect(result.outcomes).toEqual([{ chargeId: cOtraAcademia, outcome: "skipped", reason: "not_found" }]);
    expect(sendMock).not.toHaveBeenCalled();
    expect(await reminderRows(cOtraAcademia)).toEqual([]);
  });

  it("envía un correo por tutor pagador (dos cuotas de María en uno) y registra cada cuota", async () => {
    sendMock.mockReset();
    sendMock.mockResolvedValue(true);
    const result = await sendPaymentReminders(overdueAll(a));

    // María (2 cuotas, 1 correo) y Luis (1 cuota); sin correo y sin tutor se omiten.
    expect(result).toMatchObject({ sent: 3, emails: 2, failed: 0, skipped: 2 });
    expect(sendMock).toHaveBeenCalledTimes(2);
    const recipients = sendMock.mock.calls.map(([options]) => options.to).sort();
    expect(recipients).toEqual(["luis.tutor@example.invalid", "maria.tutora@example.invalid"]);
    const mariaMail = sendMock.mock.calls.map(([options]) => options).find((options) => options.to.startsWith("maria"))!;
    expect(mariaMail.text).toContain("Cuota de octubre de 2026 y Cuota de noviembre de 2026");
    expect(mariaMail.tenantId).toBe(a.organizationId);

    for (const chargeId of [cMaria1, cMaria2]) {
      expect(await reminderRows(chargeId)).toEqual([
        { status: "sent", origin: "manual", outstanding: "4500", guardian: maria.guardianId, has_sent_at: true },
      ]);
    }
    expect((await reminderRows(cParcial))[0]).toMatchObject({ status: "sent", outstanding: "2000" });
    expect(await reminderRows(cSinCorreo)).toEqual([]);
    expect(await reminderRows(cSinTutor)).toEqual([]);

    // La auditoría no guarda correo ni texto.
    const audit = await db.execute(sql`
      select after::text as after from zaltyko.audit_log
       where organization_id = ${a.organizationId}::uuid and action = 'payment_reminder.sent'
    `);
    expect(audit.rows).toHaveLength(2);
    expect(JSON.stringify(audit.rows)).not.toMatch(/example\.invalid|Bizum|Hola/);
  });

  it("no repite antes de N días: un segundo envío inmediato no manda nada", async () => {
    sendMock.mockClear();
    const again = await sendPaymentReminders(overdueAll(a));
    expect(again).toMatchObject({ sent: 0, emails: 0 });
    expect(again.outcomes.filter((item) => item.reason === "recently_reminded")).toHaveLength(3);
    expect(sendMock).not.toHaveBeenCalled();
    expect(await reminderRows(cMaria1)).toHaveLength(1);

    const overview = await getPaymentReminderOverview({ userId: a.ownerUserId, organizationId: a.organizationId });
    const item = overview.items.find((candidate) => candidate.chargeId === cMaria1)!;
    expect(item).toMatchObject({ canRemind: false, blockedReason: "recently_reminded", reminderCount: 1 });
    expect(item.nextEligibleAt).not.toBeNull();
  });

  it("una reserva caducada sin resolver cuenta como enviada para el límite", async () => {
    const familia = await payer(a, "Caducada", "caducada@example.invalid");
    const cCaducada = await charge(a, familia, { dueDaysAgo: 6 });
    await db.execute(sql`
      insert into zaltyko.payment_reminders (organization_id, charge_id, email_group_id, origin, status, outstanding_cents, currency, created_at)
      values (${a.organizationId}::uuid, ${cCaducada}::uuid, ${randomUUID()}::uuid, 'manual', 'pending', 4500, 'EUR', now() - interval '20 minutes')
    `);
    sendMock.mockReset();
    sendMock.mockResolvedValue(true);
    const result = await sendPaymentReminders({
      userId: a.ownerUserId,
      organizationId: a.organizationId,
      selection: { kind: "charges", chargeIds: [cCaducada] },
    });
    expect(result.outcomes).toEqual([{ chargeId: cCaducada, outcome: "skipped", reason: "recently_reminded" }]);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("con el intervalo cumplido vuelve a poder recordarse, y un intervalo mayor lo impide", async () => {
    await db.execute(sql`
      update zaltyko.payment_reminders
         set created_at = now() - interval '8 days', sent_at = now() - interval '8 days'
       where charge_id = ${cMaria1}::uuid
    `);
    // Con 14 días configurados, 8 no bastan.
    await updatePaymentReminderSettings({
      userId: a.ownerUserId,
      organizationId: a.organizationId,
      settings: { minIntervalDays: 14, autoEnabled: false, autoAfterDays: 3, replyToEmail: "club@example.invalid" },
    });
    sendMock.mockClear();
    expect(await sendPaymentReminders({ ...overdueAll(a), selection: { kind: "charges", chargeIds: [cMaria1] } })).toMatchObject({ sent: 0 });
    // Con 7 (por defecto) sí.
    await updatePaymentReminderSettings({
      userId: a.ownerUserId,
      organizationId: a.organizationId,
      settings: {
        minIntervalDays: 7,
        autoEnabled: false,
        autoAfterDays: 3,
        paymentInstructions: "Bizum al 600 000 000",
        replyToEmail: "club@example.invalid",
      },
    });
    sendMock.mockResolvedValue(true);
    expect(await sendPaymentReminders({ ...overdueAll(a), selection: { kind: "charges", chargeIds: [cMaria1] } })).toMatchObject({ sent: 1, emails: 1 });
    expect(sendMock.mock.calls[0]![0].text).toContain("Bizum al 600 000 000");
    expect(sendMock.mock.calls[0]![0].replyTo).toBe("club@example.invalid");
    expect(await reminderRows(cMaria1)).toHaveLength(2);
  });

  it("dos envíos simultáneos de la misma cuota mandan un solo correo y dejan una sola fila", async () => {
    const familia = await payer(a, "Carrera", "carrera@example.invalid");
    const cCarrera = await charge(a, familia, { dueDaysAgo: 6 });
    sendMock.mockReset();
    sendMock.mockImplementation(async () => {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 150));
      return true;
    });
    const selection = { kind: "charges", chargeIds: [cCarrera] } as const;
    const results = await Promise.all([
      sendPaymentReminders({ userId: a.ownerUserId, organizationId: a.organizationId, selection }),
      sendPaymentReminders({ userId: a.ownerUserId, organizationId: a.organizationId, selection }),
      sendPaymentReminders({ userId: a.ownerUserId, organizationId: a.organizationId, selection }),
    ]);
    expect(results.reduce((sum, result) => sum + result.sent, 0)).toBe(1);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(await reminderRows(cCarrera)).toHaveLength(1);
  }, 30_000);

  it("un fallo del proveedor deja la cuota en failed, sin consumir el límite, y se puede reintentar", async () => {
    const familia = await payer(a, "Fallo", "fallo@example.invalid");
    const cFallo = await charge(a, familia, { dueDaysAgo: 6 });
    const selection = { kind: "charges", chargeIds: [cFallo] } as const;
    sendMock.mockReset();
    sendMock.mockResolvedValueOnce(false);
    expect(await sendPaymentReminders({ userId: a.ownerUserId, organizationId: a.organizationId, selection })).toMatchObject({ sent: 0, failed: 1 });
    expect(await reminderRows(cFallo)).toEqual([
      { status: "failed", origin: "manual", outstanding: "4500", guardian: familia.guardianId, has_sent_at: false },
    ]);
    sendMock.mockResolvedValue(true);
    expect(await sendPaymentReminders({ userId: a.ownerUserId, organizationId: a.organizationId, selection })).toMatchObject({ sent: 1 });
    expect((await reminderRows(cFallo)).map((row) => row.status)).toEqual(["failed", "sent"]);
  });

  it("el recordatorio automático está apagado por defecto y, encendido, manda un único aviso a las nunca avisadas", async () => {
    sendMock.mockReset();
    sendMock.mockResolvedValue(true);
    // Sin la bandera global no hace nada.
    expect(await runAutomaticPaymentReminders()).toMatchObject({ enabled: false });
    expect(sendMock).not.toHaveBeenCalled();

    // Con la bandera pero sin activarlo en la academia, tampoco.
    vi.stubEnv("ZALTYKO_PAYMENT_REMINDERS_AUTO_ENABLED", "true");
    expect(await runAutomaticPaymentReminders()).toMatchObject({ enabled: true, organizations: 0, sent: 0 });
    expect(sendMock).not.toHaveBeenCalled();

    const familia = await payer(a, "Auto", "auto@example.invalid");
    const cAuto = await charge(a, familia, { dueDaysAgo: 5 });
    const cReciente = await charge(a, await payer(a, "Reciente", "reciente@example.invalid"), { dueDaysAgo: 1 });
    await updatePaymentReminderSettings({
      userId: a.ownerUserId,
      organizationId: a.organizationId,
      settings: { minIntervalDays: 7, autoEnabled: true, autoAfterDays: 3, replyToEmail: "club@example.invalid" },
    });

    const run = await runAutomaticPaymentReminders();
    expect(run).toMatchObject({ enabled: true, organizations: 1, failed: 0 });
    // Solo la vencida hace 5 días y nunca avisada; las ya recordadas y la reciente no.
    expect(await reminderRows(cAuto)).toEqual([
      { status: "sent", origin: "automatic", outstanding: "4500", guardian: familia.guardianId, has_sent_at: true },
    ]);
    expect(await reminderRows(cReciente)).toEqual([]);
    expect((await reminderRows(cParcial)).every((row) => row.origin === "manual")).toBe(true);
    // La academia B no lo activó: sin filas.
    expect(await reminderRows(cOtraAcademia)).toEqual([]);

    // Segunda pasada: nada nuevo.
    sendMock.mockClear();
    expect(await runAutomaticPaymentReminders()).toMatchObject({ sent: 0 });
    expect(sendMock).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
    vi.stubEnv("ZALTYKO_PAYMENT_REMINDERS_ENABLED", "true");
  });

  it("una academia suspendida no envía correos aunque tenga cuotas", async () => {
    const suspended = await academy("S", "suspended");
    const familia = await payer(suspended, "Suspendida", "suspendida@example.invalid");
    const cSuspendida = await charge(suspended, familia);
    // Con correo de respuesta configurado, lo único que impide enviar es el estado de la academia.
    await updatePaymentReminderSettings({
      userId: suspended.ownerUserId,
      organizationId: suspended.organizationId,
      settings: { minIntervalDays: 7, autoEnabled: false, autoAfterDays: 3, replyToEmail: "club@example.invalid" },
    });
    sendMock.mockReset();
    await expect(
      sendPaymentReminders({ userId: suspended.ownerUserId, organizationId: suspended.organizationId, selection: { kind: "overdue" } })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(sendMock).not.toHaveBeenCalled();
    expect(await reminderRows(cSuspendida)).toEqual([]);
  });
});
