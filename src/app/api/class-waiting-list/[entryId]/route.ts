export const dynamic = 'force-dynamic';

import { apiSuccess, apiError } from "@/lib/api-response";
import { eq } from "drizzle-orm";

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

    await db
      .delete(classWaitingList)
      .where(eq(classWaitingList.id, entryId));

    return apiSuccess({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
});
