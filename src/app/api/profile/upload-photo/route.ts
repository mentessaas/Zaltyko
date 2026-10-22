import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { randomUUID } from "crypto";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { containsKnownMalware } from "@/lib/uploads/file-security";

// Magic bytes for image validation
const IMAGE_SIGNATURES: Record<string, { bytes: number[]; offset?: number }> = {
  "image/jpeg": { bytes: [0xFF, 0xD8, 0xFF] },
  "image/png": { bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
  "image/webp": { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 }, // RIFF header (WEBP marker checked below)
};

/**
 * Validates image by checking magic bytes (file signature)
 */
async function validateImageMagicBytes(file: File, expectedType: string): Promise<boolean> {
  const normalizedType = expectedType === "image/jpg" ? "image/jpeg" : expectedType;
  const signature = IMAGE_SIGNATURES[normalizedType];
  if (!signature) return false;

  try {
    const buffer = await file.slice(0, 64).arrayBuffer();
    const bytes = new Uint8Array(buffer);

    const offset = signature.offset || 0;
    for (let i = 0; i < signature.bytes.length; i++) {
      if (bytes[offset + i] !== signature.bytes[i]) {
        return false;
      }
    }
    if (normalizedType === "image/webp") {
      // RIFF alone also identifies AVI/WAV; require the WEBP container marker.
      const marker = String.fromCharCode(...bytes.slice(8, 12));
      return marker === "WEBP";
    }
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = await createClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return apiError("UNAUTHORIZED", "No autorizado", 401);
    }

    const formData = await request.formData();
    const fd = formData as unknown as { get(name: string): unknown };
    const file = fd.get("file") as File | null;

    if (!file) {
      return apiError("FILE_REQUIRED", "Archivo requerido", 400);
    }

    // Validar tipo MIME (solo para aceptar el archivo)
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      return apiError("INVALID_FILE_TYPE", "Solo se permiten imágenes JPG, PNG o WebP", 400);
    }

    // Validar tamaño (máximo 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size === 0 || file.size > maxSize) {
      return apiError("FILE_TOO_LARGE", "La imagen no puede ser mayor a 5MB", 400);
    }

    const fileBytes = new Uint8Array(await file.arrayBuffer());
    if (containsKnownMalware(fileBytes)) {
      return apiError("MALWARE_DETECTED", "El archivo fue rechazado por seguridad", 400);
    }

    // Validar magic bytes (contenido real del archivo)
    const isValidImage = await validateImageMagicBytes(file, file.type);
    if (!isValidImage) {
      return apiError("INVALID_FILE_CONTENT", "El archivo no es una imagen válida", 400);
    }

    // Generar nombre único
    const fileExt = file.type === "image/jpeg" || file.type === "image/jpg"
      ? "jpg"
      : file.type === "image/png"
        ? "png"
        : "webp";
    const fileName = `${user.id}/${randomUUID()}.${fileExt}`;
    const filePath = `profile-photos/${fileName}`;

    // Subir a Supabase Storage
    // Storage writes are performed server-side with the service client. The
    // authenticated user client is still used above to establish identity;
    // this avoids relying on a missing/overly broad avatars RLS policy.
    const storage = getSupabaseAdminClient();
    const { data: uploadData, error: uploadError } = await storage.storage
      .from("avatars")
      .upload(filePath, file, {
        cacheControl: "3600",
        contentType: file.type === "image/jpg" ? "image/jpeg" : file.type,
        upsert: false,
      });

    if (uploadError) {
      // Si el bucket no existe, intentar crearlo (requiere permisos de admin)
      if (uploadError.message.includes("Bucket not found")) {
        return apiError("STORAGE_NOT_CONFIGURED", "El almacenamiento de imágenes no está configurado", 500);
      }
      return apiError("UPLOAD_FAILED", uploadError.message, 500);
    }

    // Obtener URL pública
    const {
      data: { publicUrl },
    } = storage.storage.from("avatars").getPublicUrl(filePath);

    return apiSuccess({
      url: publicUrl,
      path: filePath,
    });
  } catch (error: unknown) {
    logger.error("Error uploading photo:", error);
    return apiError("INTERNAL_ERROR", "Error interno del servidor", 500);
  }
}
