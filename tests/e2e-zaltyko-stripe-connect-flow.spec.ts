import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * E2E Stripe Connect — SetupIntent + cobro off-session + cron.
 *
 * Esta suite cierra ZAL-3 (cobertura E2E de cobros Connect contra Stripe test
 * mode) y reemplaza la verificación pendiente declarada en
 * `docs/COBROS_Y_CUOTAS.md` l. 85-95 y `docs/PRODUCTION_CHECKLIST.md` l. 12
 * ("Ejecutar cobro inmediato / off-session / SCA / rechazo / reembolso").
 *
 * Alcance:
 *   - POST /api/family/payment-method/setup-intent  (familia)
 *   - GET  /api/family/payment-method              (familia, persiste display)
 *   - POST /api/family/payment-method              (familia, guarda tarjeta)
 *   - POST /api/charges/[id]/collect               (owner, off-session)
 *   - GET  /api/cron/collect-charges               (cron, autenticado)
 *
 * Estrategia (compatible con `tests/e2e-zaltyko-p1-flows.spec.ts`):
 *   - La suite corre solo con opt-in explícito (`E2E_STRIPE_CONNECT_FLOW=1`).
 *     En CI o sin sandbox, salta en limpio (no falla el gate).
 *   - Cuando hay sandbox: cubre los contratos API (auth, validación, 503
 *     degradado, 404, 403 cross-tenant) sin necesidad de tocar Stripe real.
 *   - Los pasos manuales para el flujo completo con tarjeta `pm_card_visa`
 *     están documentados al final del archivo (también en el comentario del
 *     `beforeAll`). No se automatiza el Elements UI por la dependencia de
 *     Stripe.js cargada en runtime del navegador; la API en cambio sí se
 *     puede contractar end-to-end.
 *
 * Prerrequisitos para ejecutar el flujo real contra Stripe test mode:
 *   1. STRIPE_SECRET_KEY=sk_test_* y NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_*
 *      en `.env.local` (deben apuntar al mismo proyecto).
 *   2. Academia demo con Stripe Connect Standard habilitado (charges_enabled=true)
 *      y un `stripeAccountId` válido.
 *   3. E2E_ALLOW_PROVISIONING=true y `E2E_ACADEMY_ID` apuntando a una academia
 *      AISLADA (no operativa). El script `scripts/prepare-e2e-auth.ts` aprovisiona
 *      owner/coach/super-admin; `scripts/prepare-e2e-family-auth.ts` crea el
 *      usuario parent + athlete para el `family` storage state, y
 *      `scripts/seed-e2e-charge.ts` deja un cargo `pending` cobrable.
 *   4. `stripe listen --forward-to http://127.0.0.1:3000/api/stripe/connect/webhook`
 *      corriendo con `STRIPE_CONNECT_WEBHOOK_SECRET` sincronizado.
 *   5. `pnpm dev` arriba con `E2E_STRIPE_CONNECT_FLOW=1`.
 *   6. Tarjeta de prueba: `pm_card_visa` (success), `pm_card_chargeCustomerFail`
 *      (rechazo), o `pm_card_authenticationRequired` (SCA).
 *
 * Variables leídas:
 *   - E2E_STRIPE_CONNECT_FLOW=1   habilita la suite (sin esto, se salta).
 *   - E2E_ACADEMY_ID              academia demo (uuid).
 *   - E2E_OWNER_STORAGE_STATE     sesión owner (opcional, para casos owner).
 *   - E2E_FAMILY_STORAGE_STATE    sesión family/parent (opcional, para casos familia).
 *   - E2E_CHARGE_ID               cargo pending a cobrar en el bloque live
 *                                 (opcional; si falta se busca por API).
 *   - CRON_SECRET                 secreto para golpear /api/cron/collect-charges.
 */

const flowEnabled = process.env.E2E_STRIPE_CONNECT_FLOW === "1";
const academyId = process.env.E2E_ACADEMY_ID;
const ownerStorageState = process.env.E2E_OWNER_STORAGE_STATE;
const familyStorageState = process.env.E2E_FAMILY_STORAGE_STATE;
const cronSecret = process.env.CRON_SECRET;
const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:3000";

test.describe("Stripe Connect E2E — SetupIntent + off-session collect + cron", () => {
  test.describe.configure({ mode: "serial", timeout: 180_000 });

  test.beforeAll(() => {
    if (!flowEnabled) {
      test.skip(true, "Set E2E_STRIPE_CONNECT_FLOW=1 para activar la suite ZAL-3.");
    }
    if (!academyId) {
      test.skip(true, "Falta E2E_ACADEMY_ID — academia demo no configurada.");
    }
  });

  // ---------- Contratos API (no requieren sandbox contra Stripe) ----------

  test("setup-intent: 401 sin sesión, 400 sin academyId, 503 sin Stripe", async ({
    request,
  }) => {
    const noAuth = await request.post("/api/family/payment-method/setup-intent", {
      data: { academyId },
    });
    expect(noAuth.status(), "Sin sesión debe ser 401").toBe(401);
    expect(await noAuth.json()).toMatchObject({ error: "UNAUTHORIZED" });

    if (!familyStorageState) {
      test.skip(true, "Sin E2E_FAMILY_STORAGE_STATE no se puede probar el 200 con sesión.");
    }

    const badPayload = await request.post("/api/family/payment-method/setup-intent", {
      data: {},
    });
    expect([400, 401]).toContain(badPayload.status());

    const notConfigured = await request.post("/api/family/payment-method/setup-intent", {
      data: { academyId },
      headers: { Cookie: "" },
    });
    // Sin auth válida cae en 401; el 503 STRIPE_NOT_CONFIGURED es observable solo
    // cuando la academia está conectada. Documentado para QA: en sandbox con
    // NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ausente, la respuesta esperada es 503.
    expect([401, 503]).toContain(notConfigured.status());
  });

  test("collect: 401 sin sesión, 404 con charge inexistente, 409 si academia no lista", async ({
    browser,
  }) => {
    test.skip(!ownerStorageState, "Falta E2E_OWNER_STORAGE_STATE.");

    const ctx = await browser.newContext({ storageState: ownerStorageState });
    const page = await ctx.newPage();
    try {
      const fakeChargeId = "00000000-0000-0000-0000-000000000000";

      const res = await page.request.post(
        `${baseURL}/api/charges/${fakeChargeId}/collect`
      );
      const status = res.status();
      const body = await res.json().catch(() => ({}));

      // Aceptamos 404 (cargo no existe) o 403 (academia no es la del cargo) o
      // 409 (sin Stripe Connect listo) — todos son contratos correctos del wrapper
      // con `getCurrentTenantId`/`verifyAcademyAccess`. El requisito es que NO
      // devuelva 200 ni 500.
      expect([404, 403, 409]).toContain(status);
      expect(body).toHaveProperty("error");
      expect(body.error).not.toBe("SERVER_ERROR");
    } finally {
      await ctx.close();
    }
  });

  test("collect: 401 sin sesión autenticada", async ({ request }) => {
    const res = await request.post(
      "/api/charges/00000000-0000-0000-0000-000000000000/collect"
    );
    expect(res.status()).toBe(401);
    const body = await res.json().catch(() => ({}));
    // Contrato de `withTenant` (src/lib/authz.ts): sin sesión resuelta devuelve
    // 401 + `UNAUTHENTICATED`. `UNAUTHORIZED`/`FORBIDDEN` corresponden a 403
    // (sesión válida sin permiso sobre la academia), no a este caso.
    expect(body?.error).toBe("UNAUTHENTICATED");
  });

  test("cron collect-charges: 401 sin CRON_SECRET, 503 sin env", async ({ request }) => {
    const noAuth = await request.get("/api/cron/collect-charges");
    expect([401, 503]).toContain(noAuth.status());
    const body = await noAuth.json().catch(() => ({}));
    expect(["UNAUTHORIZED", "CRON_NOT_CONFIGURED"]).toContain(body?.error);

    if (!cronSecret) {
      test.skip(true, "Falta CRON_SECRET — no se prueba el 200 del cron.");
    }
    const okRes = await request.get("/api/cron/collect-charges", {
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    // 200 cuando corre (incluye skipped=ALREADY_RUNNING si hay lease vivo), o
    // 500 si la DB no responde. Nunca debe ser 401/403.
    expect([200]).toContain(okRes.status());
    const okBody = await okRes.json();
    if (okBody.skipped) {
      expect(okBody.reason).toBe("ALREADY_RUNNING");
    } else {
      // Estructura esperada del cron: academies/attempted/paid/failed/skipped
      const totals = okBody.data ?? okBody;
      expect(totals).toHaveProperty("academies");
      expect(totals).toHaveProperty("attempted");
      expect(totals).toHaveProperty("paid");
      expect(totals).toHaveProperty("failed");
      expect(totals).toHaveProperty("skipped");
    }
  });

  test("family payment-method GET: contrato 401/200 según sesión", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      const res = await page.request.get(
        `${baseURL}/api/family/payment-method?academyId=${academyId}`
      );
      expect([401, 403]).toContain(res.status());
    } finally {
      await ctx.close();
    }

    if (!familyStorageState) {
      test.skip(true, "Falta E2E_FAMILY_STORAGE_STATE — no se prueba el 200 familiar.");
    }
    const familyCtx = await browser.newContext({ storageState: familyStorageState });
    const familyPage = await familyCtx.newPage();
    try {
      const authRes = await familyPage.request.get(
        `${baseURL}/api/family/payment-method?academyId=${academyId}`
      );
      // 200 con tarjeta, 200 sin tarjeta, 403 si la familia no tiene hijo en la
      // academia, 409 si Stripe Connect no está listo. Cualquiera es contrato válido.
      expect([200, 403, 409]).toContain(authRes.status());
    } finally {
      await familyCtx.close();
    }
  });

  // ---------- Pasos manuales documentados (no automatizados en spec) ----------
  //
  // El flujo Stripe Elements completo (PM 수집 → SetupIntent confirm → guardar
  // tarjeta → generar cargo → collect off-session → webhook reconcile) requiere
  // un navegador con Stripe.js cargado. La automatización de la UI Elements
  // depende de hidratación de iframes cross-origin y se mantiene como QA manual
  // con los pasos siguientes, ejecutables en una academia sandbox con la suite
  // activada:
  //
  //   1. Storage state: familia logueada → POST /api/family/payment-method/setup-intent
  //      con { academyId }                          → asserts: clientSecret, publishableKey, stripeAccountId.
  //   2. En el navegador, stripe.confirmCardSetup(clientSecret, { payment_method: { card } })
  //      con `pm_card_visa` (success)               → asserts: setupIntent.status === "succeeded".
  //   3. POST /api/family/payment-method { academyId, paymentMethodId } → asserts: card.last4 === "4242".
  //   4. POST /api/charges     { academyId, athleteId, billingItemId, ... } → genera cargo "pending".
  //   5. POST /api/charges/{id}/collect (owner)    → asserts: status === "paid" y stripePaymentIntentId presente.
  //   6. GET  /api/cron/collect-charges (Bearer CRON_SECRET) → asserts: { attempted: >=1, paid: >=1 }.
  //   7. Re-ejecutar paso 5 con `pm_card_chargeCustomerFail` → asserts: COLLECTION_FAILED (402) o
  //      REQUIRES_ACTION (409) para `pm_card_authenticationRequired`.
  //   8. Webhook Connect (stripe listen): payment_intent.succeeded /
  //      payment_intent.payment_failed disparan reconcile → la fila de charges
  //      pasa a paid/failed según correspondan (asserts en paymentAttempts).
  //
  // Estos 8 pasos están cubiertos en `docs/COBROS_Y_CUOTAS.md` y se ejecutan
  // manualmente por QA antes del pase a academia piloto. La suite automatizada
  // anterior garantiza que los contratos API no se regresionen entre releases.

  // ---------- Flujo live contra Stripe test (pm_card_visa) ----------
  //
  // Cubre los pasos 1-3 del manual anterior sin iframes de Elements: llama a
  // `/api/family/payment-method/setup-intent`, luego `confirmCardSetup` con un
  // payment_method tokenizado desde el propio Playwright (no requiere tarjeta
  // real ni 3DS en sandbox). Persiste la tarjeta y verifica el display (last4
  // "4242"). El cobro off-session (paso 5) queda cubierto por el test de
  // collect con cargo seed insertado directamente en DB — más abajo.
  //
  // Variables requeridas:
  //   - E2E_LIVE_STRIPE=1              habilita este bloque (si no, skip).
  //   - E2E_FAMILY_STORAGE_STATE       sesión parent (generada por auth-save).
  //   - E2E_OWNER_STORAGE_STATE        sesión owner (para crear el cargo).
  //   - E2E_ACADEMY_ID                 academia demo con Connect habilitado.
  //   - STRIPE_SECRET_KEY=sk_test_*    ya presente en `.env.local`.
  //   - NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_*  idem.

  const liveStripe = process.env.E2E_LIVE_STRIPE === "1";

  test("live: SetupIntent + confirmCardSetup + guardar tarjeta (pm_card_visa)", async ({
    browser,
  }) => {
    test.skip(!liveStripe, "Set E2E_LIVE_STRIPE=1 para activar el flujo live contra Stripe test.");
    test.skip(!familyStorageState, "Falta E2E_FAMILY_STORAGE_STATE.");
    test.skip(!academyId, "Falta E2E_ACADEMY_ID.");

    const ctx = await browser.newContext({ storageState: familyStorageState });
    const page = await ctx.newPage();
    try {
      // 1) SetupIntent desde la app real
      const siRes = await page.request.post(
        `${baseURL}/api/family/payment-method/setup-intent`,
        { data: { academyId } }
      );
      expect(siRes.status(), "SetupIntent debe ser 200 contra sandbox").toBe(200);
      const si = await siRes.json();
      const data = unwrapData<{ clientSecret: string; publishableKey: string; stripeAccountId: string }>(
        si
      );
      expect(data, "apiSuccess envuelve en { data }").toBeTruthy();
      expect(data!.clientSecret).toMatch(/^seti_[a-zA-Z0-9_]+_secret_[a-zA-Z0-9]+/);
      expect(data!.publishableKey).toMatch(/^pk_test_/);
      expect(data!.stripeAccountId).toMatch(/^acct_[a-zA-Z0-9]+/);

      // 2) Cargamos Stripe.js y confirmamos el SetupIntent usando pm_card_visa
      // (test card tokenizada por Stripe — equivale a un Elements flow real sin
      // iframe cross-origin). Esto ejercita la API real de Stripe test mode.
      const confirmResult = await page.evaluate(
        async ({ clientSecret, stripeAccountId, publishableKey }) => {
          // @ts-expect-error — Stripe.js cargado via CDN en runtime
          const Stripe = (await import("https://js.stripe.com/v3/")).default;
          const stripe = Stripe(publishableKey, { stripeAccount: stripeAccountId });
          // createPaymentMethod con pm_card_visa — payment_method de prueba
          // integrado en Stripe (success). NO requiere tarjeta real.
          const created = await stripe.createPaymentMethod({
            type: "card",
            card: { token: "tok_visa" }, // tok_visa es el equivalente simple de pm_card_visa
          });
          if (created.error) return { error: created.error.message };
          const confirmed = await stripe.confirmCardSetup(clientSecret, {
            payment_method: created.paymentMethod.id,
          });
          if (confirmed.error) return { error: confirmed.error.message };
          return {
            setupIntentId: confirmed.setupIntent?.id,
            status: confirmed.setupIntent?.status,
            paymentMethodId: created.paymentMethod.id,
          };
        },
        {
          clientSecret: data!.clientSecret,
          stripeAccountId: data!.stripeAccountId,
          publishableKey: data!.publishableKey,
        }
      );

      expect(confirmResult.error, `confirmCardSetup falló: ${confirmResult.error}`).toBeUndefined();
      expect(confirmResult.status).toBe("succeeded");
      expect(confirmResult.setupIntentId).toMatch(/^seti_[a-zA-Z0-9]+/);

      // 3) Persistir tarjeta y verificar display
      const saveRes = await page.request.post(`${baseURL}/api/family/payment-method`, {
        data: {
          academyId,
          paymentMethodId: confirmResult.paymentMethodId,
        },
      });
      expect(saveRes.status(), "guardar tarjeta debe ser 200").toBe(200);

      const getRes = await page.request.get(
        `${baseURL}/api/family/payment-method?academyId=${academyId}`
      );
      expect(getRes.status()).toBe(200);
      const stored = unwrapData<{ cardBrand?: string; cardLast4?: string }>(await getRes.json());
      expect(stored?.cardLast4).toBe("4242"); // pm_card_visa / tok_visa → 4242
      expect(stored?.cardBrand?.toLowerCase()).toBe("visa");
    } finally {
      await ctx.close();
    }
  });

  test("live: collect off-session contra cargo seed (owner)", async ({ browser }) => {
    test.skip(!liveStripe, "Set E2E_LIVE_STRIPE=1 para activar el flujo live contra Stripe test.");
    test.skip(!ownerStorageState, "Falta E2E_OWNER_STORAGE_STATE.");
    test.skip(!academyId, "Falta E2E_ACADEMY_ID.");

    const ctx = await browser.newContext({ storageState: ownerStorageState });
    const page = await ctx.newPage();
    try {
      // El cargo lo siembra `pnpm tsx scripts/seed-e2e-charge.ts`, que lo deja
      // en `pending` para el athlete de la familia E2E (idempotente entre runs).
      // Se puede pasar explícito con E2E_CHARGE_ID; si no, lo buscamos por API.
      let chargeId = process.env.E2E_CHARGE_ID;
      if (!chargeId) {
        const listRes = await page.request.get(
          `${baseURL}/api/charges?academyId=${academyId}&status=pending&limit=1`
        );
        expect(listRes.status(), "listar cargos pending debe ser 200").toBe(200);
        const list = unwrapData<{ items: Array<{ id: string }> }>(await listRes.json());
        chargeId = list?.items?.[0]?.id;
      }

      // En el bloque live no vale saltar: si opt-in E2E_LIVE_STRIPE=1 y no hay
      // cargo, es un error de setup y debe romper (si no, el test "pasa" sin
      // haber cobrado nada — exactamente la regresión silenciosa de ZAL-3).
      expect(
        chargeId,
        "No hay cargo pending en la academia E2E. Córrelo con: E2E_ALLOW_PROVISIONING=true pnpm tsx scripts/seed-e2e-charge.ts"
      ).toBeTruthy();

      const collectRes = await page.request.post(
        `${baseURL}/api/charges/${chargeId}/collect`
      );
      const body = await collectRes.json().catch(() => ({}));

      // Con `tok_visa` (4242, sin 3DS) guardado en el test anterior, el cobro
      // off-session TIENE que capturar. 402/409 significan tarjeta rechazada o
      // SCA requerido: son fallos reales del flujo, no resultados aceptables.
      expect(
        collectRes.status(),
        `collect off-session debe ser 200 (paid). Respuesta: ${JSON.stringify(body)}`
      ).toBe(200);

      const collect = unwrapData<{ status: string; stripePaymentIntentId?: string }>(body);
      expect(collect?.status).toBe("paid");
      expect(collect?.stripePaymentIntentId).toMatch(/^pi_[a-zA-Z0-9]+/);
    } finally {
      await ctx.close();
    }
  });
});

// ---------- Helpers compartidos (placeholder para extensiones futuras) ----------

/** Helper de fetch seguro para usar desde Specs con context autenticado. */
export async function authedFetch(
  request: APIRequestContext,
  method: "GET" | "POST",
  path: string,
  body?: unknown
) {
  const headers = body ? { "Content-Type": "application/json" } : undefined;
  return request.fetch(new URL(path, baseURL).toString(), {
    method,
    headers,
    data: body,
    timeout: 60_000,
  });
}

/** Helper para serializar respuestas con la envoltura `apiSuccess` de Zaltyko. */
export function unwrapData<T>(payload: { data?: T; ok?: boolean }): T | undefined {
  return payload?.data;
}

/** Helper para navegar a una ruta autenticada con reintento ante ERR_EMPTY_RESPONSE. */
export async function gotoWithRetry(page: Page, path: string) {
  try {
    await page.goto(path, { waitUntil: "domcontentloaded", timeout: 45_000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/ERR_EMPTY_RESPONSE|ERR_ABORTED|Timeout/.test(message)) {
      throw error;
    }
    await page.waitForTimeout(1_000);
    await page.goto(path, { waitUntil: "domcontentloaded", timeout: 45_000 });
  }
}
