import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { randomUUID } from "crypto";

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = await createClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "FILE_REQUIRED" }, { status: 400 });
    }

    // Validar tipo de archivo
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "INVALID_FILE_TYPE", message: "Solo se permiten imágenes JPG, PNG o WebP" },
        { status: 400 }
      );
    }

    // Validar tamaño (máximo 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "FILE_TOO_LARGE", message: "La imagen no puede ser mayor a 5MB" },
        { status: 400 }
      );
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
        return NextResponse.json(
          {
            error: "STORAGE_NOT_CONFIGURED",
            message: "El almacenamiento de imágenes no está configurado. Contacta al administrador.",
          },
          { status: 500 }
        );
      }
      return NextResponse.json(
        { error: "UPLOAD_FAILED", message: uploadError.message },
        { status: 500 }
      );
    }

    // Obtener URL pública
    const {
      data: { publicUrl },
    } = supabase.storage.from("avatars").getPublicUrl(filePath);

    return NextResponse.json({
      url: publicUrl,
      path: filePath,
    });
  } catch (error: any) {
    console.error("Error uploading photo:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: error.message },
      { status: 500 }
    );
  }
}

