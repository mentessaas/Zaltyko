export const dynamic = 'force-dynamic';

import { apiSuccess, apiError } from "@/lib/api-response";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { classWaitingList } from "@/db/schema";
import { handleApiError } from "@/lib/api-error-handler";
import { withTenant } from "@/lib/authz";

export const DELETE = withTenant(async (request, context) => {
  try {
    const params = context.params as { entryId?: string };
    const entryId = params?.entryId;

    if (!entryId) {
      return apiError("ENTRY_ID_REQUIRED", "Entry ID is required", 400);
    }

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
    }

    await db
      .delete(classWaitingList)
      .where(and(eq(classWaitingList.id, entryId), eq(classWaitingList.tenantId, context.tenantId)));

    return apiSuccess({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
});
