import { getSupabaseAdminClient } from "@/lib/supabase/admin";

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
    console.error("Error uploading file:", error);
    throw new Error("Error al subir el archivo");
  }

  // Obtener URL pública
  const { data: { publicUrl } } = supabase.storage
    .from("ticket-attachments")
    .getPublicUrl(fileName);

  return {
    fileName: file.name,
    fileUrl: publicUrl,
    fileType: file.type,
    fileSize: String(file.size),
  };
}

export async function deleteTicketFile(fileUrl: string): Promise<void> {
  const supabase = getSupabaseAdminClient();

  // Extraer nombre del archivo de la URL
  const urlParts = fileUrl.split("/storage/v1/object/public/");
  if (urlParts.length < 2) return;

  const filePath = urlParts[1];

  const { error } = await supabase.storage
    .from("ticket-attachments")
    .remove([filePath]);

  if (error) {
    console.error("Error deleting file:", error);
  }
}
