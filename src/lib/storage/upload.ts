import { createClient } from "@/lib/supabase/client";

export interface UploadResult {
  url: string;
  path: string;
}

/**
 * Sube una imagen al bucket de eventos en Supabase Storage
 */
export async function uploadEventImage(file: File, eventId: string): Promise<UploadResult> {
  const supabase = createClient();
  
  const fileExt = file.name.split(".").pop();
  const fileName = `${eventId}/${Date.now()}.${fileExt}`;
  const filePath = `events/images/${fileName}`;

  const { data, error } = await supabase.storage
    .from("events")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    throw new Error(`Error al subir imagen: ${error.message}`);
  }

  const { data: { publicUrl } } = supabase.storage
    .from("events")
    .getPublicUrl(filePath);

  return {
    url: publicUrl,
    path: filePath,
  };
}

/**
 * Sube un archivo (PDF, DOC, etc.) al bucket de eventos en Supabase Storage
 */
export async function uploadEventFile(file: File, eventId: string): Promise<UploadResult> {
  const supabase = createClient();
  
  const fileExt = file.name.split(".").pop();
  const fileName = `${eventId}/${Date.now()}-${file.name}`;
  const filePath = `events/files/${fileName}`;

  const { data, error } = await supabase.storage
    .from("events")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    throw new Error(`Error al subir archivo: ${error.message}`);
  }

  const { data: { publicUrl } } = supabase.storage
    .from("events")
    .getPublicUrl(filePath);

  return {
    url: publicUrl,
    path: filePath,
  };
}

/**
 * Elimina un archivo del bucket de eventos
 */
export async function deleteEventFile(filePath: string): Promise<void> {
  const supabase = createClient();
  
  const { error } = await supabase.storage
    .from("events")
    .remove([filePath]);

  if (error) {
    throw new Error(`Error al eliminar archivo: ${error.message}`);
  }
}

