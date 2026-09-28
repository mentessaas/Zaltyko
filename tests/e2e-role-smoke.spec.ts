import { resolve } from "node:path";

import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const academyId = process.env.E2E_ACADEMY_ID;
const otherAcademyId = process.env.E2E_ACADEMY_B_ID;
const athleteId = process.env.E2E_ATHLETE_ID;
const routeFixtureGroupId = process.env.E2E_ROUTE_AUDIT_GROUP_ID;
const routeFixtureClassId = process.env.E2E_ROUTE_AUDIT_CLASS_ID;
const routeFixtureSessionId = process.env.E2E_ROUTE_AUDIT_SESSION_ID;
const routeFixtureEventId = process.env.E2E_ROUTE_AUDIT_EVENT_ID;
const routeFixtureAnnouncementId = process.env.E2E_ROUTE_AUDIT_ANNOUNCEMENT_ID;
const routeFixtureTicketId = process.env.E2E_ROUTE_AUDIT_TICKET_ID;
const routeFixtureConversationId = process.env.E2E_ROUTE_AUDIT_CONVERSATION_ID;
const routeFixtureCoachId = process.env.E2E_ROUTE_AUDIT_COACH_ID;
const routeFixtureCoachProfileId = process.env.E2E_ROUTE_AUDIT_COACH_PROFILE_ID;
const routeFixtureOwnerProfileId = process.env.E2E_ROUTE_AUDIT_OWNER_PROFILE_ID;
const ownerStorageState = process.env.E2E_OWNER_STORAGE_STATE ?? process.env.E2E_STORAGE_STATE;
const adminStorageState = process.env.E2E_ADMIN_STORAGE_STATE;
const coachStorageState = process.env.E2E_COACH_STORAGE_STATE;
const familyStorageState = process.env.E2E_FAMILY_STORAGE_STATE;
const athleteStorageState = process.env.E2E_ATHLETE_STORAGE_STATE;
const superAdminStorageState = process.env.E2E_SUPER_ADMIN_STORAGE_STATE;
const superAdminPaths = ["/super-admin/dashboard", "/super-admin/academies", "/super-admin/users"];
const ownerAcademyPaths = ["dashboard", "athletes", "groups", "classes", "billing", "settings"];
const ownerReadOnlyPaths = [
  "announcements",
  "announcements/new",
  "audit-logs",
  "athletes/new",
  "billing/campaigns",
  "billing/discounts",
  "billing/discounts/history",
  "billing/receipts",
  "billing/scholarships",
  "coach",
  "coaches",
  "coaches/today",
  "comms",
  "contact-messages",
  "dashboard/analytics",
  "dashboard/at-a-glance",
  "evaluations",
  "events",
  "licenses",
  "messages",
  "reports",
  "reports/attendance",
  "reports/class",
  "reports/coach",
  "reports/churn",
  "reports/financial",
  "reports/progress",
  "support",
  "support/new",
  "trials",
  "whatsapp",
];
const ownerLegacyReadOnlyPaths = [
  "/dashboard/academies",
  "/dashboard/announcements",
  "/dashboard/announcements/new",
  "/dashboard/assessments",
  "/dashboard/athletes",
  "/dashboard/athletes/new",
  "/dashboard/billing",
  "/dashboard/classes",
  "/dashboard/classes/calendar",
  "/dashboard/classes/groups",
  "/dashboard/coaches",
  "/dashboard/empleo/mis-postulaciones",
  "/dashboard/events",
  "/dashboard/events/new",
  "/dashboard/marketplace/mis-productos",
  "/dashboard/messages",
  "/dashboard",
  "/dashboard/plan-limits",
  "/dashboard/settings",
  "/dashboard/users",
];
const superAdminReadOnlyPaths = [
  "/super-admin",
  "/super-admin/academies/public",
  "/super-admin/billing",
  "/super-admin/growth",
  "/super-admin/logs",
  "/super-admin/settings",
  "/super-admin/support",
  "/admin/analytics",
];
const runtimeFailures = new WeakMap<Page, Set<string>>();

test.beforeEach(async ({ page }) => {
  const failures = new Set<string>();
  runtimeFailures.set(page, failures);
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin !== baseURL || !url.pathname.startsWith("/api/")) return;
    if (response.status() === 400 || response.status() === 429 || response.status() >= 500) {
      failures.add(`${response.status()} ${url.pathname}`);
    }
  });
  page.on("pageerror", (error) => failures.add(`browser ${error.name}`));
});

test.afterEach(async ({ page }) => {
  expect([...runtimeFailures.get(page) ?? []], "Unexpected API or browser runtime failures").toEqual([]);
});

async function expectNoRouteError(page: import("@playwright/test").Page) {
  await expect(page.getByText(/Failed query|This page could not be found|Application error/i)).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/RATE_LIMIT_EXCEEDED|Rate limiting unavailable/i);
}

async function gotoAppPath(
  page: import("@playwright/test").Page,
  path: string,
  options: { allowRedirectAbort?: boolean; expectedStatus?: number } = {}
) {
  try {
    const response = await page.goto(path, { waitUntil: "domcontentloaded", timeout: 120_000 });
    if (response) {
      if (options.expectedStatus !== undefined) {
        expect(response.status(), `Unexpected HTTP status for ${new URL(path, baseURL).pathname}`).toBe(options.expectedStatus);
      } else {
        expect(
          response.status(),
          `Expected a successful app route response for ${new URL(path, baseURL).pathname}`
        ).toBeLessThan(400);
      }
    }
  } catch (error) {
    if (options.allowRedirectAbort && error instanceof Error && error.message.includes("net::ERR_ABORTED")) {
      return;
    }

    throw error;
  }
}

async function assertLegacySelfPages(page: import("@playwright/test").Page) {
  for (const path of ["/dashboard/calendar", "/dashboard/profile"]) {
    await gotoAppPath(page, `${baseURL}${path}`, { allowRedirectAbort: true });
    await expectNoRouteError(page);
    await expect(page).not.toHaveURL(/\/auth\/login/);
  }
}

test.describe("role smoke: super admin", () => {
  test.skip(!superAdminStorageState, "Set E2E_SUPER_ADMIN_STORAGE_STATE to run super admin smoke.");
  test.use(superAdminStorageState ? { storageState: superAdminStorageState } : {});
  test.describe.configure({ mode: "serial" });

  for (const path of superAdminPaths) {
    test(`can open core admin surface: ${path}`, async ({ page }) => {
      test.setTimeout(180_000);
      await gotoAppPath(page, `${baseURL}${path}`);
      await expectNoRouteError(page);
      await expect(page).not.toHaveURL(/\/auth\/login/);

      if (path === "/super-admin/users") {
        const academyOwners = page.getByRole("row").filter({ hasText: /Propietario de \d+ academias?/ });
        await expect(academyOwners).not.toHaveCount(0);
        for (const row of await academyOwners.all()) {
          await expect(row.getByRole("button", { name: "Eliminar" })).toBeDisabled();
        }
      }
    });
  }

  for (const path of superAdminReadOnlyPaths) {
    test(`can open additional admin read surface: ${path}`, async ({ page }) => {
      test.setTimeout(180_000);
      await gotoAppPath(page, `${baseURL}${path}`, { allowRedirectAbort: true });
      await expectNoRouteError(page);
      await expect(page).not.toHaveURL(/\/auth\/login/);
    });
  }

  test("can open synthetic academy and profile details", async ({ page }) => {
    test.skip(!academyId || !routeFixtureCoachProfileId || !routeFixtureTicketId, "Seed read-only Super Admin detail fixtures.");
    test.setTimeout(180_000);
    for (const path of [
      `/super-admin/academies/${academyId}`,
      `/super-admin/users/${routeFixtureCoachProfileId}`,
      `/super-admin/support/${routeFixtureTicketId}`,
    ]) {
      await gotoAppPath(page, `${baseURL}${path}`, { allowRedirectAbort: true });
      await expectNoRouteError(page);
      await expect(page).not.toHaveURL(/\/auth\/login/);
    }
  });

  test("experimental admin pages stay hidden while their schema flags are off", async ({ page }) => {
    test.setTimeout(180_000);
    const syntheticActorId = "00000000-0000-4000-8000-000000000001";
    for (const path of [
      "/admin/disputes",
      "/api/admin/disputes",
      `/app/${academyId}/audit-timeline`,
      `/app/${academyId}/marketplace`,
      `/app/${academyId}/privacy`,
      `/app/${academyId}/public-page`,
      `/app/${academyId}/store`,
      `/app/${academyId}/store/onboarding`,
      `/app/${academyId}/subdomain`,
      `/app/athlete/${syntheticActorId}/public-page`,
      `/app/coach/${syntheticActorId}/public-page`,
      `/app/supplier/${syntheticActorId}/public-page`,
    ]) {
      await gotoAppPath(page, `${baseURL}${path}`, { expectedStatus: 404 });
    }
  });
});

test.describe("role smoke: academy owner", () => {
  test.skip(!academyId || !ownerStorageState, "Set E2E_ACADEMY_ID and E2E_OWNER_STORAGE_STATE/E2E_STORAGE_STATE.");
  test.use(ownerStorageState ? { storageState: ownerStorageState } : {});
  test.describe.configure({ mode: "serial" });

  for (const path of ownerAcademyPaths) {
    test(`can open demo-critical academy module: ${path}`, async ({ page }) => {
      test.setTimeout(180_000);
      await gotoAppPath(page, `${baseURL}/app/${academyId}/${path}`);
      await expectNoRouteError(page);
      await expect(page).not.toHaveURL(/\/auth\/login/);
    });
  }

  for (const path of ownerReadOnlyPaths) {
    test(`can open additional read surface: ${path}`, async ({ page }) => {
      test.setTimeout(180_000);
      await gotoAppPath(page, `${baseURL}/app/${academyId}/${path}`, { allowRedirectAbort: true });
      await expectNoRouteError(page);
      await expect(page).not.toHaveURL(/\/auth\/login/);
    });
  }

  for (const path of ownerLegacyReadOnlyPaths) {
    test(`can open additional legacy read surface: ${path}`, async ({ page }) => {
      test.setTimeout(180_000);
      await gotoAppPath(page, `${baseURL}${path}`, { allowRedirectAbort: true });
      await expectNoRouteError(page);
      await expect(page).not.toHaveURL(/\/auth\/login/);
    });
  }

  test("can open the linked athlete record and its read surfaces", async ({ page }) => {
    test.skip(!athleteId, "Set E2E_ATHLETE_ID for the linked synthetic athlete.");
    test.setTimeout(180_000);

    for (const suffix of [
      "",
      "/assessments",
      "/documents",
      "/guardians",
      "/history",
      "/notes",
    ]) {
      await gotoAppPath(page, `${baseURL}/app/${academyId}/athletes/${athleteId}${suffix}`, {
        allowRedirectAbort: true,
      });
      await expectNoRouteError(page);
      await expect(page).not.toHaveURL(/\/auth\/login/);
    }
  });

  test("can resolve the authenticated app root and owner onboarding entry", async ({ page }) => {
    test.setTimeout(180_000);
    for (const path of ["/app", `/app/${academyId}`, "/onboarding", "/onboarding/owner"]) {
      await gotoAppPath(page, `${baseURL}${path}`, { allowRedirectAbort: true });
      await expectNoRouteError(page);
      await expect(page).not.toHaveURL(/\/auth\/login/);
    }
  });

  test("can open synthetic class, group, session, event, announcement and support details", async ({ page }) => {
    test.skip(
      !academyId || !athleteId || !routeFixtureGroupId || !routeFixtureClassId || !routeFixtureSessionId ||
        !routeFixtureEventId || !routeFixtureAnnouncementId || !routeFixtureTicketId || !routeFixtureCoachId ||
        !routeFixtureOwnerProfileId || !routeFixtureConversationId,
      "Create the isolated read-only route fixtures in the E2E sandbox."
    );
    test.setTimeout(240_000);

    const paths = [
      `/app/${academyId}/athletes/${athleteId}/evaluate`,
      `/app/${academyId}/classes/${routeFixtureClassId}`,
      `/app/${academyId}/classes/${routeFixtureClassId}/recurring`,
      `/app/${academyId}/groups/${routeFixtureGroupId}`,
      `/app/${academyId}/attendance/today/${routeFixtureSessionId}`,
      `/app/${academyId}/coaches/${routeFixtureCoachId}`,
      `/app/${academyId}/coaches/${routeFixtureCoachId}/public-settings`,
      `/app/${academyId}/events/${routeFixtureEventId}`,
      `/app/${academyId}/events/${routeFixtureEventId}/invitations`,
      `/app/${academyId}/announcements/${routeFixtureAnnouncementId}`,
      `/app/${academyId}/support/${routeFixtureTicketId}`,
      `/dashboard/athletes/${athleteId}`,
      `/dashboard/classes/${routeFixtureClassId}/edit`,
      `/dashboard/sessions/${routeFixtureSessionId}`,
      `/dashboard/events/${routeFixtureEventId}`,
      `/dashboard/announcements/${routeFixtureAnnouncementId}`,
      `/dashboard/messages/${routeFixtureConversationId}`,
      `/dashboard/profile/${routeFixtureOwnerProfileId}`,
      `/dashboard/view/${routeFixtureCoachProfileId}`,
    ];
    for (const path of paths) {
      await gotoAppPath(page, `${baseURL}${path}`, { allowRedirectAbort: true });
      await expectNoRouteError(page);
      await expect(page).not.toHaveURL(/\/auth\/login/);
    }
  });

  test("legacy calendar and profile remain scoped to the signed-in owner", async ({ page }) => {
    test.setTimeout(180_000);
    await assertLegacySelfPages(page);
  });
});

test.describe("role smoke: coach", () => {
  test.skip(!academyId || !coachStorageState, "Set E2E_ACADEMY_ID and E2E_COACH_STORAGE_STATE.");
  test.use(coachStorageState ? { storageState: coachStorageState } : {});

  test("can open assigned work surfaces without admin billing/settings content", async ({ page }) => {
    test.setTimeout(180_000);

    for (const path of ["dashboard", "classes", "groups", "attendance", "attendance/today", "assessments", "coach/today-simple"]) {
      await gotoAppPath(page, `${baseURL}/app/${academyId}/${path}`, { allowRedirectAbort: true });
      await expectNoRouteError(page);
      await expect(page).not.toHaveURL(/\/auth\/login/);
    }
    await gotoAppPath(page, `${baseURL}/onboarding/coach`, { allowRedirectAbort: true });
    await expectNoRouteError(page);
    await expect(page).not.toHaveURL(/\/auth\/login/);

    if (routeFixtureClassId && routeFixtureGroupId && routeFixtureSessionId) {
      for (const path of [
        `/app/${academyId}/classes/${routeFixtureClassId}`,
        `/app/${academyId}/groups/${routeFixtureGroupId}`,
        `/app/${academyId}/coach/today/${routeFixtureSessionId}`,
      ]) {
        await gotoAppPath(page, `${baseURL}${path}`, { allowRedirectAbort: true });
        await expectNoRouteError(page);
        await expect(page).not.toHaveURL(/\/auth\/login/);
      }
    }

    await gotoAppPath(page, `${baseURL}/app/${academyId}/billing`, { allowRedirectAbort: true });
    await expect(page.getByText("E2E Coach")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Planes y cobros" })).toHaveCount(0);
    await gotoAppPath(page, `${baseURL}/app/${academyId}/settings`, { allowRedirectAbort: true });
    await expect(page.getByText("E2E Coach")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ajustes de la academia" })).toHaveCount(0);
    await assertLegacySelfPages(page);
  });
});

test.describe("role smoke: academy admin", () => {
  test.skip(!academyId || !adminStorageState, "Set academy and admin storage state.");
  test.use(adminStorageState ? { storageState: adminStorageState } : {});

  test("admin without owner membership never sees subscription controls", async ({ page }) => {
    test.setTimeout(180_000);
    await gotoAppPath(page, `${baseURL}/app/${academyId}/dashboard`);
    await expectNoRouteError(page);
    await expect(page).not.toHaveURL(/\/auth\/login/);

    // E2E_ADMIN must be a disposable non-owner membership. If it accidentally
    // inherits owner privileges, the plan controls become visible and fail
    // this check instead of making the role matrix look green.
    await gotoAppPath(page, `${baseURL}/app/${academyId}/billing`, { allowRedirectAbort: true });
    await expectNoRouteError(page);
    await expect(page.getByRole("heading", { name: "Planes y suscripción" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Planes disponibles" })).toHaveCount(0);
    await assertLegacySelfPages(page);
  });
});

for (const [role, storageState] of [
  ["family", familyStorageState],
  ["athlete", athleteStorageState],
] as const) {
  test.describe(`role smoke: ${role}`, () => {
    test.skip(!academyId || !storageState || !athleteId, `Set academy, ${role} state, and E2E_ATHLETE_ID.`);
    test.use(storageState ? { storageState } : {});

    test("can open linked self-service pages without administrative billing", async ({ page }) => {
      test.setTimeout(180_000);
      await gotoAppPath(page, `${baseURL}/app/${academyId}/my-dashboard`);
      await expectNoRouteError(page);
      await expect(page).not.toHaveURL(/\/auth\/login/);

      await gotoAppPath(page, `${baseURL}/app/${academyId}/billing`, { allowRedirectAbort: true });
      await expect(page.getByRole("heading", { name: "Planes y cobros" })).toHaveCount(0);
      await gotoAppPath(page, `${baseURL}/app/${academyId}/settings`, { allowRedirectAbort: true });
      await expect(page.getByRole("heading", { name: "Ajustes de la academia" })).toHaveCount(0);

      for (const path of ["my-events", "notifications"]) {
        await gotoAppPath(page, `${baseURL}/app/${academyId}/${path}`, { allowRedirectAbort: true });
        await expectNoRouteError(page);
        await expect(page).not.toHaveURL(/\/auth\/login/);
      }

      const extraSelfServicePaths = [
        role === "family" ? "/onboarding/parent" : "/onboarding/athlete",
        ...(routeFixtureEventId ? [`/app/${academyId}/events/${routeFixtureEventId}/register`] : []),
      ];
      for (const path of extraSelfServicePaths) {
        const url = path.startsWith("/app/") ? path : `${baseURL}${path}`;
        await gotoAppPath(page, url, { allowRedirectAbort: true });
        await expectNoRouteError(page);
        await expect(page).not.toHaveURL(/\/auth\/login/);
      }

      await gotoAppPath(page, `${baseURL}/app/${academyId}/athletes/${athleteId}/progress`);
      await expectNoRouteError(page);
      await expect(page).not.toHaveURL(/\/auth\/login/);
      await gotoAppPath(page, `${baseURL}/app/${academyId}/athletes/${athleteId}/history`, {
        allowRedirectAbort: true,
      });
      await expectNoRouteError(page);
      await expect(page).not.toHaveURL(/\/auth\/login/);
      await assertLegacySelfPages(page);
    });
  });
}

test.describe("role smoke: academy isolation", () => {
  test.skip(!academyId || !otherAcademyId || !ownerStorageState, "Set two academies and owner storage state.");
  test.use(ownerStorageState ? { storageState: ownerStorageState } : {});

  test("owner A cannot open academy B dashboard", async ({ page }) => {
    test.setTimeout(180_000);
    await gotoAppPath(page, `${baseURL}/app/${otherAcademyId}/dashboard`, {
      allowRedirectAbort: true,
      expectedStatus: 404,
    });
    await expect(page.getByText("E2E audit B")).toHaveCount(0);
  });
});
