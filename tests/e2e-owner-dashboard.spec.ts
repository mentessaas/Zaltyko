import { expect, test, type Page } from "@playwright/test";

const organizationId = process.env.E2E_DOMAIN_ORGANIZATION_ID;
const locationId = process.env.E2E_DOMAIN_LOCATION_ID;
const storageState = process.env.E2E_STORAGE_STATE;

test.skip(
  !organizationId || !locationId || !storageState,
  "Set the greenfield Owner organization, location and storage state for this E2E suite."
);

const ownerRoute = (path = "") => {
  const pathname = path ? `/owner/${path.replace(/^\//, "")}` : "/owner";
  const query = new URLSearchParams({
    organizationId: organizationId!,
    locationId: locationId!,
  });
  return `${pathname}?${query.toString()}`;
};

const criticalOwnerRoutes = [
  "",
  "groups",
  "classes",
  "enrollments",
  "payments",
  "insights",
  "health-score/setup",
];

async function expectNoRouteError(page: Page) {
  await expect(
    page.getByText(
      /Failed query|This page could not be found|Application error/i
    )
  ).toHaveCount(0);
}

async function gotoOwner(page: Page, path = "") {
  const target = ownerRoute(path);
  await page.goto(target, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await expect(page).toHaveURL(
    new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    {
      timeout: 60_000,
    }
  );
  await expect(page.getByRole("main").first()).toBeVisible({ timeout: 60_000 });
  await expectNoRouteError(page);
}

test.describe("Greenfield Owner workspace", () => {
  test.use(storageState ? { storageState } : {});
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  test("desktop navigation exposes the canonical Owner modules", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoOwner(page);

    const navigation = page.getByRole("navigation", { name: "Principal" });
    await expect(navigation).toBeVisible();
    for (const [label, href] of [
      ["Resumen", ownerRoute()],
      ["Grupos", ownerRoute("groups")],
      ["Clases", ownerRoute("classes")],
      ["Insights", ownerRoute("insights")],
      ["Capacidad", `${ownerRoute()}#capacity`],
      ["Inscripciones", ownerRoute("enrollments")],
      ["Cobros", ownerRoute("payments")],
    ]) {
      await expect(
        navigation.getByRole("link", { name: label })
      ).toHaveAttribute("href", href);
    }
    await expect(
      navigation.getByRole("link", { name: "Resumen" })
    ).toHaveAttribute("aria-current", "page");
  });

  test("mobile navigation keeps primary tasks visible and secondary links keyboard-accessible", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoOwner(page);

    const navigation = page.getByRole("navigation", {
      name: "Navegación móvil",
    });
    await expect(navigation).toBeVisible();
    for (const label of ["Resumen", "Grupos", "Clases", "Inscripciones"]) {
      await expect(navigation.getByRole("link", { name: label })).toBeVisible();
    }

    // The disclosure control is a native <summary>; query the element directly
    // because browser accessibility trees don't consistently expose its role.
    const more = navigation.locator("summary").filter({ hasText: "Más" });
    await expect(more).toBeVisible();
    await more.focus();
    await expect(more).toBeFocused();
    await page.keyboard.press("Enter");
    for (const label of ["Insights", "Capacidad", "Cobros"]) {
      await expect(navigation.getByRole("link", { name: label })).toBeVisible();
    }

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth
      )
    ).toBe(false);
  });

  test("skip link moves keyboard users to the workspace content", async ({
    page,
  }) => {
    await gotoOwner(page);
    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: "Saltar al contenido" });
    await expect(skipLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#owner-workspace-content$/);
    await expect(page.locator("#owner-workspace-content")).toBeVisible();
    await expect(page.locator("#owner-workspace-content")).toBeFocused();
  });

  for (const path of criticalOwnerRoutes) {
    test(`Owner route renders without application errors: ${path || "dashboard"}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await gotoOwner(page, path);
      await expect(
        page.getByRole("navigation", { name: "Principal" })
      ).toBeVisible();
      if (path === "payments") {
        await expect(
          page.getByRole("link", { name: "Volver al panel" })
        ).toHaveAttribute("href", ownerRoute());
      }
    });
  }

  test("Owner workspace remains usable at common breakpoints", async ({
    page,
  }) => {
    for (const viewport of [
      { width: 375, height: 812 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1280, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await gotoOwner(page);
      await expect(page.getByRole("main").first()).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth
        )
      ).toBe(false);
      if (viewport.width < 1024) {
        await expect(
          page.getByRole("navigation", { name: "Navegación móvil" })
        ).toBeVisible();
      } else {
        await expect(
          page.getByRole("navigation", { name: "Principal" })
        ).toBeVisible();
      }
    }
  });
});
