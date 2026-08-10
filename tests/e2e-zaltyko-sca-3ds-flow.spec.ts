import { expect, test, type Frame, type Page } from "@playwright/test";

import { unwrapData } from "./e2e-zaltyko-stripe-connect-flow.spec";

/**
 * E2E SCA/3DS live — recuperación del reto con tarjeta `4000 0027 6000 3184`.
 *
 * Cierra la condición que el board dejó abierta en ZAL-10: los unit tests de
 * ZAL-410 fijan el contrato (`paymentMethodId` en el 409, sondeo de status),
 * pero *no* ejercitan `confirmCardPayment` contra Stripe ni abren el reto. QA
 * encontró el bug precisamente ahí — 50/50 verde con el reto roto.
 *
 * Esta suite recorre el camino real, con el navegador y contra Stripe test
 * mode, en los dos puntos de entrada que el criterio de aceptación nombra:
 *
 *   - Owner:   `StudentChargesTab` → POST /api/charges/[id]/collect
 *   - Familia: `MyPaymentsWidget`  → POST /api/family/charges/[id]/pay
 *
 * ## Por qué esta tarjeta
 *
 * `4000 0027 6000 3184` ("authenticate always", token `tok_threeDSecureRequired`)
 * exige 3DS en TODAS las transacciones, también off-session. Es la única forma
 * determinista de reproducir la secuencia que rompía:
 *
 *   collectCharge (off_session, confirm) → authentication_required
 *   → Stripe limpia `payment_method` del PI (status requires_payment_method)
 *   → confirmCardPayment(secret)                  → payment_intent_unexpected_state
 *   → confirmCardPayment(secret, {payment_method}) → requires_action → reto → succeeded
 *
 * `tok_visa` (4242) NO sirve: nunca dispara SCA, que es por lo que la suite
 * `e2e-zaltyko-stripe-connect-flow.spec.ts` pasaba con el bug presente.
 *
 * ## Activación (opt-in, nunca corre en CI por defecto)
 *
 *   - E2E_SCA_3DS_FLOW=1          habilita la suite entera. Sin esto, skip limpio.
 *   - E2E_ACADEMY_ID              academia AISLADA con Connect `charges_enabled=true`.
 *   - E2E_OWNER_STORAGE_STATE     sesión owner (`scripts/prepare-e2e-auth.ts` + auth-save).
 *   - E2E_FAMILY_STORAGE_STATE    sesión parent (`scripts/prepare-e2e-family-auth.ts` + auth-save).
 *   - E2E_SCA_OWNER_CHARGE_ID     cargo cobrable para el recorrido owner (opcional).
 *   - E2E_SCA_FAMILY_CHARGE_ID    cargo cobrable para el recorrido familia (opcional).
 *
 * Prerrequisito de webhook: `stripe listen --forward-to
 * http://127.0.0.1:3000/api/stripe/connect/webhook` con
 * `STRIPE_CONNECT_WEBHOOK_SECRET` sincronizado. Sin él, `payment_intent.succeeded`
 * no aterriza y el cargo se queda en `failed` aunque el reto pase — el sondeo de
 * `waitForChargePaid` agota los 5s y el test lo reporta como tal.
 *
 * Runbook completo: `docs/RUNBOOK_E2E_SCA_3DS.md`.
 *
 * ## Contrato anti-falso-verde
 *
 * Dentro del bloque live NO se salta por falta de datos: si opt-in está activo y
 * falta el cargo o la tarjeta, el test rompe con el comando exacto que lo
 * aprovisiona. Un skip silencioso aquí reproduce exactamente la regresión que
 * ZAL-408 destapó.
 */

/** Token de test de Stripe para `4000 0027 6000 3184` (autentica siempre). */
export const SCA_TEST_CARD_TOKEN = "tok_threeDSecureRequired";
/** Últimos 4 dígitos con los que la tarjeta se persiste en `family_stripe_customers`. */
export const SCA_TEST_CARD_LAST4 = "3184";

const flowEnabled = process.env.E2E_SCA_3DS_FLOW === "1";
const academyId = process.env.E2E_ACADEMY_ID;
const ownerStorageState = process.env.E2E_OWNER_STORAGE_STATE;
const familyStorageState = process.env.E2E_FAMILY_STORAGE_STATE;
const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:3000";

const SEED_HINT =
  "E2E_ALLOW_PROVISIONING=true E2E_ACADEMY_ID=<uuid> pnpm tsx scripts/seed-e2e-charge.ts";

/**
 * Pulsa "Complete authentication" en el reto 3DS de Stripe test mode.
 *
 * El reto vive en un árbol de iframes cross-origin anidados que Stripe cambia
 * sin previo aviso (`__privateStripeFrame` → `challengeFrame` → `acsFrame`).
 * En vez de fijar esa jerarquía, recorremos TODOS los frames de la página
 * (`page.frames()` los devuelve recursivamente, también cross-origin) y
 * pulsamos el primero que exponga el botón. Sobrevive a re-anidados de Stripe.
 *
 * @returns `true` si se pulsó el botón; `false` si expiró el plazo.
 */
export async function completeThreeDsChallenge(
  page: Page,
  options: { action?: "complete" | "fail"; timeoutMs?: number } = {}
): Promise<boolean> {
  const { action = "complete", timeoutMs = 45_000 } = options;

  // Stripe etiqueta los botones del ACS de prueba con estos ids estables; el
  // match por texto queda como red de seguridad si los renombran.
  const selector =
    action === "complete"
      ? '#test-source-authorize-3ds, button:has-text("Complete authentication"), button:has-text("Complete")'
      : '#test-source-fail-3ds, button:has-text("Fail authentication"), button:has-text("Fail")';

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      if (frame.isDetached()) continue;
      const button = frame.locator(selector).first();
      // `count()` sobre un frame que se desmonta a mitad lanza; lo tratamos
      // como "este frame no era" y seguimos con el resto.
      const found = await button.count().catch(() => 0);
      if (!found) continue;
      try {
        await button.click({ timeout: 10_000 });
        return true;
      } catch {
        // El frame pudo navegar entre el count() y el click(): reintentamos.
      }
    }
    await page.waitForTimeout(500);
  }
  return false;
}

/** Resuelve un cargo cobrable del academy E2E, o rompe con el comando de seed. */
async function resolvePayableChargeId(
  page: Page,
  explicitId: string | undefined,
  role: "owner" | "family"
): Promise<string> {
  if (explicitId) return explicitId;

  const path =
    role === "owner"
      ? `${baseURL}/api/charges?academyId=${academyId}&status=pending&limit=1`
      : `${baseURL}/api/family/charges?academyId=${academyId}&limit=20`;
  const res = await page.request.get(path);
  const list = unwrapData<{ items?: Array<{ id: string; status?: string }> }>(
    await res.json().catch(() => ({}))
  );
  const payable = (list?.items ?? []).find((c) =>
    role === "owner" ? true : ["pending", "overdue", "failed"].includes(c.status ?? "")
  );

  expect(
    payable?.id,
    `No hay cargo cobrable para el recorrido ${role} en la academia E2E. Siémbralo con: ${SEED_HINT}`
  ).toBeTruthy();
  return payable!.id;
}

test.describe("SCA/3DS live — reto real con 4000 0027 6000 3184", () => {
  test.describe.configure({ mode: "serial", timeout: 240_000 });

  test.beforeAll(() => {
    if (!flowEnabled) {
      test.skip(
        true,
        "Set E2E_SCA_3DS_FLOW=1 para activar el recorrido live de SCA (ZAL-10 / ZAL-410)."
      );
    }
    if (!academyId) {
      test.skip(true, "Falta E2E_ACADEMY_ID — academia E2E con Connect no configurada.");
    }
  });

  // ---------- 1) Alta de la tarjeta que siempre pide 3DS ----------

  test("familia guarda la tarjeta 3DS y completa el reto en el SetupIntent", async ({
    browser,
  }) => {
    test.skip(!familyStorageState, "Falta E2E_FAMILY_STORAGE_STATE.");

    const ctx = await browser.newContext({ storageState: familyStorageState });
    const page = await ctx.newPage();
    try {
      // Stripe.js exige un origen web real para inicializar Connect (ZAL-3).
      await page.goto(`${baseURL}/auth/login`, { waitUntil: "domcontentloaded" });

      const siRes = await page.request.post(
        `${baseURL}/api/family/payment-method/setup-intent`,
        { data: { academyId } }
      );
      expect(siRes.status(), "SetupIntent debe ser 200 contra la academia E2E").toBe(200);
      const si = unwrapData<{
        clientSecret: string;
        publishableKey: string;
        stripeAccountId: string;
      }>(await siRes.json());
      expect(si?.clientSecret).toMatch(/^seti_[a-zA-Z0-9_]+_secret_/);

      // Lanzamos `confirmCardSetup` SIN await: con esta tarjeta Stripe abre el
      // reto y la promesa no resuelve hasta que se completa. Guardamos el
      // resultado en `window` y lo recogemos después de pulsar el botón.
      await page.evaluate(
        async ({ clientSecret, stripeAccountId, publishableKey, cardToken }) => {
          const w = window as Window & {
            Stripe?: unknown;
            __scaSetup?: { status?: string; error?: string; paymentMethodId?: string };
          };
          w.__scaSetup = undefined;

          const StripeCtor = await new Promise<
            (key: string, options: { stripeAccount: string }) => {
              createPaymentMethod: (args: unknown) => Promise<{
                error?: { message?: string };
                paymentMethod?: { id: string };
              }>;
              confirmCardSetup: (
                secret: string,
                data: { payment_method: string }
              ) => Promise<{ error?: { message?: string }; setupIntent?: { status?: string } }>;
            }
          >((resolve, reject) => {
            if (typeof w.Stripe === "function") {
              resolve(w.Stripe as never);
              return;
            }
            const script = document.createElement("script");
            script.src = "https://js.stripe.com/v3/";
            script.onload = () =>
              typeof w.Stripe === "function"
                ? resolve(w.Stripe as never)
                : reject(new Error("Stripe.js no expuso window.Stripe"));
            script.onerror = () => reject(new Error("No se pudo cargar Stripe.js"));
            document.head.appendChild(script);
          });

          const stripe = StripeCtor(publishableKey, { stripeAccount: stripeAccountId });
          const created = await stripe.createPaymentMethod({
            type: "card",
            card: { token: cardToken },
          });
          if (created.error || !created.paymentMethod) {
            w.__scaSetup = { error: created.error?.message ?? "createPaymentMethod sin PM" };
            return;
          }
          const paymentMethodId = created.paymentMethod.id;
          void stripe
            .confirmCardSetup(clientSecret, { payment_method: paymentMethodId })
            .then((result) => {
              w.__scaSetup = {
                status: result.setupIntent?.status,
                error: result.error?.message,
                paymentMethodId,
              };
            });
        },
        {
          clientSecret: si!.clientSecret,
          stripeAccountId: si!.stripeAccountId,
          publishableKey: si!.publishableKey,
          cardToken: SCA_TEST_CARD_TOKEN,
        }
      );

      const challenged = await completeThreeDsChallenge(page);
      expect(
        challenged,
        "El reto 3DS del SetupIntent nunca se abrió — con 4000 0027 6000 3184 es obligatorio."
      ).toBe(true);

      await expect
        .poll(
          () =>
            page.evaluate(
              () =>
                (window as Window & { __scaSetup?: { status?: string } }).__scaSetup ?? null
            ),
          { timeout: 60_000, message: "confirmCardSetup nunca resolvió tras el reto" }
        )
        .not.toBeNull();

      const setup = await page.evaluate(
        () =>
          (window as Window & {
            __scaSetup?: { status?: string; error?: string; paymentMethodId?: string };
          }).__scaSetup!
      );
      expect(setup.error, `confirmCardSetup falló: ${setup.error}`).toBeFalsy();
      expect(setup.status).toBe("succeeded");

      const saveRes = await page.request.post(`${baseURL}/api/family/payment-method`, {
        data: { academyId, paymentMethodId: setup.paymentMethodId },
      });
      expect(saveRes.status(), "guardar la tarjeta 3DS debe ser 200").toBe(200);

      const getRes = await page.request.get(
        `${baseURL}/api/family/payment-method?academyId=${academyId}`
      );
      const stored = unwrapData<{ cardLast4?: string; card?: { last4?: string } }>(
        await getRes.json()
      );
      expect(
        stored?.card?.last4 ?? stored?.cardLast4,
        "La familia debe quedar con la tarjeta 3DS guardada, no con 4242"
      ).toBe(SCA_TEST_CARD_LAST4);
    } finally {
      await ctx.close();
    }
  });

  // ---------- 2) El defecto exacto de QA-ZAL-408, a nivel de contrato HTTP ----------

  test("collect off-session devuelve 409 REQUIRES_ACTION con paymentMethodId", async ({
    browser,
  }) => {
    test.skip(!ownerStorageState, "Falta E2E_OWNER_STORAGE_STATE.");

    const ctx = await browser.newContext({ storageState: ownerStorageState });
    const page = await ctx.newPage();
    try {
      const chargeId = await resolvePayableChargeId(
        page,
        process.env.E2E_SCA_OWNER_CHARGE_ID,
        "owner"
      );

      const res = await page.request.post(`${baseURL}/api/charges/${chargeId}/collect`);
      const body = await res.json().catch(() => ({}));

      expect(
        res.status(),
        `Con la tarjeta 3DS guardada el cobro off-session TIENE que pedir autenticación. Respuesta: ${JSON.stringify(body)}`
      ).toBe(409);
      expect(body?.error).toBe("REQUIRES_ACTION");

      // Este es el bug de ZAL-408 punto 1: sin `paymentMethodId` el cliente
      // llama a confirmCardPayment sin PM y Stripe responde
      // `payment_intent_unexpected_state` — el reto no llega a abrirse nunca.
      expect(body?.details, "El 409 debe traer `details` para poder recuperar").toBeTruthy();
      expect(body.details.clientSecret).toMatch(/^pi_[a-zA-Z0-9_]+_secret_/);
      expect(body.details.paymentIntentId).toMatch(/^pi_[a-zA-Z0-9]+/);
      expect(body.details.stripeAccountId).toMatch(/^acct_[a-zA-Z0-9]+/);
      expect(body.details.publishableKey).toMatch(/^pk_test_/);
      expect(
        body.details.paymentMethodId,
        "Stripe limpia el payment_method del PI al lanzar authentication_required: sin este campo el reto no se puede abrir"
      ).toMatch(/^pm_[a-zA-Z0-9]+/);
    } finally {
      await ctx.close();
    }
  });

  // ---------- 3) Recorrido owner completo por UI ----------

  test("owner: cobrar con tarjeta abre el reto 3DS y el cargo queda pagado", async ({
    browser,
  }) => {
    test.skip(!ownerStorageState, "Falta E2E_OWNER_STORAGE_STATE.");

    const ctx = await browser.newContext({ storageState: ownerStorageState });
    const page = await ctx.newPage();
    try {
      const chargeId = await resolvePayableChargeId(
        page,
        process.env.E2E_SCA_OWNER_CHARGE_ID,
        "owner"
      );

      // `handleCollectCard` pide confirmación con window.confirm antes de cobrar.
      page.on("dialog", (dialog) => void dialog.accept());

      await page.goto(`${baseURL}/app/${academyId}/billing`, {
        waitUntil: "domcontentloaded",
      });

      const collectButton = page
        .getByRole("button", { name: /cobrar/i })
        .first();
      await expect(
        collectButton,
        "No hay botón de cobro visible en /billing — ¿el cargo seed no está listado?"
      ).toBeVisible({ timeout: 30_000 });
      await collectButton.click();

      const challenged = await completeThreeDsChallenge(page);
      expect(
        challenged,
        "El reto 3DS no se abrió desde el dashboard owner — es el fallo que QA reportó en ZAL-408."
      ).toBe(true);

      // El toast distingue el caso feliz ("Cobro realizado", el webhook ya
      // reconcilió) del degradado ("Cobro autenticado", sondeo agotado). Ambos
      // prueban que el reto pasó; solo el primero prueba la reconciliación.
      await expect(page.getByText(/Cobro realizado|Cobro autenticado/)).toBeVisible({
        timeout: 60_000,
      });

      await expect
        .poll(
          async () => {
            const res = await page.request.get(`${baseURL}/api/charges/${chargeId}/status`);
            const body = unwrapData<{ status?: string }>(await res.json().catch(() => ({})));
            return body?.status ?? null;
          },
          {
            timeout: 60_000,
            message:
              "El cargo nunca llegó a `paid`. Comprueba que `stripe listen` esté reenviando payment_intent.succeeded al webhook Connect.",
          }
        )
        .toBe("paid");
    } finally {
      await ctx.close();
    }
  });

  // ---------- 4) Recorrido familia completo por UI ----------

  test("familia: pagar ahora abre el reto 3DS y el cargo queda pagado", async ({
    browser,
  }) => {
    test.skip(!familyStorageState, "Falta E2E_FAMILY_STORAGE_STATE.");

    const ctx = await browser.newContext({ storageState: familyStorageState });
    const page = await ctx.newPage();
    try {
      const chargeId = await resolvePayableChargeId(
        page,
        process.env.E2E_SCA_FAMILY_CHARGE_ID,
        "family"
      );

      await page.goto(`${baseURL}/my-dashboard`, { waitUntil: "domcontentloaded" });

      const payButton = page.getByRole("button", { name: /pagar ahora/i }).first();
      await expect(
        payButton,
        "No hay botón 'Pagar ahora' en el portal de familia — ¿no queda cargo cobrable?"
      ).toBeVisible({ timeout: 30_000 });
      await payButton.click();

      const challenged = await completeThreeDsChallenge(page);
      expect(
        challenged,
        "El reto 3DS no se abrió desde el portal de familia — es el fallo que QA reportó en ZAL-408."
      ).toBe(true);

      await expect
        .poll(
          async () => {
            const res = await page.request.get(
              `${baseURL}/api/family/charges/${chargeId}/status`
            );
            const body = unwrapData<{ status?: string }>(await res.json().catch(() => ({})));
            return body?.status ?? null;
          },
          {
            timeout: 60_000,
            message:
              "El cargo nunca llegó a `paid` desde el portal de familia. Revisa `stripe listen`.",
          }
        )
        .toBe("paid");

      // `MyPaymentsWidget` no debe dejar el error de recuperación visible tras
      // un reto correcto (regresión: "Tu banco pide autenticación...").
      await expect(page.getByText(/Tu banco pide autenticación/)).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });
});

/** Reexport para specs futuras que necesiten atravesar el árbol de iframes. */
export type ThreeDsFrame = Frame;
