import { withTenant } from "@/lib/authz";
import { uploadFile, generateFilePath } from "@/lib/supabase/storage-helpers";
import { db } from "@/db";
import { assessmentVideos, athleteAssessments } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api-response";
import { verifyProgressAccess } from "@/lib/progress/service";
import { VIDEO_UPLOADS, validateUpload } from "@/lib/uploads/file-security";

const UploadFieldsSchema = z.object({
  academyId: z.string().uuid(),
  assessmentId: z.string().uuid(),
});

const DeleteQuerySchema = z.object({ id: z.string().uuid() });

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
    if (!validation.ok) {
      return apiError("FILE_TOO_LARGE", "El video no puede ser mayor a 50MB", 400);
    }

    // Generate unique path
    const fileName = generateFilePath(context.tenantId, academyId, "assessment-videos", file.name);

    // Upload to Supabase Storage
    const { url, path } = await uploadFile(file, fileName, {
      contentType: file.type,
      upsert: false,
    });

    // Save to database
    const videoId = crypto.randomUUID();
    await db.insert(assessmentVideos).values({
      id: videoId,
      assessmentId: assessmentId,
      url: url,
      title: file.name.replace(/\.[^/.]+$/, ""),
    });

    return apiSuccess({
      id: videoId,
      url,
      path,
    });
  } catch (error: unknown) {
    logger.error("Error uploading assessment video:", error);
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

    // Find video and verify tenant access
    const [video] = await db
      .select({ id: assessmentVideos.id, assessmentId: assessmentVideos.assessmentId })
      .from(assessmentVideos)
      .where(eq(assessmentVideos.id, videoId))
      .limit(1);

    if (!video) {
      return apiError("VIDEO_NOT_FOUND", "Video no encontrado", 404);
    }

    // Verify tenant via assessment
    const [assessment] = await db
      .select({
        id: athleteAssessments.id,
        tenantId: athleteAssessments.tenantId,
        academyId: athleteAssessments.academyId,
        athleteId: athleteAssessments.athleteId,
      })
      .from(athleteAssessments)
      .where(and(eq(athleteAssessments.id, video.assessmentId), eq(athleteAssessments.tenantId, context.tenantId)))
      .limit(1);

    if (!assessment) {
      return apiError("FORBIDDEN", "No tienes acceso a este video", 403);
    }
    const scope = await verifyProgressAccess({
      tenantId: context.tenantId,
      academyId: assessment.academyId,
      athleteId: assessment.athleteId,
      profile: context.profile,
    });
    if (!scope.allowed) {
      return apiError(scope.reason ?? "FORBIDDEN", "No tienes acceso a este video", 403);
    }

    // Delete from database
    await db.delete(assessmentVideos).where(eq(assessmentVideos.id, videoId));

    return apiSuccess({ success: true });
  } catch (error: unknown) {
    logger.error("Error deleting assessment video:", error);
    return apiError("DELETE_FAILED", "Error al eliminar el video", 500);
  }
});
