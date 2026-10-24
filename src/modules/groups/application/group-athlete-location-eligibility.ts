import { sql } from "drizzle-orm";

import { athletes } from "@/db/zaltyko-schema";

export const eligibleGroupMembershipStatuses = [
  "pending",
  "active",
  "paused",
] as const;
export const eligibleGroupEnrollmentStatuses = [
  "pending",
  "trial",
  "active",
  "paused",
] as const;

const groupStatuses = sql.join(
  eligibleGroupMembershipStatuses.map((status) => sql`${status}`),
  sql`, `
);
const enrollmentStatuses = sql.join(
  eligibleGroupEnrollmentStatuses.map((status) => sql`${status}`),
  sql`, `
);

function eligibleLocationRelationship(input: {
  organizationId: string;
  locationIds: string[];
  excludeGroupId?: string;
}) {
  if (input.locationIds.length === 0) return sql`false`;

  const locationIds = sql.join(
    input.locationIds.map((locationId) => sql`${locationId}::uuid`),
    sql`, `
  );
  const excludedGroup = input.excludeGroupId
    ? sql`and eligible_membership.group_id <> ${input.excludeGroupId}::uuid`
    : sql``;

  return sql`(
    exists (
      select 1
      from zaltyko.group_memberships eligible_membership
      inner join zaltyko.groups eligible_group
        on eligible_group.organization_id = eligible_membership.organization_id
       and eligible_group.id = eligible_membership.group_id
      where eligible_membership.organization_id = ${input.organizationId}::uuid
        and eligible_membership.athlete_id = ${athletes.id}
        and eligible_membership.status in (${groupStatuses})
        and eligible_group.location_id in (${locationIds})
        and eligible_group.status = 'active'
        ${excludedGroup}
    )
    or exists (
      select 1
      from zaltyko.enrollments eligible_enrollment
      where eligible_enrollment.organization_id = ${input.organizationId}::uuid
        and eligible_enrollment.athlete_id = ${athletes.id}
        and eligible_enrollment.location_id in (${locationIds})
        and eligible_enrollment.status in (${enrollmentStatuses})
    )
  )`;
}

/** SQL predicate shared by candidate search and direct membership creation. */
export function hasEligibleGroupLocationRelationship(input: {
  organizationId: string;
  groupId: string;
  locationId: string;
}) {
  return eligibleLocationRelationship({
    organizationId: input.organizationId,
    locationIds: [input.locationId],
    excludeGroupId: input.groupId,
  });
}

/** Candidate enrollment eligibility: an open relationship at any target site. */
export function hasEligibleLocationRelationships(input: {
  organizationId: string;
  locationIds: string[];
}) {
  return eligibleLocationRelationship(input);
}

/** Direct enrollment eligibility at the selected site. */
export function hasEligibleEnrollmentLocationRelationship(input: {
  organizationId: string;
  locationId: string;
}) {
  return eligibleLocationRelationship({
    organizationId: input.organizationId,
    locationIds: [input.locationId],
  });
}
