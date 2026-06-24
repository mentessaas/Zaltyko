import { expect, test } from "@playwright/test";

const storageState = process.env.E2E_STORAGE_STATE;

test.use(storageState ? { storageState } : {});

test.describe("global account link request UI", () => {
  test.skip(!storageState, "Set E2E_STORAGE_STATE to run authenticated link request UI smoke.");

  test("renders staff link request and unlink controls", async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto("/dashboard/users", { waitUntil: "domcontentloaded", timeout: 60_000 });

    await expect(page.getByRole("heading", { name: "Equipo" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Vincular cuenta existente" })).toBeVisible();
    await expect(page.getByLabel("Email de cuenta existente")).toBeVisible();
    await expect(page.getByRole("button", { name: /Solicitar vinculo/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Solicitudes de vinculo" })).toBeVisible();
  });

  test("renders incoming academy link requests panel in global profile", async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto("/dashboard/profile", { waitUntil: "domcontentloaded", timeout: 60_000 });

    await expect(page.getByRole("heading", { name: "Vinculos con academias" })).toBeVisible();
  });
});
