import { NextResponse } from "next/server";
import { z } from "zod";

import { withTenant } from "@/lib/authz";
import { getChecklist } from "@/lib/onboarding";
import { CHECKLIST_DEFINITIONS } from "@/lib/onboarding-utils";

const querySchema = z.object({
  academyId: z.string().uuid().optional(),
});

export const GET = withTenant(async (request, context) => {
  const url = new URL(request.url);
  const params = querySchema.safeParse(Object.fromEntries(url.searchParams));

  if (!params.success) {
    return NextResponse.json({ error: "INVALID_QUERY" }, { status: 400 });
  }

  const academyId = params.data.academyId ?? context.profile.activeAcademyId ?? null;
  if (!academyId) {
    return NextResponse.json({ error: "ACADEMY_REQUIRED" }, { status: 400 });
  }

  const items = await getChecklist(academyId);
  const completed = items.filter((item) => item.status === "completed").length;
  const total = CHECKLIST_DEFINITIONS.length;

  return NextResponse.json({
    items,
    summary: {
      completed,
      total,
    },
  });
});

