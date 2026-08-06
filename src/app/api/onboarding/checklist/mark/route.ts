import { z } from "zod";

import { withTenant } from "@/lib/authz";
import { markChecklistItem } from "@/lib/onboarding";
import { CHECKLIST_KEYS } from "@/lib/onboarding-utils";
import { apiSuccess, apiError } from "@/lib/api-response";

const bodySchema = z.object({
  academyId: z.string().uuid().optional(),
  key: z.enum(CHECKLIST_KEYS),
  status: z.enum(["pending", "completed", "skipped"]).optional(),
});

export const POST = withTenant(async (request, context) => {
  const parsed = bodySchema.safeParse(await request.json());

  if (!parsed.success) {
    return apiError("INVALID_PAYLOAD", "Payload inválido", 400);
  }

  const academyId = parsed.data.academyId ?? context.profile.activeAcademyId ?? null;

  if (!academyId) {
    return apiError("ACADEMY_REQUIRED", "Academy requerido", 400);
  }

  await markChecklistItem({
    academyId,
    key: parsed.data.key,
    tenantId: context.tenantId,
    status: parsed.data.status,
  });

  return apiSuccess({ ok: true });
});
