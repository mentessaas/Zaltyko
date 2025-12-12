import { getSupabaseAdminClient } from "./admin";

/**
 * Sube un archivo a Supabase Storage
 */
export async function uploadFile(
  file: File | Buffer,
  path: string,
  options?: {
    contentType?: string;
    upsert?: boolean;
  }
): Promise<{ url: string; path: string }> {
  const supabase = getSupabaseAdminClient();

  const fileBuffer = file instanceof File ? await file.arrayBuffer() : file;
  const fileBytes = new Uint8Array(fileBuffer);

  const { data, error } = await supabase.storage
    .from("uploads")
    .upload(path, fileBytes, {
      contentType: options?.contentType || "application/octet-stream",
      upsert: options?.upsert || false,
    });

  if (error) {
    throw new Error(`Error uploading file: ${error.message}`);
  }

  // Obtener URL pública
  const { data: urlData } = supabase.storage.from("uploads").getPublicUrl(path);

  return {
    url: urlData.publicUrl,
    path: data.path,
  };
}

/**
 * Elimina un archivo de Supabase Storage
 */
export async function deleteFile(path: string): Promise<void> {
  const supabase = getSupabaseAdminClient();

  const { error } = await supabase.storage.from("uploads").remove([path]);

  if (error) {
    throw new Error(`Error deleting file: ${error.message}`);
  }
}

/**
 * Obtiene la URL pública de un archivo
 */
export function getPublicUrl(path: string): string {
  const supabase = getSupabaseAdminClient();
  const { data } = supabase.storage.from("uploads").getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Genera una ruta única para un archivo
 */
export function generateFilePath(
  tenantId: string,
  academyId: string,
  folder: string,
  originalFileName: string
): string {
  const fileExt = originalFileName.split(".").pop();
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return `${tenantId}/${academyId}/${folder}/${timestamp}-${random}.${fileExt}`;
}

