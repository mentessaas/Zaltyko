export const dynamic = 'force-dynamic';

import { apiSuccess, apiError } from "@/lib/api-response";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { classWaitingList } from "@/db/schema";
import { handleApiError } from "@/lib/api-error-handler";
import { withTenant } from "@/lib/authz";
import { authorizeClassResource } from "@/lib/authz/resource-scope";
import { promoteNextWaitingListEntry } from "@/lib/classes/promote-waiting-list";
import { withTransaction } from "@/lib/db-transactions";
import { assertAcademyOperationalWritable, lockAcademyOperationalWrites } from "@/lib/limits";

export const POST = withTenant(async (request, context) => {
  try {
    const entryId = (context.params as { entryId?: string })?.entryId;
    if (!entryId) return apiError("ENTRY_ID_REQUIRED", "Entry ID is required", 400);
    if (!context.tenantId) return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);

    const [entry] = await db
      .select({ id: classWaitingList.id, classId: classWaitingList.classId })
      .from(classWaitingList)
      .where(and(eq(classWaitingList.id, entryId), eq(classWaitingList.tenantId, context.tenantId)))
      .limit(1);
    if (!entry) return apiError("ENTRY_NOT_FOUND", "Entry not found", 404);
    const scope = await authorizeClassResource({ context, classId: entry.classId });
    if (!scope.allowed) return apiError("ENTRY_NOT_FOUND", "Entry not found", 404);

    const promoted = await promoteNextWaitingListEntry(entry.classId, context.tenantId, entry.id);
    if (!promoted) return apiError("PROMOTION_UNAVAILABLE", "No hay plaza disponible para esta entrada", 409);
    return apiSuccess({ ok: true, promoted });
  } catch (error) {
    return handleApiError(error);
  }
});

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

    const [candidate] = await db
      .select({ id: classWaitingList.id, classId: classWaitingList.classId })
      .from(classWaitingList)
      .where(and(eq(classWaitingList.id, entryId), eq(classWaitingList.tenantId, context.tenantId)))
      .limit(1);
    if (!candidate) return apiError("ENTRY_NOT_FOUND", "Entry not found", 404);
    const scope = await authorizeClassResource({ context, classId: candidate.classId });
    if (!scope.allowed || !scope.resource) return apiError("ENTRY_NOT_FOUND", "Entry not found", 404);

    const deleted = await withTransaction(async (tx) => {
      await lockAcademyOperationalWrites(tx, scope.resource!.academyId);
      await assertAcademyOperationalWritable(context.tenantId!, scope.resource!.academyId, tx);
      const [entry] = await tx
      .select({ id: classWaitingList.id, classId: classWaitingList.classId })
      .from(classWaitingList)
      .where(and(eq(classWaitingList.id, entryId), eq(classWaitingList.tenantId, context.tenantId!)))
      .limit(1);
      if (!entry || entry.classId !== candidate.classId) return false;

      await tx
        .delete(classWaitingList)
        .where(and(eq(classWaitingList.id, entryId), eq(classWaitingList.tenantId, context.tenantId!)));
      return true;
    });
    if (!deleted) return apiError("ENTRY_NOT_FOUND", "Entry not found", 404);

    return apiSuccess({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
});
