import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  locations,
  memberLocationScopes,
  organizationMembers,
  organizations,
  type OrganizationMember,
} from "@/db/zaltyko-schema";
import { COACH_WITHOUT_LOCATIONS_REASON } from "@/modules/owner-dashboard/domain/coach-access";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export interface OwnerScope {
  organization: { id: string; name: string; defaultCurrency: string };
  member: {
    id: string;
    role: OrganizationMember["role"];
    locationScopeMode: OrganizationMember["locationScopeMode"];
  };
  locations: Array<{ id: string; name: string; timezone?: string | null }>;
  selectedLocationId: string | null;
  canViewOrganizationAggregate: boolean;
}

/**
 * Roles that may use the management surface (Resumen, Personas, Club...).
 * Every caller of resolveOwnerScope gets this set unless it explicitly opts in
 * to the coach operations surface, so new routes fail closed for coaches.
 */
const ownerSurfaceRoles = new Set(["owner", "admin", "manager"]);

/**
 * "coach_operations" is the only surface a coach may use: today's sessions and
 * taking attendance, always for one assigned site at a time.
 */
export type OwnerScopeSurface = "management" | "coach_operations";

const coachOperationsRoles = new Set([...ownerSurfaceRoles, "coach"]);

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
  surface?: OwnerScopeSurface;
}): Promise<OwnerScope> {
  const allowedRoles =
    input.surface === "coach_operations"
      ? coachOperationsRoles
      : ownerSurfaceRoles;
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
  // Without an explicit organization, pick the first membership this surface
  // admits so a coach seat elsewhere never hides an owner's own academy.
  const membership = input.organizationId
    ? memberships.find((item) => item.organizationId === input.organizationId)
    : (memberships.find((item) => allowedRoles.has(item.role)) ??
      memberships[0]);
  if (!membership || !allowedRoles.has(membership.role)) {
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
    .select({
      id: locations.id,
      name: locations.name,
      timezone: locations.timezone,
    })
    .from(locations)
    .where(eq(locations.organizationId, membership.organizationId))
    .orderBy(asc(locations.name))
    .limit(500);
  const locationRows =
    membership.locationScopeMode === "all"
      ? allLocations
      : await db
          .select({
            id: locations.id,
            name: locations.name,
            timezone: locations.timezone,
          })
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
  const isCoach = membership.role === "coach";
  // A coach never sees the organization aggregate, even with "all" sites: the
  // coach surface always works on one site of their scope at a time.
  const canViewOrganizationAggregate =
    !isCoach && membership.locationScopeMode === "all";
  const selectedLocationId = canViewOrganizationAggregate
    ? (requestedLocation?.id ?? null)
    : (requestedLocation?.id ?? locationRows[0]?.id ?? null);
  if (!canViewOrganizationAggregate && !selectedLocationId) {
    await auditDeniedAccess({
      organizationId: membership.organizationId,
      userId: input.userId,
      reason: isCoach ? COACH_WITHOUT_LOCATIONS_REASON : "no_assigned_locations",
    });
    throw new OperationalError(
      "LOCATION_SCOPE_DENIED",
      "Sin sedes asignadas",
      403,
      isCoach
        ? {
            reason: COACH_WITHOUT_LOCATIONS_REASON,
            organizationId: membership.organizationId,
          }
        : undefined
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
