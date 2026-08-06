import { z } from "zod";

import { withTenant } from "@/lib/authz";
import { uploadFile, generateFilePath } from "@/lib/supabase/storage-helpers";
import { logger } from "@/lib/logger";
import { apiError, apiSuccess } from "@/lib/api-response";
import { verifyAcademyAccess } from "@/lib/permissions";
import { IMAGE_UPLOADS, validateUpload } from "@/lib/uploads/file-security";

const UploadFieldsSchema = z.object({
  academyId: z.string().uuid(),
  folder: z.string().regex(/^[a-zA-Z0-9/_-]+$/).default("uploads"),
});

export const POST = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
  }

  try {
    const formData = await request.formData();
    const fd = formData as unknown as { get(name: string): unknown };
    const file = fd.get("file") as File;
    const parsed = UploadFieldsSchema.safeParse({
      academyId: fd.get("academyId"),
      folder: fd.get("folder") || "uploads",
    });

    if (!parsed.success) {
      return apiError("INVALID_PAYLOAD", "Datos de subida inválidos", 400, parsed.error.issues);
    }

    if (!file) {
      return apiError("FILE_REQUIRED", "File is required", 400);
    }

    const access = await verifyAcademyAccess(parsed.data.academyId, context.tenantId);
    if (!access.allowed) {
      return apiError(access.reason ?? "FORBIDDEN", "Access denied", 403);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const validation = validateUpload(bytes, file.type, IMAGE_UPLOADS);
    if (!validation.ok && validation.code === "INVALID_FILE_TYPE") {
      return apiError("INVALID_FILE_TYPE", "Solo se permiten imágenes (JPEG, PNG, GIF, WEBP)", 400);
    }
    if (!validation.ok && validation.code === "FILE_SIGNATURE_INVALID") {
      return apiError("FILE_SIGNATURE_INVALID", "El contenido no coincide con el tipo declarado", 400);
    }
    if (!validation.ok) {
      return apiError("FILE_TOO_LARGE", "El archivo no puede ser mayor a 5MB", 400);
    }

    // Generar ruta única para el archivo
    const fileName = generateFilePath(context.tenantId, parsed.data.academyId, parsed.data.folder, file.name);

    // Subir a Supabase Storage
    const { url, path } = await uploadFile(file, fileName, {
      contentType: file.type,
      upsert: false,
    });

    return apiSuccess({
      url,
      path,
    });
  } catch (error: unknown) {
    logger.error("Error in upload endpoint:", error);
    return apiError("UPLOAD_FAILED", "Error al subir el archivo", 500);
  }
});
