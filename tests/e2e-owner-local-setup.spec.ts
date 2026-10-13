import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.DATABASE_URL;
const runId = process.env.E2E_LOCAL_RUN_ID;

if (
  process.env.E2E_LOCAL_SUPABASE !== "true" ||
  !supabaseUrl ||
  !anonKey ||
  !serviceRoleKey ||
  !databaseUrl ||
  !runId
) {
  throw new Error("Run this suite only through `pnpm test:e2e:local`.");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const pool = new Pool({ connectionString: databaseUrl, max: 1 });

let userId: string | undefined;
let email: string | undefined;
let password: string | undefined;
let organizationName: string | undefined;
let locationName: string | undefined;

test.describe("Isolated local Supabase Owner setup", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  test.beforeEach(async ({}, testInfo) => {
    const unique = randomUUID();
    email = `e2e-${runId}-${testInfo.project.name}-${unique}@example.test`;
    password = `${randomUUID()}aA1!`;
    organizationName = `Academia E2E ${runId.slice(0, 8)} ${testInfo.project.name}`;
    locationName = `Sede E2E ${runId.slice(0, 8)} ${testInfo.project.name}`;

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error)
      throw new Error(`Could not create local E2E identity: ${error.message}`);
    userId = data.user.id;
  });

  test.afterAll(async () => {
    await pool.end();
  });

  // Do not delete individual rows here: the append-only audit log deliberately
  // prevents deleting an academy after its bootstrap event. The local runner
  // destroys this unique project's entire database volume after the test.
  test("logs in and creates a synthetic academy through the UI", async ({
    page,
  }) => {
    await loginThroughUi(page, email!, password!);
    await expect(
      page.getByRole("heading", { name: "Crea tu espacio de dirección" })
    ).toBeVisible();

    await page.getByLabel("Nombre de la academia").fill(organizationName!);
    await page.getByRole("radio", { name: "Gimnasia rítmica" }).check();
    await page.getByLabel("Nombre de la primera sede").fill(locationName!);

    const bootstrapResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/organizations/bootstrap") &&
        response.request().method() === "POST"
    );
    await page
      .getByRole("button", { name: "Crear espacio de dirección" })
      .click();
    const response = await bootstrapResponse;
    expect(response.status()).toBe(201);
    const result = (await response.json()) as { organizationId: string };
    expect(result.organizationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );

    await expect(page).toHaveURL(
      new RegExp(`/owner\\?organizationId=${result.organizationId}`)
    );

    const persisted = await pool.query<{
      organization_name: string;
      location_name: string;
      role: string;
    }>(
      `select organization.name as organization_name,
              location.name as location_name,
              member.role::text as role
         from zaltyko.organizations as organization
         join zaltyko.organization_members as member
           on member.organization_id = organization.id
         join zaltyko.locations as location
           on location.organization_id = organization.id
        where organization.id = $1::uuid
          and member.user_id = $2::uuid`,
      [result.organizationId, userId]
    );
    expect(persisted.rows).toEqual([
      {
        organization_name: organizationName,
        location_name: locationName,
        role: "owner",
      },
    ]);
  });
});

async function loginThroughUi(
  page: Page,
  userEmail: string,
  userPassword: string
) {
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const routePaths: string[] = [];
  const navigationRequests: string[] = [];
  const submitEvents: boolean[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.name));
  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame()) return;
    try {
      routePaths.push(new URL(frame.url()).pathname);
    } catch {
      routePaths.push("unparseable route");
    }
  });
  page.on("requestfailed", (request) => {
    try {
      const url = new URL(request.url());
      failedRequests.push(`${url.host}${url.pathname}`);
    } catch {
      failedRequests.push("unparseable request URL");
    }
  });
  page.on("request", (request) => {
    if (!request.isNavigationRequest()) return;
    try {
      const url = new URL(request.url());
      navigationRequests.push(`${request.method()} ${url.pathname}`);
    } catch {
      navigationRequests.push("unparseable navigation URL");
    }
  });
  await page.exposeFunction("__recordE2ESubmit", (prevented: boolean) => {
    submitEvents.push(prevented);
  });
  await page.goto("/auth/login?next=%2Fowner%2Fsetup", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator("button[aria-busy]")).toHaveAttribute(
    "aria-busy",
    "false"
  );
  await page.waitForFunction(
    () => "serviceWorker" in navigator && Boolean(navigator.serviceWorker.controller),
    undefined,
    { timeout: 30_000 }
  );
  const firstNavigationType = await page.evaluate(
    () => performance.getEntriesByType("navigation")[0]?.type
  );
  expect(firstNavigationType).toBe("navigate");
  await page.getByLabel("Correo electrónico").fill(userEmail);
  await page.getByLabel("Contraseña").fill(userPassword);
  const emailInput = page.getByLabel("Correo electrónico");
  const passwordInput = page.getByLabel("Contraseña");
  await expect(emailInput).toHaveValue(userEmail);
  await expect(passwordInput).toHaveValue(userPassword);
  const formIsValid = await page.locator("form").evaluate((form) =>
    (form as HTMLFormElement).checkValidity()
  );
  expect(formIsValid).toBe(true);
  const loginButton = page.getByRole("button", { name: "Iniciar sesión" });
  await expect(loginButton).toBeEnabled();
  await page.locator("form").evaluate((form) => {
    form.addEventListener(
      "submit",
      (event) => {
        window.setTimeout(() => {
          void (window as typeof window & {
            __recordE2ESubmit: (prevented: boolean) => Promise<void>;
          }).__recordE2ESubmit(event.defaultPrevented);
        }, 0);
      },
      { once: true }
    );
  });
  const authResponsePromise = page
    .waitForResponse(
      (response) =>
        response.url().includes("/auth/v1/token") &&
        response.request().method() === "POST",
      { timeout: 10_000 }
    )
    .catch(() => null);
  await loginButton.click();
  const authResponse = await authResponsePromise;
  if (!authResponse) {
    const alert = page.getByRole("alert");
    const detail = (await alert.count())
      ? await alert.innerText()
      : "no alert shown";
    const emailLength = (
      await page.getByLabel("Correo electrónico").inputValue()
    ).length;
    const passwordLength = (await page.getByLabel("Contraseña").inputValue())
      .length;
    throw new Error(
      `Local login did not call Supabase Auth: ${detail || "empty alert"}; ` +
        `input lengths=${emailLength}/${passwordLength}; ` +
        `page errors=${pageErrors.join(",") || "none"}; ` +
        `failed requests=${failedRequests.join(",") || "none"}; ` +
        `submit prevented=${submitEvents.join(",") || "not observed"}; ` +
        `navigation requests=${navigationRequests.join(",") || "none"}`
    );
  }
  if (!authResponse.ok()) {
    const body = (await authResponse.json().catch(() => ({}))) as {
      msg?: string;
      message?: string;
      error_description?: string;
    };
    throw new Error(
      `Local Supabase Auth rejected the synthetic login (${authResponse.status()}): ${body.msg ?? body.message ?? body.error_description ?? "no safe error detail"}`
    );
  }
  try {
    await expect(page).toHaveURL(/\/owner\/setup$/, { timeout: 8_000 });
  } catch {
    const sessionSignals = await page.evaluate(() => ({
      path: window.location.pathname,
      cookieNames: document.cookie
        .split(";")
        .map((cookie) => cookie.trim().split("=")[0])
        .filter(Boolean),
      supabaseStorageKeys: Object.keys(window.localStorage).filter((key) =>
        /^sb-.+-auth-token(?:\.\d+)?$/.test(key)
      ),
    }));
    throw new Error(
      `Local login succeeded at Auth (${authResponse.status()}) but did not reach owner setup; ` +
        `routes=${routePaths.join(",") || "none"}; ` +
        `path=${sessionSignals.path}; ` +
        `cookieNames=${sessionSignals.cookieNames.join(",") || "none"}; ` +
        `supabaseStorageKeys=${sessionSignals.supabaseStorageKeys.join(",") || "none"}; ` +
        `pageErrors=${pageErrors.join(",") || "none"}; ` +
        `failedRequests=${failedRequests.join(",") || "none"}`
    );
  }
}
