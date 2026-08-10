/**
 * NEGATIVE FIXTURE — A3/auth-before-validate
 *
 * Each handler below SHOULD trigger the validate-before-auth gate.
 * The fixture exposes the failure modes that the gate exists to catch:
 *   1. Body parse before any auth — the canonical mistake.
 *   2. `.parse()` on a literal schema before any auth call.
 *   3. Plain inline handler that reads the body without first resolving the
 *      tenant/super-admin.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

declare function resolveUserId(req: Request, ctx: any): Promise<string | null>;

// 1. Body parse before any auth — should trigger.
export const POST = async (request: Request, context: any) => {
  const body = z.object({ name: z.string() }).parse(await request.json());
  // … intentional bug: auth is unreachable from a request without a body,
  // and we never call resolveUserId before parsing.
  if (!body.name) return NextResponse.json({ error: "BAD_NAME" }, { status: 400 });
  // The auth call happens *after* the parse, which is too late.
  const userId = await resolveUserId(request, context);
  if (!userId) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  return NextResponse.json({ ok: true });
};

// 2. Schema-level parse before any auth — should trigger.
const BodySchema = z.object({ name: z.string() });
export const PATCH = async (request: Request) => {
  const body = BodySchema.parse(await request.json());
  return NextResponse.json({ ok: true, body });
};

// 3. Inline export that never calls any auth primitive and parses body first.
export const PUT = async (request: Request) => {
  const data = JSON.parse(await request.text());
  return NextResponse.json({ ok: true, data });
};

export const _noop = [POST, PATCH, PUT];
