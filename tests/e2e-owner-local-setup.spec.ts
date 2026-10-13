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

  test.afterEach(async () => {
    try {
      if (userId && organizationName) {
        const owned = await pool.query<{ id: string }>(
          `select organization.id
             from zaltyko.organizations as organization
             join zaltyko.organization_members as member
               on member.organization_id = organization.id
            where member.user_id = $1::uuid
              and organization.name = $2`,
          [userId, organizationName]
        );

        for (const row of owned.rows) {
          const deleted = await pool.query<{ id: string }>(
            `delete from zaltyko.organizations
              where id = $1::uuid and name = $2
              returning id`,
            [row.id, organizationName]
          );
          expect(deleted.rowCount).toBe(1);
        }

        const remaining = await pool.query<{ count: number }>(
          `select count(*)::int as count
             from zaltyko.organization_members
            where user_id = $1::uuid`,
          [userId]
        );
        expect(remaining.rows[0]?.count).toBe(0);
      }
    } finally {
      if (userId) {
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (error)
          throw new Error(
            `Could not delete local E2E identity: ${error.message}`
          );
      }
      userId = undefined;
      email = undefined;
      password = undefined;
      organizationName = undefined;
      locationName = undefined;
    }
  });

  test.afterAll(async () => {
    await pool.end();
  });

  test("logs in and creates then removes a synthetic academy through the UI", async ({
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
    await expect(
      page.getByText(organizationName!, { exact: true })
    ).toBeVisible();

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
  page.on("pageerror", (error) => pageErrors.push(error.name));
  page.on("requestfailed", (request) => {
    try {
      const url = new URL(request.url());
      failedRequests.push(`${url.host}${url.pathname}`);
    } catch {
      failedRequests.push("unparseable request URL");
    }
  });
  await page.goto("/auth/login?next=%2Fowner%2Fsetup", {
    waitUntil: "domcontentloaded",
  });
  await page.getByLabel("Correo electrónico").fill(userEmail);
  await page.getByLabel("Contraseña").fill(userPassword);
  const authResponsePromise = page
    .waitForResponse(
      (response) =>
        response.url().includes("/auth/v1/token") &&
        response.request().method() === "POST",
      { timeout: 10_000 }
    )
    .catch(() => null);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
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
        `failed requests=${failedRequests.join(",") || "none"}`
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
  await expect(page).toHaveURL(/\/owner\/setup$/);
}
