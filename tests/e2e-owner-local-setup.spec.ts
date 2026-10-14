import { createHash, randomUUID } from "node:crypto";

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
      const search = createEnrollment.getByLabel("Gimnasta");
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
    await page.getByLabel("Fecha efectiva").fill(`${servicePeriod}-01`);
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
      await expect(
        page.getByRole("heading", { name: "Tu academia en marcha" })
      ).toBeVisible();
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
    } finally {
      await secondOwnerContext.close();
    }
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
    source: string;
    consent_proof: string;
    grant_events: number;
    total_events: number;
  }>(
    `select consent.state,
            consent.policy_version,
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
  expect(persisted.rows).toEqual([
    {
      state: "granted",
      policy_version: "v1-2026-08-01",
      source: "signup",
      consent_proof: consentProof,
      grant_events: 1,
      total_events: 1,
    },
  ]);
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
