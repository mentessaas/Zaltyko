import { expect, test } from "@playwright/test";

test.describe("role-based registration UI", () => {
  test("shows all initial account roles without requiring an academy", async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto("/auth/register", { waitUntil: "domcontentloaded", timeout: 60_000 });

    await expect(page.getByRole("heading", { name: "Crea tu cuenta" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Dueño de academia/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Entrenador/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Padre \/ tutor/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Atleta/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Proveedor/ })).toBeVisible();
    await expect(page.getByLabel("Nombre completo")).toBeVisible();
    await expect(page.getByLabel("Correo electrónico")).toBeVisible();

    const googleButton = page.getByRole("button", { name: "Crear cuenta con Google", exact: true });
    await expect(googleButton).toHaveAttribute("type", "button");
    await expect(googleButton).toHaveAttribute("formnovalidate", "");
    await expect(page.getByLabel("Nombre completo")).not.toHaveAttribute("required");
    await expect(page.getByLabel("Correo electrónico")).not.toHaveAttribute("required");
    await expect(page.getByLabel("Contraseña")).not.toHaveAttribute("required");
  });
});
