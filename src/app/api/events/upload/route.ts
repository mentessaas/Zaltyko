import { withTenant } from "@/lib/authz";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { events } from "@/db/schema";
import { handleApiError } from "@/lib/api-error-handler";
import { apiSuccess, apiError } from "@/lib/api-response";
import { uploadEventStorageObject } from "@/lib/supabase/admin-operations";
import { containsKnownMalware, matchesMagicBytes } from "@/lib/uploads/file-security";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";
// @service-role storage:events-upload. Required because event media is written to a server-owned bucket.

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

    if (eventId) {
      const parsedEventId = z.string().uuid().safeParse(eventId);
      if (!parsedEventId.success) {
        return apiError("INVALID_EVENT_ID", "El evento no es válido", 400);
      }
      const [event] = await db
        .select({ id: events.id })
        .from(events)
        .where(and(eq(events.id, eventId), eq(events.tenantId, context.tenantId)))
        .limit(1);
      if (!event) {
        return apiError("EVENT_NOT_FOUND", "No tienes acceso a este evento", 404);
      }
    }

    if (file.size > MAX_FILE_SIZE) {
      return apiError("FILE_TOO_LARGE", `El archivo excede el tamaño máximo de ${MAX_FILE_SIZE / 1024 / 1024}MB`, 400);
    }

    if (type !== "image" && type !== "file") {
      return apiError("INVALID_FILE_TYPE", "Tipo de archivo no permitido", 400);
    }

    // Event images are public content: validate both the declared MIME and
    // the actual file signature before writing to Storage. This prevents a
    // renamed executable/HTML file from being served as an image.
    if (type === "image") {
      const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
      if (!allowedImageTypes.has(file.type)) {
        return apiError("INVALID_FILE_TYPE", "Solo se permiten imágenes JPG, PNG, GIF o WebP", 400);
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (containsKnownMalware(bytes) || !matchesMagicBytes(bytes, file.type)) {
        return apiError("INVALID_FILE_CONTENT", "El archivo no es una imagen válida", 400);
      }
    } else {
      const allowedDocumentTypes = new Set([
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ]);
      if (!allowedDocumentTypes.has(file.type)) {
        return apiError("INVALID_FILE_TYPE", "Solo se permiten documentos PDF, DOC o DOCX", 400);
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const isOleDocument = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
      const isZipDocument = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
      const validSignature = file.type === "application/pdf"
        ? matchesMagicBytes(bytes, file.type)
        : file.type === "application/msword" ? isOleDocument : isZipDocument;
      if (containsKnownMalware(bytes) || !validSignature) {
        return apiError("INVALID_FILE_CONTENT", "El archivo no es un documento válido", 400);
      }
    }

    const fileExt = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    // A timestamp alone collides when two coaches upload at once. Keep the
    // human-sortable timestamp but add a UUID suffix for collision safety.
    const uniqueName = `${Date.now()}-${randomUUID()}.${fileExt}`;
    const fileName = eventId ? `${eventId}/${uniqueName}` : uniqueName;
    const bucket = type === "image" ? "events/images" : "events/files";
    const filePath = `${bucket}/${fileName}`;

    // Convertir File a ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { publicUrl } = await uploadEventStorageObject({
      path: filePath,
      body: buffer,
      contentType: file.type,
    });

    return apiSuccess({ url: publicUrl, path: filePath });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/events/upload", method: "POST" });
  }
});
