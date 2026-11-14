import { sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import type { OwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { sqlUuidArray } from "@/modules/owner-dashboard/application/sql-uuid-array";
import {
  addDays,
  addMonths,
  attendanceWeekStarts,
  athleteSignupMonthStarts,
  buildAthleteSignups,
  buildAttendanceWeeks,
  buildClassOccupancy,
  buildMonthlyFees,
  localIsoDate,
  monthStart,
  type AthleteSignupsChart,
  type AttendanceWeekRow,
  type AttendanceWeeksChart,
  type ClassOccupancyChart,
  type ClassOccupancyRow,
  type MonthlyFeesChart,
  type MonthlyFeesRow,
} from "@/modules/owner-dashboard/domain/summary-charts-model";

/**
 * Datos de las gráficas de `/owner`, leídos de las tablas operativas ya
 * persistidas (asistencia, clases, inscripciones, cargos y fichas). No depende
 * del trabajador de analítica: si una tabla está vacía, la gráfica muestra su
 * estado vacío, nunca una serie inventada.
 *
 * El ámbito es el mismo que el del resumen operativo: la sede elegida o, para
 * quien ve el agregado, todas las sedes autorizadas. Las semanas y los meses se
 * cuentan en la zona horaria de cada sede.
 */

export interface OwnerChartScope {
  organizationId: string;
  aggregate: boolean;
  locationIds: string[];
  timezone: string;
  today: string;
}

export interface OwnerSummaryCharts {
  today: string;
  timezone: string;
  attendance: AttendanceWeeksChart;
  occupancy: ClassOccupancyChart;
  fees: MonthlyFeesChart;
  signups: AthleteSignupsChart;
}

function count(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

function dateText(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").slice(0, 10);
}

export async function resolveOwnerChartScope(input: {
  scope: OwnerScope;
  locationId?: string | null;
  now?: Date;
}): Promise<OwnerChartScope> {
  const { scope } = input;
  const organizationId = scope.organization.id;
  const aggregate = scope.canViewOrganizationAggregate && !(input.locationId ?? scope.selectedLocationId);
  const locationIds = aggregate
    ? scope.locations.map((location) => location.id)
    : [input.locationId ?? scope.selectedLocationId ?? scope.locations[0]?.id ?? ""].filter(Boolean);
  const selectedLocationId = aggregate ? null : (locationIds[0] ?? null);
  const result = await db.execute(sql`
    select organization.default_timezone,
      (
        select location.timezone from zaltyko.locations location
        where location.organization_id = organization.id
          and location.id = ${selectedLocationId}::uuid
      ) as location_timezone
    from zaltyko.organizations organization
    where organization.id = ${organizationId}::uuid
    limit 1
  `);
  const row = result.rows[0] as
    | { default_timezone?: string | null; location_timezone?: string | null }
    | undefined;
  const timezone =
    (aggregate ? row?.default_timezone : (row?.location_timezone ?? row?.default_timezone)) ??
    "Europe/Madrid";
  return {
    organizationId,
    aggregate,
    locationIds,
    timezone,
    today: localIsoDate(input.now ?? new Date(), timezone),
  };
}

async function attendanceWeekRows(chartScope: OwnerChartScope): Promise<AttendanceWeekRow[]> {
  if (chartScope.locationIds.length === 0) return [];
  const starts = attendanceWeekStarts(chartScope.today);
  const from = starts[0];
  const to = addDays(starts[starts.length - 1], 6);
  const result = await db.execute(sql`
    select
      (date_trunc('week', session.starts_at at time zone location.timezone))::date::text as week_start,
      count(*) filter (where attendance.status = 'present')::int as present,
      count(*) filter (where attendance.status = 'late')::int as late,
      count(*) filter (where attendance.status = 'excused')::int as excused,
      count(*) filter (where attendance.status = 'absent')::int as absent,
      count(distinct session.id)::int as sessions
    from zaltyko.attendance_records attendance
    join zaltyko.sessions session
      on session.organization_id = attendance.organization_id
     and session.id = attendance.session_id
     and session.location_id = attendance.location_id
    join zaltyko.locations location
      on location.organization_id = attendance.organization_id
     and location.id = attendance.location_id
    where attendance.organization_id = ${chartScope.organizationId}::uuid
      and attendance.location_id = any(${sqlUuidArray(chartScope.locationIds)})
      and session.starts_at >= (${from}::date - 2)::timestamp at time zone 'UTC'
      and session.starts_at < (${to}::date + 3)::timestamp at time zone 'UTC'
      and (session.starts_at at time zone location.timezone)::date between ${from}::date and ${to}::date
    group by 1
    order by 1
  `);
  return (result.rows as Array<Record<string, unknown>>).map((row) => ({
    weekStart: dateText(row.week_start),
    present: count(row.present),
    late: count(row.late),
    excused: count(row.excused),
    absent: count(row.absent),
    sessions: count(row.sessions),
  }));
}

/**
 * Plazas de cada clase activa hoy. «Inscritas» sigue la regla de la lista de
 * asistencia y de «Clases completas» (attention-items): gimnastas activas con
 * inscripción activa o de prueba vigente. Las plazas son las de la clase, o
 * las de la sesión de hoy si se cambiaron solo para hoy.
 */
async function classOccupancyRows(chartScope: OwnerChartScope): Promise<ClassOccupancyRow[]> {
  if (chartScope.locationIds.length === 0) return [];
  const result = await db.execute(sql`
    select
      ct.id::text as class_template_id,
      ct.name as class_name,
      location.name as location_name,
      coalesce(
        (
          select s.capacity_override
          from zaltyko.sessions s
          where s.organization_id = ct.organization_id
            and s.class_template_id = ct.id
            and s.status <> 'cancelled'
            and s.capacity_override is not null
            and s.starts_at >= now() - interval '2 days'
            and s.starts_at < now() + interval '2 days'
            and (s.starts_at at time zone location.timezone)::date = (now() at time zone location.timezone)::date
          order by s.starts_at asc
          limit 1
        ),
        ct.capacity
      )::int as capacity,
      (
        select count(distinct e.athlete_id)
        from zaltyko.enrollments e
        join zaltyko.athletes athlete
          on athlete.organization_id = e.organization_id
         and athlete.id = e.athlete_id
         and athlete.is_active
        where e.organization_id = ct.organization_id
          and e.location_id = ct.location_id
          and e.class_template_id = ct.id
          and e.status in ('active', 'trial')
          and e.starts_on <= (now() at time zone location.timezone)::date
          and (e.ends_on is null or e.ends_on > (now() at time zone location.timezone)::date)
      )::int as enrolled
    from zaltyko.class_templates ct
    join zaltyko.locations location
      on location.organization_id = ct.organization_id
     and location.id = ct.location_id
    where ct.organization_id = ${chartScope.organizationId}::uuid
      and ct.location_id = any(${sqlUuidArray(chartScope.locationIds)})
      and ct.status = 'active'
      and ct.effective_from <= (now() at time zone location.timezone)::date
      and (ct.effective_to is null or ct.effective_to >= (now() at time zone location.timezone)::date)
    order by ct.name, ct.id
    limit 200
  `);
  return (result.rows as Array<Record<string, unknown>>).map((row) => ({
    classTemplateId: String(row.class_template_id),
    className: String(row.class_name ?? ""),
    locationName: String(row.location_name ?? ""),
    capacity: count(row.capacity),
    enrolled: count(row.enrolled),
  }));
}

/**
 * Cargos cuyo periodo de servicio empieza en el mes en curso, de facturas
 * emitidas (ni borrador ni anuladas). Lo cobrado es lo asignado a cada cargo;
 * lo pendiente se parte en vencido y por vencer según su fecha de cobro.
 */
async function monthlyFeeRows(chartScope: OwnerChartScope): Promise<MonthlyFeesRow[]> {
  if (chartScope.locationIds.length === 0) return [];
  const first = monthStart(chartScope.today);
  const next = addMonths(first, 1);
  const locationFilter: SQL = chartScope.aggregate
    ? sql`(c.location_id is null or c.location_id = any(${sqlUuidArray(chartScope.locationIds)}))`
    : sql`c.location_id = any(${sqlUuidArray(chartScope.locationIds)})`;
  const result = await db.execute(sql`
    with month_charges as (
      select c.id, c.currency, c.amount_cents, c.due_at,
        coalesce(sum(pa.amount_cents), 0) as allocated_cents
      from zaltyko.charges c
      join zaltyko.invoices i
        on i.organization_id = c.organization_id
       and i.id = c.invoice_id
      left join zaltyko.payment_allocations pa
        on pa.organization_id = c.organization_id
       and pa.charge_id = c.id
      where c.organization_id = ${chartScope.organizationId}::uuid
        and ${locationFilter}
        and c.status <> 'void'
        and i.status not in ('draft', 'void')
        and i.voided_at is null
        and c.service_period_start >= ${first}::date
        and c.service_period_start < ${next}::date
      group by c.id, c.currency, c.amount_cents, c.due_at
    )
    select currency,
      count(*)::int as charges,
      coalesce(sum(amount_cents), 0)::bigint::text as billed_cents,
      coalesce(sum(least(allocated_cents, amount_cents)), 0)::bigint::text as collected_cents,
      coalesce(sum(greatest(amount_cents - allocated_cents, 0)) filter (where due_at >= now()), 0)::bigint::text as pending_cents,
      coalesce(sum(greatest(amount_cents - allocated_cents, 0)) filter (where due_at < now()), 0)::bigint::text as overdue_cents
    from month_charges
    group by currency
    order by currency
  `);
  return (result.rows as Array<Record<string, unknown>>).map((row) => ({
    currency: String(row.currency),
    charges: count(row.charges),
    billedCents: count(row.billed_cents),
    collectedCents: count(row.collected_cents),
    pendingCents: count(row.pending_cents),
    overdueCents: count(row.overdue_cents),
  }));
}

/**
 * Fichas creadas cada mes. Con el agregado cuentan todas las de la academia;
 * en una sede, las que tienen una pertenencia a un grupo o una inscripción en
 * esa sede.
 */
async function athleteSignupRows(chartScope: OwnerChartScope) {
  if (chartScope.locationIds.length === 0) return [];
  const starts = athleteSignupMonthStarts(chartScope.today);
  const from = starts[0];
  const locationLink: SQL = chartScope.aggregate
    ? sql`true`
    : sql`(
        exists (
          select 1 from zaltyko.group_memberships membership
          join zaltyko.groups g
            on g.organization_id = membership.organization_id
           and g.id = membership.group_id
          where membership.organization_id = athlete.organization_id
            and membership.athlete_id = athlete.id
            and g.location_id = any(${sqlUuidArray(chartScope.locationIds)})
        )
        or exists (
          select 1 from zaltyko.enrollments e
          where e.organization_id = athlete.organization_id
            and e.athlete_id = athlete.id
            and e.location_id = any(${sqlUuidArray(chartScope.locationIds)})
        )
      )`;
  const result = await db.execute(sql`
    select
      (date_trunc('month', athlete.created_at at time zone ${chartScope.timezone}))::date::text as month,
      count(*)::int as created
    from zaltyko.athletes athlete
    where athlete.organization_id = ${chartScope.organizationId}::uuid
      and athlete.created_at >= (${from}::date - 2)::timestamp at time zone 'UTC'
      and (athlete.created_at at time zone ${chartScope.timezone})::date >= ${from}::date
      and ${locationLink}
    group by 1
    order by 1
  `);
  return (result.rows as Array<Record<string, unknown>>).map((row) => ({
    month: dateText(row.month),
    created: count(row.created),
  }));
}

export async function getOwnerAttendanceWeeksChart(chartScope: OwnerChartScope) {
  return buildAttendanceWeeks(await attendanceWeekRows(chartScope), chartScope.today);
}

export async function getOwnerMonthlyFeesChart(
  chartScope: OwnerChartScope,
  includeFinancials: boolean
) {
  return buildMonthlyFees(
    includeFinancials ? await monthlyFeeRows(chartScope) : null,
    chartScope.today
  );
}

export async function getOwnerSummaryCharts(input: {
  scope: OwnerScope;
  locationId?: string | null;
  includeFinancials: boolean;
  now?: Date;
}): Promise<OwnerSummaryCharts> {
  const chartScope = await resolveOwnerChartScope(input);
  const [attendance, occupancy, fees, signups] = await Promise.all([
    attendanceWeekRows(chartScope),
    classOccupancyRows(chartScope),
    input.includeFinancials ? monthlyFeeRows(chartScope) : Promise.resolve(null),
    athleteSignupRows(chartScope),
  ]);
  return {
    today: chartScope.today,
    timezone: chartScope.timezone,
    attendance: buildAttendanceWeeks(attendance, chartScope.today),
    occupancy: buildClassOccupancy(occupancy),
    fees: buildMonthlyFees(fees, chartScope.today),
    signups: buildAthleteSignups(signups, chartScope.today),
  };
}
