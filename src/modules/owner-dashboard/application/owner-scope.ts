import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  locations,
  memberLocationScopes,
  organizationMembers,
  organizations,
  type OrganizationMember,
} from "@/db/zaltyko-schema";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export interface OwnerScope {
  organization: { id: string; name: string; defaultCurrency: string };
  member: {
    id: string;
    role: OrganizationMember["role"];
    locationScopeMode: OrganizationMember["locationScopeMode"];
  };
  locations: Array<{ id: string; name: string }>;
  selectedLocationId: string | null;
  canViewOrganizationAggregate: boolean;
}

const ownerSurfaceRoles = new Set(["owner", "admin", "manager"]);

async function auditDeniedAccess(input: {
  organizationId?: string;
  userId: string;
  reason: string;
}): Promise<void> {
  if (!input.organizationId) return;
  try {
    await db.execute(sql`
      insert into zaltyko.audit_log (
        organization_id, actor_user_id, action, target_type, metadata
      )
      select id, ${input.userId}::uuid, 'owner_surface.access_denied',
             'owner_surface', jsonb_build_object('reason', ${input.reason}::text)
      from zaltyko.organizations
      where id = ${input.organizationId}::uuid
    `);
  } catch (error) {
    if (process.env.NODE_ENV === "test") throw error;
    // Audit failures must not turn authorization denials into existence oracles.
  }
}

export async function resolveOwnerScope(input: {
  userId: string;
  organizationId?: string;
  locationId?: string;
}): Promise<OwnerScope> {
  const memberships = await db
    .select({
      memberId: organizationMembers.id,
      organizationId: organizationMembers.organizationId,
      organizationName: organizations.name,
      defaultCurrency: organizations.defaultCurrency,
      role: organizationMembers.role,
      locationScopeMode: organizationMembers.locationScopeMode,
    })
    .from(organizationMembers)
    .innerJoin(
      organizations,
      eq(organizations.id, organizationMembers.organizationId)
    )
    .where(
      and(
        eq(organizationMembers.userId, input.userId),
        eq(organizationMembers.status, "active")
      )
    )
    .orderBy(asc(organizations.name))
    .limit(100);
  const membership = input.organizationId
    ? memberships.find((item) => item.organizationId === input.organizationId)
    : memberships[0];
  if (!membership || !ownerSurfaceRoles.has(membership.role)) {
    await auditDeniedAccess({
      organizationId: input.organizationId,
      userId: input.userId,
      reason: "membership_or_role",
    });
    throw new OperationalError(
      "FORBIDDEN",
      "Sin acceso a la superficie Owner",
      403
    );
  }

  const allLocations = await db
    .select({ id: locations.id, name: locations.name })
    .from(locations)
    .where(eq(locations.organizationId, membership.organizationId))
    .orderBy(asc(locations.name))
    .limit(500);
  const locationRows =
    membership.locationScopeMode === "all"
      ? allLocations
      : await db
          .select({ id: locations.id, name: locations.name })
          .from(memberLocationScopes)
          .innerJoin(
            locations,
            and(
              eq(locations.organizationId, memberLocationScopes.organizationId),
              eq(locations.id, memberLocationScopes.locationId)
            )
          )
          .where(
            and(
              eq(
                memberLocationScopes.organizationId,
                membership.organizationId
              ),
              eq(memberLocationScopes.memberId, membership.memberId)
            )
          )
          .orderBy(asc(locations.name))
          .limit(500);
  const requestedLocation = input.locationId
    ? locationRows.find((location) => location.id === input.locationId)
    : null;
  if (input.locationId && !requestedLocation) {
    await auditDeniedAccess({
      organizationId: membership.organizationId,
      userId: input.userId,
      reason: "location_scope",
    });
    throw new OperationalError(
      "LOCATION_SCOPE_DENIED",
      "Sede fuera de alcance",
      403
    );
  }
  const canViewOrganizationAggregate = membership.locationScopeMode === "all";
  const selectedLocationId = canViewOrganizationAggregate
    ? (requestedLocation?.id ?? null)
    : (requestedLocation?.id ?? locationRows[0]?.id ?? null);
  if (!canViewOrganizationAggregate && !selectedLocationId) {
    await auditDeniedAccess({
      organizationId: membership.organizationId,
      userId: input.userId,
      reason: "no_assigned_locations",
    });
    throw new OperationalError(
      "LOCATION_SCOPE_DENIED",
      "Sin sedes asignadas",
      403
    );
  }

  return {
    organization: {
      id: membership.organizationId,
      name: membership.organizationName,
      defaultCurrency: membership.defaultCurrency,
    },
    member: {
      id: membership.memberId,
      role: membership.role,
      locationScopeMode: membership.locationScopeMode,
    },
    locations: locationRows,
    selectedLocationId,
    canViewOrganizationAggregate,
  };
}
