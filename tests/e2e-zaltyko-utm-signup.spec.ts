/**
 * ZAL-336 — signup/owner onboarding/claim con persistencia UTM en sandbox.
 *
 * El navegador hace el signup real de la aplicación y recorre el POST de
 * onboarding. Supabase Auth se sustituye únicamente por el mock de desarrollo
 * explícito; la fila se lee desde PostgreSQL local, no se inserta desde el
 * test. El proveedor de auth remoto, secretos y producción quedan fuera.
 */

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { expect, test, type Page } from "@playwright/test";

const databaseUrl =
  process.env.E2E_DATABASE_URL ??
  `postgresql://${process.env.USER ?? "postgres"}@127.0.0.1:5432/zaltyko_e2e_zal336`;
const databaseHost = new URL(databaseUrl).hostname;
const browserMockCookie = "zaltyko_e2e_mock_client";

test.beforeEach(async ({ context }) => {
  await context.addCookies([
    {
      name: browserMockCookie,
      value: "1",
      url: process.env.BASE_URL || "http://127.0.0.1:3000",
    },
  ]);
});

test.beforeAll(() => {
  if (process.env.E2E_MOCK_AUTH !== "1") {
    throw new Error(
      "ZAL-336 exige E2E_MOCK_AUTH=1; no se permite ejecutar contra Auth real."
    );
  }
  if (databaseHost !== "127.0.0.1" && databaseHost !== "localhost" && databaseHost !== "::1") {
    throw new Error(`ZAL-336 exige PostgreSQL local; host recibido: ${databaseHost}`);
  }
});

interface AcademyRow {
  id: string;
  name: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  utm_landing_path: string | null;
  utm_captured_at: string | null;
}

async function withDb<T>(callback: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

async function gotoWithRetry(page: Page, url: string): Promise<void> {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/ERR_ABORTED|ERR_EMPTY_RESPONSE|ERR_CONNECTION|Timeout|net::ERR_/i.test(message)) {
      throw error;
    }
    await page.waitForTimeout(1_000);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  }
}

async function gotoPublic(page: Page, url: string): Promise<void> {
  await gotoWithRetry(page, url);
  await page.waitForTimeout(1_500);
}

async function readSessionStorage(page: Page, key: string): Promise<string | null> {
  try {
    return await page.evaluate((storageKey) => sessionStorage.getItem(storageKey), key);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/Execution context was destroyed|Target page, context or browser has been closed/i.test(message)) {
      return null;
    }
    throw error;
  }
}

async function readAcademyRow(id: string): Promise<AcademyRow | null> {
  return withDb(async (client) => {
    const result = await client.query<AcademyRow>(
      `SELECT id::text, name, utm_source, utm_medium, utm_campaign,
              utm_term, utm_content, utm_landing_path,
              utm_captured_at::text
         FROM public.academies
        WHERE id = $1::uuid`,
      [id]
    );
    return result.rows[0] ?? null;
  });
}

async function deleteAcademyAndOwner(academyId: string, userId: string): Promise<void> {
  await withDb(async (client) => {
    await client.query("DELETE FROM public.academies WHERE id = $1::uuid", [academyId]);
    await client.query("DELETE FROM public.profiles WHERE user_id = $1::uuid", [userId]);
  });
}

async function signupAsOwner(page: Page, email: string, fullName: string): Promise<void> {
  await gotoWithRetry(page, "/auth/register");
  await expect(page.getByRole("heading", { name: "Crea tu cuenta" })).toBeVisible();
  // In Next dev, the auth page can be visible before its client handlers are
  // hydrated. Give React one stable frame before filling controlled inputs.
  await page.waitForTimeout(1_500);
  await page.getByLabel("Nombre completo").fill(fullName);
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill("ZaltykoE2E12345");
  await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding\/owner$/, { timeout: 90_000 });
}

async function createAcademyFromOwnerWizard(
  page: Page,
  academyName: string
): Promise<string> {
  await expect(page.getByRole("heading", { name: "Crea tu primera academia" })).toBeVisible();
  // The wizard can paint before its client submit handler hydrates in Next
  // dev; wait for one stable frame before filling the controlled form.
  await page.waitForTimeout(1_500);
  await page.getByLabel("Nombre completo").fill("ZAL-336 Owner");
  await page.getByLabel("Nombre de tu academia").fill(academyName);
  await page.getByRole("button", { name: /Entrar a mi academia/i }).click();
  await expect(page).toHaveURL(/\/app\/[0-9a-f-]+\/dashboard$/, { timeout: 120_000 });
  const academyId = page.url().match(/\/app\/([0-9a-f-]+)\/dashboard$/)?.[1];
  expect(academyId).toBeTruthy();
  return academyId!;
}

async function getMockUserId(page: Page): Promise<string> {
  const cookie = (await page.context().cookies()).find(
    (item) => item.name === "zaltyko_e2e_mock_auth"
  );
  expect(cookie).toBeTruthy();
  const payload = JSON.parse(decodeURIComponent(cookie!.value)) as { id?: string };
  expect(payload.id).toMatch(/^[0-9a-f-]{36}$/i);
  return payload.id!;
}

async function seedClaimableAcademy(): Promise<{ academyId: string; seedProfileId: string }> {
  const academyId = "00000000-0000-0000-0000-000000003360";
  const seedProfileId = "00000000-0000-0000-0000-000000003361";
  const tenantId = "00000000-0000-0000-0000-000000003362";
  const seedUserId = "00000000-0000-0000-0000-000000003363";
  await withDb(async (client) => {
    await client.query("DELETE FROM public.academies WHERE id = $1::uuid", [academyId]);
    await client.query("DELETE FROM public.profiles WHERE id = $1::uuid", [seedProfileId]);
    await client.query(
      `INSERT INTO public.profiles (id, user_id, tenant_id, name, role, can_login)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'owner', true)`,
      [seedProfileId, seedUserId, tenantId, "ZAL-336 Seed Owner"]
    );
    await client.query(
      `INSERT INTO public.academies (
         id, tenant_id, name, academy_type, owner_id, contact_email,
         utm_source, utm_medium, utm_campaign, utm_term, utm_content,
         utm_landing_path, utm_captured_at
       ) VALUES (
         $1::uuid, $2::uuid, $3, 'artistica', $4::uuid, $5,
         'instagram', 'social', 'seed_first_touch', 'madrid', 'hero_v1',
         '/es/gimnasia-artistica/espana', now() - interval '1 day'
       )`,
      [academyId, tenantId, "ZAL-336 Seed Academy", seedProfileId, "zal336-claim@zaltyko.test"]
    );
  });
  return { academyId, seedProfileId };
}

test.describe("ZAL-336 — signup UTM → fila en academies", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(240_000);

  test("cinco UTM normalizados + landing path + marca de captura", async ({ page }) => {
    const email = `zal336-full-${randomUUID()}@zaltyko.test`;
    await gotoPublic(
      page,
      "/?utm_source=Google_Ads&utm_medium=CPC&utm_campaign=Onboarding_Q3_2026&utm_term=Gimnasia_Artistica&utm_content=Hero_V1",
    );
    await expect
      .poll(() => readSessionStorage(page, "zaltyko_first_touch_utm"), {
        timeout: 30_000,
      })
      .toContain("Google_Ads".toLowerCase());

    await signupAsOwner(page, email, "ZAL-336 Full UTM");
    const academyId = await createAcademyFromOwnerWizard(
      page,
      `ZAL-336 Full ${randomUUID().slice(0, 8)}`
    );
    const userId = await getMockUserId(page);

    try {
      await expect.poll(() => readAcademyRow(academyId), { timeout: 30_000 }).toMatchObject({
        utm_source: "google_ads",
        utm_medium: "cpc",
        utm_campaign: "onboarding_q3_2026",
        utm_term: "gimnasia_artistica",
        utm_content: "hero_v1",
        utm_landing_path: "/",
      });
      const row = await readAcademyRow(academyId);
      expect(row?.utm_captured_at).not.toBeNull();
    } finally {
      await deleteAcademyAndOwner(academyId, userId);
    }
  });

  test("entrada directa conserva el canal direct sin atribución UTM", async ({ page }) => {
    const email = `zal336-direct-${randomUUID()}@zaltyko.test`;
    await gotoPublic(page, "/");
    await page.evaluate(() => sessionStorage.clear());
    await signupAsOwner(page, email, "ZAL-336 Direct");
    const academyId = await createAcademyFromOwnerWizard(
      page,
      `ZAL-336 Direct ${randomUUID().slice(0, 8)}`
    );
    const userId = await getMockUserId(page);

    try {
      await expect.poll(() => readAcademyRow(academyId), { timeout: 30_000 }).toMatchObject({
        utm_source: "direct",
        utm_medium: "none",
        utm_campaign: "none",
        utm_term: "none",
        utm_content: "none",
        utm_landing_path: null,
      });
      const row = await readAcademyRow(academyId);
      expect(row?.utm_captured_at).not.toBeNull();
    } finally {
      await deleteAcademyAndOwner(academyId, userId);
    }
  });

  test("claim conserva el first-touch ya atribuido en la academia pre-registrada", async ({ page }) => {
    const { academyId, seedProfileId } = await seedClaimableAcademy();
    await gotoPublic(page, "/");
    await page.evaluate(() => sessionStorage.clear());
    await signupAsOwner(page, "zal336-claim@zaltyko.test", "ZAL-336 Claim");
    await expect(page.getByRole("heading", { name: "Confirma tu academia" })).toBeVisible();
    await page.waitForTimeout(1_500);
    await page.getByTestId("owner-claim-confirm").click();
    await expect(page).toHaveURL(new RegExp(`/app/${academyId}/dashboard$`), {
      timeout: 120_000,
    });
    const claimedUserId = await getMockUserId(page);

    try {
      const row = await readAcademyRow(academyId);
      expect(row).toMatchObject({
        utm_source: "instagram",
        utm_medium: "social",
        utm_campaign: "seed_first_touch",
        utm_term: "madrid",
        utm_content: "hero_v1",
        utm_landing_path: "/es/gimnasia-artistica/espana",
      });
      await deleteAcademyAndOwner(academyId, claimedUserId);
    } finally {
      await withDb(async (client) => {
        await client.query("DELETE FROM public.academies WHERE id = $1::uuid", [academyId]);
        await client.query("DELETE FROM public.profiles WHERE id = $1::uuid", [seedProfileId]);
      });
    }
  });

  test("second touch no sobrescribe el primer touch en sessionStorage ni en DB", async ({ page }) => {
    const email = `zal336-second-${randomUUID()}@zaltyko.test`;
    await gotoPublic(
      page,
      "/?utm_source=Google_Ads&utm_medium=CPC&utm_campaign=first_touch_q3",
    );
    await gotoPublic(
      page,
      "/?utm_source=TikTok_Ads&utm_medium=Social&utm_campaign=second_touch",
    );
    await expect
      .poll(() => readSessionStorage(page, "zaltyko_first_touch_utm"), {
        timeout: 30_000,
      })
      .toContain("first_touch_q3");
    await expect
      .poll(() => readSessionStorage(page, "zaltyko_first_touch_utm"), {
        timeout: 30_000,
      })
      .not.toContain("second_touch");

    await signupAsOwner(page, email, "ZAL-336 Second Touch");
    const academyId = await createAcademyFromOwnerWizard(
      page,
      `ZAL-336 Second ${randomUUID().slice(0, 8)}`
    );
    const userId = await getMockUserId(page);

    try {
      const row = await readAcademyRow(academyId);
      expect(row).toMatchObject({
        utm_source: "google_ads",
        utm_medium: "cpc",
        utm_campaign: "first_touch_q3",
      });
      expect(row?.utm_source).not.toBe("tiktok_ads");
      expect(row?.utm_campaign).not.toBe("second_touch");
    } finally {
      await deleteAcademyAndOwner(academyId, userId);
    }
  });
});
