import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";

import {
  expect,
  test,
  type Dialog,
  type Request as PlaywrightRequest,
  type Response as PlaywrightResponse,
} from "@playwright/test";
import { Pool } from "pg";

import type { MonthlyInvoiceOptionsResponse } from "../src/components/owner-dashboard/OwnerMonthlyInvoiceWorkspace";

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

type OwnerInteractionDiagnostic = {
  at: string;
  type: string;
  pathname: string;
  targetTag: string;
  buttonKind: "family-association" | "other" | "none";
  expanded: string | null;
  disabled: boolean | null;
  buttonId: number | null;
  connected: boolean | null;
  readyState: string;
};
type OwnerDiagnosticWindow = Window & {
  __zaltykoOwnerInteractions?: OwnerInteractionDiagnostic[];
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
      diagnostics.push({ at: new Date().toISOString(), ...event });
      if (diagnostics.length > 100) diagnostics.shift();
    };

    // Test-only metadata, never form values, names, query strings or payloads.
    // Capture the actual hit target after a reload without delaying/retrying it.
    await page.addInitScript(() => {
      const targetWindow = window as OwnerDiagnosticWindow;
      targetWindow.__zaltykoOwnerInteractions = [];
      const buttonIds = new WeakMap<Element, number>();
      let nextButtonId = 1;
      const recordInteraction = (type: string, target: Element | null) => {
        if (location.pathname !== "/owner/groups") return;
        const button = target?.closest("button") ?? null;
        if (button && !buttonIds.has(button)) buttonIds.set(button, nextButtonId++);
        const events = targetWindow.__zaltykoOwnerInteractions!;
        events.push({
          at: new Date().toISOString(), type, pathname: location.pathname,
          targetTag: target?.tagName.toLowerCase() ?? "none",
          buttonKind: button
            ? (button.textContent?.trim().startsWith("Vincular familia a ")
                ? "family-association" : "other")
            : "none",
          expanded: button?.getAttribute("aria-expanded") ?? null,
          disabled: button instanceof HTMLButtonElement ? button.disabled : null,
          buttonId: button ? buttonIds.get(button)! : null,
          connected: button?.isConnected ?? null,
          readyState: document.readyState,
        });
        if (events.length > 50) events.shift();
      };
      new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          const target = mutation.target;
          if (target instanceof HTMLButtonElement &&
              target.textContent?.trim().startsWith("Vincular familia a ")) {
            recordInteraction(`attribute-${mutation.attributeName}`, target);
          }
        }
      }).observe(document, {
        subtree: true, attributes: true, attributeFilter: ["aria-expanded", "disabled"],
      });
      for (const type of ["pointerdown", "pointerup", "click"]) {
        document.addEventListener(type, (event) => {
          if (location.pathname !== "/owner/groups") return;
          const target = event.target instanceof Element ? event.target : null;
          recordInteraction(event.type, target);
          if (event.type === "click") {
            queueMicrotask(() => recordInteraction("after-click-microtask", target));
            requestAnimationFrame(() => recordInteraction("after-click-frame", target));
          }
        }, { capture: true });
      }
    });

    page.on("request", (request) => {
      const pathname = diagnosticPathname(request.url());
      if (pathname !== "/api/v1/owner/families/options") return;
      record({ type: "family-options-request", pathname, method: request.method() });
    });

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
      const pathname = diagnosticPathname(response.url());
      if (pathname === "/api/v1/owner/families/options") {
        record({ type: "family-options-response", pathname, status: response.status() });
      }
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

  test.afterEach(async ({ page }, testInfo) => {
    const { unexpectedBlockedRequests, expectedBlockedTelemetryRequests } =
      networkGuardReport();
    if (testInfo.status !== testInfo.expectedStatus || unexpectedBlockedRequests.length > 0) {
      const interactions = await page.evaluate(() =>
        (window as OwnerDiagnosticWindow).__zaltykoOwnerInteractions ?? []
      ).catch(() => null);
      // Artifact allowlist: arbitrary console/error text and paths stay excluded,
      // even if their upstream diagnostic sanitizer misses a sensitive value.
      const events = browserDiagnostics.map((event) => ({
        at: event.at,
        type: event.type,
        pathname: ["/owner/groups", "/api/v1/owner/families/options"].includes(event.pathname)
          ? event.pathname : "<other-route>",
        method: event.method && ["GET", "POST", "PATCH", "PUT", "DELETE", "HEAD", "OPTIONS"].includes(event.method)
          ? event.method : undefined,
        status: typeof event.status === "number" && event.status >= 100 && event.status <= 599
          ? event.status : undefined,
        errorObserved: Boolean(event.error),
        messageObserved: Boolean(event.message),
        errorCategory: /hydrat|server.*client|client.*server/i.test(event.message ?? "")
          ? "hydration"
          : /NS_BINDING_ABORTED|navigat|redirect|router|refresh/i.test(event.message ?? event.error ?? "")
            ? "navigation"
            : /fetch|network|loading/i.test(event.message ?? event.error ?? "")
              ? "network"
              : (event.error || event.message) ? "other" : undefined,
      }));
      const diagnosticPath = testInfo.outputPath("browser-navigation-diagnostics.json");
      await writeFile(diagnosticPath, JSON.stringify(
        {
          browser: testInfo.project.name,
          status: unexpectedBlockedRequests.length > 0 ? "failed-network-guard" : testInfo.status,
          events,
          interactions,
          blockedExternalRequestCount: unexpectedBlockedRequests.length,
          expectedBlockedTelemetryRequestCount: expectedBlockedTelemetryRequests.length,
        },
        null,
        2
      ), "utf8");
      await testInfo.attach("browser-navigation-diagnostics.json", {
        path: diagnosticPath,
        contentType: "application/json",
      });
    }
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

    // No aceptar un click sin envío si la hidratación descartó un campo.
    await expect(page.getByLabel("Nombre completo")).toHaveValue(ownerName!);
    await expect(page.getByLabel("Correo electrónico")).toHaveValue(email!);
    await expect(page.getByLabel("Contraseña")).toHaveValue(password!);

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
      // The PATCH response precedes router.refresh(). Network idle does not
      // prove that the refreshed pending list has committed; a document goto
      // here can be interrupted by its older navigation in WebKit. Observe
      // the activated row leaving this filter, then use the real filter UI.
      await expect(pendingRow).toHaveCount(0);
      await page.getByRole("combobox", { name: "Filtrar por estado" }).selectOption("active");
      await expect(page).toHaveURL((url) =>
        url.pathname === "/owner/enrollments" &&
        url.searchParams.get("organizationId") === result.organizationId &&
        url.searchParams.get("locationId") === result.locationId &&
        url.searchParams.get("status") === "active"
      );
      const activeRows = page.locator("li").filter({ hasText: athleteName });
      await expect(activeRows).toHaveCount(expectedActiveCount);
      const activeEnrollmentRow = activeRows.filter({
        hasText: enrolledClassName,
      });
      await expect(activeEnrollmentRow).toHaveCount(1);
      await expect(
        activeEnrollmentRow.getByText("Activa", { exact: true })
      ).toBeVisible();
      if (expectedActiveCount === 1) {
        // Exercise a real document reload, not only a React remount. Commit
        // the first PATCH and lose its response; only an explicit replay may
        // send the original command again after hydration.
        // Keep the paused row in scope after hydration. A post-replay goto
        // would race router.refresh(), whose RSC stream can remain open.
        await page.goto(`/owner/enrollments?${scope}&status=all`);
        await expect(activeEnrollmentRow.getByText("Activa", { exact: true })).toBeVisible();
        const id = enrollmentPayload.data.id;
        const endpoint = `/api/v1/owner/enrollments/${id}`;
        const snapshot = async () => {
          const persisted = await pool.query(
            `select to_jsonb(e) as enrollment,
              (select coalesce(jsonb_agg(to_jsonb(p) order by p.id), '[]'::jsonb)
                 from zaltyko.enrollment_pauses p
                where p.organization_id = e.organization_id and p.enrollment_id = e.id) as pauses,
              (select coalesce(jsonb_agg(to_jsonb(h) order by h.id), '[]'::jsonb)
                 from zaltyko.enrollment_status_history h
                where h.organization_id = e.organization_id and h.enrollment_id = e.id) as history,
              (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'event', o.event_name, 'payload', o.payload) order by o.id), '[]'::jsonb)
                 from zaltyko.outbox_events o
                where o.organization_id = e.organization_id and o.aggregate_id = e.id) as events
             from zaltyko.enrollments e where e.organization_id = $1::uuid and e.id = $2::uuid`,
            [result.organizationId, id]
          );
          expect(persisted.rows).toHaveLength(1);
          return persisted.rows[0];
        };
        const beforeLoss = await snapshot();
        const commands: Array<{ body: string | null; key: string | undefined }> = [];
        await page.route(`**${endpoint}`, async route => {
          const request = route.request();
          if (request.method() !== "PATCH") return route.continue();
          commands.push({ body: request.postData(), key: request.headers()["idempotency-key"] });
          if (commands.length !== 1) return route.continue();
          const committed = await route.fetch();
          expect(committed.status()).toBe(200);
          await route.abort("failed");
        });
        await activeEnrollmentRow.getByRole("button", { name: /^Pausar inscripción/ }).click();
        const pending = page.getByRole("region", { name: "Operación de inscripción pendiente" });
        await expect(pending.getByRole("button", { name: "Reintentar la misma operación" })).toBeEnabled();
        expect(commands).toHaveLength(1);
        expect(commands[0].key).toBeTruthy();
        const afterLoss = await snapshot();
        expect(afterLoss.enrollment.status).toBe("paused");
        expect(afterLoss.enrollment.version).toBe(beforeLoss.enrollment.version + 1);
        expect(afterLoss.pauses).toHaveLength(beforeLoss.pauses.length + 1);
        expect(afterLoss.history).toHaveLength(beforeLoss.history.length + 1);
        expect(afterLoss.events).toHaveLength(beforeLoss.events.length + 1);
        const acceptUnload = async (dialog: Dialog) => {
          expect(dialog.type()).toBe("beforeunload");
          await dialog.accept();
        };
        page.once("dialog", acceptUnload);
        try {
          const reloadResponse = await page.reload({ waitUntil: "networkidle" });
          expect(reloadResponse?.ok()).toBe(true);
        } finally {
          page.off("dialog", acceptUnload);
        }
        await expect(pending.getByRole("button", { name: "Reintentar la misma operación" })).toBeEnabled();
        expect(commands).toHaveLength(1);
        expect(await snapshot()).toEqual(afterLoss);
        const replay = page.waitForResponse(candidate =>
          new URL(candidate.url()).pathname === endpoint && candidate.request().method() === "PATCH"
        );
        await pending.getByRole("button", { name: "Reintentar la misma operación" }).click();
        expect((await replay).status()).toBe(200);
        await expect(pending).toHaveCount(0);
        expect(commands).toHaveLength(2);
        expect(commands[1]).toEqual(commands[0]);
        expect(await snapshot()).toEqual(afterLoss);
        await page.unroute(`**${endpoint}`);
        await expect(activeEnrollmentRow.getByRole("button", { name: /^Reanudar inscripción/ })).toBeEnabled();
        const resume = page.waitForResponse(candidate =>
          new URL(candidate.url()).pathname === endpoint && candidate.request().method() === "PATCH"
        );
        await activeEnrollmentRow.getByRole("button", { name: /^Reanudar inscripción/ }).click();
        expect((await resume).status()).toBe(200);
        await expect(activeEnrollmentRow.getByText("Activa", { exact: true })).toBeVisible();
        const restored = await snapshot();
        expect(restored.enrollment.status).toBe("active");
        expect(restored.enrollment.version).toBe(afterLoss.enrollment.version + 1);
        expect(restored.pauses).toHaveLength(afterLoss.pauses.length);
        expect(restored.pauses.every((pause: { ends_on: string | null }) => pause.ends_on !== null)).toBe(true);
      }
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
        data: MonthlyInvoiceOptionsResponse;
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

    // Browser-layout fixture only: the real association above is already valid.
    // Simulate concurrent resolution reasons in one HTTP read, without changing
    // database data or claiming that the hosted API produced this combination.
    const layoutOptions = structuredClone(refreshedMonthlyOptions);
    const layoutEnrollment = layoutOptions.data.families[0]!.enrollments[0]!;
    layoutEnrollment.blockingReasons = [
      "PRICE_ASSIGNMENT_REQUIRED",
      "FAMILY_MEMBERSHIP_PERIOD_INCOMPLETE",
      "ENROLLMENT_PERIOD_INCOMPLETE",
    ];
    layoutEnrollment.assignedPrice = null;
    const layoutReasons = [
      "Falta asignar una tarifa mensual.",
      "La relación con la familia no cubre este periodo completo.",
      "La inscripción no cubre este periodo completo.",
    ];
    const layoutOptionsUrl = "**/api/v1/owner/billing/monthly-invoices/options?*";
    let layoutReads = 0;
    const layoutOptionsHandler = async (route: import("@playwright/test").Route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (
        request.method() !== "GET" ||
        url.searchParams.get("organizationId") !== result.organizationId ||
        url.searchParams.get("locationId") !== result.locationId ||
        url.searchParams.get("servicePeriod") !== servicePeriod
      ) {
        await route.continue();
        return;
      }
      layoutReads += 1;
      await route.fulfill({ status: 200, json: layoutOptions });
    };
    const originalViewport = page.viewportSize();
    await page.route(layoutOptionsUrl, layoutOptionsHandler);
    try {
      await page.goto(`${billingUrl}&servicePeriod=${servicePeriod}`);
      await familySelect.selectOption(associationData.data.familyId);
      await expect(familySelect).toHaveValue(associationData.data.familyId);
      const issues = page.getByRole("region", {
        name: "Inscripciones que requieren atención",
      });
      const issue = issues.getByRole("listitem").filter({
        has: page.getByRole("button", {
          name: `Vincular a una familia a ${athleteName}`,
          exact: true,
        }),
      });
      await expect(issue).toHaveCount(1);
      for (const reason of layoutReasons) {
        await expect(issue.getByText(reason, { exact: true })).toBeVisible();
      }
      const actions = issue.getByRole("button");
      await expect(actions).toHaveCount(2);
      await expect(actions.nth(0)).toHaveAccessibleName(
        `Asignar tarifa mensual a ${athleteName}`
      );
      await expect(actions.nth(1)).toHaveAccessibleName(
        `Vincular a una familia a ${athleteName}`
      );
      await expect(actions.nth(0)).toBeEnabled();
      await expect(actions.nth(1)).toBeEnabled();

      for (const width of [375, 768, 1280]) {
        await test.step(`Cuotas: múltiples motivos y ambas acciones a ${width}px (HTTP simulado)`, async () => {
          await page.setViewportSize({ width, height: 900 });
          await issue.scrollIntoViewIfNeeded();
          const geometry = await issue.evaluate((element) => {
            const rect = (box: DOMRect) => ({
              left: box.left, right: box.right, top: box.top,
              bottom: box.bottom, width: box.width, height: box.height,
            });
            const buttons = [...element.querySelectorAll("button")];
            const text: Array<ReturnType<typeof rect> & { label: string; button: number }> = [];
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
              const node = walker.currentNode;
              if (!node.textContent?.trim()) continue;
              const range = document.createRange();
              range.selectNodeContents(node);
              const button = node.parentElement?.closest("button");
              for (const box of range.getClientRects()) {
                if (box.width > 0 && box.height > 0) {
                  text.push({
                    ...rect(box), label: node.textContent.trim(),
                    button: button ? buttons.indexOf(button) : -1,
                  });
                }
              }
            }
            return {
              row: rect(element.getBoundingClientRect()),
              buttons: buttons.map((button) => rect(button.getBoundingClientRect())),
              text,
              viewport: window.innerWidth,
              scrollWidth: document.documentElement.scrollWidth,
            };
          });
          const overlaps = (
            a: { left: number; right: number; top: number; bottom: number },
            b: { left: number; right: number; top: number; bottom: number }
          ) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 &&
            Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
          expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewport);
          expect(geometry.row.left).toBeGreaterThanOrEqual(0);
          expect(geometry.row.right).toBeLessThanOrEqual(geometry.viewport);
          expect(geometry.buttons).toHaveLength(2);
          expect(geometry.text.length).toBeGreaterThanOrEqual(6);
          for (const button of geometry.buttons) {
            expect(button.width).toBeGreaterThanOrEqual(44);
            expect(button.height).toBeGreaterThanOrEqual(44);
            expect(button.left).toBeGreaterThanOrEqual(geometry.row.left - 1);
            expect(button.right).toBeLessThanOrEqual(geometry.row.right + 1);
            expect(button.top).toBeGreaterThanOrEqual(geometry.row.top - 1);
            expect(button.bottom).toBeLessThanOrEqual(geometry.row.bottom + 1);
          }
          expect(overlaps(geometry.buttons[0]!, geometry.buttons[1]!)).toBe(false);
          for (const [index, text] of geometry.text.entries()) {
            const container = text.button < 0 ? geometry.row : geometry.buttons[text.button]!;
            expect(text.left, text.label).toBeGreaterThanOrEqual(container.left - 1);
            expect(text.right, text.label).toBeLessThanOrEqual(container.right + 1);
            expect(text.top, text.label).toBeGreaterThanOrEqual(container.top - 1);
            expect(text.bottom, text.label).toBeLessThanOrEqual(container.bottom + 1);
            for (const [buttonIndex, button] of geometry.buttons.entries()) {
              if (buttonIndex !== text.button) {
                expect(overlaps(text, button), text.label).toBe(false);
              }
            }
            for (const other of geometry.text.slice(index + 1)) {
              expect(overlaps(text, other), `${text.label} / ${other.label}`).toBe(false);
            }
          }
        });
      }
      expect(layoutReads).toBeGreaterThan(0);
    } finally {
      await page.unroute(layoutOptionsUrl, layoutOptionsHandler);
      if (originalViewport) await page.setViewportSize(originalViewport);
    }
    // Resume the actual isolated HTTP/DB flow and its existing callback checks.
    await page.goto(`${billingUrl}&servicePeriod=${servicePeriod}`);
    await familySelect.selectOption(associationData.data.familyId);
    await expect(familySelect).toHaveValue(associationData.data.familyId);
    await expect(linkAthleteToFamily).toHaveCount(0);
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

    let manualPaymentPostCount = 0;
    const countManualPaymentPosts = (request: PlaywrightRequest): void => {
      const requestUrl = new URL(request.url());
      if (
        requestUrl.pathname === "/api/v1/owner/billing/manual-payments" &&
        request.method() === "POST"
      ) {
        manualPaymentPostCount += 1;
      }
    };
    page.on("request", countManualPaymentPosts);

    await page.goto(`/owner/payments?${scope}`);
    const paymentHeading = page.getByRole("heading", {
      name: "Registrar un pago recibido",
    });
    await expect(paymentHeading).toBeVisible();
    const paymentMethod = page.getByRole("combobox", {
      name: "Método de pago",
    });
    await expect(paymentMethod).toHaveCount(1);
    const paymentForm = page.locator("form").filter({ has: paymentMethod });
    await expect(paymentForm).toHaveCount(1);
    const pendingMonthlyChargeOption = paymentForm
      .getByRole("option")
      .filter({ hasText: adultName });
    await expect(pendingMonthlyChargeOption).toHaveCount(1);
    const pendingMonthlyChargeLabel =
      (await pendingMonthlyChargeOption.textContent())?.replace(/\s+/g, " ").trim() ?? "";
    expect(pendingMonthlyChargeLabel).toContain(adultName);
    const invoiceReference = pendingMonthlyChargeLabel.split("·")[1]?.trim();
    expect(invoiceReference).toMatch(/^MENSUAL/i);
    expect(invoiceReference?.length ?? 0).toBeGreaterThan(32);

    // Geometry-only measurement against this run's synthetic monthly charge.
    // It runs before the existing full-payment POST and leaves ledger assertions intact.
    for (const viewport of [
      { width: 375, height: 812 },
      { width: 768, height: 1024 },
      { width: 1280, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await paymentHeading.scrollIntoViewIfNeeded();
      const geometry = await paymentForm.evaluate((element) => {
        type Box = {
          left: number;
          right: number;
          top: number;
          bottom: number;
          width: number;
          height: number;
        };
        const box = (target: Element): Box => {
          const rect = target.getBoundingClientRect();
          return {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          };
        };
        const within = (inner: Box, outer: Box): boolean =>
          inner.left >= outer.left - 1 && inner.right <= outer.right + 1;
        const intersects = (left: Box, right: Box): boolean =>
          left.left < right.right && right.left < left.right &&
          left.top < right.bottom && right.top < left.bottom;

        const form = element as HTMLFormElement;
        const main = form.closest("main");
        if (!(main instanceof HTMLElement)) {
          throw new Error("Manual payment form has no main container.");
        }
        const heading = Array.from(
          main.querySelectorAll<HTMLElement>("h1, h2, h3, h4")
        ).find(
          (candidate) =>
            candidate.textContent?.replace(/\s+/g, " ").trim() ===
            "Registrar un pago recibido"
        );
        if (!heading) {
          throw new Error("Manual payment heading is not inside main.");
        }

        let container: HTMLElement = main;
        for (
          let ancestor = form.parentElement;
          ancestor && ancestor !== main;
          ancestor = ancestor.parentElement
        ) {
          const maxWidth = Number.parseFloat(
            window.getComputedStyle(ancestor).maxWidth
          );
          if (
            Number.isFinite(maxWidth) &&
            maxWidth > 0 &&
            ancestor.contains(heading)
          ) {
            container = ancestor;
            break;
          }
        }

        const controls = Array.from(
          form.querySelectorAll<HTMLElement>(
            'input:not([type="hidden"]), select, textarea, button'
          )
        )
          .filter((control) => {
            const style = window.getComputedStyle(control);
            return (
              control.getClientRects().length > 0 &&
              style.display !== "none" &&
              style.visibility !== "hidden"
            );
          })
          .map((control) => ({
            name:
              control.getAttribute("aria-label") ||
              control.getAttribute("name") ||
              control.id ||
              control.tagName.toLowerCase(),
            ...box(control),
          }));

        const formBounds = box(form);
        const headingBounds = box(heading);
        const containerBounds = box(container);
        const textFragments: Array<Box & { root: "heading" | "form" }> = [];
        for (const [rootName, root] of [
          ["heading", heading],
          ["form", form],
        ] as const) {
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const textParent = node.parentElement;
            if (
              !(node.textContent ?? "").trim() ||
              textParent?.closest(
                '[aria-hidden="true"], button, select, input, textarea'
              )
            ) {
              continue;
            }
            const range = document.createRange();
            range.selectNodeContents(node);
            for (const rect of Array.from(range.getClientRects())) {
              if (rect.width <= 0 || rect.height <= 0) continue;
              textFragments.push({
                root: rootName,
                left: rect.left,
                right: rect.right,
                top: rect.top,
                bottom: rect.bottom,
                width: rect.width,
                height: rect.height,
              });
            }
          }
        }

        const viewportBounds: Box = {
          left: 0,
          right: window.innerWidth,
          top: 0,
          bottom: window.innerHeight,
          width: window.innerWidth,
          height: window.innerHeight,
        };
        const controlOverlaps: string[] = [];
        for (let index = 0; index < controls.length; index += 1) {
          const current = controls[index]!;
          for (const other of controls.slice(index + 1)) {
            if (intersects(current, other)) {
              controlOverlaps.push(`${current.name}/${other.name}`);
            }
          }
        }
        const textControlOverlaps = textFragments.filter((fragment) =>
          controls.some((control) => intersects(fragment, control))
        ).length;

        return {
          viewport: window.innerWidth,
          documentScrollWidth: document.documentElement.scrollWidth,
          controlsCount: controls.length,
          headingTextCount: textFragments.filter(
            (fragment) => fragment.root === "heading"
          ).length,
          formTextCount: textFragments.filter(
            (fragment) => fragment.root === "form"
          ).length,
          containerWithinViewport: within(containerBounds, viewportBounds),
          formWithinContainer: within(formBounds, containerBounds),
          headingWithinContainer: within(headingBounds, containerBounds),
          headingFormOverlap: intersects(headingBounds, formBounds),
          controlsOutside: controls
            .filter(
              (control) =>
                !within(control, formBounds) ||
                !within(control, containerBounds) ||
                !within(control, viewportBounds)
            )
            .map((control) => control.name),
          controlsTooSmall: controls
            .filter((control) => control.width < 44 || control.height < 44)
            .map((control) => control.name),
          textOutside: textFragments.filter((fragment) => {
            const rootBounds =
              fragment.root === "form" ? formBounds : headingBounds;
            return (
              !within(fragment, rootBounds) ||
              !within(fragment, containerBounds) ||
              !within(fragment, viewportBounds)
            );
          }).length,
          controlOverlaps,
          textControlOverlaps,
        };
      });

      expect(geometry.viewport).toBe(viewport.width);
      expect(geometry.documentScrollWidth).toBeLessThanOrEqual(viewport.width);
      expect(geometry.controlsCount).toBeGreaterThanOrEqual(6);
      expect(geometry.headingTextCount).toBeGreaterThan(0);
      expect(geometry.formTextCount).toBeGreaterThan(0);
      expect(geometry.containerWithinViewport).toBe(true);
      expect(geometry.formWithinContainer).toBe(true);
      expect(geometry.headingWithinContainer).toBe(true);
      expect(geometry.headingFormOverlap).toBe(false);
      expect(geometry.controlsOutside).toEqual([]);
      expect(geometry.controlsTooSmall).toEqual([]);
      expect(geometry.textOutside).toBe(0);
      expect(geometry.controlOverlaps).toEqual([]);
      expect(geometry.textControlOverlaps).toBe(0);
      expect(manualPaymentPostCount).toBe(0);
    }

    await paymentMethod.selectOption({ label: "Transferencia" });
    expect(manualPaymentPostCount).toBe(0);
    const paymentResponse = page.waitForResponse(
      (candidate) =>
        candidate.url().endsWith("/api/v1/owner/billing/manual-payments") &&
        candidate.request().method() === "POST"
    );
    await page.getByRole("button", { name: "Guardar pago recibido" }).click();
    const paymentResult = await paymentResponse;
    expect(manualPaymentPostCount).toBe(1);
    page.off("request", countManualPaymentPosts);
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

    await expect(primaryNavigation.getByRole("link", { name: /Insights|Capacidad|Health Score|Retención/i })).toHaveCount(0);
    for (const viewport of [{ width: 375, height: 812 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }]) {
      await page.setViewportSize(viewport);
      await expect(page.getByRole("region", { name: "Tu academia en marcha" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
      if (viewport.width < 1280) {
        const mobileNavigation = page.getByRole("navigation", { name: "Navegación móvil" });
        await expect(mobileNavigation).toBeVisible();
        const targets = await mobileNavigation.locator(":scope > a, :scope > details > summary").evaluateAll((elements) => elements.map((element) => {
          const box = element.getBoundingClientRect();
          const text = document.createRange();
          text.selectNodeContents(element);
          const textBox = text.getBoundingClientRect();
          return { label: element.textContent?.trim(), left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height, textLeft: textBox.left, textRight: textBox.right };
        }));
        expect(targets).toHaveLength(6);
        for (const target of targets) {
          expect(target.width, target.label).toBeGreaterThanOrEqual(44);
          expect(target.height, target.label).toBeGreaterThanOrEqual(44);
          expect(target.textLeft, target.label).toBeGreaterThanOrEqual(target.left - 1);
          expect(target.textRight, target.label).toBeLessThanOrEqual(target.right + 1);
        }
        for (let index = 0; index < targets.length; index++) {
          for (const other of targets.slice(index + 1)) {
            const target = targets[index];
            const overlaps = target.left < other.right && other.left < target.right && target.top < other.bottom && other.top < target.bottom;
            expect(overlaps, `${target.label} / ${other.label}`).toBe(false);
          }
        }
      }
      await expect(page.getByRole("navigation", { name: "Operaciones de la academia" }).getByRole("link", { name: "Cuotas mensuales" })).toBeVisible();
    }
    for (const path of ["insights", "health-score/setup"]) {
      const retiredResponse = await page.request.get(`/owner/${path}?${scope}`);
      expect(retiredResponse.status()).toBe(404);
      expect(retiredResponse.headers()["x-robots-tag"]).toContain("noindex");
    }

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
    await expect(openExistingFamilyAfterReload).toHaveAttribute("aria-expanded", "true");
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

    await assignedAthleteRow.getByRole("button", { name: "Cerrar editor", exact: true }).click();
    await assignedAthleteRow.getByRole("button", { name: `Vincular familia a ${intakeAthleteName}`, exact: true }).click();
    await assignedAthleteRow.getByRole("radio", { name: "Completar la familia actual de esta gimnasta", exact: true }).check();
    await assignedAthleteRow.getByLabel("Nombre de la persona adulta responsable", { exact: true }).fill("Responsable Intake");
    await assignedAthleteRow.getByLabel("Apellidos", { exact: true }).fill("QA Completion");
    await assignedAthleteRow.getByLabel("Fecha de inicio de la asociación", { exact: true }).fill(intakeGroup.local_date);
    const completeFamilyResponsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/v1/owner/families/associations" && response.request().method() === "POST"
    );
    await assignedAthleteRow.getByRole("button", { name: "Asociar familia", exact: true }).click();
    const completeFamilyResponse = await completeFamilyResponsePromise;
    expect(completeFamilyResponse.status()).toBe(201);
    expect(completeFamilyResponse.request().postDataJSON()).toEqual({
      organizationId: result.organizationId,
      locationId: intakeGroup.location_id,
      familyId: intakeFamilyId,
      athleteIds: [intakeAthleteId],
      effectiveFrom: intakeGroup.local_date,
      payer: { givenName: "Responsable Intake", familyName: "QA Completion", relationship: "parent" },
    });
    await expect(assignedAthleteRow.getByRole("status")).toContainText("Familia vinculada");
    const completedFamilyRows = await pool.query<{
      family_id: string; member_count: number; payer_count: number; guardian_count: number;
    }>(
      `select member.family_id::text as family_id,
        count(distinct member.id)::int as member_count,
        count(distinct payer.id)::int as payer_count,
        count(distinct guardian.id)::int as guardian_count
       from zaltyko.family_members member
       left join zaltyko.family_payers payer on payer.organization_id = member.organization_id and payer.family_id = member.family_id
       left join zaltyko.family_guardians guardian on guardian.organization_id = member.organization_id and guardian.family_id = member.family_id
       where member.organization_id = $1::uuid and member.athlete_id = $2::uuid
       group by member.family_id`,
      [result.organizationId, intakeAthleteId]
    );
    expect(completedFamilyRows.rows).toEqual([{ family_id: intakeFamilyId, member_count: 1, payer_count: 1, guardian_count: 1 }]);

    // The export is a read of this disposable academy, independent of Stripe
    // readiness. It must remain usable with the same Owner session on mobile.
    // Follow the workspace's real client navigation. Firefox aborted the
    // document goto at this transition after the family's router.refresh().
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole("navigation", { name: "Principal", exact: true })
      .getByText("Más", { exact: true })
      .click();
    const planLink = page.getByRole("navigation", { name: "Principal", exact: true })
      .getByRole("link", { name: "Plan", exact: true });
    await expect(planLink).toHaveAttribute("href", `/owner/subscription?organizationId=${result.organizationId}`);
    await expect(planLink).toBeVisible();
    await planLink.click();
    await expect(page).toHaveURL(new RegExp(`/owner/subscription\\?organizationId=${result.organizationId}$`));
    const exportHeading = page.getByRole("heading", { name: "Datos de tu academia", exact: true });
    const exportButton = page.getByRole("button", { name: "Descargar datos operativos", exact: true });
    for (const viewport of [{ width: 375, height: 812 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }]) {
      await page.setViewportSize(viewport);
      await expect(exportHeading).toBeVisible();
      await exportButton.scrollIntoViewIfNeeded();
      await expect(exportButton).toBeVisible();
      await expect(exportButton).toBeEnabled();
      const bounds = await exportButton.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    }
    const exportResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/v1/owner/data-export" &&
        url.searchParams.get("organizationId") === result.organizationId &&
        response.request().method() === "GET";
    });
    const downloadPromise = page.waitForEvent("download");
    await exportButton.click();
    const exportResponse = await exportResponsePromise;
    expect(exportResponse.status()).toBe(200);
    expect(exportResponse.headers()["cache-control"]).toContain("no-store");
    const exportDownload = await downloadPromise;
    expect(exportDownload.suggestedFilename()).toMatch(/\.json$/);
    const exportStream = await exportDownload.createReadStream();
    expect(exportStream).not.toBeNull();
    const exportChunks: Buffer[] = [];
    for await (const chunk of exportStream!) exportChunks.push(Buffer.from(chunk));
    const exportText = Buffer.concat(exportChunks).toString("utf8");
    expect(() => JSON.parse(exportText)).not.toThrow();
    const downloadedData: unknown = JSON.parse(exportText);
    const credentialKeys = new Set(["accesstoken", "refreshtoken", "encryptedpassword", "password", "secretkey", "servicerolekey"]);
    const assertNoCredentialFields = (value: unknown): void => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) {
        value.forEach(assertNoCredentialFields);
        return;
      }
      for (const [key, child] of Object.entries(value)) {
        expect(credentialKeys.has(key.replace(/[^a-z0-9]/gi, "").toLowerCase())).toBe(false);
        assertNoCredentialFields(child);
      }
    };
    assertNoCredentialFields(downloadedData);
    expect(exportText).toContain(result.organizationId);
    expect(exportText).toContain(intakeGivenName);
    expect(exportText).not.toContain(password!);
    expect(await exportDownload.failure()).toBeNull();
  });

  test("acepta una solicitud sintética de acceso asistido sin crear academia ni prometer apertura", async ({
    page,
  }) => {
    const organizationCountBefore = await pool.query<{ count: number }>(
      "select count(*)::int as count from zaltyko.organizations"
    );
    const contactPosts: Array<{ method: string; body: string }> = [];
    await page.route("**/api/contact", async (route) => {
      const request = route.request();
      const body = request.postData() ?? "";
      contactPosts.push({ method: request.method(), body });

      if (contactPosts.length === 1) {
        // Simula la pérdida de la respuesta; el reintento lo inicia la persona.
        await route.abort();
        return;
      }

      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: {} }),
      });
    });

    await page.goto("/contact?type=market_access", {
      waitUntil: "domcontentloaded",
    });
    const form = page.getByRole("form", { name: "Formulario de contacto" });
    await expect(form).toBeVisible();
    await expect(form.getByLabel("Nombre completo")).toBeVisible();
    await expect(form.getByLabel("Email")).toBeVisible();
    await expect(form.getByLabel("País del club")).toBeVisible();
    await expect(form.getByLabel("Tu función en el club")).toBeVisible();

    const marketAccessGroup = form.getByRole("group", {
      name: "Acceso asistido para tu club",
    });
    await expect(marketAccessGroup).toBeVisible();
    const disciplines = form.getByRole("group", {
      name: "Disciplinas o actividades del club",
    });
    for (const label of [
      "Artística femenina",
      "Artística masculina",
      "Rítmica",
      "Otra actividad del club",
    ]) {
      await expect(disciplines.getByRole("checkbox", { name: label })).toBeVisible();
    }
    await expect(
      form.getByText(/esta solicitud no crea una academia ni contrata un plan/i)
    ).toBeVisible();
    await expect(
      form.getByText(/no hay una fecha de apertura comprometida/i)
    ).toBeVisible();
    await expect(form.getByText(/no te suscribes a campañas/i)).toBeVisible();
    // El evento de analítica local no es una solicitud de contacto.
    expect(contactPosts).toHaveLength(0);

    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const geometry = await form.evaluate((element) => {
        const formElement = element as HTMLElement;
        const formBounds = formElement.getBoundingClientRect();
        const controls = Array.from(
          formElement.querySelectorAll<HTMLElement>(
            'input:not([type="hidden"]), select, textarea, button'
          )
        )
          .filter((control) => control.getClientRects().length > 0)
          .map((control) => {
            const bounds = control.getBoundingClientRect();
            return {
              name:
                control.getAttribute("aria-label") ||
                control.getAttribute("name") ||
                control.id ||
                control.tagName.toLowerCase(),
              left: bounds.left,
              right: bounds.right,
              top: bounds.top,
              bottom: bounds.bottom,
            };
          });
        const overlaps: string[] = [];
        for (let index = 0; index < controls.length; index += 1) {
          for (const other of controls.slice(index + 1)) {
            const control = controls[index]!;
            if (
              control.left < other.right &&
              other.left < control.right &&
              control.top < other.bottom &&
              other.top < control.bottom
            ) {
              overlaps.push(`${control.name}/${other.name}`);
            }
          }
        }
        return {
          viewport: window.innerWidth,
          documentScrollWidth: document.documentElement.scrollWidth,
          formLeft: formBounds.left,
          formRight: formBounds.right,
          formClientWidth: formElement.clientWidth,
          formScrollWidth: formElement.scrollWidth,
          controls,
          overlaps,
        };
      });

      expect(geometry.viewport).toBe(width);
      expect(geometry.documentScrollWidth).toBeLessThanOrEqual(width);
      expect(geometry.formLeft).toBeGreaterThanOrEqual(0);
      expect(geometry.formRight).toBeLessThanOrEqual(width);
      expect(geometry.formScrollWidth).toBeLessThanOrEqual(
        geometry.formClientWidth
      );
      expect(geometry.overlaps).toEqual([]);
      for (const control of geometry.controls) {
        expect(control.left, control.name).toBeGreaterThanOrEqual(geometry.formLeft);
        expect(control.right, control.name).toBeLessThanOrEqual(geometry.formRight);
      }
    }

    await form.getByLabel("Nombre completo").fill("Responsable adulto E2E");
    await form.getByLabel("Email").fill("responsable-market-access@example.test");
    await form.getByLabel("País del club").fill("Argentina");
    await form.getByLabel("Tu función en el club").selectOption("owner");
    await disciplines.getByRole("checkbox", { name: "Rítmica" }).check();
    await form
      .getByLabel("Mensaje")
      .fill("Solicitamos evaluar la gestión de clases y asistencia del club.");

    const submitButton = form.getByRole("button", { name: "Enviar mensaje" });
    await expect(submitButton).toBeEnabled();
    await submitButton.click();
    await expect(form.getByRole("alert")).toBeVisible();
    await expect(submitButton).toBeEnabled();
    expect(contactPosts).toHaveLength(1);
    expect(contactPosts[0]!.method).toBe("POST");
    const originalBody = contactPosts[0]!.body;
    const originalPayload = JSON.parse(originalBody) as Record<string, unknown>;
    expect(Object.keys(originalPayload).sort()).toEqual(
      [
        "academy",
        "email",
        "honeypot",
        "marketAccess",
        "message",
        "name",
        "plan",
        "reason",
        "source",
        "submissionId",
        "visitorId",
      ].sort()
    );
    expect(originalPayload.name).toBe("Responsable adulto E2E");
    expect(originalPayload.email).toBe("responsable-market-access@example.test");
    expect(originalPayload.academy).toBeNull();
    expect(originalPayload.reason).toBe("market_access");
    expect(originalPayload.plan).toBeNull();
    expect(originalPayload.source).toBe("public_contact");
    expect(originalPayload.message).toBe(
      "Solicitamos evaluar la gestión de clases y asistencia del club."
    );
    expect(originalPayload.honeypot).toBe("");
    expect(originalPayload.visitorId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(originalPayload.submissionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(originalPayload.marketAccess).toEqual({
      countryName: "Argentina",
      role: "owner",
      disciplines: ["rhythmic"],
    });

    await submitButton.click();
    await expect(form.getByRole("status")).toHaveText(
      "Solicitud guardada. Revisaremos la disponibilidad para tu país y te responderemos por correo."
    );
    expect(contactPosts).toHaveLength(2);
    expect(contactPosts[1]!.method).toBe("POST");
    expect(contactPosts[1]!.body).toBe(originalBody);
    expect(
      (JSON.parse(contactPosts[1]!.body) as Record<string, unknown>).submissionId
    ).toBe(originalPayload.submissionId);
    await expect(form.getByRole("status")).not.toContainText(
      /campañas|fecha de apertura|academia creada|plan contratado/i
    );
    const organizationCountAfter = await pool.query<{ count: number }>(
      "select count(*)::int as count from zaltyko.organizations"
    );
    expect(organizationCountAfter.rows[0]?.count).toBe(
      organizationCountBefore.rows[0]?.count
    );
  });

  test.describe("Owner staff profiles in the isolated local setup", () => {
    let staffOrganizationId: string;
    let staffGivenName: string;
    let staffFamilyName: string;

    test.beforeEach(async ({ page }) => {
      userId = undefined;
      await page.context().clearCookies();
      const unique = randomUUID();
      email = "e2e-staff-" + unique + "@example.test";
      password = randomUUID() + "aA1!";
      ownerName = "Owner Staff E2E " + unique.slice(0, 8);
      organizationName =
        "Academia Staff E2E " + runId!.slice(0, 8) + " " + unique.slice(0, 8);
      locationName =
        "Sede Staff E2E " + runId!.slice(0, 8) + " " + unique.slice(0, 8);
      staffGivenName = "Staff";
      staffFamilyName = "E2E " + unique.slice(0, 8);

      await page.goto("/auth/register?role=owner", {
        waitUntil: "domcontentloaded",
      });
      await expect(
        page.getByRole("heading", { name: "Crea tu cuenta" })
      ).toBeVisible();
      await page.getByLabel("Nombre completo").fill(ownerName);
      await page.getByLabel("Correo electrónico").fill(email);
      await page.getByLabel("Contraseña").fill(password);
      const termsCheckbox = page.getByRole("checkbox");
      await expect(termsCheckbox).toHaveCount(1);
      await termsCheckbox.check();

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
      expect(
        typeof createdUserId === "string" &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
            createdUserId
          )
      ).toBe(true);
      if (!createdUserId) {
        throw new Error("Local staff E2E signup omitted the user ID.");
      }
      userId = createdUserId;
      await expect(page).toHaveURL(/\/owner\/setup$/u);
      await page.getByLabel("Nombre de la academia").fill(organizationName);
      await page.getByRole("radio", { name: "Gimnasia rítmica" }).check();
      await page.getByLabel("Nombre de la primera sede").fill(locationName);

      const bootstrapRequestPromise = page.waitForRequest(
        (request) =>
          request.url().endsWith("/api/v1/organizations/bootstrap") &&
          request.method() === "POST"
      );
      const bootstrapResponsePromise = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/v1/organizations/bootstrap") &&
          response.request().method() === "POST"
      );
      await page
        .getByRole("button", { name: "Crear espacio de dirección" })
        .click();
      const bootstrapRequest = await bootstrapRequestPromise;
      const bootstrapResponse = await bootstrapResponsePromise;
      expect(bootstrapResponse.status()).toBe(201);
      const bootstrapResult = (await bootstrapResponse.json()) as {
        organizationId: string;
        locationId: string;
      };
      const bootstrapKey = bootstrapRequest.headers()["idempotency-key"];
      expect(Boolean(bootstrapKey)).toBe(true);
      if (!bootstrapKey) {
        throw new Error("Local staff E2E bootstrap omitted its idempotency key.");
      }
      const bootstrapBody = bootstrapRequest.postDataJSON() as Record<
        string,
        unknown
      >;
      expect("contractualAcceptance" in bootstrapBody).toBe(false);
      staffOrganizationId = bootstrapResult.organizationId;
      await expectPersistedOwnerSignupConsent(userId, bootstrapKey);
      const ownerScope = await pool.query<{
        role: string;
        status: string;
        location_scope_mode: string;
      }>(
        "select role, status, location_scope_mode from zaltyko.organization_members where organization_id = $1::uuid and user_id = $2::uuid",
        [staffOrganizationId, userId]
      );
      expect(ownerScope.rows).toEqual([
        { role: "owner", status: "active", location_scope_mode: "all" },
      ]);
      await expect(page).toHaveURL(
        new RegExp("/owner\\?organizationId=" + staffOrganizationId + "$", "u")
      );
    });

    test("commits a create once and recovers it only by exact manual replay", async ({
      page,
    }) => {
      const endpoint = "/api/v1/owner/staff";
      const displayName = staffGivenName + " " + staffFamilyName;
      const listResponsePromise = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === endpoint &&
          response.request().method() === "GET"
      );
      await page.goto("/owner/staff?organizationId=" + staffOrganizationId, {
        waitUntil: "domcontentloaded",
      });
      expect((await listResponsePromise).status()).toBe(200);
      await expect(
        page.getByRole("heading", { name: "Personal", exact: true })
      ).toBeVisible();
      await expect(
        page.getByText(
          /crear un perfil no crea una cuenta, invitación ni acceso a zaltyko/i
        )
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => typeof navigator.locks?.request === "function"
        )
      ).toBe(true);

      type SnapshotRow = {
        table_name: string;
        row_count: number;
        content_hash: string;
      };
      type ProfileRow = {
        id: string;
        person_id: string;
        member_id: string | null;
        is_active: boolean;
      };
      type AccessCounts = {
        authUsers: number;
        members: number;
        scopes: number;
        invitations: number;
      };
      type ObservedCommand = {
        method: string;
        path: string;
        body: string | null;
        key: string | undefined;
      };
      type MutationPayload = {
        data?: {
          replayed?: boolean;
          receipt?: {
            staffProfileId?: string;
            version?: string;
            isActive?: boolean;
          };
        };
      };

      const snapshotSql =
        "select table_name, row_count, content_hash from (" +
        "select 'people'::text as table_name, count(*)::int as row_count, " +
        "md5(coalesce(jsonb_agg(to_jsonb(row_data) order by to_jsonb(row_data)::text)::text, '[]')) as content_hash " +
        "from zaltyko.people row_data where row_data.organization_id = $1::uuid union all " +
        "select 'staff_profiles'::text, count(*)::int, " +
        "md5(coalesce(jsonb_agg(to_jsonb(row_data) order by to_jsonb(row_data)::text)::text, '[]')) " +
        "from zaltyko.staff_profiles row_data where row_data.organization_id = $1::uuid union all " +
        "select 'audit_log'::text, count(*)::int, " +
        "md5(coalesce(jsonb_agg(to_jsonb(row_data) order by to_jsonb(row_data)::text)::text, '[]')) " +
        "from zaltyko.audit_log row_data where row_data.organization_id = $1::uuid union all " +
        "select 'outbox_events'::text, count(*)::int, " +
        "md5(coalesce(jsonb_agg(to_jsonb(row_data) order by to_jsonb(row_data)::text)::text, '[]')) " +
        "from zaltyko.outbox_events row_data where row_data.organization_id = $1::uuid" +
        ") as organization_snapshot order by table_name";
      const readSnapshot = async (): Promise<SnapshotRow[]> => {
        const result = await pool.query<SnapshotRow>(snapshotSql, [
          staffOrganizationId,
        ]);
        return result.rows.map((row) => ({
          table_name: row.table_name,
          row_count: Number(row.row_count),
          content_hash: row.content_hash,
        }));
      };
      const readProfiles = async (): Promise<ProfileRow[]> => {
        const result = await pool.query<ProfileRow>(
          "select id::text as id, person_id::text as person_id, member_id::text as member_id, is_active from zaltyko.staff_profiles where organization_id = $1::uuid order by id",
          [staffOrganizationId]
        );
        return result.rows;
      };
      const readAccessCounts = async (): Promise<AccessCounts> => {
        const [authUsers, members, scopes, invitations] = await Promise.all([
          pool.query<{ count: number }>(
            "select count(*)::int as count from auth.users"
          ),
          pool.query<{ count: number }>(
            "select count(*)::int as count from zaltyko.organization_members where organization_id = $1::uuid",
            [staffOrganizationId]
          ),
          pool.query<{ count: number }>(
            "select count(*)::int as count from zaltyko.member_location_scopes where organization_id = $1::uuid",
            [staffOrganizationId]
          ),
          pool.query<{ count: number }>(
            "select count(*)::int as count from public.invitations"
          ),
        ]);
        return {
          authUsers: Number(authUsers.rows[0]?.count ?? 0),
          members: Number(members.rows[0]?.count ?? 0),
          scopes: Number(scopes.rows[0]?.count ?? 0),
          invitations: Number(invitations.rows[0]?.count ?? 0),
        };
      };
      const rowCount = (snapshot: SnapshotRow[], table: string) =>
        snapshot.find((row) => row.table_name === table)?.row_count ?? -1;

      const snapshotBefore = await readSnapshot();
      const accessBefore = await readAccessCounts();
      expect(await readProfiles()).toHaveLength(0);
      expect(rowCount(snapshotBefore, "staff_profiles")).toBe(0);

      const commands: ObservedCommand[] = [];
      let allowManualReplay = false;
      let manualReplayForwarded = false;
      let firstCommitStatus: number | null = null;
      await page.route("**" + endpoint, async (route) => {
        const request = route.request();
        if (request.method() !== "POST") {
          await route.continue();
          return;
        }
        const url = new URL(request.url());
        commands.push({
          method: request.method(),
          path: url.pathname + url.search,
          body: request.postData(),
          key: request.headers()["idempotency-key"],
        });
        if (commands.length === 1) {
          const committed = await route.fetch();
          firstCommitStatus = committed.status();
          await route.abort("failed");
          return;
        }
        if (allowManualReplay && !manualReplayForwarded) {
          manualReplayForwarded = true;
          await route.continue();
          return;
        }
        await route.abort("failed");
      });

      const createForm = page.locator("main form").first();
      await createForm.getByLabel("Nombre", { exact: true }).fill(staffGivenName);
      await createForm
        .getByLabel("Apellidos", { exact: true })
        .fill(staffFamilyName);
      await createForm
        .getByLabel("Nombre preferido")
        .fill("Entrenador E2E");
      await createForm.getByRole("button", { name: "Crear perfil" }).click();
      const pending = page.getByRole("region", {
        name: "Operación pendiente",
      });
      await expect(
        pending.getByRole("button", {
          name: "Reintentar la misma operación",
        })
      ).toBeEnabled();
      expect(commands.length).toBe(1);
      expect(firstCommitStatus).toBe(201);
      expect(commands[0]?.method === "POST").toBe(true);
      expect(commands[0]?.path === endpoint).toBe(true);
      expect(Boolean(commands[0]?.body)).toBe(true);
      expect(Boolean(commands[0]?.key)).toBe(true);

      const snapshotAfterLoss = await readSnapshot();
      const profilesAfterLoss = await readProfiles();
      expect(profilesAfterLoss).toHaveLength(1);
      const createdProfile = profilesAfterLoss[0];
      if (!createdProfile) {
        throw new Error("The committed create did not leave a profile row.");
      }
      expect(createdProfile.member_id === null && createdProfile.is_active).toBe(
        true
      );
      expect(rowCount(snapshotAfterLoss, "people")).toBe(
        rowCount(snapshotBefore, "people") + 1
      );
      expect(rowCount(snapshotAfterLoss, "staff_profiles")).toBe(1);
      expect(rowCount(snapshotAfterLoss, "audit_log")).toBe(
        rowCount(snapshotBefore, "audit_log") + 1
      );
      expect(rowCount(snapshotAfterLoss, "outbox_events")).toBe(
        rowCount(snapshotBefore, "outbox_events") + 1
      );
      expect(
        JSON.stringify(await readAccessCounts()) === JSON.stringify(accessBefore)
      ).toBe(true);

      const expectKeyedHistory = async (
        key: string,
        expectedCount: number
      ) => {
        const keyedRecords = await pool.query<{
          audit_count: number;
          outbox_count: number;
        }>(
          "select (select count(*)::int from zaltyko.audit_log where organization_id = $1::uuid and idempotency_key = $2) as audit_count, " +
            "(select count(*)::int from zaltyko.outbox_events where organization_id = $1::uuid and idempotency_key = $2) as outbox_count",
          [
            staffOrganizationId,
            "staff_" + createHash("sha256").update(key).digest("hex"),
          ]
        );
        expect(keyedRecords.rows[0]?.audit_count).toBe(expectedCount);
        expect(keyedRecords.rows[0]?.outbox_count).toBe(expectedCount);
      };
      await expectKeyedHistory(commands[0]!.key!, 1);

      const acceptBeforeUnload = async (dialog: Dialog) => {
        if (dialog.type() !== "beforeunload") {
          await dialog.dismiss();
          throw new Error("Unexpected browser dialog during staff recovery.");
        }
        await dialog.accept();
      };
      page.once("dialog", acceptBeforeUnload);
      try {
        const reloadResponse = await page.reload({ waitUntil: "networkidle" });
        expect(reloadResponse?.ok()).toBe(true);
      } finally {
        page.off("dialog", acceptBeforeUnload);
      }
      await expect(
        page.getByRole("region", { name: "Operación pendiente" }).getByRole(
          "button",
          { name: "Reintentar la misma operación" }
        )
      ).toBeEnabled();
      await expect(
        page.getByRole("heading", { name: displayName, exact: true })
      ).toBeVisible();
      expect(commands.length).toBe(1);
      const snapshotAfterReload = await readSnapshot();
      expect(
        JSON.stringify(snapshotAfterReload) ===
          JSON.stringify(snapshotAfterLoss)
      ).toBe(true);

      const replayResponsePromise = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === endpoint &&
          response.request().method() === "POST"
      );
      allowManualReplay = true;
      await page
        .getByRole("region", { name: "Operación pendiente" })
        .getByRole("button", { name: "Reintentar la misma operación" })
        .click();
      const replayResponse = await replayResponsePromise;
      expect(replayResponse.status()).toBe(200);
      const replayPayload = (await replayResponse.json()) as MutationPayload;
      expect(replayPayload.data?.replayed).toBe(true);
      expect(replayPayload.data?.receipt?.staffProfileId).toBe(createdProfile.id);
      expect(replayPayload.data?.receipt?.isActive).toBe(true);
      const replayVersion = replayPayload.data?.receipt?.version;
      expect(typeof replayVersion === "string").toBe(true);
      expect(commands.length).toBe(2);
      const manualCommand = commands[1];
      expect(
        Boolean(
          manualCommand &&
            commands[0]?.method === manualCommand.method &&
            commands[0]?.path === manualCommand.path &&
            commands[0]?.body === manualCommand.body &&
            commands[0]?.key === manualCommand.key
        )
      ).toBe(true);
      expect(manualReplayForwarded).toBe(true);
      await expect(pending).toHaveCount(0);
      const snapshotAfterReplay = await readSnapshot();
      expect(
        JSON.stringify(snapshotAfterReplay) ===
          JSON.stringify(snapshotAfterLoss)
      ).toBe(true);
      expect(
        JSON.stringify(await readAccessCounts()) === JSON.stringify(accessBefore)
      ).toBe(true);
      await page.unroute("**" + endpoint);

      const staffPath = endpoint + "/" + createdProfile.id;
      const waitForStaffListRead = (
        expectedStatus: "active" | "archived" | "all"
      ) =>
        page.waitForResponse(
          (response) => {
            const url = new URL(response.url());
            return (
              url.pathname === endpoint &&
              response.request().method() === "GET" &&
              url.searchParams.get("organizationId") === staffOrganizationId &&
              url.searchParams.get("status") === expectedStatus
            );
          }
        );
      type StaffListPayload = {
        data?: {
          items?: Array<{
            id: string;
            givenName: string;
            familyName: string;
            preferredName: string | null;
            isActive: boolean;
            version: string;
          }>;
        };
      };
      const readListedProfile = async (response: PlaywrightResponse) => {
        expect(response.status()).toBe(200);
        const payload = (await response.json()) as StaffListPayload;
        const profile = payload.data?.items?.find(
          (item) => item.id === createdProfile.id
        );
        if (!profile) {
          throw new Error("The refreshed staff list omitted its profile.");
        }
        return profile;
      };

      const initialListRead = waitForStaffListRead("active");
      await page.getByRole("button", { name: "Actualizar lista" }).click();
      const initialListedProfile = await readListedProfile(await initialListRead);
      if (typeof replayVersion !== "string") {
        throw new Error("The original create receipt omitted its version.");
      }
      expect(initialListedProfile.version).toBe(replayVersion);
      const createdArticle = page.getByRole("article", {
        name: displayName,
        exact: true,
      });
      await createdArticle.getByRole("button", { name: "Editar" }).click();
      const staleEditForm = createdArticle.locator("form");
      await expect(staleEditForm.getByRole("heading", { name: "Editar perfil" })).toBeVisible();

      // Simulate a second authorized editor changing the same record while
      // this browser keeps its original edit draft open.
      const concurrentKey = randomUUID();
      const concurrentResponse = await page.context().request.patch(
        new URL(staffPath, page.url()).toString(),
        {
          data: {
            organizationId: staffOrganizationId,
            givenName: "Concurrente",
            familyName: staffFamilyName,
            preferredName: "Cambio concurrente",
            version: initialListedProfile.version,
          },
          headers: { "Idempotency-Key": concurrentKey },
        }
      );
      expect(concurrentResponse.status()).toBe(200);
      const concurrentPayload =
        (await concurrentResponse.json()) as MutationPayload;
      expect(concurrentPayload.data?.replayed).toBe(false);
      expect(concurrentPayload.data?.receipt?.staffProfileId).toBe(
        createdProfile.id
      );
      expect(concurrentPayload.data?.receipt?.isActive).toBe(true);
      const concurrentVersion = concurrentPayload.data?.receipt?.version;
      if (typeof concurrentVersion !== "string") {
        throw new Error("The concurrent update omitted its new version.");
      }
      expect(concurrentVersion).not.toBe(initialListedProfile.version);
      const concurrentDisplayName = "Concurrente " + staffFamilyName;
      const snapshotAfterConcurrent = await readSnapshot();
      expect(rowCount(snapshotAfterConcurrent, "people")).toBe(
        rowCount(snapshotAfterReplay, "people")
      );
      expect(rowCount(snapshotAfterConcurrent, "staff_profiles")).toBe(
        rowCount(snapshotAfterReplay, "staff_profiles")
      );
      expect(rowCount(snapshotAfterConcurrent, "audit_log")).toBe(
        rowCount(snapshotAfterReplay, "audit_log") + 1
      );
      expect(rowCount(snapshotAfterConcurrent, "outbox_events")).toBe(
        rowCount(snapshotAfterReplay, "outbox_events") + 1
      );
      expect(await readProfiles()).toEqual([
        {
          id: createdProfile.id,
          person_id: createdProfile.person_id,
          member_id: null,
          is_active: true,
        },
      ]);
      await expectKeyedHistory(concurrentKey, 1);

      const concurrentListRead = waitForStaffListRead("active");
      await page.getByRole("button", { name: "Actualizar lista" }).click();
      await readListedProfile(await concurrentListRead);
      const concurrentArticle = page.getByRole("article", {
        name: concurrentDisplayName,
        exact: true,
      });
      await expect(concurrentArticle).toBeVisible();
      const retainedDraft = concurrentArticle.locator("form");
      await expect(retainedDraft.getByLabel("Nombre", { exact: true })).toHaveValue(
        staffGivenName
      );
      await expect(
        retainedDraft.getByLabel("Apellidos", { exact: true })
      ).toHaveValue(staffFamilyName);
      await expect(retainedDraft.getByLabel("Nombre preferido")).toHaveValue(
        "Entrenador E2E"
      );

      const stalePatchRequestPromise = page.waitForRequest(
        (request) =>
          new URL(request.url()).pathname === staffPath &&
          request.method() === "PATCH"
      );
      const stalePatchResponsePromise = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === staffPath &&
          response.request().method() === "PATCH"
      );
      await retainedDraft
        .getByRole("button", { name: "Guardar cambios" })
        .click();
      const stalePatchRequest = await stalePatchRequestPromise;
      const stalePatchBody = stalePatchRequest.postDataJSON() as {
        version?: string;
      };
      expect(stalePatchBody.version).toBe(initialListedProfile.version);
      const staleKey = stalePatchRequest.headers()["idempotency-key"];
      if (!staleKey) {
        throw new Error("The stale edit request omitted its idempotency key.");
      }
      const stalePatchResponse = await stalePatchResponsePromise;
      expect(stalePatchResponse.status()).toBe(409);
      const snapshotAfterStaleConflict = await readSnapshot();
      expect(
        JSON.stringify(snapshotAfterStaleConflict) ===
          JSON.stringify(snapshotAfterConcurrent)
      ).toBe(true);
      await expect(
        page.locator('[role="alert"]').filter({
          hasText: "El perfil cambió desde que cargaste la lista.",
        })
      ).toBeVisible();
      await expect(retainedDraft.getByLabel("Nombre", { exact: true })).toHaveValue(
        staffGivenName
      );
      await expect(
        page.getByRole("region", { name: "Operación pendiente" })
      ).toHaveCount(0);
      await expectKeyedHistory(staleKey, 0);

      await retainedDraft.getByRole("button", { name: "Cancelar" }).click();
      const currentArticle = page.getByRole("article", {
        name: concurrentDisplayName,
        exact: true,
      });
      await currentArticle.getByRole("button", { name: "Editar" }).click();
      const editForm = currentArticle.locator("form");
      const editedGivenName = "Entrenador";
      const editedFamilyName = "Actualizado " + staffFamilyName;
      const editedPreferredName = "Entrenador principal";
      const editedDisplayName = editedGivenName + " " + editedFamilyName;
      await editForm.getByLabel("Nombre", { exact: true }).fill(editedGivenName);
      await editForm
        .getByLabel("Apellidos", { exact: true })
        .fill(editedFamilyName);
      await editForm
        .getByLabel("Nombre preferido")
        .fill(editedPreferredName);
      const updateRequestPromise = page.waitForRequest(
        (request) =>
          new URL(request.url()).pathname === staffPath &&
          request.method() === "PATCH"
      );
      const updateResponsePromise = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === staffPath &&
          response.request().method() === "PATCH"
      );
      await editForm.getByRole("button", { name: "Guardar cambios" }).click();
      const updateRequest = await updateRequestPromise;
      const updateBody = updateRequest.postDataJSON() as {
        givenName?: string;
        familyName?: string;
        preferredName?: string | null;
        version?: string;
      };
      expect(updateBody).toMatchObject({
        givenName: editedGivenName,
        familyName: editedFamilyName,
        preferredName: editedPreferredName,
        version: concurrentVersion,
      });
      const updateKey = updateRequest.headers()["idempotency-key"];
      if (!updateKey) {
        throw new Error("The successful edit omitted its idempotency key.");
      }
      const updateResponse = await updateResponsePromise;
      expect(updateResponse.status()).toBe(200);
      const updatePayload = (await updateResponse.json()) as MutationPayload;
      expect(updatePayload.data?.replayed).toBe(false);
      expect(updatePayload.data?.receipt?.staffProfileId).toBe(
        createdProfile.id
      );
      expect(updatePayload.data?.receipt?.isActive).toBe(true);
      const editedVersion = updatePayload.data?.receipt?.version;
      if (typeof editedVersion !== "string") {
        throw new Error("The successful edit omitted its version.");
      }
      expect(editedVersion).not.toBe(concurrentVersion);
      await expect(
        page.getByRole("heading", { name: editedDisplayName, exact: true })
      ).toBeVisible();
      const snapshotAfterEdit = await readSnapshot();
      expect(rowCount(snapshotAfterEdit, "people")).toBe(
        rowCount(snapshotAfterReplay, "people")
      );
      expect(rowCount(snapshotAfterEdit, "staff_profiles")).toBe(
        rowCount(snapshotAfterReplay, "staff_profiles")
      );
      expect(rowCount(snapshotAfterEdit, "audit_log")).toBe(
        rowCount(snapshotAfterConcurrent, "audit_log") + 1
      );
      expect(rowCount(snapshotAfterEdit, "outbox_events")).toBe(
        rowCount(snapshotAfterConcurrent, "outbox_events") + 1
      );
      expect(await readProfiles()).toEqual([
        {
          id: createdProfile.id,
          person_id: createdProfile.person_id,
          member_id: null,
          is_active: true,
        },
      ]);
      await expectKeyedHistory(updateKey, 1);

      const editedArticle = page.getByRole("article", {
        name: editedDisplayName,
        exact: true,
      });
      const archiveRequestPromise = page.waitForRequest(
        (request) =>
          new URL(request.url()).pathname === staffPath + "/archive" &&
          request.method() === "POST"
      );
      const archiveResponsePromise = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === staffPath + "/archive" &&
          response.request().method() === "POST"
      );
      await editedArticle.getByRole("button", { name: "Archivar" }).click();
      const archiveRequest = await archiveRequestPromise;
      const archiveBody = archiveRequest.postDataJSON() as {
        organizationId?: string;
        version?: string;
      };
      expect(archiveBody).toMatchObject({
        organizationId: staffOrganizationId,
        version: editedVersion,
      });
      const archiveKey = archiveRequest.headers()["idempotency-key"];
      if (!archiveKey) {
        throw new Error("The archive request omitted its idempotency key.");
      }
      const archiveResponse = await archiveResponsePromise;
      expect(archiveResponse.status()).toBe(200);
      const archivePayload = (await archiveResponse.json()) as MutationPayload;
      expect(archivePayload.data?.replayed).toBe(false);
      expect(archivePayload.data?.receipt?.staffProfileId).toBe(
        createdProfile.id
      );
      expect(archivePayload.data?.receipt?.isActive).toBe(false);
      const archivedVersion = archivePayload.data?.receipt?.version;
      if (typeof archivedVersion !== "string") {
        throw new Error("The archive receipt omitted its version.");
      }
      await expect(editedArticle).toHaveCount(0);
      const snapshotAfterArchive = await readSnapshot();
      expect(rowCount(snapshotAfterArchive, "people")).toBe(
        rowCount(snapshotAfterReplay, "people")
      );
      expect(rowCount(snapshotAfterArchive, "staff_profiles")).toBe(
        rowCount(snapshotAfterReplay, "staff_profiles")
      );
      expect(rowCount(snapshotAfterArchive, "audit_log")).toBe(
        rowCount(snapshotAfterEdit, "audit_log") + 1
      );
      expect(rowCount(snapshotAfterArchive, "outbox_events")).toBe(
        rowCount(snapshotAfterEdit, "outbox_events") + 1
      );
      expect(await readProfiles()).toEqual([
        {
          id: createdProfile.id,
          person_id: createdProfile.person_id,
          member_id: null,
          is_active: false,
        },
      ]);
      await expectKeyedHistory(archiveKey, 1);

      const archivedListRead = waitForStaffListRead("archived");
      await page.getByLabel("Mostrar").selectOption("archived");
      const archivedListedProfile = await readListedProfile(
        await archivedListRead
      );
      expect(archivedListedProfile.version).toBe(archivedVersion);
      expect(archivedListedProfile.isActive).toBe(false);
      const archivedArticle = page.getByRole("article", {
        name: editedDisplayName,
        exact: true,
      });
      await expect(archivedArticle.getByText("Archivado", { exact: true })).toBeVisible();
      const reactivateRequestPromise = page.waitForRequest(
        (request) =>
          new URL(request.url()).pathname === staffPath + "/reactivate" &&
          request.method() === "POST"
      );
      const reactivateResponsePromise = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === staffPath + "/reactivate" &&
          response.request().method() === "POST"
      );
      await archivedArticle
        .getByRole("button", { name: "Reactivar" })
        .click();
      const reactivateRequest = await reactivateRequestPromise;
      const reactivateBody = reactivateRequest.postDataJSON() as {
        organizationId?: string;
        version?: string;
      };
      expect(reactivateBody).toMatchObject({
        organizationId: staffOrganizationId,
        version: archivedVersion,
      });
      const reactivateKey = reactivateRequest.headers()["idempotency-key"];
      if (!reactivateKey) {
        throw new Error("The reactivation request omitted its idempotency key.");
      }
      const reactivateResponse = await reactivateResponsePromise;
      expect(reactivateResponse.status()).toBe(200);
      const reactivatePayload =
        (await reactivateResponse.json()) as MutationPayload;
      expect(reactivatePayload.data?.replayed).toBe(false);
      expect(reactivatePayload.data?.receipt?.staffProfileId).toBe(
        createdProfile.id
      );
      expect(reactivatePayload.data?.receipt?.isActive).toBe(true);
      const reactivatedVersion = reactivatePayload.data?.receipt?.version;
      if (typeof reactivatedVersion !== "string") {
        throw new Error("The reactivation receipt omitted its version.");
      }
      expect(reactivatedVersion).not.toBe(archivedVersion);
      await expect(archivedArticle).toHaveCount(0);
      const snapshotAfterReactivate = await readSnapshot();
      expect(rowCount(snapshotAfterReactivate, "people")).toBe(
        rowCount(snapshotAfterReplay, "people")
      );
      expect(rowCount(snapshotAfterReactivate, "staff_profiles")).toBe(
        rowCount(snapshotAfterReplay, "staff_profiles")
      );
      expect(rowCount(snapshotAfterReactivate, "audit_log")).toBe(
        rowCount(snapshotAfterArchive, "audit_log") + 1
      );
      expect(rowCount(snapshotAfterReactivate, "outbox_events")).toBe(
        rowCount(snapshotAfterArchive, "outbox_events") + 1
      );
      expect(rowCount(snapshotAfterReactivate, "audit_log")).toBe(
        rowCount(snapshotAfterReplay, "audit_log") + 4
      );
      expect(rowCount(snapshotAfterReactivate, "outbox_events")).toBe(
        rowCount(snapshotAfterReplay, "outbox_events") + 4
      );
      expect(await readProfiles()).toEqual([
        {
          id: createdProfile.id,
          person_id: createdProfile.person_id,
          member_id: null,
          is_active: true,
        },
      ]);
      expect(
        JSON.stringify(await readAccessCounts()) === JSON.stringify(accessBefore)
      ).toBe(true);
      await expectKeyedHistory(reactivateKey, 1);

      const activeListRead = waitForStaffListRead("active");
      await page.getByLabel("Mostrar").selectOption("active");
      const activeListedProfile = await readListedProfile(await activeListRead);
      expect(activeListedProfile.version).toBe(reactivatedVersion);
      expect(activeListedProfile.isActive).toBe(true);
      const activeArticle = page.getByRole("article", {
        name: editedDisplayName,
        exact: true,
      });
      await expect(activeArticle.getByText("Activo", { exact: true })).toBeVisible();
      await activeArticle.getByRole("button", { name: "Editar" }).click();
      await expect(activeArticle.locator("form")).toBeVisible();

      for (const viewport of [
        { width: 375, height: 812 },
        { width: 768, height: 1024 },
        { width: 1280, height: 900 },
      ]) {
        await page.setViewportSize(viewport);
        const navigation = page.getByRole("navigation", {
          name: viewport.width < 1280 ? "Navegación móvil" : "Principal",
          exact: true,
        });
        const moreSummary = navigation.locator("summary");
        await moreSummary.click();
        await expect(
          navigation.getByRole("link", { name: "Personal", exact: true })
        ).toHaveAttribute("aria-current", "page");
        await moreSummary.click();

        const geometry = await page.evaluate(() => {
          const isVisible = (element: Element) => {
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            return (
              rect.width > 0 &&
              rect.height > 0 &&
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              style.opacity !== "0"
            );
          };
          const description = (element: Element) =>
            (element.textContent ?? "").trim().replace(/\s+/gu, " ").slice(0, 100) ||
            element.getAttribute("aria-label") ||
            element.tagName.toLowerCase();
          const interactive = Array.from(
            document.querySelectorAll(
              "header a[href], header button, header summary, main a[href], main button, main summary, main input, main select, main textarea"
            )
          ).filter(isVisible);
          const targets = interactive.map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              label: description(element),
              x: rect.left,
              right: rect.right,
              y: rect.top,
              bottom: rect.bottom,
              width: rect.width,
              height: rect.height,
            };
          });
          const overlaps: string[] = [];
          for (let left = 0; left < targets.length; left += 1) {
            for (let right = left + 1; right < targets.length; right += 1) {
              const a = targets[left]!;
              const b = targets[right]!;
              const intersectionWidth = Math.min(a.right, b.right) - Math.max(a.x, b.x);
              const intersectionHeight = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
              if (intersectionWidth > 1 && intersectionHeight > 1) {
                overlaps.push(`${a.label} / ${b.label}`);
              }
            }
          }
          const textElements = Array.from(
            document.querySelectorAll(
              "header a[href], header button, header summary, main h1, main h2, main h3, main h4, main p, main label, main button, main a[href], main summary"
            )
          ).filter(isVisible);
          const inlineTextDiagnostics = {
            visibleInlineElementCount: 0,
            inlineZeroClientWidthCount: 0,
            nonemptyInlineElementCount: 0,
            measuredContainerCount: 0,
            measuredFragmentCount: 0,
            unmeasurableCount: 0,
          };
          const textOverflow = textElements
            .filter((element) => {
              if (window.getComputedStyle(element).display !== "inline") {
                return element.scrollWidth > element.clientWidth + 2;
              }

              inlineTextDiagnostics.visibleInlineElementCount += 1;
              if (element.clientWidth === 0) {
                inlineTextDiagnostics.inlineZeroClientWidthCount += 1;
              }
              if (!(element.textContent ?? "").trim()) return false;
              inlineTextDiagnostics.nonemptyInlineElementCount += 1;

              // Inline elements do not expose a useful clientWidth in every
              // browser. Measure their rendered text fragments against the
              // nearest ancestor that has a layout box instead.
              let container = element.parentElement;
              while (container) {
                const display = window.getComputedStyle(container).display;
                if (
                  display !== "inline" &&
                  display !== "contents" &&
                  container.clientWidth > 0
                ) {
                  break;
                }
                container = container.parentElement;
              }
              if (!container) {
                inlineTextDiagnostics.unmeasurableCount += 1;
                return true;
              }

              const range = document.createRange();
              range.selectNodeContents(element);
              const fragments = Array.from(range.getClientRects());
              if (fragments.length === 0) {
                inlineTextDiagnostics.unmeasurableCount += 1;
                return true;
              }
              inlineTextDiagnostics.measuredContainerCount += 1;
              inlineTextDiagnostics.measuredFragmentCount += fragments.length;

              const containerRect = container.getBoundingClientRect();
              const contentLeft = containerRect.left + container.clientLeft;
              const contentRight = contentLeft + container.clientWidth;
              return fragments.some(
                (fragment) =>
                  fragment.left < contentLeft - 2 ||
                  fragment.right > contentRight + 2
              );
            })
            .map(description);
          const outsideViewport = targets.filter(
            (target) => target.x < -1 || target.right > window.innerWidth + 1
          );
          const tooSmall = targets.filter(
            (target) => target.width < 44 || target.height < 44
          );
          const mainElement = document.querySelector("main");
          return {
            viewportWidth: window.innerWidth,
            documentScrollWidth: document.documentElement.scrollWidth,
            bodyScrollWidth: document.body.scrollWidth,
            mainClientWidth: mainElement?.clientWidth ?? 0,
            mainScrollWidth: mainElement?.scrollWidth ?? 0,
            targets,
            overlaps,
            textOverflow,
            inlineTextDiagnostics,
            outsideViewport,
            tooSmall,
          };
        });
        console.info(
          JSON.stringify({
            viewportWidth: geometry.viewportWidth,
            inlineTextDiagnostics: geometry.inlineTextDiagnostics,
          })
        );
        expect(geometry.viewportWidth).toBe(viewport.width);
        expect(geometry.documentScrollWidth).toBeLessThanOrEqual(viewport.width);
        expect(geometry.bodyScrollWidth).toBeLessThanOrEqual(viewport.width);
        expect(geometry.mainScrollWidth).toBeLessThanOrEqual(
          geometry.mainClientWidth + 2
        );
        expect(geometry.targets.length).toBeGreaterThan(0);
        expect(geometry.outsideViewport).toEqual([]);
        expect(geometry.tooSmall).toEqual([]);
        expect(geometry.overlaps).toEqual([]);
        expect(geometry.textOverflow).toEqual([]);
        expect(geometry.inlineTextDiagnostics.unmeasurableCount).toBe(0);
        expect(geometry.inlineTextDiagnostics.measuredContainerCount).toBe(
          geometry.inlineTextDiagnostics.nonemptyInlineElementCount
        );
      }
      await activeArticle
        .locator("form")
        .getByRole("button", { name: "Cancelar" })
        .click();
    });
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
