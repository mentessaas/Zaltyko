import { sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export const capacityHeatmapQuerySchema = z.object({
  organizationId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  programId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
  asOf: z.string().date().optional(),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

interface HeatmapCursor {
  isoWeekday: number;
  startsAt: string;
  endsAt: string;
}

interface HeatmapRow extends Record<string, unknown> {
  iso_weekday: number;
  starts_at_local: string;
  ends_at_local: string;
  occupied: number;
  capacity: number;
  classes: Array<Record<string, unknown>>;
}

function decodeCursor(value?: string): HeatmapCursor | null {
  if (!value) return null;
  try {
    return z.object({
      isoWeekday: z.number().int().min(1).max(7),
      startsAt: z.string().regex(/^\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/),
      endsAt: z.string().regex(/^\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/),
    }).parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
  } catch {
    throw new OperationalError("INVALID_RELATION", "Cursor del heatmap inválido", 400);
  }
}

function encodeCursor(value: HeatmapCursor): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function number(value: unknown): number {
  return Number(value ?? 0);
}

export async function getCapacityHeatmap(
  input: z.input<typeof capacityHeatmapQuerySchema> & { userId: string }
) {
  const query = capacityHeatmapQuerySchema.parse(input);
  const scope = await resolveOwnerScope({
    userId: input.userId,
    organizationId: query.organizationId,
    locationId: query.locationId,
  });
  const asOf = query.asOf ?? new Date().toISOString().slice(0, 10);
  const cursor = decodeCursor(query.cursor);
  const result = await db.execute(sql`
    with latest_enrollment_status as (
      select distinct on (history.organization_id, history.enrollment_id)
        history.organization_id, history.enrollment_id, history.to_status
      from zaltyko.enrollment_status_history history
      where history.organization_id = ${scope.organization.id}::uuid
        and history.effective_on <= ${asOf}::date
      order by history.organization_id, history.enrollment_id,
        history.effective_on desc, history.changed_at desc
    ), enrollment_occupancy as (
      select e.organization_id, e.location_id, e.class_template_id,
        count(distinct e.athlete_id)::int as occupied
      from zaltyko.enrollments e
      left join latest_enrollment_status latest_status
        on latest_status.organization_id = e.organization_id
       and latest_status.enrollment_id = e.id
      where e.organization_id = ${scope.organization.id}::uuid
        and e.starts_on <= ${asOf}::date
        and (e.ends_on is null or e.ends_on >= ${asOf}::date)
        and coalesce(latest_status.to_status, e.status) = 'active'
      group by e.organization_id, e.location_id, e.class_template_id
    ), class_slots as (
      select ct.id as class_template_id, ct.location_id, ct.program_id, ct.name,
        slot.iso_weekday, slot.starts_at_local, slot.ends_at_local,
        least(ct.capacity, coalesce(space.capacity, ct.capacity))::int as capacity,
        coalesce(enrollment.occupied, 0)::int as occupied
      from zaltyko.class_templates ct
      join zaltyko.class_template_weekdays slot
        on slot.organization_id = ct.organization_id and slot.class_template_id = ct.id
      left join zaltyko.spaces space
        on space.organization_id = ct.organization_id and space.id = ct.default_space_id
      left join enrollment_occupancy enrollment
        on enrollment.organization_id = ct.organization_id
       and enrollment.location_id = ct.location_id
       and enrollment.class_template_id = ct.id
      where ct.organization_id = ${scope.organization.id}::uuid
        and (${scope.selectedLocationId}::uuid is null or ct.location_id = ${scope.selectedLocationId}::uuid)
        and ct.status = 'active' and ct.effective_from <= ${asOf}::date
        and (ct.effective_to is null or ct.effective_to >= ${asOf}::date)
        and (${query.programId ?? null}::uuid is null or ct.program_id = ${query.programId ?? null}::uuid)
        and (${query.groupId ?? null}::uuid is null or exists (
          select 1 from zaltyko.class_template_groups class_group
          where class_group.organization_id = ct.organization_id
            and class_group.class_template_id = ct.id and class_group.group_id = ${query.groupId ?? null}::uuid
        ))
    ), grouped_cells as (
      select iso_weekday, starts_at_local, ends_at_local,
        sum(occupied)::int as occupied, sum(capacity)::int as capacity,
        jsonb_agg(jsonb_build_object(
          'classTemplateId', class_template_id,
          'locationId', location_id,
          'programId', program_id,
          'name', name,
          'occupied', occupied,
          'capacity', capacity,
          'openSeats', greatest(capacity - occupied, 0),
          'fillRate', case when capacity > 0 then round(occupied::numeric / capacity, 4) else null end
        ) order by name, class_template_id) as classes
      from class_slots
      group by iso_weekday, starts_at_local, ends_at_local
    )
    select iso_weekday, starts_at_local, ends_at_local, occupied, capacity, classes
    from grouped_cells
    where ${cursor?.isoWeekday ?? null}::int is null
      or (iso_weekday, starts_at_local, ends_at_local) > (
        ${cursor?.isoWeekday ?? null}::int,
        ${cursor?.startsAt ?? null}::time,
        ${cursor?.endsAt ?? null}::time
      )
    order by iso_weekday, starts_at_local, ends_at_local
    limit ${query.limit + 1}
  `);
  const selected = result.rows as unknown as HeatmapRow[];
  const hasMore = selected.length > query.limit;
  const visible = selected.slice(0, query.limit);
  const cells = visible.map((row) => {
    const occupied = number(row.occupied);
    const capacity = number(row.capacity);
    return {
      isoWeekday: number(row.iso_weekday),
      startsAtLocal: row.starts_at_local,
      endsAtLocal: row.ends_at_local,
      occupied,
      capacity,
      openSeats: Math.max(capacity - occupied, 0),
      fillRate: capacity > 0 ? occupied / capacity : null,
      classes: row.classes,
    };
  });
  const last = visible.at(-1);
  return {
    organization: scope.organization,
    scope: {
      locationId: scope.selectedLocationId,
      locations: scope.locations,
      canViewOrganizationAggregate: scope.canViewOrganizationAggregate,
    },
    asOf,
    filters: { programId: query.programId ?? null, groupId: query.groupId ?? null },
    cells,
    nextCursor: hasMore && last
      ? encodeCursor({
          isoWeekday: number(last.iso_weekday),
          startsAt: last.starts_at_local,
          endsAt: last.ends_at_local,
        })
      : null,
  };
}
