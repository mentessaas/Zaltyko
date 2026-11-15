import { sql } from "drizzle-orm";

import { db } from "@/db";
import type { DatabaseClient } from "@/lib/db-transactions";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export interface SaasOwnerScope {
  organizationId: string;
  organizationName: string;
  countryCode: string;
  memberId: string;
  userId: string;
}

/** Commercial actions are reserved for an active Owner membership. */
export async function resolveSaasOwnerScope(input: {
  userId: string;
  organizationId: string;
  tx?: DatabaseClient;
}): Promise<SaasOwnerScope> {
  const client = input.tx ?? db;
  const result = await client.execute(sql`
    select o.id as organization_id, o.name as organization_name,
           o.country_code as country_code,
           m.id as member_id, m.role
    from zaltyko.organization_members m
    inner join zaltyko.organizations o
      on o.id = m.organization_id
    where m.organization_id = ${input.organizationId}::uuid
      and m.user_id = ${input.userId}::uuid
      and m.status = 'active'
    limit 1
  `);
  const membership = result.rows[0] as
    | {
        organization_id: string;
        organization_name: string;
        country_code: string;
        member_id: string;
        role: string;
      }
    | undefined;

  // Foreign organizations and organizations without an active membership are
  // deliberately indistinguishable to callers.
  if (!membership) {
    throw new OperationalError(
      "NOT_FOUND",
      "Academia no encontrada",
      404
    );
  }
  if (membership.role !== "owner") {
    throw new OperationalError(
      "FORBIDDEN",
      "Solo la dirección de la academia puede gestionar la suscripción",
      403
    );
  }

  return {
    organizationId: membership.organization_id,
    organizationName: membership.organization_name,
    countryCode: membership.country_code,
    memberId: membership.member_id,
    userId: input.userId,
  };
}

/**
 * Email de la cuenta (auth.users) del Owner que contrata. Solo sirve para
 * prellenar el contacto del Customer de Stripe: nunca llega del navegador.
 */
export async function resolveOwnerAccountEmail(
  userId: string,
  tx?: DatabaseClient
): Promise<string | null> {
  const client = tx ?? db;
  const result = await client.execute(sql`
    select btrim(email) as email
    from auth.users
    where id = ${userId}::uuid
      and email is not null
      and btrim(email) <> ''
    limit 1
  `);
  const row = result.rows[0] as { email?: unknown } | undefined;
  return typeof row?.email === "string" ? row.email : null;
}

export function hasSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
