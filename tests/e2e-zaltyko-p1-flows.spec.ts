import { expect, test, type Page } from "@playwright/test";

/**
 * P1 go-live coverage with authenticated sandbox data.
 *
 * Requires:
 * - E2E_ACADEMY_ID
 * - E2E_STORAGE_STATE, usually .auth/user.json from pnpm test:e2e:auth
 *
 * The spec creates minimal data when missing so the go-live evidence does not
 * depend on manual seed records in the academy.
 */

const academyId = process.env.E2E_ACADEMY_ID;
const storageState = process.env.E2E_STORAGE_STATE;
const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const runId = process.env.E2E_RUN_ID ?? new Date().toISOString().slice(0, 10);

test.skip(!academyId, "Set E2E_ACADEMY_ID to run P1 flow coverage.");
test.skip(!storageState, "Set E2E_STORAGE_STATE to run P1 flow coverage.");

type ApiResponse<T> = {
  ok?: boolean;
  data?: T;
  error?: string;
  message?: string;
  meta?: { total?: number };
};

type AthleteSummary = {
  id: string;
  name: string;
  academyId: string;
};

type ClassSummary = {
  id: string;
  name: string;
  academyId: string;
};

type SessionSummary = {
  id: string;
  classId: string;
  sessionDate: string;
};

type GoLiveSeed = {
  athlete: AthleteSummary;
  clazz: ClassSummary;
  session: SessionSummary;
};

const academyPath = (path: string) => `/app/${academyId}/${path.replace(/^\//, "")}`;

function goLiveName(resource: string) {
  return `QA Go Live ${resource} ${runId}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function gotoAcademy(page: Page, path: string) {
  const targetPath = academyPath(path);
  try {
    await page.goto(targetPath, { waitUntil: "domcontentloaded", timeout: 45_000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/ERR_EMPTY_RESPONSE|ERR_ABORTED|Timeout/.test(message)) {
      throw error;
    }
    await page.waitForTimeout(1_000);
    await page.goto(targetPath, { waitUntil: "domcontentloaded", timeout: 45_000 });
  }
  await expect(page.getByText(/Failed query|This page could not be found|Application error/i)).toHaveCount(0, { timeout: 15_000 });
}

async function apiFetch<T>(
  page: Page,
  path: string,
  options: { method?: string; body?: unknown; expectedStatuses?: number[] } = {}
) {
  const method = options.method ?? (options.body === undefined ? "GET" : "POST");
  const expectedStatuses = options.expectedStatuses ?? [200, 201];
  const response = await page.request.fetch(new URL(path, baseURL).toString(), {
    method,
    headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
    data: options.body === undefined ? undefined : options.body,
    timeout: 60_000,
  });
  const contentType = response.headers()["content-type"] ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();
  const result = { status: response.status(), payload, contentType };

  expect(expectedStatuses, `${method} ${path} returned ${result.status}: ${JSON.stringify(result.payload)}`).toContain(result.status);
  return result as { status: number; payload: ApiResponse<T>; contentType: string };
}

async function ensureAthlete(page: Page): Promise<AthleteSummary> {
  const targetName = goLiveName("Athlete");
  const list = await apiFetch<AthleteSummary[]>(page, `/api/athletes?academyId=${academyId}&limit=200`);
  const existing = list.payload.data?.find((item) => item.name === targetName);
  if (existing) return existing;

  const created = await apiFetch<{ id: string }>(page, "/api/athletes", {
    method: "POST",
    body: {
      academyId,
      name: targetName,
      dob: "2014-01-15",
      status: "active",
      level: "Go Live",
    },
  });

  return {
    id: created.payload.data!.id,
    name: targetName,
    academyId: academyId!,
  };
}

async function ensureClass(page: Page): Promise<ClassSummary> {
  const targetName = goLiveName("Class");
  const list = await apiFetch<{ items: ClassSummary[] }>(page, `/api/classes?academyId=${academyId}`);
  const existing = list.payload.data?.items.find((item) => item.name === targetName);
  if (existing) return existing;

  const created = await apiFetch<{ id: string }>(page, "/api/classes", {
    method: "POST",
    body: {
      academyId,
      name: targetName,
      weekdays: [new Date().getDay()],
      startTime: "17:00",
      endTime: "18:00",
      capacity: 12,
      allowsFreeTrial: true,
    },
  });

  return {
    id: created.payload.data!.id,
    name: targetName,
    academyId: academyId!,
  };
}

async function ensureSession(page: Page, classId: string): Promise<SessionSummary> {
  const sessionDate = todayIso();
  const list = await apiFetch<{ items: SessionSummary[] }>(
    page,
    `/api/class-sessions?classId=${classId}&from=${sessionDate}&to=${sessionDate}`
  );
  const existing = list.payload.data?.items.find((item) => item.sessionDate === sessionDate);
  if (existing) return existing;

  const created = await apiFetch<{ id: string }>(page, "/api/class-sessions", {
    method: "POST",
    body: {
      academyId,
      classId,
      sessionDate,
      startTime: "17:00",
      endTime: "18:00",
      status: "scheduled",
      notes: "Go-live QA session",
    },
  });

  return {
    id: created.payload.data!.id,
    classId,
    sessionDate,
  };
}

async function ensureEnrollment(page: Page, athleteId: string, classId: string) {
  const response = await apiFetch(page, "/api/class-enrollments", {
    method: "POST",
    body: {
      academyId,
      classId,
      athleteId,
    },
    expectedStatuses: [200, 201, 409],
  });

  expect(["ENROLLMENT_EXISTS", undefined]).toContain(response.payload.error);
}

async function ensureGoLiveSeed(page: Page): Promise<GoLiveSeed> {
  const athlete = await ensureAthlete(page);
  const clazz = await ensureClass(page);
  await ensureEnrollment(page, athlete.id, clazz.id);
  const session = await ensureSession(page, clazz.id);
  return { athlete, clazz, session };
}

test.describe("P1 go-live flow coverage", () => {
  test.use({ storageState });
  test.describe.configure({ mode: "serial", timeout: 240_000 });

  let seed: GoLiveSeed;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    seed = await ensureGoLiveSeed(page);
    await context.close();
  });

  test("onboarding/trial: owner APIs and aha surfaces are available", async ({ page }) => {
    const stateRes = await apiFetch(page, "/api/onboarding/state");
    expect(stateRes.status).toBeGreaterThanOrEqual(200);

    const checklistRes = await apiFetch(page, "/api/onboarding/checklist");
    expect(checklistRes.status).toBeGreaterThanOrEqual(200);

    await gotoAcademy(page, "dashboard");
    await expect(page.locator("#main-content")).toBeVisible({ timeout: 30_000 });

    await gotoAcademy(page, "athletes");
    await expect(page.getByText(seed.athlete.name).first()).toBeVisible({ timeout: 30_000 });

    await gotoAcademy(page, "classes");
    await expect(page.getByText(seed.clazz.name).first()).toBeVisible({ timeout: 30_000 });
  });

  test("evaluaciones: crea evaluación real y confirma historial", async ({ page }) => {
    await gotoAcademy(page, "assessments");
    await expect(page.locator("#main-content")).toBeVisible();

    const created = await apiFetch<{ id: string }>(page, `/api/assessments/${seed.athlete.id}`, {
      method: "POST",
      body: {
        assessmentDate: todayIso(),
        assessmentType: "practice",
        apparatus: null,
        overallComment: "Go-live QA assessment",
        totalScore: 8,
      },
    });
    expect(created.payload.data?.id).toBeTruthy();

    const history = await apiFetch<Array<{ id: string; overallComment: string | null }>>(
      page,
      `/api/assessments/${seed.athlete.id}`
    );
    expect(history.payload.data?.some((item) => item.id === created.payload.data?.id)).toBe(true);

    await gotoAcademy(page, `athletes/${seed.athlete.id}/assessments`);
    await expect(page.locator("#main-content")).toBeVisible({ timeout: 30_000 });

    await gotoAcademy(page, `athletes/${seed.athlete.id}/progress`);
    await expect(page.locator("#main-content")).toBeVisible({ timeout: 30_000 });
  });

  test("asistencia: registra asistencia y alimenta reporte/export", async ({ page }) => {
    await apiFetch(page, "/api/attendance", {
      method: "POST",
      body: {
        sessionId: seed.session.id,
        entries: [
          {
            athleteId: seed.athlete.id,
            status: "present",
            notes: "Go-live QA attendance",
          },
        ],
      },
    });

    const attendance = await apiFetch<{ items: Array<{ athleteId: string; status: string }> }>(
      page,
      `/api/attendance?sessionId=${seed.session.id}`
    );
    expect(attendance.payload.data?.items.some((item) => item.athleteId === seed.athlete.id && item.status === "present")).toBe(true);

    await gotoAcademy(page, "attendance");
    await expect(page.locator("#main-content")).toBeVisible({ timeout: 30_000 });

    await gotoAcademy(page, "reports/attendance");
    await expect(page.locator("#main-content")).toBeVisible({ timeout: 30_000 });

    const exportRes = await apiFetch<string>(page, "/api/reports/attendance/export?format=pdf", {
      expectedStatuses: [200],
    });
    expect(exportRes.contentType).toContain("application/pdf");
  });

  test("comunicación: mensajes/notificaciones cargan y WhatsApp degradado no rompe", async ({ page }) => {
    await gotoAcademy(page, "messages");
    await expect(page.locator("#main-content")).toBeVisible({ timeout: 30_000 });

    await gotoAcademy(page, "notifications");
    await expect(page.locator("#main-content")).toBeVisible({ timeout: 30_000 });

    await gotoAcademy(page, "whatsapp");
    await expect(page.locator("#main-content")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Failed query|Application error/i)).toHaveCount(0);
  });

  test("billing: planes, status y checkout Growth están controlados", async ({ page }) => {
    await gotoAcademy(page, "billing");
    await expect(page.locator("#main-content")).toBeVisible({ timeout: 30_000 });

    const plansRes = await apiFetch<Array<{ code: string; stripePriceId?: string | null }>>(page, "/api/billing/plans");
    const serializedPlans = JSON.stringify(plansRes.payload);
    expect(serializedPlans).not.toMatch(/Academias ilimitadas/i);
    const growthPlan = plansRes.payload.data?.find((plan) => plan.code === "pro");
    expect(growthPlan).toBeTruthy();

    const statusRes = await apiFetch<{ planCode: string; status: string }>(page, "/api/billing/status", {
      method: "POST",
      body: { academyId },
    });
    expect(statusRes.payload.data?.planCode).toBeTruthy();
    expect(statusRes.payload.data?.status).toBeTruthy();

    const checkoutRes = await apiFetch<{ checkoutUrl?: string }>(page, "/api/billing/checkout", {
      method: "POST",
      body: { academyId, planCode: "pro" },
      expectedStatuses: [200, 503],
    });
    if (checkoutRes.status === 503) {
      test.info().annotations.push({
        type: "stripe",
        description: "Stripe is not configured in this environment; checkout creation was intentionally unavailable.",
      });
      expect(checkoutRes.payload.error).toBe("STRIPE_NOT_CONFIGURED");
    } else {
      expect(checkoutRes.payload.data?.checkoutUrl).toMatch(/^https:\/\/.*stripe\.com\//);
    }
  });
});
