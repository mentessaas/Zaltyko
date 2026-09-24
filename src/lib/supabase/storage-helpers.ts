import { getSupabaseAdminClient } from "./admin";
import { safeUploadExtension } from "@/lib/uploads/file-security";
import { randomBytes } from "node:crypto";

/**
 * Sube un archivo a Supabase Storage
 */
export async function uploadFile(
  file: File | Buffer,
  path: string,
  options?: {
    contentType?: string;
    upsert?: boolean;
    bucket?: string;
  }
): Promise<{ url: string; path: string }> {
  const supabase = getSupabaseAdminClient();
  const bucket = options?.bucket ?? "uploads";

  const fileBuffer = file instanceof File ? await file.arrayBuffer() : file;
  const fileBytes = new Uint8Array(fileBuffer);

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, fileBytes, {
      contentType: options?.contentType || "application/octet-stream",
      upsert: options?.upsert || false,
    });

  if (error) {
    throw new Error(`Error uploading file: ${error.message}`);
  }

  // Obtener URL pública
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);

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
 * Recupera la ruta interna de un objeto del bucket `uploads` desde su URL
 * pública. Sirve para limpiar vídeos/fotos creados antes de migrar a URLs
 * firmadas; devuelve null para URLs externas o malformadas.
 */
export function extractUploadPath(value: string): string | null {
  if (!value || !value.startsWith("http")) return null;
  try {
    const pathname = new URL(value).pathname;
    const markers = [
      "/storage/v1/object/public/uploads/",
      "/storage/v1/object/sign/uploads/",
    ];
    const marker = markers.find((candidate) => pathname.includes(candidate));
    if (!marker) return null;
    const index = pathname.indexOf(marker);
    const pathValue = pathname.slice(index + marker.length);
    return pathValue ? decodeURIComponent(pathValue) : null;
  } catch {
    return null;
  }
}

/** Signed, short-lived URL for private files (documents/PII). */
export async function createSignedUrl(path: string, expiresIn = 3600): Promise<string> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.storage.from("uploads").createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) throw new Error(`Error creating signed URL: ${error?.message ?? "unknown"}`);
  return data.signedUrl;
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
  const fileExt = safeUploadExtension(originalFileName, "bin");
  const timestamp = Date.now();
  const random = randomBytes(12).toString("hex");
  return `${tenantId}/${academyId}/${folder}/${timestamp}-${random}.${fileExt}`;
}
