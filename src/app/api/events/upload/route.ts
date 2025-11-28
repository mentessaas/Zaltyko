import { NextResponse } from "next/server";
import { withTenant } from "@/lib/authz";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { handleApiError } from "@/lib/api-error-handler";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const POST = withTenant(async (request, context) => {
  try {
    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const type = formData.get("type") as string | null;
    const eventId = formData.get("eventId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "FILE_REQUIRED" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "FILE_TOO_LARGE", message: `El archivo excede el tamaño máximo de ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();
    const fileExt = file.name.split(".").pop();
    const timestamp = Date.now();
    const fileName = eventId ? `${eventId}/${timestamp}.${fileExt}` : `${timestamp}.${fileExt}`;
    const bucket = type === "image" ? "events/images" : "events/files";
    const filePath = `${bucket}/${fileName}`;

    // Convertir File a ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { data, error: uploadError } = await supabase.storage
      .from("events")
      .upload(filePath, buffer, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: "UPLOAD_FAILED", message: uploadError.message },
        { status: 500 }
      );
    }

    const { data: { publicUrl } } = supabase.storage
      .from("events")
      .getPublicUrl(filePath);

    return NextResponse.json({ url: publicUrl, path: filePath });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/events/upload", method: "POST" });
  }
});

