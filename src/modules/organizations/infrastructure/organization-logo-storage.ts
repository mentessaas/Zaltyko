import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";
import type { DatabaseClient } from "@/lib/db-transactions";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { validateUpload } from "@/lib/uploads/file-security";

export const ORGANIZATION_LOGO_BUCKET = "organization-logos";
export const ORGANIZATION_LOGO_MAX_BYTES = 1024 * 1024;
export const ORGANIZATION_LOGO_URL_TTL_SECONDS = 10 * 60;

export const ORGANIZATION_LOGO_UPLOADS = {
  "image/jpeg": { maxBytes: ORGANIZATION_LOGO_MAX_BYTES, extension: "jpg" },
  "image/png": { maxBytes: ORGANIZATION_LOGO_MAX_BYTES, extension: "png" },
  "image/webp": { maxBytes: ORGANIZATION_LOGO_MAX_BYTES, extension: "webp" },
} as const;

export const ORGANIZATION_LOGO_UNAVAILABLE_MESSAGE = "El logo del club aún no está disponible";

const organizationLogoPathSchema = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/logo\.(jpg|png|webp)$/iu;

export function isMissingOrganizationLogoColumn(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown; cause?: unknown };
  if (record.code === "42703" && typeof record.message === "string" && /logo_path/iu.test(record.message)) return true;
  return record.cause !== error && isMissingOrganizationLogoColumn(record.cause);
}

export function organizationLogoPath(organizationId: string, extension: string): string {
  if (!/^[0-9a-f-]{36}$/iu.test(organizationId) || !["jpg", "png", "webp"].includes(extension)) {
    throw new Error("Invalid organization logo path");
  }
  return `${organizationId}/logo.${extension}`;
}

export function validateOrganizationLogo(bytes: Uint8Array, contentType: string) {
  return validateUpload(bytes, contentType, ORGANIZATION_LOGO_UPLOADS);
}

export function isOrganizationLogoPath(value: string): boolean {
  return organizationLogoPathSchema.test(value);
}

/** Check the additive candidate before issuing SQL that names its column. */
export async function isOrganizationLogoColumnAvailable(client: DatabaseClient = db): Promise<boolean> {
  const result = await client.execute(sql`
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'zaltyko'
        and table_name = 'organizations'
        and column_name = 'logo_path'
    ) as available
  `);
  return (result.rows[0] as { available?: unknown } | undefined)?.available === true;
}

export async function getOrganizationLogoState(
  organizationId: string,
  client: DatabaseClient = db
): Promise<{ available: boolean; logoPath: string | null }> {
  if (!(await isOrganizationLogoColumnAvailable(client))) return { available: false, logoPath: null };
  const result = await client.execute(sql`
    select logo_path as "logoPath"
    from zaltyko.organizations
    where id = ${organizationId}::uuid
    limit 1
  `);
  return {
    available: true,
    logoPath: (result.rows[0] as { logoPath?: string | null } | undefined)?.logoPath ?? null,
  };
}

export async function setOrganizationLogoPath(
  organizationId: string,
  logoPath: string | null,
  expectedLogoPath: string | null,
  client: DatabaseClient = db
): Promise<boolean> {
  if (!(await isOrganizationLogoColumnAvailable(client))) return false;
  const result = await client.execute(sql`
    update zaltyko.organizations
    set logo_path = ${logoPath}, updated_at = now()
    where id = ${organizationId}::uuid
      and logo_path is not distinct from ${expectedLogoPath}
    returning id
  `);
  return result.rows.length === 1;
}

export async function createOrganizationLogoUrlForOrganization(
  organizationId: string,
  client: DatabaseClient = db
): Promise<string | null> {
  const state = await getOrganizationLogoState(organizationId, client);
  if (!state.available || !state.logoPath || !isOrganizationLogoPath(state.logoPath)) return null;
  return createOrganizationLogoUrl(state.logoPath);
}

export async function uploadOrganizationLogo(
  path: string,
  bytes: Uint8Array,
  contentType: string
): Promise<void> {
  if (!isOrganizationLogoPath(path)) throw new Error("Invalid organization logo path");
  const { error } = await getSupabaseAdminClient()
    .storage
    .from(ORGANIZATION_LOGO_BUCKET)
    .upload(path, bytes, { contentType, cacheControl: "3600", upsert: true });
  if (error) throw new Error("No se ha podido guardar el logo de la academia.");
}

export async function removeOrganizationLogo(path: string): Promise<void> {
  if (!isOrganizationLogoPath(path)) throw new Error("Invalid organization logo path");
  const { error } = await getSupabaseAdminClient()
    .storage
    .from(ORGANIZATION_LOGO_BUCKET)
    .remove([path]);
  if (error) throw new Error("No se ha podido quitar el logo de la academia.");
}

export async function createOrganizationLogoUrl(path: string): Promise<string> {
  if (!isOrganizationLogoPath(path)) throw new Error("Invalid organization logo path");
  const { data, error } = await getSupabaseAdminClient()
    .storage
    .from(ORGANIZATION_LOGO_BUCKET)
    .createSignedUrl(path, ORGANIZATION_LOGO_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) throw new Error("No se ha podido cargar el logo de la academia.");
  return data.signedUrl;
}
