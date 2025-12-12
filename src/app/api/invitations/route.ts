import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { invitations } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { verifyAcademyAccess } from "@/lib/permissions";
import { markChecklistItem, markWizardStep } from "@/lib/onboarding";
import { trackEvent } from "@/lib/analytics";
import { getAppUrl } from "@/lib/env";

const bodySchema = z.object({
  academyId: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(["coach", "parent"]),
  groupsAssigned: z.array(z.string().uuid()).optional(),
  expiresInDays: z.number().int().min(1).max(30).default(7),
});

export const POST = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  if (!["owner", "admin", "super_admin"].includes(context.profile.role)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  const access = await verifyAcademyAccess(parsed.data.academyId, context.tenantId);
  if (!access.allowed) {
    return NextResponse.json({ error: access.reason ?? "FORBIDDEN" }, { status: 403 });
  }

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000);

  await db.insert(invitations).values({
    id: randomUUID(),
    tenantId: context.tenantId,
    email: parsed.data.email.toLowerCase(),
    role: parsed.data.role,
    token,
    status: "pending",
    invitedBy: context.profile.userId,
    academyIds: [parsed.data.academyId],
    defaultAcademyId: parsed.data.academyId,
    expiresAt,
  });

  if (parsed.data.role === "coach") {
    await markChecklistItem({
      academyId: parsed.data.academyId,
      tenantId: context.tenantId,
      key: "invite_first_coach",
    });
    await markWizardStep({
      academyId: parsed.data.academyId,
      tenantId: context.tenantId,
      step: "coaches",
    });
  }

  const origin = request.headers.get("origin") ?? getAppUrl();
  const invitationUrl =
    parsed.data.role === "parent"
      ? `${origin}/invite/parent?token=${token}`
      : `${origin}/invite/accept?token=${token}`;

  await trackEvent("invitation_sent", {
    academyId: parsed.data.academyId,
    tenantId: context.tenantId,
    userId: context.userId,
    metadata: {
      role: parsed.data.role,
      email: parsed.data.email,
    },
  });

  if (parsed.data.role === "parent") {
    await trackEvent("first_parent_invited", {
      academyId: parsed.data.academyId,
      tenantId: context.tenantId,
      userId: context.userId,
      metadata: {
        email: parsed.data.email,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    invitationUrl,
    expiresAt: expiresAt.toISOString(),
  });
});

