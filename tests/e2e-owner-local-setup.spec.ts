import { createHash, randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import { Pool } from "pg";

import {
  grantLocalNetworkAccess,
  installLocalE2ENetworkGuard,
  shouldGrantLocalNetworkAccess,
  type LocalNetworkGuardReport,
} from "./support/local-e2e-network";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const databaseUrl = process.env.DATABASE_URL;
const runId = process.env.E2E_LOCAL_RUN_ID;

if (
  process.env.E2E_LOCAL_SUPABASE !== "true" ||
  !supabaseUrl ||
  !databaseUrl ||
  !runId
) {
  throw new Error("Run this suite only through the isolated local E2E runner.");
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

type BrowserDiagnosticEvent = {
  at: string;
  type: string;
  pathname: string;
  method?: string;
  status?: number;
  error?: string;
  message?: string;
};

let browserDiagnostics: BrowserDiagnosticEvent[] = [];
let networkGuardReport: () => LocalNetworkGuardReport = () => ({
  unexpectedBlockedRequests: [],
  expectedBlockedTelemetryRequests: [],
});

function diagnosticPathname(value: string): string {
  try {
    return new URL(value).pathname;
  } catch {
    return "<invalid-url>";
  }
}

function sanitizeDiagnosticText(value: string): string {
  return value
    .replace(/https?:\/\/[^\s"'<>]+/gi, diagnosticPathname)
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer <redacted>")
    .replace(
      /((?:authorization|cookie|set-cookie|access[_-]?token|refresh[_-]?token|password|secret|idempotency-key)\s*[:=]\s*)[^\s,;]+/gi,
      "$1<redacted>"
    )
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "<email>")
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
      "<uuid>"
    )
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "<redacted>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

test.describe("Isolated local Supabase Owner setup", () => {
  test.describe.configure({ mode: "serial", timeout: 300_000 });

  test.beforeEach(async ({ page }, testInfo) => {
    const baseUrl = process.env.BASE_URL!;
    if (
      shouldGrantLocalNetworkAccess(
        process.env.E2E_LOCAL_SUPABASE === "true",
        testInfo.project.name
      )
    ) {
      await grantLocalNetworkAccess(page.context(), baseUrl);
    }
    networkGuardReport = await installLocalE2ENetworkGuard(page.context(), {
      baseUrl,
      supabaseUrl: supabaseUrl!,
    });
    const diagnostics: BrowserDiagnosticEvent[] = [];
    browserDiagnostics = diagnostics;
    const record = (event: Omit<BrowserDiagnosticEvent, "at">) => {
      if (diagnostics.length < 100) {
        diagnostics.push({ at: new Date().toISOString(), ...event });
      }
    };

    page.on("requestfailed", (request) => {
      if (request.resourceType() !== "document") return;
      record({
        type: "document-request-failed",
        pathname: diagnosticPathname(request.url()),
        method: request.method(),
        error: sanitizeDiagnosticText(request.failure()?.errorText ?? ""),
      });
    });
    page.on("response", (response) => {
      if (response.request().resourceType() !== "document") return;
      record({
        type: "document-response",
        pathname: diagnosticPathname(response.url()),
        method: response.request().method(),
        status: response.status(),
      });
    });
    page.on("framenavigated", (frame) => {
      if (frame !== page.mainFrame()) return;
      record({
        type: "main-frame-navigation",
        pathname: diagnosticPathname(frame.url()),
      });
    });
    page.on("pageerror", (error) => {
      record({
        type: "page-error",
        pathname: diagnosticPathname(page.url()),
        error: sanitizeDiagnosticText(error.name),
        message: sanitizeDiagnosticText(error.message),
      });
    });
    page.on("console", (message) => {
      if (message.type() !== "error" && message.type() !== "warning") return;
      const text = message.text();
      if (
        !/NS_BINDING_ABORTED|navigat|redirect|router|refresh|fetch|network|failed|uncaught|hydration|loading/i.test(
          text
        )
      ) {
        return;
      }
      record({
        type: `console-${message.type()}`,
        pathname: diagnosticPathname(page.url()),
        message: sanitizeDiagnosticText(text),
      });
    });

    const unique = randomUUID();
    email = `e2e-${unique}@example.test`;
    password = `${randomUUID()}aA1!`;
    ownerName = `Owner E2E ${unique.slice(0, 8)}`;
    organizationName = `Academia E2E ${runId.slice(0, 8)} ${unique.slice(0, 8)}`;
    locationName = `Sede E2E ${runId.slice(0, 8)} ${unique.slice(0, 8)}`;
  });

  test.afterEach(async ({}, testInfo) => {
    const { unexpectedBlockedRequests, expectedBlockedTelemetryRequests } =
      networkGuardReport();
    await testInfo.attach("browser-navigation-diagnostics.json", {
      body: JSON.stringify(
        {
          browser: testInfo.project.name,
          status: testInfo.status,
          events: browserDiagnostics,
          blockedExternalRequests: unexpectedBlockedRequests,
          expectedBlockedTelemetryRequests,
        },
        null,
        2
      ),
      contentType: "application/json",
    });
    expect(unexpectedBlockedRequests).toEqual([]);
  });

  test.afterAll(async () => {
    await pool.end();
  });

  // Do not delete individual rows here: the append-only audit log deliberately
  // prevents deleting an academy after its bootstrap event. The local runner
  // destroys this unique project's entire database volume after the test.
  test("signs up and completes synthetic Owner operations through the UI", async ({
    page,
  }, testInfo) => {
    const cspViolations: string[] = [];
    const profileRequests: string[] = [];
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
    page.on("request", (request) => {
      if (request.url().includes("/api/onboarding/profile")) {
        profileRequests.push("legacy profile endpoint called");
      }
    });
    await page.goto("/auth/register?role=owner", {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: "Crea tu cuenta" })
    ).toBeVisible();
    // El runner local bloquea service workers para que la ruta Playwright
    // observe las solicitudes. Esta suite no valida el comportamiento del SW.
    expect(
      await page.evaluate(
        () => performance.getEntriesByType("navigation")[0]?.type
      )
    ).toBe("navigate");
    await page.getByLabel("Nombre completo").fill(ownerName!);
    await page.getByLabel("Correo electrónico").fill(email!);
    await page.getByLabel("Contraseña").fill(password!);
    const termsCheckbox = page.getByRole("checkbox");
    await expect(termsCheckbox).toHaveCount(1);
    await termsCheckbox.check();
    await expect(termsCheckbox).toBeChecked();

    const signupResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/auth/v1/signup") &&
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
    expect(cspViolations).toEqual([]);
    await expect(page).toHaveURL(/\/owner\/setup$/);
    expect(profileRequests).toEqual([]);
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Crear espacio de dirección" })
    ).toBeVisible();

    await page.getByLabel("Nombre de la academia").fill(organizationName!);
    await page.getByRole("radio", { name: "Gimnasia rítmica" }).check();
    await page.getByLabel("Nombre de la primera sede").fill(locationName!);

    const bootstrapRequestPromise = page.waitForRequest(
      (request) =>
        request.url().endsWith("/api/v1/organizations/bootstrap") &&
        request.method() === "POST"
    );
    const bootstrapResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/organizations/bootstrap") &&
        response.request().method() === "POST"
    );
    await page
      .getByRole("button", { name: "Crear espacio de dirección" })
      .click();
    const bootstrapRequest = await bootstrapRequestPromise;
    const response = await bootstrapResponse;
    expect(response.status()).toBe(201);
    const result = (await response.json()) as {
      organizationId: string;
      locationId: string;
    };
    const bootstrapIdempotencyKey =
      bootstrapRequest.headers()["idempotency-key"];
    expect(bootstrapIdempotencyKey).toBeTruthy();
    if (!bootstrapIdempotencyKey)
      throw new Error("Owner bootstrap request omitted its idempotency key.");
    const bootstrapBody = bootstrapRequest.postDataJSON();
    expect(bootstrapBody).not.toHaveProperty("contractualAcceptance");
    const replay = await page.evaluate(
      async ({ key, body }) => {
        const replayResponse = await fetch("/api/v1/organizations/bootstrap", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": key,
          },
          body: JSON.stringify(body),
        });
        return {
          status: replayResponse.status,
          payload: await replayResponse.json(),
        };
      },
      { key: bootstrapIdempotencyKey, body: bootstrapBody }
    );
    expect(replay.status).toBe(201);
    expect(replay.payload).toMatchObject(result);
    await expectPersistedOwnerSignupConsent(userId!, bootstrapIdempotencyKey);
    expect(result.organizationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );

    await expect(page).toHaveURL(
      new RegExp(`/owner\\?organizationId=${result.organizationId}`)
    );

    const scope = `organizationId=${result.organizationId}&locationId=${result.locationId}`;
    const groupName = `Grupo ${runId.slice(0, 8)}`;
    const className = `Clase ${runId.slice(0, 8)}`;
    const secondClassName = `Clase extra ${runId.slice(0, 8)}`;
    const athleteGivenName = "Gimnasta";
    const athleteFamilyName = runId.slice(0, 8);
    const athleteName = `${athleteGivenName} ${athleteFamilyName}`;
    const adultGivenName = "Persona adulta";
    const adultFamilyName = runId.slice(0, 8);
    const adultName = `${adultGivenName} ${adultFamilyName}`;

    async function createClassWithSessions(name: string, weekday: string) {
      await page.goto(`/owner/classes?${scope}`);
      await page.getByLabel("Nombre de la clase").fill(name);
      await page.getByLabel("Plazas disponibles").fill("1");
      await page.getByLabel("Día 1").selectOption({ label: weekday });
      const classResponsePromise = page.waitForResponse(
        (candidate) =>
          candidate.url().endsWith("/api/v1/owner/classes") &&
          candidate.request().method() === "POST"
      );
      await page
        .getByRole("button", { name: "Crear clase y sesiones" })
        .click();
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
      const classesList = page.getByRole("region", {
        name: "Clases de tu academia",
      });
      await expect(
        classesList.getByRole("heading", { name, exact: true })
      ).toBeVisible();
      return {
        classTemplateId: classPayload.data.id,
        sessionCount: classPayload.data.sessionCount,
      };
    }

    async function createAndActivateEnrollment(
      enrolledClassName: string,
      classTemplateId: string,
      expectedActiveCount: number
    ) {
      await page.goto(`/owner/enrollments?${scope}&status=pending`);
      const createEnrollment = page.getByRole("form", {
        name: "Crear inscripción",
      });
      const classSelect = createEnrollment.getByLabel("Clase");
      const classOption = classSelect
        .locator("option")
        .filter({ hasText: enrolledClassName });
      await expect(classOption).toHaveCount(1);
      expect(await classOption.getAttribute("value")).toBe(classTemplateId);
      await classSelect.selectOption(classTemplateId);
      const search = createEnrollment.getByRole("searchbox", {
        name: "Gimnasta",
      });
      await search.fill(athleteGivenName);
      await expect(
        page.getByRole("list", { name: "Resultados de búsqueda" })
      ).toBeVisible();
      await page
        .getByRole("button", { name: athleteName, exact: true })
        .click();
      const enrollmentResponse = page.waitForResponse(
        (candidate) =>
          candidate.url().endsWith("/api/v1/owner/enrollments") &&
          candidate.request().method() === "POST"
      );
      await createEnrollment
        .getByRole("button", { name: "Registrar inscripción pendiente" })
        .click();
      const enrollmentResult = await enrollmentResponse;
      expect(enrollmentResult.ok()).toBe(true);
      const enrollmentRequest = enrollmentResult.request().postDataJSON() as {
        organizationId: string;
        locationId: string;
        athleteId: string;
        classTemplateId: string;
      };
      expect(enrollmentRequest).toMatchObject({
        organizationId: result.organizationId,
        locationId: result.locationId,
        athleteId,
        classTemplateId,
      });
      const enrollmentPayload = (await enrollmentResult.json()) as {
        data: { id: string };
      };
      expect(enrollmentPayload.data.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      const pendingRow = page
        .locator("li")
        .filter({ hasText: athleteName })
        .filter({ hasText: enrolledClassName });
      await expect(pendingRow).toHaveCount(1);
      await expect(pendingRow).toBeVisible();
      const activateResponse = page.waitForResponse(
        (candidate) =>
          /\/api\/v1\/owner\/enrollments\/[^/]+$/.test(candidate.url()) &&
          candidate.request().method() === "PATCH"
      );
      await pendingRow.getByRole("button", { name: "Activar" }).click();
      const activationResult = await activateResponse;
      expect(activationResult.ok()).toBe(true);
      expect(
        new URL(activationResult.url()).pathname.match(
          /\/api\/v1\/owner\/enrollments\/([^/]+)$/
        )?.[1]
      ).toBe(enrollmentPayload.data.id);
      await page.waitForLoadState("networkidle");
      await page.goto(`/owner/enrollments?${scope}&status=active`);
      const activeRows = page.locator("li").filter({ hasText: athleteName });
      await expect(activeRows).toHaveCount(expectedActiveCount);
      const activeEnrollmentRow = activeRows.filter({
        hasText: enrolledClassName,
      });
      await expect(activeEnrollmentRow).toHaveCount(1);
      await expect(
        activeEnrollmentRow.getByText("Activa", { exact: true })
      ).toBeVisible();
      return enrollmentPayload.data.id;
    }

    await page.goto(`/owner/groups?${scope}`);
    await expect(
      page.getByRole("heading", { name: "Grupos y equipos", exact: true })
    ).toBeVisible();
    await page.getByLabel("Nombre del grupo").fill(groupName);
    await page.getByLabel("Plazas (opcional)").fill("2");
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
    const createdAthleteResponse = await athleteResponse;
    expect(createdAthleteResponse.ok()).toBe(true);
    const createdAthletePayload = (await createdAthleteResponse.json()) as {
      data: { athleteId: string };
    };
    expect(createdAthletePayload.data.athleteId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    const athleteId = createdAthletePayload.data.athleteId;
    await expect(page.getByText(athleteName, { exact: true })).toBeVisible();

    const firstClass = await createClassWithSessions(className, "Lunes");
    const secondClass = await createClassWithSessions(
      secondClassName,
      "Miércoles"
    );
    const classTemplateId = firstClass.classTemplateId;
    const secondClassTemplateId = secondClass.classTemplateId;
    const firstEnrollmentId = await createAndActivateEnrollment(
      className,
      classTemplateId,
      1
    );
    const secondEnrollmentId = await createAndActivateEnrollment(
      secondClassName,
      secondClassTemplateId,
      2
    );
    expect(firstEnrollmentId).not.toBe(secondEnrollmentId);

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
    const firstClassSession = sessionSelect
      .locator("option")
      .filter({ hasText: className });
    expect(await firstClassSession.count()).toBeGreaterThan(0);
    const firstClassSessionId = await firstClassSession
      .first()
      .getAttribute("value");
    expect(firstClassSessionId).toBeTruthy();
    await sessionSelect.selectOption(firstClassSessionId!);
    const selectedSessionId = await sessionSelect.inputValue();
    const selectedSessionResult = await pool.query<{ starts_at: string }>(
      `select starts_at
         from zaltyko.sessions
        where organization_id = $1::uuid and id = $2::uuid and location_id = $3::uuid`,
      [result.organizationId, selectedSessionId, result.locationId]
    );
    expect(selectedSessionResult.rows).toHaveLength(1);
    const selectedSessionStartsAt = selectedSessionResult.rows[0].starts_at;
    const attendance = page.getByLabel(`Asistencia de ${athleteName}`, {
      exact: true,
    });
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
    // One gymnast is enrolled in two classes so the invoice proves one
    // athlete-level line with both covered enrollments.
    const servicePeriod = nextMonth();
    await page.getByLabel("Mes de la cuota").fill(servicePeriod);
    const linkAthleteToFamily = page.getByRole("button", {
      name: `Vincular a una familia a ${athleteName}`,
      exact: true,
    });
    await expect(linkAthleteToFamily).toHaveCount(2);
    await linkAthleteToFamily.first().click();
    await expect(
      page.getByRole("heading", {
        name: `Vincular a ${athleteName} a una familia`,
      })
    ).toBeVisible();
    await page.getByLabel("Nombre de la persona adulta").fill(adultGivenName);
    const adultFamilyNameField = page.getByLabel("Apellidos", {
      exact: true,
    });
    await expect(adultFamilyNameField).toHaveCount(1);
    await adultFamilyNameField.fill(adultFamilyName);
    const associationEffectiveDate = page.getByLabel("Fecha efectiva");
    const associationLocalDate = await pool.query<{ local_date: string }>(
      `select (current_timestamp at time zone timezone)::date::text as local_date
         from zaltyko.locations
        where organization_id = $1::uuid and id = $2::uuid and is_active = true`,
      [result.organizationId, result.locationId]
    );
    expect(associationLocalDate.rows).toHaveLength(1);
    const associationEffectiveFrom = associationLocalDate.rows[0]!.local_date;
    expect(associationEffectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    await associationEffectiveDate.fill(associationEffectiveFrom);
    const refreshedMonthlyOptionsPromise = page.waitForResponse(
      (candidate) =>
        candidate
          .url()
          .includes("/api/v1/owner/billing/monthly-invoices/options") &&
        candidate.url().includes(`servicePeriod=${servicePeriod}`) &&
        candidate.request().method() === "GET"
    );
    const associationResponse = page.waitForResponse(
      (candidate) =>
        candidate.url().endsWith("/api/v1/owner/families/associations") &&
        candidate.request().method() === "POST"
    );
    await page.getByRole("button", { name: "Guardar vínculo" }).click();
    const associationResult = await associationResponse;
    expect(associationResult.ok()).toBe(true);
    const associationRequest = associationResult.request().postDataJSON() as {
      organizationId: string;
      locationId: string;
      athleteIds: string[];
    };
    expect(associationRequest).toMatchObject({
      organizationId: result.organizationId,
      locationId: result.locationId,
      athleteIds: [athleteId],
    });
    const associationData = (await associationResult.json()) as {
      data: { familyId: string };
    };
    const refreshedMonthlyOptionsResponse =
      await refreshedMonthlyOptionsPromise;
    expect(refreshedMonthlyOptionsResponse.ok()).toBe(true);
    const refreshedMonthlyOptions =
      (await refreshedMonthlyOptionsResponse.json()) as {
        data: {
          organizationId: string;
          locationId: string;
          servicePeriod: string;
          families: Array<{
            familyId: string;
            enrollments: Array<{
              enrollmentId: string;
              athleteId: string;
              blockingReasons: string[];
            }>;
          }>;
          unassignedEnrollments: Array<{ enrollmentId: string }>;
        };
      };
    expect(refreshedMonthlyOptions.data.organizationId).toBe(
      result.organizationId
    );
    expect(refreshedMonthlyOptions.data.locationId).toBe(result.locationId);
    expect(refreshedMonthlyOptions.data.servicePeriod).toBe(servicePeriod);
    expect(refreshedMonthlyOptions.data.families).toHaveLength(1);
    const associatedFamily = refreshedMonthlyOptions.data.families[0];
    expect(associatedFamily?.familyId).toBe(associationData.data.familyId);
    expect(
      associatedFamily?.enrollments
        .map(({ enrollmentId }) => enrollmentId)
        .sort()
    ).toEqual([firstEnrollmentId, secondEnrollmentId].sort());
    expect(
      new Set(
        associatedFamily?.enrollments.map(
          ({ athleteId: linkedAthleteId }) => linkedAthleteId
        )
      )
    ).toEqual(new Set([athleteId]));
    expect(
      associatedFamily?.enrollments.every(
        ({ blockingReasons }) => !blockingReasons.includes("FAMILY_REQUIRED")
      )
    ).toBe(true);
    expect(refreshedMonthlyOptions.data.unassignedEnrollments).toHaveLength(0);
    const familyMemberships = await pool.query<{ family_id: string }>(
      `select family_id
         from zaltyko.family_members
        where organization_id = $1::uuid
          and family_id = $2::uuid
          and athlete_id = $3::uuid
          and starts_on <= $4::date
          and (ends_on is null or ends_on >= (
            $4::date + interval '1 month - 1 day'
          )::date)`,
      [
        result.organizationId,
        associationData.data.familyId,
        athleteId,
        `${servicePeriod}-01`,
      ]
    );
    expect(familyMemberships.rows).toHaveLength(1);
    const familySelect = page.getByRole("combobox", {
      name: "Familia",
      exact: true,
    });
    await expect(familySelect).toHaveValue(associationData.data.familyId);
    const payerSelect = page.getByRole("combobox", {
      name: "Quién paga",
      exact: true,
    });
    await expect(payerSelect).toHaveValue("");
    await expect(linkAthleteToFamily).toHaveCount(0);
    const tariffAssignmentButtons = page.getByRole("button", {
      name: `Asignar tarifa mensual a ${athleteName}`,
    });
    await expect(tariffAssignmentButtons).toHaveCount(2);

    const waitForPricePlanOptions = () =>
      page.waitForResponse(
        (candidate) =>
          candidate.url().includes("/api/v1/owner/price-plans/options") &&
          candidate.request().method() === "GET"
      );
    const pricePlanOptionsResponsePromise = waitForPricePlanOptions();
    await tariffAssignmentButtons.first().click();
    await expect(
      page.getByRole("heading", { name: `Asignar tarifa a ${athleteName}` })
    ).toBeVisible();
    const pricePlanOptionsResponse = await pricePlanOptionsResponsePromise;
    expect(pricePlanOptionsResponse.ok()).toBe(true);
    const pricePlanOptionsPayload = (await pricePlanOptionsResponse.json()) as {
      data: {
        organizationId: string;
        locationId: string;
        classTemplates: Array<{ id: string; name: string }>;
      };
    };
    expect(pricePlanOptionsPayload.data.organizationId).toBe(
      result.organizationId
    );
    expect(pricePlanOptionsPayload.data.locationId).toBe(result.locationId);
    const coveredClassOptions = pricePlanOptionsPayload.data.classTemplates
      .filter(({ name }) => [className, secondClassName].includes(name))
      .sort((left, right) => left.name.localeCompare(right.name));
    expect(coveredClassOptions.map(({ name }) => name)).toEqual(
      [className, secondClassName].sort((left, right) =>
        left.localeCompare(right)
      )
    );
    const coveredClassTemplateIds = coveredClassOptions
      .map(({ id }) => id)
      .sort();
    expect(coveredClassTemplateIds).toEqual(
      [classTemplateId, secondClassTemplateId].sort()
    );

    const coverageGroup = page.getByRole("group", {
      name: "Clases cubiertas",
    });
    const firstCoverageCheckbox = coverageGroup.getByRole("checkbox", {
      name: className,
      exact: true,
    });
    const secondCoverageCheckbox = coverageGroup.getByRole("checkbox", {
      name: secondClassName,
      exact: true,
    });
    await expect(firstCoverageCheckbox).not.toBeChecked();
    await expect(secondCoverageCheckbox).not.toBeChecked();
    await firstCoverageCheckbox.check();
    await secondCoverageCheckbox.check();
    await page
      .getByLabel("Nombre de la tarifa")
      .fill(`Cuota ${runId.slice(0, 8)}`);
    await page.getByLabel(/Importe mensual/).fill("35,00");
    await page
      .getByLabel("Vigente desde", { exact: true })
      .fill(`${servicePeriod}-01`);
    await expect(
      page.getByRole("checkbox", { name: "Sin fecha de fin", exact: true })
    ).toBeChecked();
    const pricePlanResponse = page.waitForResponse(
      (candidate) =>
        candidate.url().endsWith("/api/v1/owner/billing/price-plans") &&
        candidate.request().method() === "POST"
    );
    await page.getByRole("button", { name: "Crear tarifa mensual" }).click();
    const pricePlanResult = await pricePlanResponse;
    expect(pricePlanResult.ok()).toBe(true);
    const pricePlanRequest = pricePlanResult.request().postDataJSON() as {
      organizationId: string;
      locationId: string;
      name: string;
      amountCents: number;
      coverage: {
        classTemplateIds: string[];
        startsOn: string;
        endsOn: string | null;
      };
    };
    expect(pricePlanRequest).toEqual({
      organizationId: result.organizationId,
      locationId: result.locationId,
      name: `Cuota ${runId.slice(0, 8)}`,
      amountCents: 3500,
      coverage: {
        classTemplateIds: coveredClassTemplateIds,
        startsOn: `${servicePeriod}-01`,
        endsOn: null,
      },
    });
    const pricePlanPayload = (await pricePlanResult.json()) as {
      data: { id: string };
    };
    expect(pricePlanPayload.data.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    const pricePlanId = pricePlanPayload.data.id;
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Tarifa creada con cobertura para 2 clases" })
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Tarifa mensual", exact: true })
    ).toHaveValue(pricePlanId);
    await page
      .getByLabel("Vigente desde", { exact: true })
      .fill(`${servicePeriod}-01`);
    const tariffAssignment = page.waitForResponse(
      (candidate) =>
        /\/api\/v1\/owner\/enrollments\/[^/]+\/price-plan$/.test(
          candidate.url()
        ) && candidate.request().method() === "PATCH"
    );
    await page.getByRole("button", { name: "Guardar tarifa" }).click();
    const firstTariffAssignmentResponse = await tariffAssignment;
    expect(firstTariffAssignmentResponse.ok()).toBe(true);
    const firstAssignedEnrollmentId = new URL(
      firstTariffAssignmentResponse.url()
    ).pathname.match(
      /\/api\/v1\/owner\/enrollments\/([^/]+)\/price-plan$/
    )?.[1];
    expect([firstEnrollmentId, secondEnrollmentId]).toContain(
      firstAssignedEnrollmentId
    );

    await expect(tariffAssignmentButtons).toHaveCount(1);
    const secondPricePlanOptionsResponsePromise = waitForPricePlanOptions();
    await tariffAssignmentButtons.click();
    await expect(
      page.getByRole("heading", { name: `Asignar tarifa a ${athleteName}` })
    ).toBeVisible();
    const secondPricePlanOptionsResponse =
      await secondPricePlanOptionsResponsePromise;
    expect(secondPricePlanOptionsResponse.ok()).toBe(true);
    const secondPricePlanOptionsPayload =
      (await secondPricePlanOptionsResponse.json()) as {
        data: {
          organizationId: string;
          locationId: string;
          items: Array<{ id: string }>;
        };
      };
    expect(secondPricePlanOptionsPayload.data.organizationId).toBe(
      result.organizationId
    );
    expect(secondPricePlanOptionsPayload.data.locationId).toBe(
      result.locationId
    );
    expect(
      secondPricePlanOptionsPayload.data.items.some(
        (item) => item.id === pricePlanId
      )
    ).toBe(true);
    await expect(
      page.getByRole("combobox", { name: "Tarifa mensual", exact: true })
    ).toHaveValue(pricePlanId);
    await page
      .getByLabel("Vigente desde", { exact: true })
      .fill(`${servicePeriod}-01`);
    const secondTariffAssignment = page.waitForResponse(
      (candidate) =>
        /\/api\/v1\/owner\/enrollments\/[^/]+\/price-plan$/.test(
          candidate.url()
        ) && candidate.request().method() === "PATCH"
    );
    await page.getByRole("button", { name: "Guardar tarifa" }).click();
    const secondTariffAssignmentResponse = await secondTariffAssignment;
    expect(secondTariffAssignmentResponse.ok()).toBe(true);
    const secondAssignedEnrollmentId = new URL(
      secondTariffAssignmentResponse.url()
    ).pathname.match(
      /\/api\/v1\/owner\/enrollments\/([^/]+)\/price-plan$/
    )?.[1];
    expect([firstEnrollmentId, secondEnrollmentId].sort()).toEqual(
      [firstAssignedEnrollmentId, secondAssignedEnrollmentId].sort()
    );
    await expect(tariffAssignmentButtons).toHaveCount(0);

    const invoiceLines = page.getByRole("list", {
      name: "Desglose por gimnasta",
    });
    const invoiceLine = invoiceLines.getByRole("listitem");
    await expect(invoiceLine).toHaveCount(1);
    await expect(invoiceLine).toContainText(athleteName);
    await expect(invoiceLine).toContainText("Clases cubiertas:");
    await expect(invoiceLine).toContainText(className);
    await expect(invoiceLine).toContainText(secondClassName);
    await expect(invoiceLine).toContainText(/35,00/);
    await expect(payerSelect).toHaveValue("");
    await payerSelect.selectOption({ label: adultName });
    await expect(page.getByText("Total de la factura")).toBeVisible();
    await expect(
      page.getByText("Total de la factura").locator("..").getByText(/35,00/)
    ).toBeVisible();
    await page
      .getByLabel("Fecha de vencimiento", { exact: true })
      .fill(`${servicePeriod}-15`);
    const invoiceButton = page.getByRole("button", {
      name: /Emitir factura pendiente/,
    });
    await expect(invoiceButton).toBeEnabled();
    const invoiceResponse = page.waitForResponse(
      (candidate) =>
        candidate
          .url()
          .endsWith("/api/v1/owner/billing/monthly-invoices/issue") &&
        candidate.request().method() === "POST"
    );
    await invoiceButton.click();
    const issuedInvoiceResponse = await invoiceResponse;
    expect(issuedInvoiceResponse.ok()).toBe(true);
    const issuedInvoicePayload = (await issuedInvoiceResponse.json()) as {
      data: {
        totalAmountCents: number;
        lines: Array<{
          athleteId: string;
          enrollmentId: string | null;
          pricePlanId: string;
          amountCents: number;
          coveredEnrollments: Array<{
            classTemplateId: string;
            className: string;
          }>;
        }>;
      };
    };
    expect(issuedInvoicePayload.data.totalAmountCents).toBe(3500);
    expect(issuedInvoicePayload.data.lines).toHaveLength(1);
    expect(issuedInvoicePayload.data.lines[0]).toMatchObject({
      athleteId: expect.any(String),
      enrollmentId: null,
      pricePlanId,
      amountCents: 3500,
    });
    expect(
      issuedInvoicePayload.data.lines[0]?.coveredEnrollments
        .map(({ classTemplateId }) => classTemplateId)
        .sort()
    ).toEqual(coveredClassTemplateIds);
    expect(
      issuedInvoicePayload.data.lines[0]?.coveredEnrollments
        .map(({ className: coveredClassName }) => coveredClassName)
        .sort((left, right) => left.localeCompare(right))
    ).toEqual(
      [className, secondClassName].sort((left, right) =>
        left.localeCompare(right)
      )
    );
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Factura emitida y pendiente" })
    ).toBeVisible();

    await page.goto(`/owner/payments?${scope}`);
    await expect(
      page.getByRole("heading", { name: "Registrar un pago recibido" })
    ).toBeVisible();
    const paymentMethod = page.getByRole("combobox", {
      name: "Método de pago",
    });
    await expect(paymentMethod).toHaveCount(1);
    await paymentMethod.selectOption({ label: "Transferencia" });
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
    await expect(
      page.getByRole("heading", { name: "No hay cargos pendientes" })
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Cargo pendiente" })
    ).toHaveCount(0);

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
    const primaryNavigation = page.getByRole("navigation", {
      name: "Principal",
    });
    await expect(primaryNavigation).toBeVisible();
    const dashboardLink = primaryNavigation.getByRole("link", {
      name: "Resumen",
    });
    await expect(dashboardLink).toBeVisible();
    await expect(dashboardLink).toHaveAttribute("href", `/owner?${scope}`);

    const persisted = await pool.query<{
      organization_name: string;
      location_name: string;
      role: string;
      groups: number;
      members: number;
      athletes: number;
      class_templates: number;
      sessions: number;
      active_enrollments: number;
      family_members: number;
      family_payers: number;
      tariff_coverage: number;
      attendance: number;
      invoices: number;
      invoice_lines: number;
      invoice_line_enrollments: number;
      paid_charges: number;
      manual_payments: number;
    }>(
      `select organization.name as organization_name,
              location.name as location_name,
              member.role::text as role,
              (select count(*)::int from zaltyko.groups g where g.organization_id = organization.id) as groups,
              (select count(*)::int from zaltyko.group_memberships gm where gm.organization_id = organization.id) as members,
              (select count(*)::int from zaltyko.athletes a where a.organization_id = organization.id) as athletes,
              (select count(*)::int from zaltyko.class_templates ct where ct.organization_id = organization.id) as class_templates,
              (select count(*)::int from zaltyko.sessions s where s.organization_id = organization.id) as sessions,
              (select count(*)::int from zaltyko.enrollments e where e.organization_id = organization.id and e.status = 'active') as active_enrollments,
              (select count(*)::int from zaltyko.family_members fm where fm.organization_id = organization.id) as family_members,
              (select count(*)::int from zaltyko.family_payers fp where fp.organization_id = organization.id) as family_payers,
              (select count(*)::int from zaltyko.price_plan_class_template_coverage pc where pc.organization_id = organization.id) as tariff_coverage,
              (select count(*)::int from zaltyko.attendance_records ar where ar.organization_id = organization.id and ar.status = 'present') as attendance,
              (select count(*)::int from zaltyko.invoices i where i.organization_id = organization.id) as invoices,
              (select count(*)::int from zaltyko.invoice_lines il where il.organization_id = organization.id) as invoice_lines,
              (select count(*)::int from zaltyko.invoice_line_enrollments ile where ile.organization_id = organization.id) as invoice_line_enrollments,
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
        athletes: 1,
        class_templates: 2,
        sessions: firstClass.sessionCount + secondClass.sessionCount,
        active_enrollments: 2,
        family_members: 1,
        family_payers: 1,
        tariff_coverage: 2,
        attendance: 1,
        invoices: 1,
        invoice_lines: 1,
        invoice_line_enrollments: 2,
        paid_charges: 1,
        manual_payments: 1,
      },
    ]);

    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(
        `/owner?${scope}&from=${dashboardPeriod.from}&to=${dashboardPeriod.to}`
      );
      const responsiveSummary = page.getByRole("region", {
        name: "Tu academia en marcha",
      });
      await expect(
        responsiveSummary.getByRole("heading", {
          name: "Cobros recibidos en este periodo",
        })
      ).toBeVisible();
      await expect(
        responsiveSummary
          .getByText("Cobros", { exact: true })
          .locator("..")
          .getByText("1", { exact: true })
      ).toBeVisible();
      await expect(responsiveSummary.getByText("35,00")).toBeVisible();
      const viewport = await page.evaluate(() => ({
        width: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.width);
    }

    const browser = page.context().browser();
    if (!browser)
      throw new Error("The authenticated E2E browser is unavailable.");
    const secondOwnerContext = await browser.newContext();
    if (
      shouldGrantLocalNetworkAccess(
        process.env.E2E_LOCAL_SUPABASE === "true",
        testInfo.project.name
      )
    ) {
      await grantLocalNetworkAccess(secondOwnerContext, process.env.BASE_URL!);
    }
    const secondOwnerBlockedExternalRequests =
      await installLocalE2ENetworkGuard(secondOwnerContext, {
        baseUrl: process.env.BASE_URL!,
        supabaseUrl: supabaseUrl!,
      });
    try {
      const secondOwnerPage = await secondOwnerContext.newPage();
      const secondOwnerId = randomUUID();
      const secondOwnerName = `Owner E2E ${secondOwnerId.slice(0, 8)}`;
      const secondOwnerEmail = `e2e-${secondOwnerId}@example.test`;
      const secondOwnerPassword = `${randomUUID()}aA1!`;
      const secondOwnerProfileRequests: string[] = [];
      secondOwnerPage.on("request", (request) => {
        if (request.url().includes("/api/onboarding/profile")) {
          secondOwnerProfileRequests.push("legacy profile endpoint called");
        }
      });
      const appOrigin = new URL(page.url()).origin;
      await secondOwnerPage.goto(`${appOrigin}/auth/register?role=owner`);
      await expect(
        secondOwnerPage.getByRole("heading", { name: "Crea tu cuenta" })
      ).toBeVisible();
      await secondOwnerPage.getByLabel("Nombre completo").fill(secondOwnerName);
      await secondOwnerPage
        .getByLabel("Correo electrónico")
        .fill(secondOwnerEmail);
      await secondOwnerPage.getByLabel("Contraseña").fill(secondOwnerPassword);
      const secondTermsCheckbox = secondOwnerPage.getByRole("checkbox");
      await expect(secondTermsCheckbox).toHaveCount(1);
      await secondTermsCheckbox.check();
      const secondSignupResponsePromise = secondOwnerPage.waitForResponse(
        (candidate) =>
          candidate.url().includes("/auth/v1/signup") &&
          candidate.request().method() === "POST"
      );
      await secondOwnerPage
        .getByRole("button", { name: "Crear cuenta", exact: true })
        .click();
      const secondSignupResponse = await secondSignupResponsePromise;
      expect(secondSignupResponse.ok()).toBe(true);
      const secondSignupPayload = (await secondSignupResponse.json()) as {
        id?: string;
        user?: { id?: string };
      };
      const secondUserId =
        secondSignupPayload.user?.id ?? secondSignupPayload.id;
      expect(secondUserId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      if (!secondUserId)
        throw new Error("Second local signup response omitted the user ID.");
      await expect(secondOwnerPage).toHaveURL(/\/owner\/setup$/);
      expect(secondOwnerProfileRequests).toEqual([]);
      await expect(secondOwnerPage.getByRole("checkbox")).toHaveCount(0);
      await expect(
        secondOwnerPage.getByRole("button", {
          name: "Crear espacio de dirección",
        })
      ).toBeVisible();
      await secondOwnerPage
        .getByLabel("Nombre de la academia")
        .fill(`Academia E2E aislada ${secondOwnerId.slice(0, 8)}`);
      await secondOwnerPage
        .getByRole("radio", { name: "Gimnasia rítmica" })
        .check();
      await secondOwnerPage
        .getByLabel("Nombre de la primera sede")
        .fill(`Sede E2E aislada ${secondOwnerId.slice(0, 8)}`);
      const secondBootstrapRequestPromise = secondOwnerPage.waitForRequest(
        (request) =>
          request.url().endsWith("/api/v1/organizations/bootstrap") &&
          request.method() === "POST"
      );
      const secondBootstrapResponsePromise = secondOwnerPage.waitForResponse(
        (candidate) =>
          candidate.url().endsWith("/api/v1/organizations/bootstrap") &&
          candidate.request().method() === "POST"
      );
      await secondOwnerPage
        .getByRole("button", { name: "Crear espacio de dirección" })
        .click();
      const secondBootstrapRequest = await secondBootstrapRequestPromise;
      const secondBootstrapResponse = await secondBootstrapResponsePromise;
      expect(secondBootstrapResponse.status()).toBe(201);
      const secondBootstrapIdempotencyKey =
        secondBootstrapRequest.headers()["idempotency-key"];
      expect(secondBootstrapIdempotencyKey).toBeTruthy();
      if (!secondBootstrapIdempotencyKey)
        throw new Error("Second Owner bootstrap omitted its idempotency key.");
      const secondOrganization = (await secondBootstrapResponse.json()) as {
        organizationId: string;
        locationId: string;
      };

      const syntheticCoach = await pool.query<{ member_id: string }>(
        `with coach_member as (
           insert into zaltyko.organization_members
             (organization_id, user_id, role, status, location_scope_mode)
           values ($1::uuid, $2::uuid, 'coach', 'active', 'selected')
           returning organization_id, id
         )
         insert into zaltyko.member_location_scopes
           (organization_id, member_id, location_id)
         select organization_id, id, $3::uuid from coach_member
         returning member_id::text as member_id`,
        [result.organizationId, secondUserId, result.locationId]
      );
      expect(syntheticCoach.rows).toHaveLength(1);

      // Real HTTP/session authorization against this disposable runner database.
      // Owning another academy must not grant commercial access here, even
      // when the same identity is an active operational member in this academy.
      const ownUsageUrl = new URL("/api/v1/owner/saas/usage", appOrigin);
      ownUsageUrl.searchParams.set("organizationId", result.organizationId);
      expect((await page.request.get(ownUsageUrl.toString())).status()).toBe(200);
      const foreignUsageUrl = new URL("/api/v1/owner/saas/usage", appOrigin);
      foreignUsageUrl.searchParams.set("organizationId", secondOrganization.organizationId);
      expect((await page.request.get(foreignUsageUrl.toString())).status()).toBe(404);
      expect((await secondOwnerPage.request.get(foreignUsageUrl.toString())).status()).toBe(200);
      for (const commercialDeniedRole of ["coach", "manager", "admin"]) {
        await pool.query(
          `update zaltyko.organization_members set role = $1
            where organization_id = $2::uuid and id = $3::uuid`,
          [commercialDeniedRole, result.organizationId, syntheticCoach.rows[0]!.member_id]
        );
        expect((await secondOwnerPage.request.get(ownUsageUrl.toString())).status()).toBe(403);
      }
      // Restore the synthetic coach for the existing operational denial checks.
      await pool.query(
        `update zaltyko.organization_members set role = 'coach'
          where organization_id = $1::uuid and id = $2::uuid`,
        [result.organizationId, syntheticCoach.rows[0]!.member_id]
      );

      await expectPersistedOwnerSignupConsent(
        secondUserId,
        secondBootstrapIdempotencyKey
      );

      const secondTenantRequest = new URL("/api/v1/owner/groups", appOrigin);
      secondTenantRequest.searchParams.set(
        "organizationId",
        secondOrganization.organizationId
      );
      secondTenantRequest.searchParams.set(
        "locationId",
        secondOrganization.locationId
      );
      secondTenantRequest.searchParams.set("role", "owner");
      secondTenantRequest.searchParams.set("userId", userId!);
      const primaryIntoOtherTenant = await page.request.get(
        secondTenantRequest.toString()
      );
      expect(primaryIntoOtherTenant.status()).toBe(403);

      const otherTenantIntoPrimary = new URL("/api/v1/owner/groups", appOrigin);
      otherTenantIntoPrimary.searchParams.set(
        "organizationId",
        result.organizationId
      );
      otherTenantIntoPrimary.searchParams.set("locationId", result.locationId);
      const outsiderResponse = await secondOwnerPage.request.get(
        otherTenantIntoPrimary.toString()
      );
      expect(outsiderResponse.status()).toBe(403);

      const otherLocationRequest = new URL("/api/v1/owner/groups", appOrigin);
      otherLocationRequest.searchParams.set(
        "organizationId",
        result.organizationId
      );
      otherLocationRequest.searchParams.set(
        "locationId",
        secondOrganization.locationId
      );
      const otherLocationResponse = await page.request.get(
        otherLocationRequest.toString()
      );
      expect(otherLocationResponse.status()).toBe(403);

      const manualPaymentUrl = new URL(
        "/api/v1/owner/billing/manual-payments",
        appOrigin
      );
      manualPaymentUrl.searchParams.set(
        "organizationId",
        secondOrganization.organizationId
      );
      manualPaymentUrl.searchParams.set(
        "locationId",
        secondOrganization.locationId
      );
      const paymentOtherOrganization = await page.request.get(
        manualPaymentUrl.toString()
      );
      expect(paymentOtherOrganization.status()).toBe(403);

      manualPaymentUrl.searchParams.set(
        "organizationId",
        result.organizationId
      );
      manualPaymentUrl.searchParams.set(
        "locationId",
        secondOrganization.locationId
      );
      const paymentOtherLocation = await page.request.get(
        manualPaymentUrl.toString()
      );
      expect(paymentOtherLocation.status()).toBe(403);

      manualPaymentUrl.searchParams.set("locationId", result.locationId);
      const coachPaymentOptions = await secondOwnerPage.request.get(
        manualPaymentUrl.toString()
      );
      expect(coachPaymentOptions.status()).toBe(403);

      const dashboardUrl = new URL("/api/v1/owner/dashboard", appOrigin);
      dashboardUrl.searchParams.set(
        "organization_id",
        secondOrganization.organizationId
      );
      dashboardUrl.searchParams.set(
        "location_id",
        secondOrganization.locationId
      );
      dashboardUrl.searchParams.set("from", dashboardPeriod.from);
      dashboardUrl.searchParams.set("to", dashboardPeriod.to);
      const dashboardOtherOrganization = await page.request.get(
        dashboardUrl.toString()
      );
      expect(dashboardOtherOrganization.status()).toBe(403);

      dashboardUrl.searchParams.set("organization_id", result.organizationId);
      dashboardUrl.searchParams.set(
        "location_id",
        secondOrganization.locationId
      );
      const dashboardOtherLocation = await page.request.get(
        dashboardUrl.toString()
      );
      expect(dashboardOtherLocation.status()).toBe(403);

      dashboardUrl.searchParams.set("location_id", result.locationId);
      const coachDashboard = await secondOwnerPage.request.get(
        dashboardUrl.toString()
      );
      expect(coachDashboard.status()).toBe(403);
    } finally {
      await secondOwnerContext.close();
      const secondOwnerNetworkReport = secondOwnerBlockedExternalRequests();
      expect(secondOwnerNetworkReport.unexpectedBlockedRequests).toEqual([]);
    }

    // Exercise the tutor profile through the existing authenticated Owner UI.
    // The family link begins today so it is eligible in the active-family
    // selector; the invoice above remains for the next service period.
    const tutorBeforeRows = await pool.query<{
      guardian_id: string;
      family_payer_id: string;
      given_name: string;
      family_name: string;
      updated_at: string;
    }>(
      `select guardian.id::text as guardian_id,
              payer.id::text as family_payer_id,
              person.given_name,
              person.family_name,
              person.updated_at::text as updated_at
         from zaltyko.family_payers as payer
         join zaltyko.family_guardians as family_guardian
           on family_guardian.organization_id = payer.organization_id
          and family_guardian.family_id = payer.family_id
          and family_guardian.guardian_id = payer.guardian_id
         join zaltyko.guardians as guardian
           on guardian.organization_id = family_guardian.organization_id
          and guardian.id = family_guardian.guardian_id
         join zaltyko.people as person
           on person.organization_id = guardian.organization_id
          and person.id = guardian.person_id
        where payer.organization_id = $1::uuid
          and payer.family_id = $2::uuid
          and payer.is_primary = true
          and payer.ends_on is null
          and family_guardian.is_active = true
          and guardian.is_active = true`,
      [result.organizationId, associationData.data.familyId]
    );
    expect(tutorBeforeRows.rows).toHaveLength(1);
    expect(tutorBeforeRows.rows[0]).toMatchObject({
      given_name: adultGivenName,
      family_name: adultFamilyName,
    });
    const tutorBefore = tutorBeforeRows.rows[0]!;
    const renamedTutorGivenName = "Tutor QA";
    const renamedTutorFamilyName = "Editado " + runId.slice(0, 8);
    const renamedTutorName = renamedTutorGivenName + " " + renamedTutorFamilyName;
    const ownerGroupRows = await pool.query<{ id: string }>(
      `select id::text as id
         from zaltyko.groups
        where organization_id = $1::uuid
          and location_id = $2::uuid
          and name = $3
          and status = 'active'`,
      [result.organizationId, result.locationId, groupName]
    );
    expect(ownerGroupRows.rows).toHaveLength(1);
    const ownerGroupId = ownerGroupRows.rows[0]!.id;
    const ownerGroupsUrl = "/owner/groups?" + scope + "&groupId=" + encodeURIComponent(ownerGroupId);

    await page.goto(ownerGroupsUrl);
    await expect(
      page.getByRole("heading", { name: "Grupos y equipos", exact: true })
    ).toBeVisible();
    const openFamilyEditor = page.getByRole("button", {
      name: "Vincular familia a " + athleteName,
      exact: true,
    });
    const familyOptionsResponsePromise = page.waitForResponse(
      (candidate) =>
        new URL(candidate.url()).pathname === "/api/v1/owner/families/options" &&
        candidate.request().method() === "GET"
    );
    await openFamilyEditor.click();
    expect((await familyOptionsResponsePromise).status()).toBe(200);
    await page.getByRole("radio", { name: "Elegir una familia existente" }).check();
    await page
      .getByRole("combobox", { name: /^Familia existente/u })
      .selectOption(associationData.data.familyId);
    await expect(page.getByLabel("Persona pagadora de esta familia")).toHaveValue(
      tutorBefore.family_payer_id
    );
    await page.getByRole("button", {
      name: "Contactos de " + adultName,
      exact: true,
    }).click();
    const contactsSection = page.getByRole("region", {
      name: "Contactos de " + adultName,
    });
    await expect(contactsSection).toBeVisible();
    const initialProfileResponsePromise = page.waitForResponse(
      (candidate) =>
        new URL(candidate.url()).pathname ===
          "/api/v1/owner/guardians/" + tutorBefore.guardian_id + "/profile" &&
        candidate.request().method() === "GET"
    );
    await contactsSection.getByRole("button", { name: "Editar nombre del tutor" }).click();
    const initialProfileResponse = await initialProfileResponsePromise;
    expect(initialProfileResponse.status()).toBe(200);
    const initialProfilePayload = (await initialProfileResponse.json()) as {
      ok: boolean;
      data: { guardianId: string; givenName: string; familyName: string; updatedAt: string };
    };
    expect(initialProfilePayload).toMatchObject({
      ok: true,
      data: {
        guardianId: tutorBefore.guardian_id,
        givenName: adultGivenName,
        familyName: adultFamilyName,
      },
    });
    const profileRegion = page.getByRole("region", { name: "Perfil del tutor" });
    await expect(profileRegion.getByLabel("Nombre", { exact: true })).toHaveValue(adultGivenName);
    await expect(profileRegion.getByLabel("Apellidos", { exact: true })).toHaveValue(adultFamilyName);
    await profileRegion.getByLabel("Nombre", { exact: true }).fill(renamedTutorGivenName);
    await profileRegion.getByLabel("Apellidos", { exact: true }).fill(renamedTutorFamilyName);
    const tutorProfilePatchPromise = page.waitForResponse(
      (candidate) =>
        new URL(candidate.url()).pathname ===
          "/api/v1/owner/guardians/" + tutorBefore.guardian_id + "/profile" &&
        candidate.request().method() === "PATCH"
    );
    await profileRegion.getByRole("button", { name: "Guardar nombre del tutor" }).click();
    const tutorProfilePatch = await tutorProfilePatchPromise;
    // Observe the real browser origin; never inject a header to bypass CSRF.
    expect(await tutorProfilePatch.request().headerValue("origin")).toBe(new URL(page.url()).origin);
    const tutorProfileResponse = await tutorProfilePatch.json();
    expect({ status: tutorProfilePatch.status(), problemType: tutorProfileResponse?.type ?? null })
      .toEqual({ status: 200, problemType: null });
    const tutorPatchBody = tutorProfilePatch.request().postDataJSON() as Record<string, unknown>;
    expect(tutorPatchBody).toMatchObject({
      organizationId: result.organizationId,
      locationId: result.locationId,
      expectedGivenName: adultGivenName,
      expectedFamilyName: adultFamilyName,
      expectedUpdatedAt: initialProfilePayload.data.updatedAt,
      givenName: renamedTutorGivenName,
      familyName: renamedTutorFamilyName,
    });
    const tutorPatchReceipt = tutorProfileResponse as {
      ok: boolean;
      data: { guardianId: string; givenName: string; familyName: string; updatedAt: string; replayed: boolean };
    };
    expect(tutorPatchReceipt).toMatchObject({
      ok: true,
      data: {
        guardianId: tutorBefore.guardian_id,
        givenName: renamedTutorGivenName,
        familyName: renamedTutorFamilyName,
        replayed: false,
      },
    });
    expect(Date.parse(tutorPatchReceipt.data.updatedAt)).toBeGreaterThan(
      Date.parse(tutorBefore.updated_at)
    );
    const tutorAfterRows = await pool.query<{
      given_name: string;
      family_name: string;
      updated_at: string;
    }>(
      `select person.given_name, person.family_name, person.updated_at::text as updated_at
         from zaltyko.guardians as guardian
         join zaltyko.people as person
           on person.organization_id = guardian.organization_id
          and person.id = guardian.person_id
        where guardian.organization_id = $1::uuid and guardian.id = $2::uuid`,
      [result.organizationId, tutorBefore.guardian_id]
    );
    expect(tutorAfterRows.rows).toHaveLength(1);
    expect(tutorAfterRows.rows[0]).toMatchObject({
      given_name: renamedTutorGivenName,
      family_name: renamedTutorFamilyName,
    });
    expect(Date.parse(tutorAfterRows.rows[0]!.updated_at)).toBeGreaterThan(
      Date.parse(tutorBefore.updated_at)
    );
    expect(Date.parse(tutorAfterRows.rows[0]!.updated_at)).toBe(
      Date.parse(tutorPatchReceipt.data.updatedAt)
    );

    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Grupos y equipos", exact: true })
    ).toBeVisible();
    const openExistingFamilyAfterReload = page.getByRole("button", {
      name: "Vincular familia a " + athleteName,
      exact: true,
    });
    const reloadFamilyOptionsResponsePromise = page.waitForResponse(
      (candidate) =>
        new URL(candidate.url()).pathname === "/api/v1/owner/families/options" &&
        candidate.request().method() === "GET"
    );
    await openExistingFamilyAfterReload.click();
    expect((await reloadFamilyOptionsResponsePromise).status()).toBe(200);
    await page.getByRole("radio", { name: "Elegir una familia existente" }).check();
    await page
      .getByRole("combobox", { name: /^Familia existente/u })
      .selectOption(associationData.data.familyId);
    const reloadedContactsButton = page.getByRole("button", {
      name: "Contactos de " + renamedTutorName,
      exact: true,
    });
    await expect(reloadedContactsButton).toBeVisible();
    await reloadedContactsButton.click();
    const reloadedContactsSection = page.getByRole("region", {
      name: "Contactos de " + renamedTutorName,
    });
    const reloadedProfileResponsePromise = page.waitForResponse(
      (candidate) =>
        new URL(candidate.url()).pathname ===
          "/api/v1/owner/guardians/" + tutorBefore.guardian_id + "/profile" &&
        candidate.request().method() === "GET"
    );
    await reloadedContactsSection.getByRole("button", { name: "Editar nombre del tutor" }).click();
    const reloadedProfileResponse = await reloadedProfileResponsePromise;
    expect(reloadedProfileResponse.status()).toBe(200);
    const reloadedProfileRegion = page.getByRole("region", { name: "Perfil del tutor" });
    await expect(reloadedProfileRegion.getByLabel("Nombre", { exact: true })).toHaveValue(renamedTutorGivenName);
    await expect(reloadedProfileRegion.getByLabel("Apellidos", { exact: true })).toHaveValue(renamedTutorFamilyName);

    // Archive closes the original athlete fixture after its snapshots, billing,
    // attendance, responsive checks, and cross-tenant/site denial checks.
    const archiveBeforeRows = await pool.query<{
      athlete_is_active: boolean | null;
      memberships: Array<Record<string, unknown>>;
      enrollments: Array<Record<string, unknown>>;
      attendance: Array<Record<string, unknown>>;
      family: Array<Record<string, unknown>>;
      family_members: Array<Record<string, unknown>>;
      family_guardians: Array<Record<string, unknown>>;
      family_payers: Array<Record<string, unknown>>;
      invoices: Array<Record<string, unknown>>;
      invoice_lines: Array<Record<string, unknown>>;
      invoice_line_enrollments: Array<Record<string, unknown>>;
      charges: Array<Record<string, unknown>>;
      payments: Array<Record<string, unknown>>;
      payment_allocations: Array<Record<string, unknown>>;
      payment_attempts: Array<Record<string, unknown>>;
      refunds: Array<Record<string, unknown>>;
      provider_events: Array<Record<string, unknown>>;
    }>(
      `select
         (select is_active from zaltyko.athletes where organization_id = $1::uuid and id = $2::uuid) as athlete_is_active,
         (select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb) from
           (select * from zaltyko.group_memberships where organization_id = $1::uuid and athlete_id = $2::uuid) item) as memberships,
         (select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb) from
           (select * from zaltyko.enrollments where organization_id = $1::uuid and athlete_id = $2::uuid) item) as enrollments,
         (select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb) from
           (select * from zaltyko.attendance_records where organization_id = $1::uuid and athlete_id = $2::uuid) item) as attendance,
         (select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb) from
           (select * from zaltyko.families where organization_id = $1::uuid and id = $3::uuid) item) as family,
         (select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb) from
           (select * from zaltyko.family_members where organization_id = $1::uuid and family_id = $3::uuid and athlete_id = $2::uuid) item) as family_members,
         (select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb) from
           (select * from zaltyko.family_guardians where organization_id = $1::uuid and family_id = $3::uuid) item) as family_guardians,
         (select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb) from
           (select * from zaltyko.family_payers where organization_id = $1::uuid and family_id = $3::uuid) item) as family_payers,
         (select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb) from
           (select * from zaltyko.invoices where organization_id = $1::uuid) item) as invoices,
         (select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb) from
           (select * from zaltyko.invoice_lines where organization_id = $1::uuid) item) as invoice_lines,
         (select coalesce(jsonb_agg(to_jsonb(item) order by item.invoice_line_id, item.enrollment_id), '[]'::jsonb) from
           (select * from zaltyko.invoice_line_enrollments where organization_id = $1::uuid) item) as invoice_line_enrollments,
         (select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb) from
           (select * from zaltyko.charges where organization_id = $1::uuid) item) as charges,
         (select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb) from
           (select * from zaltyko.payments where organization_id = $1::uuid) item) as payments,
         (select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb) from
           (select * from zaltyko.payment_allocations where organization_id = $1::uuid) item) as payment_allocations,
         (select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb) from
           (select * from zaltyko.payment_attempts where organization_id = $1::uuid) item) as payment_attempts,
         (select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb) from
           (select * from zaltyko.refunds where organization_id = $1::uuid) item) as refunds,
         (select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb) from
           (select * from zaltyko.payment_provider_events where organization_id = $1::uuid) item) as provider_events`,
      [result.organizationId, athleteId, associationData.data.familyId]
    );
    const archiveBefore = archiveBeforeRows.rows[0]!;
    expect(archiveBefore.athlete_is_active).toBe(true);
    expect(archiveBefore.memberships).toHaveLength(1);
    expect(archiveBefore.memberships.every((item) => ["pending", "active", "paused"].includes(String(item.status)))).toBe(true);
    expect(archiveBefore.enrollments).toHaveLength(2);
    expect(archiveBefore.enrollments.every((item) => ["pending", "trial", "active", "paused"].includes(String(item.status)))).toBe(true);
    expect(archiveBefore.attendance).toHaveLength(1);
    expect(archiveBefore.family).toHaveLength(1);
    expect(archiveBefore.family_members).toHaveLength(1);
    expect(archiveBefore.family_guardians).toHaveLength(1);
    expect(archiveBefore.family_payers).toHaveLength(1);
    expect(archiveBefore.invoices).toHaveLength(1);
    expect(archiveBefore.invoice_lines).toHaveLength(1);
    expect(archiveBefore.invoice_line_enrollments).toHaveLength(2);
    expect(archiveBefore.charges).toHaveLength(1);
    expect(archiveBefore.payments).toHaveLength(1);
    expect(archiveBefore.payment_allocations).toHaveLength(1);

    await page.goto(ownerGroupsUrl);
    await expect(
      page.getByRole("heading", { name: "Grupos y equipos", exact: true })
    ).toBeVisible();
    const archiveButton = page.getByRole("button", {
      name: "Archivar ficha de " + athleteName,
      exact: true,
    });
    await expect(archiveButton).toBeVisible();
    await archiveButton.click();
    const archiveConfirmation = page.getByRole("group", {
      name: "Confirmación de archivo",
    });
    await expect(archiveConfirmation).toBeVisible();
    await expect(archiveConfirmation).toContainText(
      "Archivar no borra la ficha. Termina sus pertenencias a grupos y clases futuras, y conserva su historial y las cuotas pendientes."
    );
    const archiveRequestPromise = page.waitForRequest(
      (request) =>
        request.url().endsWith("/api/v1/owner/athletes/" + athleteId + "/archive") &&
        request.method() === "POST"
    );
    const archiveResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/owner/athletes/" + athleteId + "/archive") &&
        response.request().method() === "POST"
    );
    await archiveConfirmation
      .getByRole("button", { name: "Confirmar archivo", exact: true })
      .click();
    const archiveRequest = await archiveRequestPromise;
    const archiveResponse = await archiveResponsePromise;
    expect([200, 201]).toContain(archiveResponse.status());
    expect(archiveRequest.postDataJSON()).toEqual({
      organizationId: result.organizationId,
      locationId: result.locationId,
    });
    const archiveIdempotencyKeyLength = archiveRequest.headers()["idempotency-key"]?.length ?? 0;
    expect(archiveIdempotencyKeyLength).toBeGreaterThanOrEqual(8);
    const archiveReceipt = (await archiveResponse.json()) as {
      ok: boolean;
      data: { athleteId: string; isActive: boolean; replayed: boolean };
    };
    expect(Object.keys(archiveReceipt).sort()).toEqual(["data", "ok"]);
    expect(archiveReceipt.ok).toBe(true);
    expect(Object.keys(archiveReceipt.data).sort()).toEqual(["athleteId", "isActive", "replayed"]);
    expect(archiveReceipt.data).toEqual({ athleteId, isActive: false, replayed: false });
    await expect(archiveButton).toHaveCount(0);

    const archiveAfterRows = await pool.query<{
      athlete_is_active: boolean | null;
      memberships: Array<Record<string, unknown>>;
      enrollments: Array<Record<string, unknown>>;
      attendance: Array<Record<string, unknown>>;
      family: Array<Record<string, unknown>>;
      family_members: Array<Record<string, unknown>>;
      family_guardians: Array<Record<string, unknown>>;
      family_payers: Array<Record<string, unknown>>;
      invoices: Array<Record<string, unknown>>;
      invoice_lines: Array<Record<string, unknown>>;
      invoice_line_enrollments: Array<Record<string, unknown>>;
      charges: Array<Record<string, unknown>>;
      payments: Array<Record<string, unknown>>;
      payment_allocations: Array<Record<string, unknown>>;
      payment_attempts: Array<Record<string, unknown>>;
      refunds: Array<Record<string, unknown>>;
      provider_events: Array<Record<string, unknown>>;
    }>(
      `select
         (select is_active from zaltyko.athletes where organization_id = $1::uuid and id = $2::uuid) as athlete_is_active,
         (select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb) from (select * from zaltyko.group_memberships where organization_id = $1::uuid and athlete_id = $2::uuid) item) as memberships,
         (select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb) from (select * from zaltyko.enrollments where organization_id = $1::uuid and athlete_id = $2::uuid) item) as enrollments,
         (select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb) from (select * from zaltyko.attendance_records where organization_id = $1::uuid and athlete_id = $2::uuid) item) as attendance,
         (select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb) from (select * from zaltyko.families where organization_id = $1::uuid and id = $3::uuid) item) as family,
         (select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb) from (select * from zaltyko.family_members where organization_id = $1::uuid and family_id = $3::uuid and athlete_id = $2::uuid) item) as family_members,
         (select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb) from (select * from zaltyko.family_guardians where organization_id = $1::uuid and family_id = $3::uuid) item) as family_guardians,
         (select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb) from (select * from zaltyko.family_payers where organization_id = $1::uuid and family_id = $3::uuid) item) as family_payers,
         (select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb) from (select * from zaltyko.invoices where organization_id = $1::uuid) item) as invoices,
         (select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb) from (select * from zaltyko.invoice_lines where organization_id = $1::uuid) item) as invoice_lines,
         (select coalesce(jsonb_agg(to_jsonb(item) order by item.invoice_line_id, item.enrollment_id), '[]'::jsonb) from (select * from zaltyko.invoice_line_enrollments where organization_id = $1::uuid) item) as invoice_line_enrollments,
         (select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb) from (select * from zaltyko.charges where organization_id = $1::uuid) item) as charges,
         (select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb) from (select * from zaltyko.payments where organization_id = $1::uuid) item) as payments,
         (select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb) from (select * from zaltyko.payment_allocations where organization_id = $1::uuid) item) as payment_allocations,
         (select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb) from (select * from zaltyko.payment_attempts where organization_id = $1::uuid) item) as payment_attempts,
         (select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb) from (select * from zaltyko.refunds where organization_id = $1::uuid) item) as refunds,
         (select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb) from (select * from zaltyko.payment_provider_events where organization_id = $1::uuid) item) as provider_events`,
      [result.organizationId, athleteId, associationData.data.familyId]
    );
    const archiveAfter = archiveAfterRows.rows[0]!;
    expect(archiveAfter.athlete_is_active).toBe(false);
    expect(archiveAfter.memberships).toHaveLength(archiveBefore.memberships.length);
    expect(archiveAfter.memberships.every((item) => item.status === "ended" && item.ends_on !== null)).toBe(true);
    expect(archiveAfter.enrollments).toHaveLength(archiveBefore.enrollments.length);
    expect(archiveAfter.enrollments.every((item) => item.status === "cancelled" && item.ends_on !== null)).toBe(true);
    expect(archiveAfter.attendance).toEqual(archiveBefore.attendance);
    expect(archiveAfter.family).toEqual(archiveBefore.family);
    expect(archiveAfter.family_members).toEqual(archiveBefore.family_members);
    expect(archiveAfter.family_guardians).toEqual(archiveBefore.family_guardians);
    expect(archiveAfter.family_payers).toEqual(archiveBefore.family_payers);
    expect(archiveAfter.invoices).toEqual(archiveBefore.invoices);
    expect(archiveAfter.invoice_lines).toEqual(archiveBefore.invoice_lines);
    expect(archiveAfter.invoice_line_enrollments).toEqual(archiveBefore.invoice_line_enrollments);
    expect(archiveAfter.charges).toEqual(archiveBefore.charges);
    expect(archiveAfter.payments).toEqual(archiveBefore.payments);
    expect(archiveAfter.payment_allocations).toEqual(archiveBefore.payment_allocations);
    expect(archiveAfter.payment_attempts).toEqual(archiveBefore.payment_attempts);
    expect(archiveAfter.refunds).toEqual(archiveBefore.refunds);
    expect(archiveAfter.provider_events).toEqual(archiveBefore.provider_events);
    const archiveHistory = await pool.query<{
      membership_history: number;
      enrollment_history: number;
    }>(
      `select
         (select count(*)::int from zaltyko.group_membership_history as history
           join zaltyko.group_memberships as membership
             on membership.organization_id = history.organization_id and membership.id = history.membership_id
          where membership.organization_id = $1::uuid and membership.athlete_id = $2::uuid
            and history.to_status = 'ended' and history.reason_code = 'academy_request') as membership_history,
         (select count(*)::int from zaltyko.enrollment_status_history as history
           join zaltyko.enrollments as enrollment
             on enrollment.organization_id = history.organization_id and enrollment.id = history.enrollment_id
          where enrollment.organization_id = $1::uuid and enrollment.athlete_id = $2::uuid
            and history.to_status = 'cancelled' and history.reason_code = 'academy_request') as enrollment_history`,
      [result.organizationId, athleteId]
    );
    expect(archiveHistory.rows).toEqual([
      {
        membership_history: archiveBefore.memberships.length,
        enrollment_history: archiveBefore.enrollments.length,
      },
    ]);

    // Exercise intake after the original fixture assertions. The effective
    // date comes from the selected synthetic site's timezone.
    const intakeGroupRows = await pool.query<{
      location_id: string;
      group_status: string;
      capacity: number | null;
      location_active: boolean;
      timezone: string;
      local_date: string;
      occupancy: number;
    }>(
      `select academy_group.location_id::text as location_id,
              academy_group.status as group_status,
              academy_group.capacity,
              location.is_active as location_active,
              location.timezone,
              (current_timestamp at time zone location.timezone)::date::text as local_date,
              (select count(*)::int
                 from zaltyko.group_memberships as membership
                where membership.organization_id = academy_group.organization_id
                  and membership.group_id = academy_group.id
                  and membership.status in ('pending', 'active', 'paused')) as occupancy
         from zaltyko.groups as academy_group
         join zaltyko.locations as location
           on location.organization_id = academy_group.organization_id
          and location.id = academy_group.location_id
        where academy_group.organization_id = $1::uuid
          and academy_group.id = $2::uuid`,
      [result.organizationId, ownerGroupId]
    );
    expect(intakeGroupRows.rows).toHaveLength(1);
    const intakeGroup = intakeGroupRows.rows[0]!;
    expect(intakeGroup.location_id).toBe(result.locationId);
    expect(intakeGroup.group_status).toBe("active");
    expect(intakeGroup.location_active).toBe(true);
    expect(intakeGroup.timezone).toBeTruthy();
    expect(intakeGroup.local_date).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    expect(intakeGroup.capacity).toBe(2);
    expect(intakeGroup.occupancy).toBeLessThan(intakeGroup.capacity ?? 0);

    const intakeGivenName = `Bandeja ${runId.slice(0, 8)}`;
    const intakeFamilyName = `QA ${runId.slice(0, 8)}`;
    const intakeAthleteName = `${intakeGivenName} ${intakeFamilyName}`;
    const intakeUrl = `/owner/athletes?organizationId=${encodeURIComponent(result.organizationId)}`;
    const intakeListPath = "/api/v1/owner/athlete-intake";
    const intakeListResponse = (response: import("@playwright/test").Response) => {
      const responseUrl = new URL(response.url());
      return responseUrl.pathname === intakeListPath &&
        response.request().method() === "GET" &&
        responseUrl.searchParams.get("organizationId") === result.organizationId;
    };

    const initialIntakeListPromise = page.waitForResponse(intakeListResponse);
    await page.goto(intakeUrl);
    expect((await initialIntakeListPromise).status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Gimnastas", exact: true })).toBeVisible();
    const createIntakeButton = page.getByRole("button", { name: "Crear ficha y familia", exact: true });
    await expect(createIntakeButton).toBeEnabled();
    await page.getByLabel("Nombre", { exact: true }).fill(intakeGivenName);
    await page.getByLabel("Apellidos", { exact: true }).fill(intakeFamilyName);
    await expect(page.getByRole("combobox", { name: "Relación familiar inicial", exact: true })).toBeVisible();
    await page.getByLabel("Relación familiar inicial", { exact: true }).selectOption("parent");
    await page.getByLabel("Fecha efectiva del vínculo familiar", { exact: true }).fill(intakeGroup.local_date);

    const createIntakeRequestPromise = page.waitForRequest(
      (request) => new URL(request.url()).pathname === intakeListPath && request.method() === "POST"
    );
    const createIntakeResponsePromise = page.waitForResponse(
      (response) => new URL(response.url()).pathname === intakeListPath && response.request().method() === "POST"
    );
    const createdIntakeListPromise = page.waitForResponse(intakeListResponse);
    await createIntakeButton.click();
    const createIntakeRequest = await createIntakeRequestPromise;
    const createIntakeResponse = await createIntakeResponsePromise;
    expect(createIntakeResponse.status()).toBe(201);
    expect(createIntakeRequest.postDataJSON()).toEqual({
      organizationId: result.organizationId,
      givenName: intakeGivenName,
      familyName: intakeFamilyName,
      family: { kind: "new", relationship: "parent", startsOn: intakeGroup.local_date },
    });
    const createIntakeKey = createIntakeRequest.headers()["idempotency-key"];
    expect(createIntakeKey).toMatch(/^[0-9a-f-]{36}$/iu);
    const createIntakeReceipt = (await createIntakeResponse.json()) as {
      ok: boolean;
      data: { athleteId: string; familyId: string; incompleteFamily: boolean; replayed: boolean };
    };
    expect(createIntakeReceipt.ok).toBe(true);
    expect(Object.keys(createIntakeReceipt.data).sort()).toEqual([
      "athleteId", "familyId", "incompleteFamily", "replayed",
    ]);
    expect(createIntakeReceipt.data).toMatchObject({ incompleteFamily: true, replayed: false });
    const intakeAthleteId = createIntakeReceipt.data.athleteId;
    const intakeFamilyId = createIntakeReceipt.data.familyId;
    expect(intakeAthleteId).toMatch(/^[0-9a-f-]{36}$/iu);
    expect(intakeFamilyId).toMatch(/^[0-9a-f-]{36}$/iu);

    const createdListPayload = await (await createdIntakeListPromise).json() as {
      ok: boolean;
      data: {
        items: Array<{
          athleteId: string;
          givenName: string;
          familyName: string;
          incompleteFamily: boolean;
          familySummaries: Array<{ familyId: string; relationship: string; startsOn: string; incompleteFamily: boolean }>;
        }>;
      };
    };
    expect(createdListPayload.ok).toBe(true);
    const createdListItem = createdListPayload.data.items.find((item) => item.athleteId === intakeAthleteId);
    expect(createdListItem).toEqual({
      athleteId: intakeAthleteId,
      givenName: intakeGivenName,
      familyName: intakeFamilyName,
      incompleteFamily: true,
      familySummaries: [{
        familyId: intakeFamilyId,
        relationship: "parent",
        startsOn: intakeGroup.local_date,
        incompleteFamily: true,
      }],
    });
    const intakeListRow = page.locator("li").filter({ hasText: intakeAthleteName });
    await expect(intakeListRow).toHaveCount(1);
    await expect(intakeListRow).toContainText("Familia incompleta: falta asociar un tutor/pagador.");

    const intakeBeforeAssignmentRows = await pool.query<{
      person_id: string;
      athlete_id: string;
      family_id: string;
      given_name: string;
      family_name: string;
      athlete_active: boolean;
      family_active: boolean;
      relationship: string;
      family_starts_on: string;
      family_ends_on: string | null;
      membership_count: number;
      enrollment_count: number;
      guardian_link_count: number;
      payer_count: number;
    }>(
      `select person.id::text as person_id, athlete.id::text as athlete_id,
              family.id::text as family_id, person.given_name, person.family_name,
              athlete.is_active as athlete_active, family.is_active as family_active,
              family_member.relationship, family_member.starts_on::text as family_starts_on,
              family_member.ends_on::text as family_ends_on,
              (select count(*)::int from zaltyko.group_memberships as membership
                where membership.organization_id = athlete.organization_id and membership.athlete_id = athlete.id) as membership_count,
              (select count(*)::int from zaltyko.enrollments as enrollment
                where enrollment.organization_id = athlete.organization_id and enrollment.athlete_id = athlete.id) as enrollment_count,
              (select count(*)::int from zaltyko.family_guardians as family_guardian
                where family_guardian.organization_id = family.organization_id and family_guardian.family_id = family.id) as guardian_link_count,
              (select count(*)::int from zaltyko.family_payers as payer
                where payer.organization_id = family.organization_id and payer.family_id = family.id) as payer_count
         from zaltyko.athletes as athlete
         join zaltyko.people as person on person.organization_id = athlete.organization_id and person.id = athlete.person_id
         join zaltyko.family_members as family_member on family_member.organization_id = athlete.organization_id and family_member.athlete_id = athlete.id
         join zaltyko.families as family on family.organization_id = family_member.organization_id and family.id = family_member.family_id
        where athlete.organization_id = $1::uuid and athlete.id = $2::uuid and family.id = $3::uuid`,
      [result.organizationId, intakeAthleteId, intakeFamilyId]
    );
    expect(intakeBeforeAssignmentRows.rows).toHaveLength(1);
    const intakeBeforeAssignment = intakeBeforeAssignmentRows.rows[0]!;
    expect(intakeBeforeAssignment).toMatchObject({
      person_id: expect.stringMatching(/^[0-9a-f-]{36}$/iu),
      athlete_id: intakeAthleteId,
      family_id: intakeFamilyId,
      given_name: intakeGivenName,
      family_name: intakeFamilyName,
      athlete_active: true,
      family_active: true,
      relationship: "parent",
      family_starts_on: intakeGroup.local_date,
      family_ends_on: null,
      membership_count: 0,
      enrollment_count: 0,
      guardian_link_count: 0,
      payer_count: 0,
    });

    const intakeReloadListPromise = page.waitForResponse(intakeListResponse);
    await page.reload();
    const intakeReloadPayload = await (await intakeReloadListPromise).json() as typeof createdListPayload;
    expect(intakeReloadPayload.ok).toBe(true);
    expect(intakeReloadPayload.data.items.find((item) => item.athleteId === intakeAthleteId)).toMatchObject({
      athleteId: intakeAthleteId,
      incompleteFamily: true,
      familySummaries: [{ familyId: intakeFamilyId, relationship: "parent", startsOn: intakeGroup.local_date, incompleteFamily: true }],
    });
    expect(intakeBeforeAssignment.membership_count).toBe(0);
    await expect(page.locator("li").filter({ hasText: intakeAthleteName })).toHaveCount(1);

    await page.locator("li").filter({ hasText: intakeAthleteName })
      .getByRole("button", { name: "Asignar a un grupo", exact: true }).click();
    const groupSelect = page.getByLabel("Grupo y sede", { exact: true });
    await expect(groupSelect.locator(`option[value="${ownerGroupId}"]`)).toHaveCount(1);
    await groupSelect.selectOption(ownerGroupId);
    await page.getByLabel("Fecha civil de inicio en la sede", { exact: true }).fill(intakeGroup.local_date);
    const assignmentEndpoint = `/api/v1/owner/athlete-intake/${intakeAthleteId}/assign`;
    const assignIntakeRequestPromise = page.waitForRequest(
      (request) => new URL(request.url()).pathname === assignmentEndpoint && request.method() === "POST"
    );
    const assignIntakeResponsePromise = page.waitForResponse(
      (response) => new URL(response.url()).pathname === assignmentEndpoint && response.request().method() === "POST"
    );
    const assignedIntakeListPromise = page.waitForResponse(intakeListResponse);
    await page.getByRole("button", { name: "Asignar gimnasta", exact: true }).click();
    const assignIntakeRequest = await assignIntakeRequestPromise;
    const assignIntakeResponse = await assignIntakeResponsePromise;
    expect(assignIntakeResponse.status()).toBe(201);
    expect(assignIntakeRequest.postDataJSON()).toEqual({
      organizationId: result.organizationId,
      groupId: ownerGroupId,
      startsOn: intakeGroup.local_date,
    });
    const assignIntakeKey = assignIntakeRequest.headers()["idempotency-key"];
    expect(assignIntakeKey).toMatch(/^[0-9a-f-]{36}$/iu);
    const assignIntakeReceipt = (await assignIntakeResponse.json()) as {
      ok: boolean;
      data: { athleteId: string; groupId: string; membershipId: string; startsOn: string; replayed: boolean };
    };
    expect(assignIntakeReceipt.ok).toBe(true);
    expect(Object.keys(assignIntakeReceipt.data).sort()).toEqual([
      "athleteId", "groupId", "membershipId", "replayed", "startsOn",
    ]);
    expect(assignIntakeReceipt.data).toEqual({
      athleteId: intakeAthleteId,
      groupId: ownerGroupId,
      membershipId: expect.stringMatching(/^[0-9a-f-]{36}$/iu),
      startsOn: intakeGroup.local_date,
      replayed: false,
    });
    const assignedIntakeListPayload = await (await assignedIntakeListPromise).json() as {
      ok: boolean;
      data: { items: Array<{ athleteId: string }> };
    };
    expect(assignedIntakeListPayload.ok).toBe(true);
    expect(assignedIntakeListPayload.data.items.some((item) => item.athleteId === intakeAthleteId)).toBe(false);
    await expect(page.locator("li").filter({ hasText: intakeAthleteName })).toHaveCount(0);

    const intakeAfterAssignmentRows = await pool.query<{
      membership_id: string;
      group_id: string;
      membership_status: string;
      membership_starts_on: string;
      membership_ends_on: string | null;
      open_membership_count: number;
      enrollment_count: number;
      history_count: number;
      from_status: string | null;
      to_status: string | null;
      history_key: string | null;
      effective_on: string | null;
    }>(
      `select membership.id::text as membership_id,
              membership.group_id::text as group_id,
              membership.status as membership_status,
              membership.starts_on::text as membership_starts_on,
              membership.ends_on::text as membership_ends_on,
              (select count(*)::int from zaltyko.group_memberships as open_membership
                where open_membership.organization_id = membership.organization_id
                  and open_membership.athlete_id = membership.athlete_id
                  and open_membership.status in ('pending', 'active', 'paused')) as open_membership_count,
              (select count(*)::int from zaltyko.enrollments as enrollment
                where enrollment.organization_id = membership.organization_id
                  and enrollment.athlete_id = membership.athlete_id) as enrollment_count,
              (select count(*)::int from zaltyko.group_membership_history as history
                where history.organization_id = membership.organization_id
                  and history.membership_id = membership.id) as history_count,
              history.from_status,
              history.to_status,
              history.idempotency_key as history_key,
              history.effective_on::text as effective_on
         from zaltyko.group_memberships as membership
         left join zaltyko.group_membership_history as history
           on history.organization_id = membership.organization_id and history.membership_id = membership.id
        where membership.organization_id = $1::uuid
          and membership.athlete_id = $2::uuid`,
      [result.organizationId, intakeAthleteId]
    );
    expect(intakeAfterAssignmentRows.rows).toHaveLength(1);
    const intakeAfterAssignment = intakeAfterAssignmentRows.rows[0]!;
    expect(intakeAfterAssignment).toMatchObject({
      membership_id: assignIntakeReceipt.data.membershipId,
      group_id: ownerGroupId,
      membership_status: "active",
      membership_starts_on: intakeGroup.local_date,
      membership_ends_on: null,
      open_membership_count: 1,
      enrollment_count: 0,
      history_count: 1,
      from_status: null,
      to_status: "active",
      history_key: assignIntakeKey,
      effective_on: intakeGroup.local_date,
    });

    const assignedIntakeReloadListPromise = page.waitForResponse(intakeListResponse);
    await page.reload();
    const assignedIntakeReloadPayload = await (await assignedIntakeReloadListPromise).json() as {
      ok: boolean;
      data: { items: Array<{ athleteId: string }> };
    };
    expect(assignedIntakeReloadPayload.ok).toBe(true);
    expect(assignedIntakeReloadPayload.data.items.some((item) => item.athleteId === intakeAthleteId)).toBe(false);
    await expect(page.locator("li").filter({ hasText: intakeAthleteName })).toHaveCount(0);

    await page.goto(ownerGroupsUrl);
    await expect(page.getByRole("heading", { name: "Grupos y equipos", exact: true })).toBeVisible();
    const assignedAthleteRow = page.locator("li").filter({ hasText: intakeAthleteName });
    await expect(assignedAthleteRow).toHaveCount(1);
    const openAssignedAthleteProfilePromise = page.waitForResponse((response) => {
      const responseUrl = new URL(response.url());
      return responseUrl.pathname === `/api/v1/owner/athletes/${intakeAthleteId}` &&
        response.request().method() === "GET";
    });
    await assignedAthleteRow.getByRole("button", {
      name: `Editar ficha de ${intakeAthleteName}`,
      exact: true,
    }).click();
    const assignedAthleteProfileResponse = await openAssignedAthleteProfilePromise;
    expect(assignedAthleteProfileResponse.status()).toBe(200);
    const profileUrl = new URL(assignedAthleteProfileResponse.url());
    expect(profileUrl.searchParams.get("organizationId")).toBe(result.organizationId);
    expect(profileUrl.searchParams.get("locationId")).toBe(intakeGroup.location_id);
    const assignedAthleteProfile = await assignedAthleteProfileResponse.json() as {
      ok: boolean;
      data: { athleteId: string; givenName: string; familyName: string };
    };
    expect(assignedAthleteProfile).toEqual({
      ok: true,
      data: { athleteId: intakeAthleteId, givenName: intakeGivenName, familyName: intakeFamilyName },
    });
    await expect(assignedAthleteRow.getByLabel("Nombre", { exact: true })).toHaveValue(intakeGivenName);
    await expect(assignedAthleteRow.getByLabel("Apellidos", { exact: true })).toHaveValue(intakeFamilyName);
  });
});

function nextMonth(): string {
  const next = new Date();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function expectPersistedOwnerSignupConsent(
  ownerUserId: string,
  idempotencyKey: string
): Promise<void> {
  const consentProof = `signup:${createHash("sha256")
    .update(idempotencyKey)
    .digest("hex")}`;
  const persisted = await pool.query<{
    state: string;
    policy_version: string;
    current_policy_version: string;
    source: string;
    consent_proof: string;
    grant_events: number;
    total_events: number;
  }>(
    `select consent.state,
            consent.policy_version,
            (select policy_version
               from zaltyko.owner_signup_consent_policy
              where singleton = true) as current_policy_version,
            consent.source,
            consent.consent_proof,
            (select count(*)::int
               from zaltyko.owner_signup_consent_audits audit
              where audit.user_id = consent.user_id and audit.event = 'grant') as grant_events,
            (select count(*)::int
               from zaltyko.owner_signup_consent_audits audit
              where audit.user_id = consent.user_id) as total_events
       from zaltyko.owner_signup_consents consent
      where consent.user_id = $1::uuid`,
    [ownerUserId]
  );
  expect(persisted.rows).toHaveLength(1);
  expect(persisted.rows[0]).toMatchObject({
    state: "granted",
    source: "signup",
    consent_proof: consentProof,
    grant_events: 1,
    total_events: 1,
  });
  expect(persisted.rows[0]?.policy_version).toBe(
    persisted.rows[0]?.current_policy_version
  );
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
