import { resolve } from "node:path";

import { config } from "dotenv";
import { expect, test } from "@playwright/test";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const academyId = process.env.E2E_ACADEMY_ID;
const ownerStorageState = process.env.E2E_OWNER_STORAGE_STATE ?? process.env.E2E_STORAGE_STATE;
const coachStorageState = process.env.E2E_COACH_STORAGE_STATE;
const superAdminStorageState = process.env.E2E_SUPER_ADMIN_STORAGE_STATE;
const superAdminPaths = ["/super-admin/dashboard", "/super-admin/academies", "/super-admin/users"];
const ownerAcademyPaths = ["dashboard", "athletes", "groups", "classes", "billing", "settings"];

async function expectNoRouteError(page: import("@playwright/test").Page) {
  await expect(page.getByText(/Failed query|This page could not be found|Application error/i)).toHaveCount(0);
}

async function gotoAppPath(
  page: import("@playwright/test").Page,
  path: string,
  options: { allowRedirectAbort?: boolean } = {}
) {
  try {
    await page.goto(path, { waitUntil: "domcontentloaded", timeout: 120_000 });
  } catch (error) {
    if (options.allowRedirectAbort && error instanceof Error && error.message.includes("net::ERR_ABORTED")) {
      return;
    }

    throw error;
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
    });
  }
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
});

test.describe("role smoke: coach", () => {
  test.skip(!academyId || !coachStorageState, "Set E2E_ACADEMY_ID and E2E_COACH_STORAGE_STATE.");
  test.use(coachStorageState ? { storageState: coachStorageState } : {});

  test("can open assigned work surfaces without admin billing/settings content", async ({ page }) => {
    test.setTimeout(180_000);

    for (const path of ["dashboard", "classes", "assessments"]) {
      await gotoAppPath(page, `${baseURL}/app/${academyId}/${path}`);
      await expectNoRouteError(page);
      await expect(page).not.toHaveURL(/\/auth\/login/);
    }

    await gotoAppPath(page, `${baseURL}/app/${academyId}/billing`, { allowRedirectAbort: true });
    await expect(page.getByText("E2E Coach")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Planes y cobros" })).toHaveCount(0);
    await gotoAppPath(page, `${baseURL}/app/${academyId}/settings`, { allowRedirectAbort: true });
    await expect(page.getByText("E2E Coach")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ajustes de la academia" })).toHaveCount(0);
  });
});
