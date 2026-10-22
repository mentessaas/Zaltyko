import { sql } from "drizzle-orm";

import { db } from "@/db";
import type { DatabaseClient } from "@/lib/db-transactions";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export interface SaasOwnerScope {
  organizationId: string;
  organizationName: string;
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
        member_id: string;
        role: string;
      }
    | undefined;

  // Foreign organizations and organizations without an active membership are
  // deliberately indistinguishable to callers.
  if (!membership) {
    throw new OperationalError(
      "NOT_FOUND",
      "Organización no encontrada",
      404
    );
  }
  if (membership.role !== "owner") {
    throw new OperationalError(
      "FORBIDDEN",
      "Solo la persona Owner puede gestionar la suscripción",
      403
    );
  }

  return {
    organizationId: membership.organization_id,
    organizationName: membership.organization_name,
    memberId: membership.member_id,
    userId: input.userId,
  };
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
