import { sql } from "drizzle-orm";

import type { DatabaseClient } from "@/lib/db-transactions";
import { PENDING_WINDOW_MINUTES } from "@/modules/payment-reminders/domain/reminder-policy";

/**
 * Cuota abierta con su tutor pagador y su historial de recordatorios.
 *
 * El destinatario sale únicamente de `family_payer_id` de la cuota (o, si falta,
 * de la factura): la persona que figura como pagadora. Nunca se busca otro
 * tutor, otro familiar ni la ficha de la gimnasta.
 */
export interface ReminderCandidate {
  chargeId: string;
  familyId: string;
  locationId: string;
  locationName: string;
  locationTimezone: string;
  invoiceReference: string;
  currency: string;
  dueAt: Date;
  servicePeriodStart: string;
  outstandingCents: number;
  guardianId: string | null;
  payerFirstName: string | null;
  payerEmail: string | null;
  lastSentAt: Date | null;
  sentCount: number;
  hasPendingReservation: boolean;
}

export interface CandidateFilter {
  organizationId: string;
  locationIds: string[];
  chargeIds?: string[];
  /** Solo cuotas con vencimiento anterior a este instante. */
  dueBefore?: Date;
  limit: number;
}

interface CandidateRow {
  chargeId: string;
  familyId: string;
  locationId: string;
  locationName: string;
  locationTimezone: string;
  invoiceReference: string;
  currency: string;
  dueAt: string;
  servicePeriodStart: string;
  outstandingCents: string;
  guardianId: string | null;
  payerFirstName: string | null;
  payerEmail: string | null;
  lastSentAt: string | null;
  sentCount: string | number;
  hasPendingReservation: boolean | null;
}

function safeCents(value: unknown): number {
  const cents = Number(value);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : 0;
}

function uuidList(ids: string[]) {
  return sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `
  );
}

const ISO = `'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`;

export async function loadReminderCandidates(
  client: DatabaseClient,
  filter: CandidateFilter
): Promise<ReminderCandidate[]> {
  if (filter.locationIds.length === 0 || filter.chargeIds?.length === 0) return [];
  const chargeFilter = filter.chargeIds ? sql`and c.id in (${uuidList(filter.chargeIds)})` : sql``;
  const dueFilter = filter.dueBefore ? sql`and c.due_at < ${filter.dueBefore.toISOString()}::timestamptz` : sql``;

  const result = await client.execute(sql`
    select * from (
      select
        c.id::text as "chargeId",
        c.family_id::text as "familyId",
        c.location_id::text as "locationId",
        l.name as "locationName",
        l.timezone as "locationTimezone",
        i.reference as "invoiceReference",
        c.currency as "currency",
        to_char(c.due_at at time zone 'UTC', ${sql.raw(ISO)}) as "dueAt",
        c.service_period_start::text as "servicePeriodStart",
        (c.amount_cents - coalesce((
          select sum(pa.amount_cents) from zaltyko.payment_allocations pa
           where pa.organization_id = c.organization_id and pa.charge_id = c.id
        ), 0))::text as "outstandingCents",
        g.id::text as "guardianId",
        coalesce(nullif(btrim(p.preferred_name), ''), nullif(btrim(p.given_name), '')) as "payerFirstName",
        contact.value as "payerEmail",
        to_char(rem.last_sent_at at time zone 'UTC', ${sql.raw(ISO)}) as "lastSentAt",
        coalesce(rem.sent_count, 0) as "sentCount",
        coalesce(rem.has_pending, false) as "hasPendingReservation",
        i.reference as sort_reference
      from zaltyko.charges c
      inner join zaltyko.invoices i
        on i.organization_id = c.organization_id and i.id = c.invoice_id
      inner join zaltyko.locations l
        on l.organization_id = c.organization_id and l.id = c.location_id
      left join zaltyko.family_payers fp
        on fp.organization_id = c.organization_id
       and fp.family_id = c.family_id
       and fp.id = coalesce(c.family_payer_id, i.family_payer_id)
      left join zaltyko.guardians g
        on g.organization_id = fp.organization_id and g.id = fp.guardian_id and g.is_active
      left join zaltyko.people p
        on p.organization_id = g.organization_id and p.id = g.person_id
      left join lateral (
        select gc.normalized_value as value
          from zaltyko.guardian_contacts gc
         where gc.organization_id = g.organization_id
           and gc.guardian_id = g.id
           and gc.kind = 'email'
         order by gc.is_primary desc, (gc.verified_at is not null) desc, gc.created_at asc, gc.id asc
         limit 1
      ) contact on true
      left join lateral (
        select max(r.sent_at) filter (where r.status = 'sent') as last_sent_at,
               count(*) filter (where r.status = 'sent') as sent_count,
               bool_or(
                 r.status = 'pending'
                 and r.created_at > now() - make_interval(mins => ${PENDING_WINDOW_MINUTES})
               ) as has_pending
          from zaltyko.payment_reminders r
         where r.organization_id = c.organization_id and r.charge_id = c.id
      ) rem on true
      where c.organization_id = ${filter.organizationId}::uuid
        and c.location_id in (${uuidList(filter.locationIds)})
        and c.status in ('due', 'partially_paid')
        and i.status not in ('draft', 'void')
        ${chargeFilter}
        ${dueFilter}
    ) open_charges
    where "outstandingCents"::bigint > 0
    order by "dueAt" asc, sort_reference asc, "chargeId" asc
    limit ${filter.limit}
  `);

  return (result.rows as unknown as CandidateRow[]).map((row) => ({
    chargeId: row.chargeId,
    familyId: row.familyId,
    locationId: row.locationId,
    locationName: row.locationName,
    locationTimezone: row.locationTimezone,
    invoiceReference: row.invoiceReference,
    currency: row.currency,
    dueAt: new Date(row.dueAt),
    servicePeriodStart: row.servicePeriodStart,
    outstandingCents: safeCents(row.outstandingCents),
    guardianId: row.guardianId,
    payerFirstName: row.payerFirstName,
    payerEmail: row.payerEmail,
    lastSentAt: row.lastSentAt ? new Date(row.lastSentAt) : null,
    sentCount: Number(row.sentCount),
    hasPendingReservation: row.hasPendingReservation === true,
  }));
}

/**
 * Serializa dos envíos simultáneos sobre las mismas cuotas (doble clic, dos
 * pestañas, un manual y el automático): el segundo espera, ve la reserva del
 * primero y se salta la cuota. Siempre en orden de id para evitar abrazos mortales.
 */
export async function lockCharges(
  tx: DatabaseClient,
  organizationId: string,
  chargeIds: string[]
): Promise<void> {
  if (chargeIds.length === 0) return;
  await tx.execute(sql`
    select c.id from zaltyko.charges c
     where c.organization_id = ${organizationId}::uuid and c.id in (${uuidList(chargeIds)})
     order by c.id
       for update
  `);
}

export interface OrganizationProfile {
  name: string;
  countryCode: string;
  status: string;
}

export async function loadOrganizationProfile(
  client: DatabaseClient,
  organizationId: string
): Promise<OrganizationProfile | null> {
  const result = await client.execute(sql`
    select name, country_code as "countryCode", status::text as status
      from zaltyko.organizations
     where id = ${organizationId}::uuid
  `);
  return (result.rows[0] as unknown as OrganizationProfile | undefined) ?? null;
}

export function localeForCountry(countryCode: string): string {
  return countryCode.toUpperCase() === "MX" ? "es-MX" : "es-ES";
}
