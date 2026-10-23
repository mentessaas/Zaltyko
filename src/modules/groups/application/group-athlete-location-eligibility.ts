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

/** SQL predicate shared by candidate search and direct membership creation. */
export function hasEligibleGroupLocationRelationship(input: {
  organizationId: string;
  groupId: string;
  locationId: string;
}) {
  return sql`(
    exists (
      select 1
      from zaltyko.group_memberships eligible_membership
      inner join zaltyko.groups eligible_group
        on eligible_group.organization_id = eligible_membership.organization_id
       and eligible_group.id = eligible_membership.group_id
      where eligible_membership.organization_id = ${input.organizationId}::uuid
        and eligible_membership.athlete_id = ${athletes.id}
        and eligible_membership.group_id <> ${input.groupId}::uuid
        and eligible_membership.status in (${groupStatuses})
        and eligible_group.location_id = ${input.locationId}::uuid
        and eligible_group.status = 'active'
    )
    or exists (
      select 1
      from zaltyko.enrollments eligible_enrollment
      where eligible_enrollment.organization_id = ${input.organizationId}::uuid
        and eligible_enrollment.athlete_id = ${athletes.id}
        and eligible_enrollment.location_id = ${input.locationId}::uuid
        and eligible_enrollment.status in (${enrollmentStatuses})
    )
  )`;
}
