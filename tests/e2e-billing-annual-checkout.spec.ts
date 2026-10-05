import Stripe from "stripe";
import { expect, test } from "@playwright/test";

const enabled = process.env.E2E_RUN_ANNUAL_CHECKOUT === "true";
const academyId = process.env.E2E_ACADEMY_ID;
const storageState = process.env.E2E_STORAGE_STATE;
const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:3000";

test.skip(
  !enabled,
  "Annual Stripe Checkout is enabled only in its isolated CI step."
);
test.skip(
  !academyId,
  "Set E2E_ACADEMY_ID to run the annual billing checkout test."
);

if (storageState) {
  test.use({ storageState });
}

test("owner creates and expires a Stripe Test annual Checkout session", async ({
  page,
}) => {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  expect(
    stripeSecretKey,
    "CI must provide its isolated Stripe Test key."
  ).toMatch(/^sk_test_/);
  expect(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY).toMatch(/^pk_test_/);

  const stripe = new Stripe(stripeSecretKey!, {
    apiVersion: "2026-08-26.dahlia",
  });
  let checkoutSessionId: string | undefined;

  try {
    // A previous aborted CI attempt may have created sessions before it could
    // capture their IDs. Clean only open annual Starter sessions for this
    // synthetic academy in Stripe Test.
    const recentTestSessions = await stripe.checkout.sessions.list({
      created: { gte: Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60 },
      limit: 100,
    });
    for (const session of recentTestSessions.data) {
      if (
        session.status === "open" &&
        session.mode === "subscription" &&
        session.client_reference_id === academyId &&
        session.metadata?.planCode === "pro" &&
        session.metadata?.billingInterval === "year"
      ) {
        await stripe.checkout.sessions.expire(session.id);
      }
    }

    // The API session is inspected directly; the browser never enters a payment flow.
    await page.route("https://checkout.stripe.com/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><title>Stripe Test Checkout captured</title>",
      })
    );

    await page.goto(`/app/${academyId}/billing`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page).not.toHaveURL(/\/auth\/login/);
    await expect(
      page.getByRole("heading", { name: "Planes disponibles" })
    ).toBeVisible();

    const plansResponse = await page
      .context()
      .request.get(`${baseURL}/api/billing/plans`);
    expect(plansResponse.ok()).toBe(true);
    const plansPayload = (await plansResponse.json()) as {
      data?: Array<{
        code: string;
        currency: string;
        stripeAnnualPriceId: string | null;
        annualPriceEur: number | null;
      }>;
    };
    const starterPlan = plansPayload.data?.find((plan) => plan.code === "pro");
    expect(starterPlan?.stripeAnnualPriceId).toBeTruthy();
    expect(starterPlan?.annualPriceEur).toBeGreaterThan(0);

    const starterCard = page
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "Starter" }) })
      .first();
    await page.getByRole("button", { name: /Anual/ }).click();
    await expect(starterCard).toContainText("/ año");
    const selectPlanButton = starterCard.getByRole("button", {
      name: "Seleccionar",
    });
    await expect(
      selectPlanButton,
      "The synthetic owner must not have a managed subscription that redirects to the portal."
    ).toBeEnabled();

    type CheckoutCapture = {
      status: number;
      requestBody: unknown;
      payload: unknown;
    };
    let resolveCheckoutCapture!: (capture: CheckoutCapture) => void;
    let rejectCheckoutCapture!: (error: unknown) => void;
    const checkoutCapturePromise = new Promise<CheckoutCapture>(
      (resolve, reject) => {
        resolveCheckoutCapture = resolve;
        rejectCheckoutCapture = reject;
      }
    );
    await page.route("**/api/billing/checkout", async (route) => {
      try {
        const response = await route.fetch();
        const payload: unknown = await response.json();
        const capture = {
          status: response.status(),
          requestBody: route.request().postDataJSON(),
          payload,
        };
        await route.fulfill({ response, body: JSON.stringify(payload) });
        resolveCheckoutCapture(capture);
      } catch (error) {
        rejectCheckoutCapture(error);
        await route.continue().catch(() => undefined);
      }
    });
    await selectPlanButton.click();
    const checkoutCapture = await checkoutCapturePromise;
    expect(checkoutCapture.status).toBe(200);
    expect(checkoutCapture.requestBody).toMatchObject({
      academyId,
      planCode: "pro",
      billingInterval: "year",
    });

    const checkoutPayload = checkoutCapture.payload as {
      data?: { checkoutUrl?: string };
    };
    const checkoutUrl = checkoutPayload.data?.checkoutUrl;
    expect(checkoutUrl).toBeTruthy();
    const parsedCheckoutUrl = new URL(checkoutUrl!);
    expect(parsedCheckoutUrl.hostname).toBe("checkout.stripe.com");
    checkoutSessionId =
      parsedCheckoutUrl.pathname.match(/cs_test_[A-Za-z0-9]+/)?.[0];
    expect(checkoutSessionId).toBeTruthy();

    const session = await stripe.checkout.sessions.retrieve(checkoutSessionId!);
    expect(session.livemode).toBe(false);
    expect(session.status).toBe("open");
    expect(session.mode).toBe("subscription");
    expect(session.client_reference_id).toBe(academyId);
    expect(session.metadata).toMatchObject({
      planCode: "pro",
      billingInterval: "year",
    });

    const lineItems = await stripe.checkout.sessions.listLineItems(
      checkoutSessionId!,
      { limit: 5 }
    );
    expect(lineItems.data).toHaveLength(1);
    expect(lineItems.data[0].price?.id).toBe(starterPlan!.stripeAnnualPriceId);

    const price = await stripe.prices.retrieve(
      starterPlan!.stripeAnnualPriceId!
    );
    expect(price.active).toBe(true);
    expect(price.livemode).toBe(false);
    expect(price.currency).toBe(starterPlan!.currency);
    expect(price.unit_amount).toBe(starterPlan!.annualPriceEur);
    expect(price.recurring?.interval).toBe("year");
  } finally {
    if (checkoutSessionId) {
      const session =
        await stripe.checkout.sessions.retrieve(checkoutSessionId);
      if (session.status === "open") {
        const expired =
          await stripe.checkout.sessions.expire(checkoutSessionId);
        expect(expired.status).toBe("expired");
      }
    }
  }
});
