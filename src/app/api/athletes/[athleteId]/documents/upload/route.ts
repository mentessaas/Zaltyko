import { and, eq, isNull } from "drizzle-orm";

import { athletes } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { authorizeAthleteResource } from "@/lib/authz/resource-scope";
import { apiError, apiSuccess } from "@/lib/api-response";
import { handleApiError } from "@/lib/api-error-handler";
import { withTransaction } from "@/lib/db-transactions";
import { assertAcademyOperationalWritable, lockAcademyOperationalWrites } from "@/lib/limits";
import { deleteFile, generateFilePath, uploadFile } from "@/lib/supabase/storage-helpers";
import { DOCUMENT_UPLOADS, validateUpload } from "@/lib/uploads/file-security";
import { logger } from "@/lib/logger";
import { verifyAcademyAccess } from "@/lib/permissions";
import { z } from "zod";

export const dynamic = "force-dynamic";

/** Uploads the bytes first; metadata is persisted by the documents POST route. */
export const POST = withTenant(async (request, context) => {
  let uploadedPath: string | null = null;
  try {
    const athleteId = (context.params as { athleteId?: string } | undefined)?.athleteId;
    if (!athleteId) return apiError("ATHLETE_ID_REQUIRED", "Athlete ID is required", 400);
    if (!context.tenantId) return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);

    const scope = await authorizeAthleteResource({ context, athleteId });
    if (!scope.allowed) return apiError(scope.reason ?? "ATHLETE_ACCESS_DENIED", "Athlete not found", 404);

    const formData = await request.formData();
    const file = formData.get("file");
    const academyId = z.guid().safeParse(formData.get("academyId"));
    if (!academyId.success) return apiError("ACADEMY_ID_REQUIRED", "Academy ID is required", 400);
    const academyAccess = await verifyAcademyAccess(academyId.data, context.tenantId);
    if (!academyAccess.allowed) return apiError("ACADEMY_ACCESS_DENIED", "Academy access denied", 403);
    // The academy comes from the form because this endpoint returns a storage
    // path. Never allow a valid tenant user to upload an athlete's document
    // under a different academy prefix.
    if (scope.resource?.academyId !== academyId.data) {
      return apiError("ACADEMY_ATHLETE_MISMATCH", "Athlete does not belong to this academy", 404);
    }
    if (!(file instanceof File)) return apiError("FILE_REQUIRED", "File is required", 400);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const validation = validateUpload(bytes, file.type, DOCUMENT_UPLOADS);
    if (!validation.ok) {
      const message = validation.code === "FILE_TOO_LARGE"
        ? "El documento no puede superar 10 MB"
        : validation.code === "MALWARE_DETECTED"
          ? "El archivo fue rechazado por seguridad"
          : "Solo se permiten PDF o imágenes válidas (JPEG, PNG, WEBP)";
      return apiError(validation.code, message, 400);
    }

    const path = generateFilePath(context.tenantId, academyId.data, `athletes/${athleteId}/documents`, file.name);
    const uploaded = await withTransaction(async (tx) => {
      await lockAcademyOperationalWrites(tx, academyId.data);
      await assertAcademyOperationalWritable(context.tenantId!, academyId.data, tx);

      const [currentAthlete] = await tx
        .select({ id: athletes.id })
        .from(athletes)
        .where(and(
          eq(athletes.id, athleteId),
          eq(athletes.tenantId, context.tenantId!),
          eq(athletes.academyId, academyId.data),
          isNull(athletes.deletedAt),
        ))
        .limit(1);

      if (!currentAthlete) return null;

      // Hold the academy lock through the external Storage write so a
      // concurrent plan downgrade cannot leave a new object in a read-only
      // academy. If the SQL transaction fails after upload, the catch below
      // compensates by removing the object.
      const result = await uploadFile(file, path, { contentType: file.type, upsert: false });
      uploadedPath = result.path;
      return result;
    });

    if (!uploaded) return apiError("ATHLETE_NOT_FOUND", "Athlete not found", 404);
    return apiSuccess({ path: uploaded.path, fileName: file.name, fileSize: file.size, mimeType: file.type });
  } catch (error) {
    if (uploadedPath) {
      try {
        await deleteFile(uploadedPath);
      } catch (cleanupError) {
        logger.error("Failed to clean up athlete document upload after transaction failure", cleanupError);
      }
    }
    logger.error("Athlete document upload failed", error);
    return handleApiError(error, { endpoint: "/api/athletes/[athleteId]/documents/upload", method: "POST" });
  }
});
