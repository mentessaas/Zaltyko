import { randomUUID, createHash } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { DirectoryError, rows } from "./service";
import { sql } from "drizzle-orm";
export async function uploadEvidence(file: File, userId: string) {
  if (file.size > 5242880 || file.size === 0)
    throw new DirectoryError(
      "INVALID_FILE",
      "Utiliza un archivo de hasta 5 MB"
    );
  const bytes = Buffer.from(await file.arrayBuffer());
  const type =
    bytes.subarray(0, 5).toString() === "%PDF-"
      ? "application/pdf"
      : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
        ? "image/jpeg"
        : bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          ? "image/png"
          : null;
  if (!type || type !== file.type)
    throw new DirectoryError("INVALID_FILE", "Solo PDF, JPEG o PNG válidos");
  // Fail closed: a signature is not a malware review. Nothing is stored unless the scanner confirms this exact digest.
  const scanner = process.env.DIRECTORY_FILE_SCAN_URL,
    secret = process.env.DIRECTORY_FILE_SCAN_SECRET;
  if (!scanner || !secret || new URL(scanner).protocol !== "https:")
    throw new DirectoryError(
      "SCAN_NOT_CONFIGURED",
      "La subida segura de documentos todavía no está configurada. Puedes aportar una confirmación desde un canal oficial por escrito.",
      503
    );
  const hash = createHash("sha256").update(bytes).digest("hex");
  const response = await fetch(scanner, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": type,
      "X-Content-SHA256": hash,
    },
    body: bytes,
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok || result.clean !== true || result.sha256 !== hash)
    throw new DirectoryError(
      "FILE_NOT_APPROVED",
      "La revisión de seguridad no aprobó este archivo",
      400
    );
  const path = `${userId}/${randomUUID()}.${type === "application/pdf" ? "pdf" : type === "image/png" ? "png" : "jpg"}`;
  const { error } = await getSupabaseAdminClient()
    .storage.from("directory-evidence")
    .upload(path, bytes, { contentType: type, upsert: false });
  if (error)
    throw new DirectoryError(
      "UPLOAD_FAILED",
      "No se pudo guardar la prueba",
      502
    );
  return { path };
}
export async function evidenceLink(claimId: string) {
  const claim = (
    await rows(
      sql`SELECT evidence_path FROM directory_claims WHERE id=${claimId}::uuid LIMIT 1`
    )
  )[0];
  if (!claim?.evidence_path)
    throw new DirectoryError("NOT_FOUND", "Documento no disponible", 404);
  const { data, error } = await getSupabaseAdminClient()
    .storage.from("directory-evidence")
    .createSignedUrl(String(claim.evidence_path), 60, { download: true });
  if (error || !data)
    throw new DirectoryError(
      "EVIDENCE_UNAVAILABLE",
      "No se pudo abrir el documento",
      502
    );
  return { url: data.signedUrl, expiresIn: 60 };
}
