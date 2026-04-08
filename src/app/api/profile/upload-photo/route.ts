import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { randomUUID } from "crypto";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";

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

    // Validar tipo de archivo
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      return apiError("INVALID_FILE_TYPE", "Solo se permiten imágenes JPG, PNG o WebP", 400);
    }

    // Validar tamaño (máximo 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return apiError("FILE_TOO_LARGE", "La imagen no puede ser mayor a 5MB", 400);
    }

    // Generar nombre único
    const fileExt = file.name.split(".").pop();
    const fileName = `${user.id}/${randomUUID()}.${fileExt}`;
    const filePath = `profile-photos/${fileName}`;

    // Subir a Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, file, {
        cacheControl: "3600",
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
    } = supabase.storage.from("avatars").getPublicUrl(filePath);

    return apiSuccess({
      url: publicUrl,
      path: filePath,
    });
  } catch (error: any) {
    logger.error("Error uploading photo:", error);
    return apiError("INTERNAL_ERROR", error.message, 500);
  }
}
