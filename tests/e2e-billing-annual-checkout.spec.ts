import { randomUUID } from "node:crypto";
import { Pool } from "pg";
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

test("owner creates annual Checkout and syncs a signed Stripe Test webhook", async ({
  page,
}) => {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  expect(
    stripeSecretKey,
    "CI must provide its isolated Stripe Test key."
  ).toMatch(/^sk_test_/);
  expect(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY).toMatch(/^pk_test_/);
  expect(
    webhookSecret,
    "CI must provide the isolated Stripe webhook secret."
  ).toMatch(/^whsec_/);

  const stripe = new Stripe(stripeSecretKey!, {
    apiVersion: "2026-08-26.dahlia",
  });
  let checkoutSessionId: string | undefined;
  let databasePool: Pool | undefined;
  let webhookTestCustomerId: string | undefined;
  let webhookTestSubscriptionId: string | undefined;
  let webhookEventId: string | undefined;
  let webhookUserId: string | undefined;
  let previousSubscription: Record<string, unknown> | undefined;
  let subscriptionSnapshotCaptured = false;
  let webhookMutationAttempted = false;

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
      academyId,
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

    const userId = session.metadata?.userId;
    const tenantId = session.metadata?.tenantId;
    if (!userId || !tenantId) {
      throw new Error("Stripe Checkout metadata is missing owner context.");
    }
    webhookUserId = userId;

    const databaseUrl = process.env.DATABASE_URL;
    expect(
      databaseUrl,
      "CI must provide the isolated staging database URL."
    ).toBeTruthy();
    databasePool = new Pool({ connectionString: databaseUrl, max: 1 });
    const existingSubscription = await databasePool.query(
      `select id, user_id, plan_id, status, current_period_end,
              stripe_customer_id, stripe_subscription_id, stripe_price_id,
              cancel_at_period_end, last_stripe_event_id,
              last_stripe_event_created_at, updated_at
         from subscriptions
        where user_id = $1`,
      [userId]
    );
    previousSubscription = existingSubscription.rows[0];
    subscriptionSnapshotCaptured = true;

    const webhookTestRunId = randomUUID();
    const testCustomer = await stripe.customers.create({
      metadata: { e2eTestRunId: webhookTestRunId },
    });
    webhookTestCustomerId = testCustomer.id;
    const incompleteSubscription = await stripe.subscriptions.create(
      {
        customer: testCustomer.id,
        items: [{ price: starterPlan!.stripeAnnualPriceId! }],
        payment_behavior: "default_incomplete",
        metadata: {
          userId,
          tenantId: tenantId!,
          academyId: academyId!,
          planCode: "pro",
          billingInterval: "year",
          e2eTestRunId: webhookTestRunId,
        },
      },
      { idempotencyKey: `e2e-annual-webhook-${webhookTestRunId}` }
    );
    webhookTestSubscriptionId = incompleteSubscription.id;
    expect(incompleteSubscription.livemode).toBe(false);
    expect(incompleteSubscription.status).toBe("incomplete");

    webhookEventId = `evt_e2e_${randomUUID().replaceAll("-", "")}`;
    const webhookEvent = {
      id: webhookEventId,
      object: "event",
      api_version: "2026-08-26.dahlia",
      created: Math.floor(Date.now() / 1000),
      data: { object: incompleteSubscription },
      livemode: false,
      pending_webhooks: 1,
      request: { id: null, idempotency_key: null },
      type: "customer.subscription.created",
    } as Stripe.Event;
    const webhookPayload = JSON.stringify(webhookEvent);
    const signature = stripe.webhooks.generateTestHeaderString({
      payload: webhookPayload,
      secret: webhookSecret!,
    });

    webhookMutationAttempted = true;
    const webhookResponse = await page
      .context()
      .request.post(`${baseURL}/api/stripe/webhook`, {
        data: webhookPayload,
        headers: {
          "content-type": "application/json",
          "stripe-signature": signature,
        },
      });
    expect(webhookResponse.status()).toBe(200);
    await expect(webhookResponse).toBeOK();
    expect(await webhookResponse.json()).toEqual({
      received: true,
      duplicate: false,
    });

    const syncedSubscription = await databasePool.query(
      `select s.status, s.stripe_subscription_id, s.stripe_customer_id,
              s.stripe_price_id, p.code as plan_code
         from subscriptions s
         left join plans p on p.id = s.plan_id
        where s.user_id = $1`,
      [userId]
    );
    expect(syncedSubscription.rows[0]).toMatchObject({
      status: "incomplete",
      stripe_subscription_id: incompleteSubscription.id,
      stripe_customer_id: testCustomer.id,
      stripe_price_id: starterPlan!.stripeAnnualPriceId,
      plan_code: "pro",
    });

    const processedEvent = await databasePool.query(
      `select status, academy_id, tenant_id, livemode
         from billing_events
        where stripe_event_id = $1`,
      [webhookEventId]
    );
    expect(processedEvent.rows[0]).toMatchObject({
      status: "processed",
      academy_id: academyId,
      tenant_id: tenantId,
      livemode: false,
    });

    const duplicateResponse = await page
      .context()
      .request.post(`${baseURL}/api/stripe/webhook`, {
        data: webhookPayload,
        headers: {
          "content-type": "application/json",
          "stripe-signature": signature,
        },
      });
    expect(duplicateResponse.status()).toBe(200);
    expect(await duplicateResponse.json()).toEqual({
      received: true,
      duplicate: true,
    });
  } finally {
    const cleanupErrors: unknown[] = [];
    if (webhookTestSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(webhookTestSubscriptionId);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (webhookTestCustomerId) {
      try {
        await stripe.customers.del(webhookTestCustomerId);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (
      databasePool &&
      webhookUserId &&
      subscriptionSnapshotCaptured &&
      webhookMutationAttempted
    ) {
      try {
        await databasePool.query("begin");
        try {
          await databasePool.query(
            "delete from billing_events where stripe_event_id = $1",
            [webhookEventId]
          );
          if (previousSubscription) {
            await databasePool.query(
              `insert into subscriptions (
                 id, user_id, plan_id, status, current_period_end,
                 stripe_customer_id, stripe_subscription_id, stripe_price_id,
                 cancel_at_period_end, last_stripe_event_id,
                 last_stripe_event_created_at, updated_at
               ) values (
                 $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
               )
               on conflict (user_id) do update set
                 id = excluded.id,
                 plan_id = excluded.plan_id,
                 status = excluded.status,
                 current_period_end = excluded.current_period_end,
                 stripe_customer_id = excluded.stripe_customer_id,
                 stripe_subscription_id = excluded.stripe_subscription_id,
                 stripe_price_id = excluded.stripe_price_id,
                 cancel_at_period_end = excluded.cancel_at_period_end,
                 last_stripe_event_id = excluded.last_stripe_event_id,
                 last_stripe_event_created_at = excluded.last_stripe_event_created_at,
                 updated_at = excluded.updated_at`,
              [
                previousSubscription.id,
                previousSubscription.user_id,
                previousSubscription.plan_id,
                previousSubscription.status,
                previousSubscription.current_period_end,
                previousSubscription.stripe_customer_id,
                previousSubscription.stripe_subscription_id,
                previousSubscription.stripe_price_id,
                previousSubscription.cancel_at_period_end,
                previousSubscription.last_stripe_event_id,
                previousSubscription.last_stripe_event_created_at,
                previousSubscription.updated_at,
              ]
            );
          } else {
            await databasePool.query(
              "delete from subscriptions where user_id = $1",
              [webhookUserId]
            );
          }
          await databasePool.query("commit");
        } catch (error) {
          await databasePool.query("rollback").catch(() => undefined);
          throw error;
        }
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    try {
      await databasePool?.end();
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (checkoutSessionId) {
      try {
        const session =
          await stripe.checkout.sessions.retrieve(checkoutSessionId);
        if (session.status === "open") {
          const expired =
            await stripe.checkout.sessions.expire(checkoutSessionId);
          expect(expired.status).toBe("expired");
        }
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        cleanupErrors,
        "Annual billing E2E cleanup failed."
      );
    }
  }
});
