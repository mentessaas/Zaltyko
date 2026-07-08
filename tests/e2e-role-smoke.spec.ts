import { expect, test } from "@playwright/test";

const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const academyId = process.env.E2E_ACADEMY_ID;
const ownerStorageState = process.env.E2E_OWNER_STORAGE_STATE ?? process.env.E2E_STORAGE_STATE;
const coachStorageState = process.env.E2E_COACH_STORAGE_STATE;
const superAdminStorageState = process.env.E2E_SUPER_ADMIN_STORAGE_STATE;

async function expectNoRouteError(page: import("@playwright/test").Page) {
  await expect(page.getByText(/Failed query|This page could not be found|Application error/i)).toHaveCount(0);
}

test.describe("role smoke: super admin", () => {
  test.skip(!superAdminStorageState, "Set E2E_SUPER_ADMIN_STORAGE_STATE to run super admin smoke.");
  test.use(superAdminStorageState ? { storageState: superAdminStorageState } : {});

  test("can open core admin surfaces", async ({ page }) => {
    for (const path of ["/super-admin/dashboard", "/super-admin/academies", "/super-admin/users"]) {
      await page.goto(`${baseURL}${path}`);
      await expectNoRouteError(page);
      await expect(page).not.toHaveURL(/\/auth\/login/);
    }
  });
});

test.describe("role smoke: academy owner", () => {
  test.skip(!academyId || !ownerStorageState, "Set E2E_ACADEMY_ID and E2E_OWNER_STORAGE_STATE/E2E_STORAGE_STATE.");
  test.use(ownerStorageState ? { storageState: ownerStorageState } : {});

  test("can open demo-critical academy modules", async ({ page }) => {
    for (const path of ["dashboard", "athletes", "groups", "classes", "billing", "settings"]) {
      await page.goto(`${baseURL}/app/${academyId}/${path}`);
      await expectNoRouteError(page);
      await expect(page).not.toHaveURL(/\/auth\/login/);
    }
  });
});

test.describe("role smoke: coach", () => {
  test.skip(!academyId || !coachStorageState, "Set E2E_ACADEMY_ID and E2E_COACH_STORAGE_STATE.");
  test.use(coachStorageState ? { storageState: coachStorageState } : {});

  test("can open assigned work surfaces without cobros/admin settings", async ({ page }) => {
    for (const path of ["dashboard", "classes", "assessments"]) {
      await page.goto(`${baseURL}/app/${academyId}/${path}`);
      await expectNoRouteError(page);
      await expect(page).not.toHaveURL(/\/auth\/login/);
    }

    await page.goto(`${baseURL}/app/${academyId}/billing`);
    await expect(page).not.toHaveURL(new RegExp(`/app/${academyId}/billing$`));
  });
});
