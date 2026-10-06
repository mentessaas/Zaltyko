import { and, eq, inArray } from "drizzle-orm";

import {
  memberLocationScopes,
  locations,
  organizationMembers,
  organizations,
  type OrganizationMember,
} from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import { assertCurrentCronSystemActor } from "@/lib/cron-system-actor";
import type {
  OperationalActor,
  SystemActor,
} from "@/modules/shared/application/actor";
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

/**
 * Validates a cron job's organization/site boundary without impersonating a
 * human member. Call only from server-side worker adapters after cron auth.
 */
export async function assertSystemOperationalScope(
  tx: TransactionClient,
  input: {
    organizationId: string;
    locationId: string;
    actor: SystemActor;
  }
): Promise<void> {
  assertCurrentCronSystemActor(input.actor);
  const [organization] = await tx
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        eq(organizations.id, input.organizationId),
        inArray(organizations.status, ["trial", "active"])
      )
    )
    .limit(1);
  if (!organization) {
    throw new OperationalError("NOT_FOUND", "Organización no disponible", 404);
  }

  const [location] = await tx
    .select({ id: locations.id })
    .from(locations)
    .where(
      and(
        eq(locations.organizationId, input.organizationId),
        eq(locations.id, input.locationId),
        eq(locations.isActive, true)
      )
    )
    .limit(1);
  if (!location) {
    throw new OperationalError(
      "LOCATION_SCOPE_DENIED",
      "Sede no disponible en esta organización",
      403
    );
  }
}
