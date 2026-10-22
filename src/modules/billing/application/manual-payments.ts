import { sql } from "drizzle-orm";

import { db } from "@/db";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export type OpenManualPaymentCharge = {
  chargeId: string;
  familyId: string;
  locationId: string;
  locationName: string;
  invoiceReference: string;
  payerName: string | null;
  currency: string;
  dueAt: string;
  totalCents: number;
  allocatedCents: number;
  outstandingCents: number;
};

function safeCents(value: unknown): number {
  const cents = Number(value);
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new OperationalError(
      "INVALID_STATE_TRANSITION",
      "El saldo de un cargo necesita revisión antes de registrar pagos",
      409
    );
  }
  return cents;
}

/** Lists only open charges at locations the signed-in owner can access. */
export async function getManualPaymentOptions(input: {
  userId: string;
  organizationId?: string;
  locationId?: string;
}) {
  const scope = await resolveOwnerScope(input);
  if (!(scope.member.role === "owner" || scope.member.role === "admin")) {
    throw new OperationalError(
      "FORBIDDEN",
      "Solo la propiedad o administración puede registrar pagos",
      403
    );
  }

  const visibleLocationIds = scope.selectedLocationId
    ? [scope.selectedLocationId]
    : scope.locations.map((location) => location.id);
  if (visibleLocationIds.length === 0) {
    throw new OperationalError(
      "LOCATION_SCOPE_DENIED",
      "La academia necesita una sede accesible para registrar pagos",
      403
    );
  }

  const result = await db.execute(sql`
    select
      c.id::text as "chargeId",
      c.family_id::text as "familyId",
      c.location_id::text as "locationId",
      l.name as "locationName",
      i.reference as "invoiceReference",
      nullif(btrim(concat_ws(' ', p.given_name, p.family_name)), '') as "payerName",
      c.currency as "currency",
      c.due_at::text as "dueAt",
      c.amount_cents::text as "totalCents",
      coalesce(sum(pa.amount_cents), 0)::text as "allocatedCents",
      (c.amount_cents - coalesce(sum(pa.amount_cents), 0))::text as "outstandingCents"
    from zaltyko.charges c
    inner join zaltyko.invoices i
      on i.organization_id = c.organization_id and i.id = c.invoice_id
    inner join zaltyko.locations l
      on l.organization_id = c.organization_id and l.id = c.location_id
    left join zaltyko.family_payers fp
      on fp.organization_id = c.organization_id
      and fp.family_id = c.family_id
      and fp.id = c.family_payer_id
    left join zaltyko.guardians g
      on g.organization_id = fp.organization_id and g.id = fp.guardian_id
    left join zaltyko.people p
      on p.organization_id = g.organization_id and p.id = g.person_id
    left join zaltyko.payment_allocations pa
      on pa.organization_id = c.organization_id and pa.charge_id = c.id
    where c.organization_id = ${scope.organization.id}::uuid
      and c.location_id in (${sql.join(
        visibleLocationIds.map((locationId) => sql`${locationId}::uuid`),
        sql`, `
      )})
      and c.status in ('due', 'partially_paid')
      and i.status not in ('draft', 'void')
    group by c.id, l.name, i.reference, p.given_name, p.family_name
    having coalesce(sum(pa.amount_cents), 0) < c.amount_cents
    order by c.due_at asc, i.reference asc
    limit 250
  `);

  const charges: OpenManualPaymentCharge[] = result.rows.map((row) => ({
    chargeId: String(row.chargeId),
    familyId: String(row.familyId),
    locationId: String(row.locationId),
    locationName: String(row.locationName),
    invoiceReference: String(row.invoiceReference),
    payerName: typeof row.payerName === "string" ? row.payerName : null,
    currency: String(row.currency),
    dueAt: String(row.dueAt),
    totalCents: safeCents(row.totalCents),
    allocatedCents: safeCents(row.allocatedCents),
    outstandingCents: safeCents(row.outstandingCents),
  }));

  return {
    organization: scope.organization,
    locations: scope.locations,
    canManageFamilyCollectionPreferences: scope.canViewOrganizationAggregate,
    charges,
  };
}
