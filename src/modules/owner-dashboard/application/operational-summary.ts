import { sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const MAX_PERIOD_DAYS = 366;

export const ownerOperationalSummaryQuerySchema = z
  .object({
    organizationId: z.string().uuid().optional(),
    locationId: z.string().uuid().optional(),
    from: z.string().date().optional(),
    to: z.string().date().optional(),
  })
  .superRefine((query, context) => {
    if (query.from && query.to) {
      const from = Date.parse(`${query.from}T00:00:00Z`);
      const to = Date.parse(`${query.to}T00:00:00Z`);
      const days = (to - from) / 86_400_000 + 1;
      if (days < 1 || days > MAX_PERIOD_DAYS) {
        context.addIssue({
          code: "custom",
          message: `El periodo debe estar entre 1 y ${MAX_PERIOD_DAYS} días`,
          path: ["to"],
        });
      }
    }
  });

export interface OwnerOperationalSummary {
  scope: {
    organizationId: string;
    kind: "organization" | "location";
    label: string;
    locationId: string | null;
    locationIds: string[];
    timezone: string;
    timezoneMode: "organization_default" | "location" | "per_location";
  };
  period: { from: string; to: string; timezone: string; defaulted: boolean };
  metrics: {
    activeAthletes: number;
    activeGroups: number;
    attendanceRecords: number;
    paymentsReceived:
      | {
          state: "available";
          count: number;
          grossByCurrency: Array<{ currency: string; amountCents: number }>;
          label: "Bruto recibido sin netear devoluciones";
        }
      | { state: "unavailable"; reason: "financial_access_required" };
  };
}

interface CountRow extends Record<string, unknown> {
  active_athletes: number | string;
  active_groups: number | string;
}

interface AttendanceRow extends Record<string, unknown> {
  attendance_records: number | string;
}

interface PaymentRow extends Record<string, unknown> {
  currency: string;
  payment_count: number | string;
  gross_amount_cents: number | string;
}

function localDate(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  const year = get("year");
  const month = get("month");
  const day = get("day");
  if (!year || !month || !day) {
    throw new OperationalError(
      "INVALID_RELATION",
      "Zona horaria inválida",
      500
    );
  }
  return `${year}-${month}-${day}`;
}

function dateAtMonthStart(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

function number(value: unknown): number {
  if (value === null || value === undefined) {
    throw new OperationalError(
      "INVALID_RELATION",
      "El agregado operativo no devolvió un valor",
      500
    );
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new OperationalError(
      "INVALID_RELATION",
      "El agregado operativo devolvió un valor inválido",
      500
    );
  }
  return parsed;
}

function requireAggregateRow<T>(rows: T[], label: string): T {
  if (rows.length !== 1) {
    throw new OperationalError(
      "INVALID_RELATION",
      `El agregado operativo de ${label} no devolvió exactamente una fila`,
      500
    );
  }
  return rows[0];
}

function uuidArray(ids: string[]) {
  if (ids.length === 0) return sql`array[]::uuid[]`;
  return sql`array[${sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `
  )}]`;
}

export async function getOwnerOperationalSummary(
  input: z.input<typeof ownerOperationalSummaryQuerySchema> & { userId: string }
): Promise<OwnerOperationalSummary> {
  const query = ownerOperationalSummaryQuerySchema.parse(input);
  const ownerScope = await resolveOwnerScope({
    userId: input.userId,
    organizationId: query.organizationId,
    locationId: query.locationId,
  });
  const organizationId = ownerScope.organization.id;
  const organizationResult = await db.execute(sql`
    select default_timezone from zaltyko.organizations
    where id = ${organizationId}::uuid limit 1
  `);
  const organizationRows = organizationResult.rows as Array<{
    default_timezone: string;
  }>;
  const organizationTimezone = organizationRows[0]?.default_timezone;
  if (!organizationTimezone) {
    throw new OperationalError(
      "INVALID_RELATION",
      "No se pudo resolver la zona horaria de la organización",
      500
    );
  }

  const organizationAggregate =
    ownerScope.canViewOrganizationAggregate && !query.locationId;
  const locationFilterIds = organizationAggregate
    ? ownerScope.locations.map((location) => location.id)
    : [
        ownerScope.selectedLocationId ?? ownerScope.locations[0]?.id ?? "",
      ].filter(Boolean);
  const locationResult = await db.execute(sql`
    select id, name, timezone from zaltyko.locations
    where organization_id = ${organizationId}::uuid
      and id = any(${uuidArray(locationFilterIds)})
  `);
  const locationRows = locationResult.rows as Array<{
    id: string;
    name: string;
    timezone: string;
  }>;
  const locationIds = locationRows.map((location) => location.id);
  const selectedLocation = locationRows[0];
  const periodTimezone = organizationAggregate
    ? organizationTimezone
    : selectedLocation?.timezone;
  if (!periodTimezone) {
    throw new OperationalError(
      "LOCATION_SCOPE_DENIED",
      "Sin sedes disponibles para el resumen operativo",
      403
    );
  }

  const today = localDate(new Date(), periodTimezone);
  const from = query.from ?? dateAtMonthStart(today);
  const to = query.to ?? today;
  const validatedRange = ownerOperationalSummaryQuerySchema.safeParse({
    ...query,
    from,
    to,
  });
  if (!validatedRange.success) {
    throw new OperationalError(
      "INVALID_DATE_RANGE",
      "El periodo debe ser válido y no superar 366 días",
      400
    );
  }

  const countsResult = await db.execute(sql`
    with scoped_locations as (
      select l.id, l.timezone
      from zaltyko.locations l
      where l.organization_id = ${organizationId}::uuid
        and l.id = any(${uuidArray(locationIds)})
    )
    select
      count(distinct athlete.id) filter (
        where athlete.is_active
          and g.status = 'active'
          and membership.status = 'active'
          and membership.starts_on <= (now() at time zone scoped_locations.timezone)::date
          and (membership.ends_on is null or membership.ends_on >= (now() at time zone scoped_locations.timezone)::date)
      )::int as active_athletes,
      count(distinct g.id) filter (where g.status = 'active')::int as active_groups
    from scoped_locations
    left join zaltyko.groups g
      on g.organization_id = ${organizationId}::uuid
     and g.location_id = scoped_locations.id
    left join zaltyko.group_memberships membership
      on membership.organization_id = g.organization_id
     and membership.group_id = g.id
    left join zaltyko.athletes athlete
      on athlete.organization_id = membership.organization_id
     and athlete.id = membership.athlete_id
  `);
  const counts = countsResult.rows as unknown as CountRow[];
  const countRow = requireAggregateRow(counts, "alumnos y grupos");
  const activeAthletes = number(countRow.active_athletes);
  const activeGroups = number(countRow.active_groups);

  const attendanceResult = await db.execute(sql`
    select count(*)::int as attendance_records
    from zaltyko.attendance_records attendance
    join zaltyko.sessions session
      on session.organization_id = attendance.organization_id
     and session.id = attendance.session_id
     and session.location_id = attendance.location_id
    join zaltyko.locations location
      on location.organization_id = attendance.organization_id
     and location.id = attendance.location_id
    where attendance.organization_id = ${organizationId}::uuid
      and attendance.location_id = any(${uuidArray(locationIds)})
      and session.starts_at >= (${from}::date::timestamp at time zone location.timezone)
      and session.starts_at < ((${to}::date + 1)::timestamp at time zone location.timezone)
  `);
  const attendance = attendanceResult.rows as unknown as AttendanceRow[];
  const attendanceRow = requireAggregateRow(attendance, "asistencia");
  const attendanceRecords = number(attendanceRow.attendance_records);

  const financeAllowed =
    ownerScope.member.role === "owner" || ownerScope.member.role === "admin";
  let paymentsReceived: OwnerOperationalSummary["metrics"]["paymentsReceived"];
  if (!financeAllowed) {
    paymentsReceived = {
      state: "unavailable",
      reason: "financial_access_required",
    };
  } else {
    const paymentsResult = await db.execute(sql`
      select payment.currency,
        count(*)::int as payment_count,
        sum(payment.amount_cents)::bigint as gross_amount_cents
      from zaltyko.payments payment
      join zaltyko.locations location
        on location.organization_id = payment.organization_id
       and location.id = payment.location_id
      where payment.organization_id = ${organizationId}::uuid
        and payment.location_id = any(${uuidArray(locationIds)})
        and payment.status in ('succeeded', 'partially_refunded', 'refunded')
        and payment.received_at >= (${from}::date::timestamp at time zone location.timezone)
        and payment.received_at < ((${to}::date + 1)::timestamp at time zone location.timezone)
      group by payment.currency
      order by payment.currency
    `);
    const payments = paymentsResult.rows as unknown as PaymentRow[];
    const paymentCount = number(
      payments.reduce((total, row) => total + number(row.payment_count), 0)
    );
    paymentsReceived = {
      state: "available",
      count: paymentCount,
      grossByCurrency: payments.map((row) => ({
        currency: row.currency,
        amountCents: number(row.gross_amount_cents),
      })),
      label: "Bruto recibido sin netear devoluciones",
    };
  }

  const kind = organizationAggregate ? "organization" : "location";
  const scopeLabel = organizationAggregate
    ? `${ownerScope.organization.name} · todas las sedes autorizadas`
    : `${ownerScope.organization.name} · ${selectedLocation?.name ?? "sede"}`;
  return {
    scope: {
      organizationId,
      kind,
      label: scopeLabel,
      locationId: organizationAggregate ? null : (selectedLocation?.id ?? null),
      locationIds,
      timezone: periodTimezone,
      timezoneMode: organizationAggregate ? "per_location" : "location",
    },
    period: {
      from,
      to,
      timezone: periodTimezone,
      defaulted: !query.from && !query.to,
    },
    metrics: {
      activeAthletes,
      activeGroups,
      attendanceRecords,
      paymentsReceived,
    },
  };
}
