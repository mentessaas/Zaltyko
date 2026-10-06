import { and, eq } from "drizzle-orm";

import {
  memberLocationScopes,
  organizationMembers,
  type OrganizationMember,
} from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import type { OperationalActor } from "@/modules/shared/application/actor";
import { OperationalError } from "@/modules/shared/domain/operational-error";

type OperationalRole = OrganizationMember["role"];

export async function assertOperationalAccess(
  tx: TransactionClient,
  input: {
    organizationId: string;
    locationId: string;
    actor: OperationalActor;
    allowedRoles: readonly OperationalRole[];
  }
): Promise<OrganizationMember> {
  const [member] = await tx
    .select()
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.id, input.actor.memberId),
        eq(organizationMembers.organizationId, input.organizationId),
        eq(organizationMembers.userId, input.actor.userId),
        eq(organizationMembers.status, "active")
      )
    )
    .limit(1);

  if (!member || !input.allowedRoles.includes(member.role)) {
    throw new OperationalError(
      "FORBIDDEN",
      "El miembro no puede ejecutar esta operación",
      403
    );
  }

  if (member.locationScopeMode === "all") return member;

  const [scope] = await tx
    .select({ id: memberLocationScopes.id })
    .from(memberLocationScopes)
    .where(
      and(
        eq(memberLocationScopes.organizationId, input.organizationId),
        eq(memberLocationScopes.memberId, member.id),
        eq(memberLocationScopes.locationId, input.locationId)
      )
    )
    .limit(1);

  if (!scope) {
    throw new OperationalError(
      "LOCATION_SCOPE_DENIED",
      "El miembro no tiene acceso a esta sede",
      403
    );
  }

  return member;
}
