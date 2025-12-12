import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { academies } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { verifyAcademyAccess } from "@/lib/permissions";
import { markChecklistItem, markWizardStep } from "@/lib/onboarding";
import { trackEvent } from "@/lib/analytics";

const bodySchema = z.object({
  academyId: z.string().uuid(),
});

export const POST = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  const access = await verifyAcademyAccess(parsed.data.academyId, context.tenantId);
  if (!access.allowed) {
    return NextResponse.json({ error: access.reason ?? "FORBIDDEN" }, { status: 403 });
  }

  const now = new Date();

  await db
    .update(academies)
    .set({
      paymentsConfiguredAt: now,
    })
    .where(eq(academies.id, parsed.data.academyId));

  await markChecklistItem({
    academyId: parsed.data.academyId,
    tenantId: context.tenantId,
    key: "enable_payments",
  });

  await markWizardStep({
    academyId: parsed.data.academyId,
    tenantId: context.tenantId,
    step: "payments",
  });

  await trackEvent("payments_configured", {
    academyId: parsed.data.academyId,
    tenantId: context.tenantId,
    userId: context.userId,
  });

  return NextResponse.json({ ok: true, configuredAt: now.toISOString() });
});

