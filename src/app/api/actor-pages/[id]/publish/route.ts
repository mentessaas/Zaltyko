import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { actorPages, auditLogs } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canEditActorPage } from "@/lib/actor-pages/permissions";
import { evaluateAthleteConsent } from "@/lib/actor-pages/consent";

/**
 * POST /api/actor-pages/[id]/publish
 * Body: { action: 'publish' | 'unpublish' }
 *
 * Reglas:
 *   - atleta <13 → 403 bloqueado por política (no publicable)
 *   - atleta 13-17 → 409 requires_consent si no hay granted active
 *   - blocked_at → 403 blocked_by_zaltyko
 *   - soft-delete (blockedReason='deleted_by_owner') → 410 gone
 *
 * Audit log: cada publish/unpublish queda registrado en audit_logs.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [row] = await db
    .select()
    .from(actorPages)
    .where(eq(actorPages.id, params.id))
    .limit(1);

  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const isOwner = await canEditActorPage(user, row);
  if (!isOwner) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (row.blockedReason === "deleted_by_owner") {
    return NextResponse.json({ error: "gone" }, { status: 410 });
  }

  const body = await req.json().catch(() => ({}));
  const action = body?.action as "publish" | "unpublish" | undefined;

  if (action !== "publish" && action !== "unpublish") {
    return NextResponse.json(
      { error: "invalid_action", detail: "action must be 'publish' or 'unpublish'" },
      { status: 400 }
    );
  }

  // Reglas duras por tipo de actor (GDPR-K + COPPA)
  if (action === "publish") {
    if (row.blockedAt) {
      return NextResponse.json(
        { error: "blocked_by_zaltyko", detail: row.blockedReason ?? "blocked" },
        { status: 403 }
      );
    }
    if (row.entityType === "athlete") {
      const decision = await evaluateAthleteConsent(row.entityId);
      if (!decision.canPublish) {
        const status = decision.requiresGuardianConsent ? 409 : 403;
        return NextResponse.json(
          { error: "consent_required", detail: decision.reason },
          { status }
        );
      }
    }
    await db
      .update(actorPages)
      .set({ publicVisible: true, publishedAt: new Date(), updatedAt: new Date() })
      .where(eq(actorPages.id, params.id));
  } else {
    await db
      .update(actorPages)
      .set({ publicVisible: false, publishedAt: null, updatedAt: new Date() })
      .where(eq(actorPages.id, params.id));
  }

  // Audit log
  await db.insert(auditLogs).values({
    tenantId: row.tenantId ?? null,
    userId: user.id,
    userEmail: null,
    action: action === "publish" ? "actor_page.publish" : "actor_page.unpublish",
    module: "actor_pages",
    resourceType: "actor_page",
    resourceId: row.id,
    resourceName: row.displayName,
    description: `${action} actor_page ${row.entityType}:${row.entityId} (${row.publicSlug})`,
    status: "success",
  });

  return NextResponse.json({ ok: true, action });
}
