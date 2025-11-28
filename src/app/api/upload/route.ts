import { NextResponse } from "next/server";
import { withTenant } from "@/lib/authz";
import { uploadFile, generateFilePath } from "@/lib/supabase/storage-helpers";

export const POST = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const profile = context.profile;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const academyId = formData.get("academyId") as string;
    const folder = formData.get("folder") as string || "uploads";

    if (!file) {
      return NextResponse.json({ error: "FILE_REQUIRED" }, { status: 400 });
    }

    if (!academyId) {
      return NextResponse.json({ error: "ACADEMY_ID_REQUIRED" }, { status: 400 });
    }

    // Validar tipo de archivo
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "INVALID_FILE_TYPE", message: "Solo se permiten imágenes (JPEG, PNG, GIF, WEBP)" },
        { status: 400 }
      );
    }

    // Validar tamaño (máximo 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "FILE_TOO_LARGE", message: "El archivo no puede ser mayor a 5MB" },
        { status: 400 }
      );
    }

    // Generar ruta única para el archivo
    const fileName = generateFilePath(context.tenantId, academyId, folder, file.name);

    // Subir a Supabase Storage
    const { url, path } = await uploadFile(file, fileName, {
      contentType: file.type,
      upsert: false,
    });

    return NextResponse.json({
      ok: true,
      url,
      path,
    });
  } catch (error: any) {
    console.error("Error in upload endpoint:", error);
    return NextResponse.json(
      { error: "UPLOAD_FAILED", message: error.message },
      { status: 500 }
    );
  }
});

