import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { actorConsents, actorPages, athletes, guardianAthletes, guardians, profiles } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

const pageIdSchema = z.string().uuid();

async function isLinkedGuardian(actorPageId: string, userId: string) {
  const [link] = await db
    .select({ id: guardianAthletes.id })
    .from(actorPages)
    .innerJoin(athletes, and(
      eq(athletes.id, actorPages.entityId),
      eq(athletes.tenantId, actorPages.tenantId),
      eq(athletes.academyId, actorPages.academyId)
    ))
    .innerJoin(guardianAthletes, and(
      eq(guardianAthletes.athleteId, athletes.id),
      eq(guardianAthletes.tenantId, athletes.tenantId)
    ))
    .innerJoin(guardians, and(
      eq(guardians.id, guardianAthletes.guardianId),
      eq(guardians.tenantId, athletes.tenantId)
    ))
    .innerJoin(profiles, and(
      eq(profiles.id, guardians.profileId),
      eq(profiles.tenantId, athletes.tenantId)
    ))
    .where(and(
      eq(actorPages.id, actorPageId),
      eq(actorPages.entityType, "athlete"),
      eq(profiles.userId, userId),
      eq(profiles.canLogin, true),
      eq(profiles.isSuspended, false),
      isNull(athletes.deletedAt)
    ))
    .limit(1);
  return Boolean(link);
}

/**
 * POST /api/actor-consents
 * Body: { actorPageId, guardianRelationship, consentScope }
 * Registra consentimiento parental granted. IP+UA capturados para audit.
 * Solo el guardian user_id actual puede firmar.
 */
// @auth-flexible route-guard-reason: getCurrentUser verifies the Supabase session before parsing or validation; authorization follows per handler.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { actorPageId, guardianRelationship, consentScope } = body ?? {};

  if (
    !pageIdSchema.safeParse(actorPageId).success ||
    typeof guardianRelationship !== "string" ||
    typeof consentScope !== "string"
  ) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  if (!["parent", "legal_guardian"].includes(guardianRelationship)) {
    return NextResponse.json({ error: "invalid_relationship" }, { status: 400 });
  }
  if (
    !["public_page", "media_publication", "contact_visibility"].includes(
      consentScope
    )
  ) {
    return NextResponse.json({ error: "invalid_scope" }, { status: 400 });
  }

  if (!(await isLinkedGuardian(actorPageId, user.id))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const ua = req.headers.get("user-agent") ?? "";
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "";

  await db.insert(actorConsents).values({
    actorPageId,
    guardianUserId: user.id,
    guardianRelationship,
    consentScope,
    grantedAt: new Date(),
    ipAddress: ip,
    userAgent: ua,
  });

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/actor-consents
 * Body: { actorPageId, reason }
 * Revoca los consents activos del actor_page firmados por el usuario actual.
 * El trigger en DB despublica la página automáticamente.
 */
// @auth-flexible route-guard-reason: getCurrentUser verifies the Supabase session before parsing or validation; authorization follows per handler.
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { actorPageId, reason } = body ?? {};
  if (!pageIdSchema.safeParse(actorPageId).success || typeof reason !== "string" || reason.length > 2000) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  await db
    .update(actorConsents)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(
      and(
        eq(actorConsents.actorPageId, actorPageId),
        eq(actorConsents.guardianUserId, user.id),
        isNull(actorConsents.revokedAt)
      )
    );

  return NextResponse.json({ ok: true });
}

/**
 * GET /api/actor-consents?actorPageId=...
 * Lista consents (granted + revoked) para una página.
 */
// @auth-flexible route-guard-reason: getCurrentUser verifies the Supabase session before parsing or validation; authorization follows per handler.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const actorPageId = url.searchParams.get("actorPageId");
  if (!pageIdSchema.safeParse(actorPageId).success) {
    return NextResponse.json({ error: "missing_actorPageId" }, { status: 400 });
  }

  if (!(await isLinkedGuardian(actorPageId!, user.id))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const rows = await db
    .select()
    .from(actorConsents)
    .where(and(
      eq(actorConsents.actorPageId, actorPageId!),
      eq(actorConsents.guardianUserId, user.id)
    ))
    .limit(100);

  return NextResponse.json(rows);
}
