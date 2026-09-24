import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { resolveDispute } from "@/lib/trust/service";
import { isSuperAdmin } from "@/lib/authz/super-admin";

/**
 * POST /api/marketplace/disputes/[id]/mediate
 * Body: { notes }
 *
 * Solo Zaltyko (super_admin) puede mediar. Resuelve la disputa desde el lado
 * de Zaltyko (asume responsabilidad sobre la transacción).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!(await isSuperAdmin(user.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  if (typeof body.notes !== "string") {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  await resolveDispute({
    disputeId: params.id,
    resolvedBy: "zaltyko",
    notes: body.notes,
  });

  await db.insert(auditLogs).values({
    tenantId: null,
    userId: user.id,
    userEmail: null,
    action: "marketplace.dispute.zaltyko_mediated",
    module: "marketplace_disputes",
    resourceType: "marketplace_dispute",
    resourceId: params.id,
    resourceName: params.id.slice(0, 8),
    description: `Zaltyko mediation applied`,
    status: "success",
  });

  return NextResponse.json({ ok: true });
}
