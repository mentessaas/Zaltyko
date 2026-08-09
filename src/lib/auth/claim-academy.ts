/**
 * Claim academy helper — pure logic + DB query.
 *
 * Implementa la pieza del alcance ZAL-137 que faltaba en el árbol actual:
 * dado un email de usuario autenticado, devuelve la academia cuya
 * `contactEmail` matchea (case-insensitive, trimmed). Si no hay match,
 * devuelve `null` (el caller renderiza el formulario create-from-scratch).
 *
 * La función pura `normalizeClaimEmail` está exportada para que se pueda
 * testear sin tocar DB. La query usa el índice dedicado
 * `academies_contact_email_idx` (definido en src/db/schema/academies.ts).
 *
 * Tenant isolation: el caller debe pasar `tenantId` ya resuelto en el
 * contexto del usuario para evitar claim cross-tenant si en el futuro el
 * helper se llama desde un flujo per-tenant.
 */

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { academies } from "@/db/schema";

export interface ClaimableAcademy {
  id: string;
  name: string;
  tenantId: string;
  ownerId: string;
}

export interface FindClaimableAcademyArgs {
  email: string | null | undefined;
  /**
   * Si se setea, el helper filtra también por tenant. Útil para flujos
   * per-tenant en el futuro; hoy siempre se pasa `null` desde onboarding.
   */
  tenantId?: string | null;
}

/**
 * Normalización case-insensitive. Sigue la convención del repo (ver
 * `resolveUserHome`): trim + lowercase. Devuelve string vacío si input
 * no es parseable; el caller trata string vacío como sin match.
 */
export function normalizeClaimEmail(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

/**
 * Devuelve la academia "claimable" para el email dado, o `null` si no hay
 * match. Case-insensitive, ignora whitespace.
 */
export async function findClaimableAcademyByEmail(
  args: FindClaimableAcademyArgs
): Promise<ClaimableAcademy | null> {
  const normalized = normalizeClaimEmail(args.email);
  if (!normalized) return null;

  const conditions = args.tenantId
    ? and(eq(sql`lower(${academies.contactEmail})`, normalized), eq(academies.tenantId, args.tenantId))
    : eq(sql`lower(${academies.contactEmail})`, normalized);

  const [row] = await db
    .select({
      id: academies.id,
      name: academies.name,
      tenantId: academies.tenantId,
      ownerId: academies.ownerId,
    })
    .from(academies)
    .where(conditions)
    .limit(1);

  return row ?? null;
}