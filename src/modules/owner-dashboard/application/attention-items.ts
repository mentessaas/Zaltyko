import { sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { countNewTrialRequests } from "@/modules/admissions/application/admission-attention";
import type { OwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { sqlUuidArray } from "@/modules/owner-dashboard/application/sql-uuid-array";

export const ownerUnrecordedSessionsLookbackDays = 7;

export interface OwnerAttentionItems {
  unrecordedSessions: {
    count: number;
    latest: { id: string; locationId: string; className: string } | null;
  };
  fullClasses: number;
  overdueInvoices: number | null;
  /**
   * Solicitudes de prueba nuevas (P2 #15). Ausente mientras la tabla candidata
   * `zaltyko.admission_requests` no esté instalada.
   */
  newTrialRequests?: number;
}

/**
 * Read-only "needs attention" counters for the already-authorized owner scope.
 * - Unrecorded sessions: ended in the last 7 days, not cancelled, with at least
 *   one expected athlete (attendance roster rule) and no attendance records.
 * - Full classes: active class templates whose current roster fills capacity.
 * - Overdue invoices: issued or partially paid, past due. Counted only when the
 *   caller may see finances; amounts are not computed here.
 */
export async function getOwnerAttentionItems(input: {
  scope: OwnerScope;
  locationId?: string | null;
  includeFinancials: boolean;
}): Promise<OwnerAttentionItems> {
  const { scope } = input;
  const organizationId = scope.organization.id;
  const aggregate = scope.canViewOrganizationAggregate && !input.locationId;
  const locationIds = aggregate
    ? scope.locations.map((location) => location.id)
    : [scope.selectedLocationId ?? scope.locations[0]?.id ?? ""].filter(Boolean);
  if (locationIds.length === 0) {
    return {
      unrecordedSessions: { count: 0, latest: null },
      fullClasses: 0,
      overdueInvoices: input.includeFinancials ? 0 : null,
    };
  }

  const expectedAt = (dateSql: SQL) => sql`(
    select count(*)
    from zaltyko.enrollments e
    join zaltyko.athletes athlete
      on athlete.organization_id = e.organization_id
     and athlete.id = e.athlete_id
     and athlete.is_active
    where e.organization_id = ct.organization_id
      and e.location_id = ct.location_id
      and e.class_template_id = ct.id
      and e.status in ('active', 'trial')
      and e.starts_on <= ${dateSql}
      and (e.ends_on is null or e.ends_on > ${dateSql})
  )`;

  const [sessionResult, classResult, invoiceResult, newTrialRequests] = await Promise.all([
    db.execute(sql`
      with scoped_locations as (
        select l.id, l.timezone
        from zaltyko.locations l
        where l.organization_id = ${organizationId}::uuid
          and l.id = any(${sqlUuidArray(locationIds)})
      ),
      pending as (
        select s.id, s.location_id, s.ends_at, ct.name as class_name
        from zaltyko.sessions s
        join scoped_locations l on l.id = s.location_id
        join zaltyko.class_templates ct
          on ct.organization_id = s.organization_id
         and ct.id = s.class_template_id
        where s.organization_id = ${organizationId}::uuid
          and s.status <> 'cancelled'
          and s.starts_at > now() - make_interval(days => ${ownerUnrecordedSessionsLookbackDays + 1})
          and s.starts_at <= now()
          and s.ends_at <= now()
          and s.ends_at > now() - make_interval(days => ${ownerUnrecordedSessionsLookbackDays})
          and not exists (
            select 1 from zaltyko.attendance_records a
            where a.organization_id = s.organization_id
              and a.session_id = s.id
          )
          and ${expectedAt(sql`(s.starts_at at time zone l.timezone)::date`)} > 0
      )
      select
        (select count(*) from pending)::int as count,
        latest.id,
        latest.location_id,
        latest.class_name
      from (select 1) one
      left join lateral (
        select id, location_id, class_name from pending order by ends_at desc, id desc limit 1
      ) latest on true
    `),
    db.execute(sql`
      with scoped_locations as (
        select l.id, l.timezone
        from zaltyko.locations l
        where l.organization_id = ${organizationId}::uuid
          and l.id = any(${sqlUuidArray(locationIds)})
      )
      select count(*)::int as count
      from zaltyko.class_templates ct
      join scoped_locations l on l.id = ct.location_id
      where ct.organization_id = ${organizationId}::uuid
        and ct.status = 'active'
        and ct.effective_from <= (now() at time zone l.timezone)::date
        and (ct.effective_to is null or ct.effective_to >= (now() at time zone l.timezone)::date)
        and ${expectedAt(sql`(now() at time zone l.timezone)::date`)} >= coalesce(
          (
            select s.capacity_override
            from zaltyko.sessions s
            where s.organization_id = ct.organization_id
              and s.class_template_id = ct.id
              and s.status <> 'cancelled'
              and s.capacity_override is not null
              and s.starts_at >= now() - interval '2 days'
              and s.starts_at < now() + interval '2 days'
              and (s.starts_at at time zone l.timezone)::date = (now() at time zone l.timezone)::date
            order by s.starts_at asc
            limit 1
          ),
          ct.capacity
        )
    `),
    input.includeFinancials
      ? db.execute(sql`
          select count(*)::int as count
          from zaltyko.invoices i
          where i.organization_id = ${organizationId}::uuid
            and i.status in ('issued', 'partially_paid')
            and i.voided_at is null
            and i.due_at < now()
            and ${
              aggregate
                ? sql`(i.location_id is null or i.location_id = any(${sqlUuidArray(locationIds)}))`
                : sql`i.location_id = any(${sqlUuidArray(locationIds)})`
            }
        `)
      : Promise.resolve(null),
    countNewTrialRequests(db, organizationId, locationIds),
  ]);

  const sessionRow = sessionResult.rows[0] as
    | { count: number; id: string | null; location_id: string | null; class_name: string | null }
    | undefined;
  const classRow = classResult.rows[0] as { count: number } | undefined;
  const invoiceRow = invoiceResult?.rows[0] as { count: number } | undefined;

  return {
    unrecordedSessions: {
      count: Number(sessionRow?.count ?? 0),
      latest:
        sessionRow?.id && sessionRow.location_id && sessionRow.class_name
          ? { id: sessionRow.id, locationId: sessionRow.location_id, className: sessionRow.class_name }
          : null,
    },
    fullClasses: Number(classRow?.count ?? 0),
    overdueInvoices: input.includeFinancials ? Number(invoiceRow?.count ?? 0) : null,
    ...(newTrialRequests === null ? {} : { newTrialRequests }),
  };
}
