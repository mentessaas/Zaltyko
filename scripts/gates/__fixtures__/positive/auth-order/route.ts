/**
 * POSITIVE FIXTURE — A3/auth-before-validate
 *
 * Each handler below should pass the gate. We use the same shape as a real
 * Next.js `route.ts` and confirm:
 *   - `withTenant(...)` wrappers pass by construction.
 *   - Inline handlers that resolve auth before parsing the body pass.
 *   - The `@auth-flexible route-guard-reason:` annotation suppresses
 *     intentional cases (e.g. webhooks/cron signature checks).
 */
import { NextResponse } from "next/server";
import { z } from "zod";

const BodySchema = z.object({ name: z.string() });

// Hypothetical auth helpers from the Zaltyko app.
declare function withTenant<T>(handler: T): T;
declare function withBearerTenant<T>(handler: T): T;
declare function withRateLimit<T>(handler: T, options?: any): T;
declare function resolveUserId(req: Request, ctx: any): Promise<string | null>;
declare function verifyWebhookSignature(req: Request, secret: string): Promise<boolean>;

// 1. Outer `withTenant(...)` — pass.
export const POST = withTenant(async (request, context) => {
  const body = z.object({ name: z.string() }).parse(await request.json());
  return NextResponse.json({ ok: true, body });
});

// 2. Inline handler that calls `resolveUserId` before parsing — pass.
export const PUT = async (request: Request, context: any) => {
  const userId = await resolveUserId(request, context);
  if (!userId) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const data = z.object({ name: z.string() }).parse(await request.json());
  return NextResponse.json({ ok: true });
};

// 3. Webhook — auth is signature verification, after body parse; explicit @auth-flexible annotation.
// @auth-flexible route-guard-reason: stripe webhook signature validates the body, not a session
export const StripeWebhook = async (request: Request) => {
  const body = await request.text();
  const ok = await verifyWebhookSignature(request, "stripe-secret");
  if (!ok) return NextResponse.json({ error: "BAD_SIGNATURE" }, { status: 401 });
  return NextResponse.json({ received: true });
};

// 4. Cron — auth runs first inside the handler before any optional body parse.
// @auth-flexible route-guard-reason: cron secret is read from env, then request body parsed
export const CRON = async (request: Request) => {
  if (process.env.CRON_SECRET !== request.headers.get("x-cron-secret")) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  return NextResponse.json({ ok: true, body });
};

// 5. Same-file aliases and nested wrappers must preserve the auth-first
// classification used by the real API routes.
const bearerHandler = withBearerTenant(async (request: Request) => {
  const body = BodySchema.parse(await request.json());
  return NextResponse.json({ ok: true, body });
});
export const HEAD = withRateLimit(bearerHandler);

export const _noop = [POST, PUT, StripeWebhook, CRON, HEAD];
