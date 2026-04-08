import { withTenant } from "@/lib/authz";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { handleApiError } from "@/lib/api-error-handler";
import { apiSuccess, apiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const POST = withTenant(async (request, context) => {
  try {
    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant required", 400);
    }

    const formData = await request.formData();
    const fd = formData as unknown as { get(name: string): unknown };
    const file = fd.get("file") as File | null;
    const type = fd.get("type") as string | null;
    const eventId = fd.get("eventId") as string | null;

    if (!file) {
      return apiError("FILE_REQUIRED", "File required", 400);
    }

    if (file.size > MAX_FILE_SIZE) {
      return apiError("FILE_TOO_LARGE", `El archivo excede el tamaño máximo de ${MAX_FILE_SIZE / 1024 / 1024}MB`, 400);
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
      return apiError("UPLOAD_FAILED", uploadError.message, 500);
    }

    const { data: { publicUrl } } = supabase.storage
      .from("events")
      .getPublicUrl(filePath);

    return apiSuccess({ url: publicUrl, path: filePath });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/events/upload", method: "POST" });
  }
});

