import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * SQL guards for the family portal (P2 #16). Every domain read embeds one of
 * these `exists` clauses, bound to the signed-in Supabase Auth user id, so the
 * database itself re-checks the whole canonical chain on each query. The
 * pure check in domain/family-portal-access.ts mirrors the same rules.
 *
 * Aliases are prefixed with `fp_` so they never collide with the outer query.
 */

type Ref = AnyPgColumn | SQL;

/** Academy-local calendar date of `now`, evaluated with fp_o's time zone. */
function localToday(now: Date): SQL {
  return sql`(${now.toISOString()}::timestamptz at time zone fp_o.default_timezone)::date`;
}

/**
 * True when `userId` may see athlete `athleteRef` of organization
 * `organizationRef` today: active guardian in a trial/active academy, active
 * link with can_view_athletes, active family, membership open today and
 * active athlete. With `sinceRef`, the instant must also fall on or after the
 * start of that open membership (academy-local midnight).
 */
export function familyCanViewAthlete(input: {
  userId: string;
  now: Date;
  organizationRef: Ref;
  athleteRef: Ref;
  sinceRef?: Ref;
}): SQL {
  const today = localToday(input.now);
  return sql`exists (
    select 1
    from zaltyko.guardians fp_g
    join zaltyko.organizations fp_o
      on fp_o.id = fp_g.organization_id
    join zaltyko.family_guardians fp_fg
      on fp_fg.organization_id = fp_g.organization_id
      and fp_fg.guardian_id = fp_g.id
    join zaltyko.families fp_f
      on fp_f.organization_id = fp_fg.organization_id
      and fp_f.id = fp_fg.family_id
    join zaltyko.family_members fp_fm
      on fp_fm.organization_id = fp_f.organization_id
      and fp_fm.family_id = fp_f.id
    join zaltyko.athletes fp_a
      on fp_a.organization_id = fp_fm.organization_id
      and fp_a.id = fp_fm.athlete_id
    where fp_g.auth_user_id = ${input.userId}::uuid
      and fp_g.is_active
      and fp_o.status in ('trial', 'active')
      and fp_fg.is_active
      and fp_fg.can_view_athletes
      and fp_f.is_active
      and fp_a.is_active
      and fp_g.organization_id = ${input.organizationRef}
      and fp_fm.athlete_id = ${input.athleteRef}
      and fp_fm.starts_on <= ${today}
      and (fp_fm.ends_on is null or fp_fm.ends_on >= ${today})
      ${
        input.sinceRef
          ? sql`and ${input.sinceRef} >= (fp_fm.starts_on::timestamp at time zone fp_o.default_timezone)`
          : sql``
      }
  )`;
}

/**
 * True when `userId` may see the fees of family `familyRef` today
 * (provisional rule): active guardian in a trial/active academy, active link,
 * active family and an open family_payers row for that guardian.
 */
export function familyCanViewFees(input: {
  userId: string;
  now: Date;
  organizationRef: Ref;
  familyRef: Ref;
}): SQL {
  const today = localToday(input.now);
  return sql`exists (
    select 1
    from zaltyko.guardians fp_g
    join zaltyko.organizations fp_o
      on fp_o.id = fp_g.organization_id
    join zaltyko.family_guardians fp_fg
      on fp_fg.organization_id = fp_g.organization_id
      and fp_fg.guardian_id = fp_g.id
    join zaltyko.families fp_f
      on fp_f.organization_id = fp_fg.organization_id
      and fp_f.id = fp_fg.family_id
    join zaltyko.family_payers fp_p
      on fp_p.organization_id = fp_fg.organization_id
      and fp_p.family_id = fp_fg.family_id
      and fp_p.guardian_id = fp_fg.guardian_id
    where fp_g.auth_user_id = ${input.userId}::uuid
      and fp_g.is_active
      and fp_o.status in ('trial', 'active')
      and fp_fg.is_active
      and fp_f.is_active
      and fp_g.organization_id = ${input.organizationRef}
      and fp_fg.family_id = ${input.familyRef}
      and fp_p.starts_on <= ${today}
      and (fp_p.ends_on is null or fp_p.ends_on >= ${today})
  )`;
}
