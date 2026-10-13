import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import { Pool } from "pg";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const databaseUrl = process.env.DATABASE_URL;
const runId = process.env.E2E_LOCAL_RUN_ID;

if (
  process.env.E2E_LOCAL_SUPABASE !== "true" ||
  !supabaseUrl ||
  !databaseUrl ||
  !runId
) {
  throw new Error("Run this suite only through `pnpm test:e2e:local`.");
}

assertLoopbackUrl(supabaseUrl, ["http:", "https:"]);
assertLoopbackUrl(databaseUrl, ["postgres:", "postgresql:"]);

const pool = new Pool({ connectionString: databaseUrl, max: 1 });

let userId: string | undefined;
let email: string | undefined;
let password: string | undefined;
let organizationName: string | undefined;
let locationName: string | undefined;
let ownerName: string | undefined;

test.describe("Isolated local Supabase Owner setup", () => {
  test.describe.configure({ mode: "serial", timeout: 300_000 });

  test.beforeEach(async () => {
    const unique = randomUUID();
    email = `e2e-${unique}@example.test`;
    password = `${randomUUID()}aA1!`;
    ownerName = `Owner E2E ${unique.slice(0, 8)}`;
    organizationName = `Academia E2E ${runId.slice(0, 8)} ${unique.slice(0, 8)}`;
    locationName = `Sede E2E ${runId.slice(0, 8)} ${unique.slice(0, 8)}`;
  });

  test.afterAll(async () => {
    await pool.end();
  });

  // Do not delete individual rows here: the append-only audit log deliberately
  // prevents deleting an academy after its bootstrap event. The local runner
  // destroys this unique project's entire database volume after the test.
  test("signs up and completes synthetic Owner operations through the UI", async ({
    page,
  }) => {
    const cspViolations: string[] = [];
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        /Content Security Policy|violates the following CSP/i.test(
          message.text()
        )
      ) {
        cspViolations.push("CSP blocked a browser request");
      }
    });
    await page.goto("/auth/register?role=owner", {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: "Crea tu cuenta" })
    ).toBeVisible();
    await page.waitForFunction(
      () =>
        "serviceWorker" in navigator &&
        Boolean(navigator.serviceWorker.controller),
      undefined,
      { timeout: 30_000 }
    );
    expect(
      await page.evaluate(
        () => performance.getEntriesByType("navigation")[0]?.type
      )
    ).toBe("navigate");
    await page.getByLabel("Nombre completo").fill(ownerName!);
    await page.getByLabel("Correo electrónico").fill(email!);
    await page.getByLabel("Contraseña").fill(password!);
    const termsCheckbox = page.getByRole("checkbox");
    await termsCheckbox.check();
    await expect(termsCheckbox).toBeChecked();

    const signupResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/auth/v1/signup") &&
        response.request().method() === "POST"
    );
    const profileResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/onboarding/profile") &&
        response.request().method() === "POST"
    );
    await page
      .getByRole("button", { name: "Crear cuenta", exact: true })
      .click();
    const signupResponse = await signupResponsePromise;
    expect(signupResponse.ok()).toBe(true);
    const signupPayload = (await signupResponse.json()) as {
      id?: string;
      user?: { id?: string };
    };
    const createdUserId = signupPayload.user?.id ?? signupPayload.id;
    expect(createdUserId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    if (!createdUserId)
      throw new Error("Local signup response omitted the user ID.");
    userId = createdUserId;
    const profileResponse = await profileResponsePromise;
    expect(profileResponse.ok()).toBe(true);
    expect(cspViolations).toEqual([]);
    await expect(page).toHaveURL(/\/owner\/setup$/);

    await page.getByLabel("Nombre de la academia").fill(organizationName!);
    await page.getByRole("radio", { name: "Gimnasia rítmica" }).check();
    await page.getByLabel("Nombre de la primera sede").fill(locationName!);

    const bootstrapResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/organizations/bootstrap") &&
        response.request().method() === "POST"
    );
    await page
      .getByRole("button", { name: "Crear espacio de dirección" })
      .click();
    const response = await bootstrapResponse;
    expect(response.status()).toBe(201);
    const result = (await response.json()) as {
      organizationId: string;
      locationId: string;
    };
    const persistedConsent = await pool.query<{
      state: string;
      source: string;
      policy_version: string;
      consent_proof: string;
      grant_events: number;
    }>(
      `select consent.state,
              consent.source,
              consent.policy_version,
              consent.consent_proof,
              (select count(*)::int
                 from public.owner_consent_audit audit
                where audit.owner_id = consent.owner_id and audit.event = 'grant') as grant_events
         from public.owner_consent consent
        where consent.owner_id = $1::uuid`,
      [userId]
    );
    expect(persistedConsent.rows).toEqual([
      {
        state: "granted",
        source: "signup",
        policy_version: "v1-2026-08-01",
        consent_proof: "signup:register-form-v1",
        grant_events: 1,
      },
    ]);
    expect(result.organizationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );

    await expect(page).toHaveURL(
      new RegExp(`/owner\\?organizationId=${result.organizationId}`)
    );

    const scope = `organizationId=${result.organizationId}&locationId=${result.locationId}`;
    const groupName = `Grupo ${runId.slice(0, 8)}`;
    const className = `Clase ${runId.slice(0, 8)}`;
    const athleteGivenName = "Gimnasta";
    const athleteFamilyName = runId.slice(0, 8);
    const athleteName = `${athleteGivenName} ${athleteFamilyName}`;
    const adultGivenName = "Persona adulta";
    const adultFamilyName = runId.slice(0, 8);
    const adultName = `${adultGivenName} ${adultFamilyName}`;

    await page.goto(`/owner/groups?${scope}`);
    await expect(
      page.getByRole("heading", { name: /grupos/i }).first()
    ).toBeVisible();
    await page.getByLabel("Nombre del grupo").fill(groupName);
    await page.getByLabel("Plazas (opcional)").fill("1");
    const groupResponse = page.waitForResponse(
      (candidate) =>
        candidate.url().endsWith("/api/v1/owner/groups") &&
        candidate.request().method() === "POST"
    );
    await page.getByRole("button", { name: "Guardar grupo" }).click();
    expect((await groupResponse).ok()).toBe(true);
    await expect(page).toHaveURL(/groupId=/);
    await page.getByText("¿No aparece? Crear ficha y añadir").click();
    await page.getByLabel("Nombre", { exact: true }).fill(athleteGivenName);
    await page.getByLabel("Apellidos", { exact: true }).fill(athleteFamilyName);
    const athleteResponse = page.waitForResponse(
      (candidate) =>
        candidate.url().includes("/memberships") &&
        candidate.request().method() === "POST"
    );
    await page.getByRole("button", { name: "Crear y añadir al grupo" }).click();
    expect((await athleteResponse).ok()).toBe(true);
    await expect(page.getByText(athleteName, { exact: true })).toBeVisible();

    await page.goto(`/owner/classes?${scope}`);
    await page.getByLabel("Nombre de la clase").fill(className);
    await page.getByLabel("Plazas disponibles").fill("1");
    const classResponsePromise = page.waitForResponse(
      (candidate) =>
        candidate.url().endsWith("/api/v1/owner/classes") &&
        candidate.request().method() === "POST"
    );
    await page.getByRole("button", { name: "Crear clase y sesiones" }).click();
    const classResponse = await classResponsePromise;
    expect(classResponse.ok()).toBe(true);
    const classPayload = (await classResponse.json()) as {
      data: { id: string; sessionCount: number };
    };
    expect(classPayload.data.sessionCount).toBeGreaterThan(0);
    await expect(
      page.getByText(
        new RegExp(
          `Clase creada con ${classPayload.data.sessionCount} sesiones`
        )
      )
    ).toBeVisible();
    await page.waitForLoadState("networkidle");

    await page.goto(`/owner/enrollments?${scope}&status=pending`);
    const createEnrollment = page.getByRole("form", {
      name: "Crear inscripción",
    });
    const classSelect = createEnrollment.getByLabel("Clase");
    const classOption = classSelect
      .locator("option")
      .filter({ hasText: className })
      .first();
    await classSelect.selectOption((await classOption.getAttribute("value"))!);
    const search = createEnrollment.getByLabel("Gimnasta");
    await search.fill(athleteGivenName);
    await expect(
      page.getByRole("list", { name: "Resultados de búsqueda" })
    ).toBeVisible();
    await page.getByRole("button", { name: athleteName, exact: true }).click();
    const enrollmentResponse = page.waitForResponse(
      (candidate) =>
        candidate.url().endsWith("/api/v1/owner/enrollments") &&
        candidate.request().method() === "POST"
    );
    await createEnrollment
      .getByRole("button", { name: "Registrar inscripción pendiente" })
      .click();
    expect((await enrollmentResponse).ok()).toBe(true);
    const pendingRow = page
      .locator("li")
      .filter({ hasText: athleteName })
      .last();
    await expect(pendingRow).toBeVisible();
    const activateResponse = page.waitForResponse(
      (candidate) =>
        /\/api\/v1\/owner\/enrollments\/[^/]+$/.test(candidate.url()) &&
        candidate.request().method() === "PATCH"
    );
    await pendingRow.getByRole("button", { name: "Activar" }).click();
    expect((await activateResponse).ok()).toBe(true);
    await page.waitForLoadState("networkidle");
    await page.goto(`/owner/enrollments?${scope}&status=active`);
    await expect(
      page
        .locator("li")
        .filter({ hasText: athleteName })
        .getByText("Activa", { exact: true })
    ).toBeVisible();

    await page.goto(`/owner/attendance?${scope}`);
    await expect(
      page.getByRole("heading", { name: "Asistencia de la sesión" })
    ).toBeVisible();
    const sessionSelect = page.getByLabel("Seleccionar sesión");
    await expect
      .poll(async () => sessionSelect.locator("option").count(), {
        timeout: 30_000,
      })
      .toBeGreaterThan(1);
    await sessionSelect.selectOption({ index: 1 });
    const selectedSessionId = await sessionSelect.inputValue();
    const selectedSessionResult = await pool.query<{ starts_at: string }>(
      `select starts_at
         from zaltyko.sessions
        where organization_id = $1::uuid and id = $2::uuid and location_id = $3::uuid`,
      [result.organizationId, selectedSessionId, result.locationId]
    );
    expect(selectedSessionResult.rows).toHaveLength(1);
    const selectedSessionStartsAt = selectedSessionResult.rows[0].starts_at;
    const attendance = page.getByLabel(`Asistencia de ${athleteName}`);
    await expect(attendance).toBeVisible();
    await attendance.selectOption({ label: "Presente" });
    const attendanceResponse = page.waitForResponse(
      (candidate) =>
        candidate.url().includes("/attendance") &&
        candidate.request().method() === "POST"
    );
    await page
      .getByRole("button", { name: `Guardar asistencia de ${athleteName}` })
      .click();
    expect((await attendanceResponse).ok()).toBe(true);

    const billingUrl = `/owner/monthly-invoices?${scope}`;
    await page.goto(billingUrl);
    await expect(
      page.getByRole("heading", { name: "Emitir cuota mensual" })
    ).toBeVisible();
    const servicePeriod = nextMonth();
    await page.getByLabel("Mes de la cuota").fill(servicePeriod);
    await expect(
      page.getByRole("button", {
        name: `Vincular a una familia a ${athleteName}`,
      })
    ).toBeVisible();
    await page
      .getByRole("button", { name: `Vincular a una familia a ${athleteName}` })
      .click();
    await expect(
      page.getByRole("heading", {
        name: `Vincular a ${athleteName} a una familia`,
      })
    ).toBeVisible();
    await page.getByLabel("Nombre de la persona adulta").fill(adultGivenName);
    await page
      .getByLabel("Apellidos", { exact: true })
      .last()
      .fill(adultFamilyName);
    await page.getByLabel("Fecha efectiva").fill(`${servicePeriod}-01`);
    const associationResponse = page.waitForResponse(
      (candidate) =>
        candidate.url().endsWith("/api/v1/owner/families/associations") &&
        candidate.request().method() === "POST"
    );
    await page.getByRole("button", { name: "Guardar vínculo" }).click();
    expect((await associationResponse).ok()).toBe(true);
    await expect(
      page.getByRole("button", {
        name: `Asignar tarifa mensual a ${athleteName}`,
      })
    ).toBeVisible();
    await page
      .getByRole("button", { name: `Asignar tarifa mensual a ${athleteName}` })
      .click();
    await expect(
      page.getByRole("heading", { name: `Asignar tarifa a ${athleteName}` })
    ).toBeVisible();
    await page
      .getByLabel("Nombre de la tarifa")
      .fill(`Cuota ${runId.slice(0, 8)}`);
    await page.getByLabel(/Importe mensual/).fill("35,00");
    const pricePlanResponse = page.waitForResponse(
      (candidate) =>
        candidate.url().endsWith("/api/v1/owner/billing/price-plans") &&
        candidate.request().method() === "POST"
    );
    await page.getByRole("button", { name: "Crear tarifa mensual" }).click();
    expect((await pricePlanResponse).ok()).toBe(true);
    await expect(page.getByLabel("Tarifa mensual")).toBeVisible();
    await page.getByLabel("Vigente desde").fill(`${servicePeriod}-01`);
    const tariffAssignment = page.waitForResponse(
      (candidate) =>
        /\/api\/v1\/owner\/enrollments\/[^/]+\/price-plan$/.test(
          candidate.url()
        ) && candidate.request().method() === "PATCH"
    );
    await page.getByRole("button", { name: "Guardar tarifa" }).click();
    expect((await tariffAssignment).ok()).toBe(true);
    await expect(page.getByLabel("Familia")).toBeVisible();
    await page.getByLabel("Familia").selectOption({ label: athleteName });
    await page.getByLabel("Quién paga").selectOption({ label: adultName });
    await expect(page.getByText("Total de la factura")).toBeVisible();
    await expect(page.getByText(/35,00/)).toBeVisible();
    const invoiceResponse = page.waitForResponse(
      (candidate) =>
        candidate
          .url()
          .endsWith("/api/v1/owner/billing/monthly-invoices/issue") &&
        candidate.request().method() === "POST"
    );
    await page
      .getByRole("button", { name: /Emitir factura pendiente/ })
      .click();
    expect((await invoiceResponse).ok()).toBe(true);
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Factura emitida y pendiente" })
    ).toBeVisible();

    await page.goto(`/owner/payments?${scope}`);
    await expect(
      page.getByRole("heading", { name: "Registrar un pago recibido" })
    ).toBeVisible();
    await page
      .getByLabel("Método de pago")
      .selectOption({ label: "Transferencia" });
    const paymentResponse = page.waitForResponse(
      (candidate) =>
        candidate.url().endsWith("/api/v1/owner/billing/manual-payments") &&
        candidate.request().method() === "POST"
    );
    await page.getByRole("button", { name: "Guardar pago recibido" }).click();
    const paymentResult = await paymentResponse;
    expect(paymentResult.ok()).toBe(true);
    const paymentPayload = (await paymentResult.json()) as {
      data: { receivedAt: string };
    };
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Pago guardado y asignado al cargo" })
    ).toBeVisible();

    const dashboardPeriod = dashboardRange(
      selectedSessionStartsAt,
      paymentPayload.data.receivedAt
    );
    await page.goto(
      `/owner?${scope}&from=${dashboardPeriod.from}&to=${dashboardPeriod.to}`
    );
    await expect(
      page.getByRole("heading", { name: "Tu academia en marcha" })
    ).toBeVisible();
    const operationalSummary = page.getByRole("region", {
      name: "Tu academia en marcha",
    });
    await expect(
      operationalSummary.getByText("Gimnastas activos hoy")
    ).toBeVisible();
    await expect(
      operationalSummary
        .getByText("Gimnastas activos hoy")
        .locator("..")
        .getByText("1", { exact: true })
    ).toBeVisible();
    await expect(
      operationalSummary
        .getByText("Grupos activos hoy")
        .locator("..")
        .getByText("1", { exact: true })
    ).toBeVisible();
    await expect(
      operationalSummary
        .getByText("Registros de asistencia")
        .locator("..")
        .getByText("1", { exact: true })
    ).toBeVisible();
    await expect(
      operationalSummary.getByRole("heading", {
        name: "Cobros recibidos en este periodo",
      })
    ).toBeVisible();
    await expect(
      operationalSummary
        .getByText("Cobros", { exact: true })
        .locator("..")
        .getByText("1", { exact: true })
    ).toBeVisible();
    await expect(operationalSummary.getByText("35,00")).toBeVisible();
    await expect(page.getByRole("link", { name: "Principal" })).toBeVisible();

    const persisted = await pool.query<{
      organization_name: string;
      location_name: string;
      role: string;
      groups: number;
      members: number;
      class_templates: number;
      sessions: number;
      active_enrollments: number;
      attendance: number;
      invoices: number;
      invoice_lines: number;
      paid_charges: number;
      manual_payments: number;
    }>(
      `select organization.name as organization_name,
              location.name as location_name,
              member.role::text as role,
              (select count(*)::int from zaltyko.groups g where g.organization_id = organization.id) as groups,
              (select count(*)::int from zaltyko.group_memberships gm where gm.organization_id = organization.id) as members,
              (select count(*)::int from zaltyko.class_templates ct where ct.organization_id = organization.id) as class_templates,
              (select count(*)::int from zaltyko.sessions s where s.organization_id = organization.id) as sessions,
              (select count(*)::int from zaltyko.enrollments e where e.organization_id = organization.id and e.status = 'active') as active_enrollments,
              (select count(*)::int from zaltyko.attendance_records ar where ar.organization_id = organization.id and ar.status = 'present') as attendance,
              (select count(*)::int from zaltyko.invoices i where i.organization_id = organization.id) as invoices,
              (select count(*)::int from zaltyko.invoice_lines il where il.organization_id = organization.id) as invoice_lines,
              (select count(*)::int from zaltyko.charges c where c.organization_id = organization.id and c.status = 'paid' and c.collection_mode = 'manual') as paid_charges,
              (select count(*)::int from zaltyko.payments p where p.organization_id = organization.id and p.source = 'manual') as manual_payments
         from zaltyko.organizations as organization
         join zaltyko.organization_members as member on member.organization_id = organization.id
         join zaltyko.locations as location on location.organization_id = organization.id
        where organization.id = $1::uuid and location.id = $2::uuid and member.user_id = $3::uuid
        `,
      [result.organizationId, result.locationId, userId]
    );
    expect(persisted.rows).toEqual([
      {
        organization_name: organizationName,
        location_name: locationName,
        role: "owner",
        groups: 1,
        members: 1,
        class_templates: 1,
        sessions: classPayload.data.sessionCount,
        active_enrollments: 1,
        attendance: 1,
        invoices: 1,
        invoice_lines: 1,
        paid_charges: 1,
        manual_payments: 1,
      },
    ]);
  });
});

function nextMonth(): string {
  const next = new Date();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

function dashboardRange(...instants: string[]): { from: string; to: string } {
  const timestamps = instants.map((instant) => new Date(instant).getTime());
  if (timestamps.some(Number.isNaN)) {
    throw new Error(
      "Dashboard range requires persisted session and payment dates."
    );
  }
  const from = new Date(Math.min(...timestamps));
  const to = new Date(Math.max(...timestamps));
  from.setUTCDate(from.getUTCDate() - 2);
  to.setUTCDate(to.getUTCDate() + 2);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function assertLoopbackUrl(value: string, allowedProtocols: string[]): void {
  let endpoint: URL;
  try {
    endpoint = new URL(value);
  } catch {
    throw new Error("Local Owner E2E requires valid local service URLs.");
  }
  const hostname = endpoint.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (
    !allowedProtocols.includes(endpoint.protocol) ||
    !["localhost", "127.0.0.1", "::1"].includes(hostname)
  ) {
    throw new Error("Local Owner E2E refuses non-loopback service URLs.");
  }
}
