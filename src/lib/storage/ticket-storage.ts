import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_FILE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
];

export interface UploadedFile {
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: string;
}

export async function uploadTicketFile(
  file: File,
  ticketId: string,
  userId: string
): Promise<UploadedFile | null> {
  const supabase = getSupabaseAdminClient();

  // Validar tipo de archivo
  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    throw new Error(`Tipo de archivo no permitido: ${file.type}`);
  }

  // Validar tamaño
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`El archivo excede el tamaño máximo de ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }

  // Generar nombre único
  const timestamp = Date.now();
  const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
  const fileName = `${ticketId}/${timestamp}-${userId.slice(0, 8)}-${cleanFileName}`;

  // Convertir archivo a buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Subir a storage
  const { data, error } = await supabase.storage
    .from("ticket-attachments")
    .upload(fileName, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    logger.error("Error uploading file:", error);
    throw new Error("Error al subir el archivo");
  }

  return {
    fileName: file.name,
    // El bucket es privado: persistimos una referencia estable y la página
    // autorizada genera una URL firmada en cada lectura.
    fileUrl: `storage://ticket-attachments/${fileName}`,
    fileType: file.type,
    fileSize: String(file.size),
  };
}

export async function deleteTicketFile(fileUrl: string): Promise<void> {
  const supabase = getSupabaseAdminClient();

  const privateMarker = "storage://ticket-attachments/";
  const filePath = fileUrl.startsWith(privateMarker)
    ? fileUrl.slice(privateMarker.length)
    : fileUrl.split("/storage/v1/object/public/ticket-attachments/")[1];
  if (!filePath) return;

  const { error } = await supabase.storage
    .from("ticket-attachments")
    .remove([filePath]);

  if (error) {
    logger.error("Error deleting file:", error);
  }
}
