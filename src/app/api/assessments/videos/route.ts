import { withTenant } from "@/lib/authz";
import { uploadFile, generateFilePath, deleteFile } from "@/lib/supabase/storage-helpers";
import { resolveAssessmentVideoStoragePath } from "@/lib/storage/storage-object-delete-guards";
import { withTransaction } from "@/lib/db-transactions";
import { db } from "@/db";
import { assessmentVideos, athleteAssessments } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api-response";
import { verifyProgressAccess } from "@/lib/progress/service";
import { VIDEO_UPLOADS, validateUpload } from "@/lib/uploads/file-security";

const UploadFieldsSchema = z.object({
  academyId: z.guid(),
  assessmentId: z.guid(),
});

const DeleteQuerySchema = z.object({ id: z.guid() });

export const POST = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
  }

  try {
    const formData = await request.formData();
    const fd = formData as unknown as { get(name: string): unknown };
    const file = fd.get("file") as File;
    const fields = UploadFieldsSchema.safeParse({
      academyId: fd.get("academyId"),
      assessmentId: fd.get("assessmentId"),
    });

    if (!file) {
      return apiError("FILE_REQUIRED", "Archivo requerido", 400);
    }

    if (!fields.success) {
      return apiError("VALIDATION_ERROR", "Academia o evaluación inválida", 400, fields.error.flatten());
    }
    const { academyId, assessmentId } = fields.data;

    // Verify assessment exists and belongs to tenant
    const [assessment] = await db
      .select({
        id: athleteAssessments.id,
        tenantId: athleteAssessments.tenantId,
        academyId: athleteAssessments.academyId,
        athleteId: athleteAssessments.athleteId,
      })
      .from(athleteAssessments)
      .where(and(eq(athleteAssessments.id, assessmentId), eq(athleteAssessments.tenantId, context.tenantId)))
      .limit(1);

    if (!assessment) {
      return apiError("ASSESSMENT_NOT_FOUND", "Evaluación no encontrada", 404);
    }
    if (assessment.academyId !== academyId) {
      return apiError("ASSESSMENT_NOT_FOUND", "Evaluación no encontrada", 404);
    }
    const scope = await verifyProgressAccess({
      tenantId: context.tenantId,
      academyId: assessment.academyId,
      athleteId: assessment.athleteId,
      profile: context.profile,
    });
    if (!scope.allowed) {
      return apiError(scope.reason ?? "FORBIDDEN", "No tienes acceso a esta evaluación", 403);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const validation = validateUpload(bytes, file.type, VIDEO_UPLOADS);
    if (!validation.ok && validation.code === "INVALID_FILE_TYPE") {
      return apiError("INVALID_FILE_TYPE", "Solo se permiten videos (MP4, WebM, MOV)", 400);
    }
    if (!validation.ok && validation.code === "FILE_SIGNATURE_INVALID") {
      return apiError("FILE_SIGNATURE_INVALID", "El contenido no coincide con el tipo declarado", 400);
    }
    if (!validation.ok && validation.code === "MALWARE_DETECTED") {
      return apiError("MALWARE_DETECTED", "El archivo fue rechazado por seguridad", 400);
    }
    if (!validation.ok) {
      return apiError("FILE_TOO_LARGE", "El video no puede ser mayor a 50MB", 400);
    }

    // Bind the Storage key to both the authorized assessment and its row
    // before upload so future cleanup can verify the exact association.
    const videoId = crypto.randomUUID();
    const canonicalAssessmentId = assessment.id;
    const generatedStoragePath = generateFilePath(
      context.tenantId,
      academyId,
      `assessment-videos/${canonicalAssessmentId}/${videoId}`,
      file.name,
    );

    // Upload to Supabase Storage
    const { url, path } = await uploadFile(file, generatedStoragePath, {
      contentType: file.type,
      upsert: false,
    });
    if (path !== generatedStoragePath) {
      throw new Error("Storage returned a path different from the generated key");
    }
    // Save to database
    await db.insert(assessmentVideos).values({
      id: videoId,
      assessmentId: canonicalAssessmentId,
      url: url,
      title: file.name.replace(/\.[^/.]+$/, ""),
    });

    return apiSuccess({
      id: videoId,
      url,
      path,
    });
  } catch (error: unknown) {
    // Upload or insert may have committed before a response was lost. Keep
    // the ID-bound object for later reconciliation; never compensate here.
    logger.error("Error uploading assessment video:", undefined, {
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return apiError("UPLOAD_FAILED", "Error al subir el video", 500);
  }
});

export const DELETE = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
  }

  try {
    const { searchParams } = new URL(request.url);
    const query = DeleteQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!query.success) {
      return apiError("VIDEO_ID_REQUIRED", "Video ID requerido", 400);
    }
    const videoId = query.data.id;

    const deletion = await withTransaction(async (tx) => {
      const [video] = await tx
        .select({ id: assessmentVideos.id, assessmentId: assessmentVideos.assessmentId, url: assessmentVideos.url })
        .from(assessmentVideos)
        .where(eq(assessmentVideos.id, videoId))
        .for("update")
        .limit(1);
      if (!video) return { kind: "not_found" as const };

      const [assessment] = await tx
        .select({
          id: athleteAssessments.id,
          tenantId: athleteAssessments.tenantId,
          academyId: athleteAssessments.academyId,
          athleteId: athleteAssessments.athleteId,
        })
        .from(athleteAssessments)
        .where(and(eq(athleteAssessments.id, video.assessmentId), eq(athleteAssessments.tenantId, context.tenantId!)))
        .for("update")
        .limit(1);
      if (!assessment) return { kind: "forbidden" as const, reason: "FORBIDDEN" };

      const scope = await verifyProgressAccess({
        tenantId: context.tenantId!,
        academyId: assessment.academyId,
        athleteId: assessment.athleteId,
        profile: context.profile,
      });
      if (!scope.allowed) {
        return { kind: "forbidden" as const, reason: scope.reason ?? "FORBIDDEN" };
      }

      const storagePath = resolveAssessmentVideoStoragePath({
        storedUrl: video.url,
        configuredSupabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
        tenantId: assessment.tenantId,
        academyId: assessment.academyId,
        assessmentId: assessment.id,
        videoId: video.id,
      });
      if (!storagePath) return { kind: "unsafe_reference" as const };

      const [deletedVideo] = await tx
        .delete(assessmentVideos)
        .where(and(
          eq(assessmentVideos.id, video.id),
          eq(assessmentVideos.assessmentId, video.assessmentId),
          eq(assessmentVideos.url, video.url),
        ))
        .returning({ id: assessmentVideos.id });
      if (!deletedVideo) return { kind: "changed" as const };

      return { kind: "deleted" as const, storagePath };
    });

    if (deletion.kind === "not_found") {
      return apiError("VIDEO_NOT_FOUND", "Video no encontrado", 404);
    }
    if (deletion.kind === "forbidden") {
      return apiError(deletion.reason, "No tienes acceso a este video", 403);
    }
    if (deletion.kind === "unsafe_reference" || deletion.kind === "changed") {
      return apiError(
        "VIDEO_STORAGE_REFERENCE_UNSAFE",
        "No se ha eliminado nada. La referencia del video no acredita un objeto ligado a esta evaluación.",
        409,
      );
    }

    try {
      await deleteFile(deletion.storagePath);
    } catch (storageError) {
      // Metadata is already deleted; keep the existing success contract and
      // log only a safe error class, never the stored URL or object key.
      logger.warn("Assessment video metadata deleted but storage cleanup failed", {
        errorType: storageError instanceof Error ? storageError.name : typeof storageError,
      });
    }

    return apiSuccess({ success: true });
  } catch (error: unknown) {
    logger.error("Error deleting assessment video:", undefined, {
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return apiError("DELETE_FAILED", "Error al eliminar el video", 500);
  }
});
