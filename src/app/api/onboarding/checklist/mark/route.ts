import { NextResponse } from "next/server";
import { z } from "zod";

import { withTenant } from "@/lib/authz";
import { markChecklistItem } from "@/lib/onboarding";
import { CHECKLIST_KEYS } from "@/lib/onboarding-utils";

const bodySchema = z.object({
  academyId: z.string().uuid().optional(),
  key: z.enum(CHECKLIST_KEYS),
  status: z.enum(["pending", "completed", "skipped"]).optional(),
});

export const POST = withTenant(async (request, context) => {
  const parsed = bodySchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  const academyId = parsed.data.academyId ?? context.profile.activeAcademyId ?? null;

  if (!academyId) {
    return NextResponse.json({ error: "ACADEMY_REQUIRED" }, { status: 400 });
  }

  await markChecklistItem({
    academyId,
    key: parsed.data.key,
    tenantId: context.tenantId,
    status: parsed.data.status,
  });

  return NextResponse.json({ ok: true });
});

