import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export type OpenManualPaymentCharge = {
  chargeId: string;
  familyId: string;
  locationId: string;
  locationName: string;
  locationTimezone: string;
  invoiceReference: string;
  payerName: string | null;
  currency: string;
  dueAt: string;
  totalCents: number;
  allocatedCents: number;
  outstandingCents: number;
};

const PAGE_SIZE = 50;
const cursorPayloadSchema = z.object({
  version: z.literal(1),
  userId: z.guid(),
  memberId: z.guid(),
  role: z.enum(["owner", "admin"]),
  organizationId: z.guid(),
  selectedLocationId: z.guid().nullable(),
  locationScopeHash: z.string().regex(/^[a-f0-9]{64}$/),
  lastDueAt: z.string().datetime({ offset: true }),
  lastInvoiceReference: z.string().min(1).max(200),
  lastChargeId: z.guid(),
});
type ManualPaymentCursor = z.infer<typeof cursorPayloadSchema>;

function locationScopeHash(locationIds: string[]): string {
  return createHash("sha256")
    .update(JSON.stringify([...locationIds].sort()))
    .digest("hex");
}

function encodeCursor(payload: ManualPaymentCursor): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

// The cursor is an untrusted position hint, never an authorization grant.
// Each request resolves the actor and location scope again, compares that
// scope with the cursor payload, and applies the current scope in SQL.
function decodeCursor(
  value: string | undefined,
  expectedScope: Omit<
    ManualPaymentCursor,
    "version" | "lastDueAt" | "lastInvoiceReference" | "lastChargeId"
  >
): Pick<
  ManualPaymentCursor,
  "lastDueAt" | "lastInvoiceReference" | "lastChargeId"
> | null {
  if (!value) return null;
  if (value.length > 4096) {
    throw new OperationalError("INVALID_RELATION", "Cursor inválido", 400);
  }

  const encodedPayload = value;
  if (
    !encodedPayload ||
    !/^[A-Za-z0-9_-]+$/.test(encodedPayload)
  ) {
    throw new OperationalError("INVALID_RELATION", "Cursor inválido", 400);
  }

  let payload: ManualPaymentCursor;
  try {
    payload = cursorPayloadSchema.parse(
      JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"))
    );
  } catch {
    throw new OperationalError("INVALID_RELATION", "Cursor inválido", 400);
  }

  if (
    payload.version !== 1 ||
    payload.userId !== expectedScope.userId ||
    payload.memberId !== expectedScope.memberId ||
    payload.role !== expectedScope.role ||
    payload.organizationId !== expectedScope.organizationId ||
    payload.selectedLocationId !== expectedScope.selectedLocationId ||
    payload.locationScopeHash !== expectedScope.locationScopeHash
  ) {
    throw new OperationalError(
      "INVALID_RELATION",
      "El cursor ya no coincide con el alcance autorizado",
      400
    );
  }

  return {
    lastDueAt: payload.lastDueAt,
    lastInvoiceReference: payload.lastInvoiceReference,
    lastChargeId: payload.lastChargeId,
  };
}

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
  cursor?: string;
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

  const cursor = decodeCursor(input.cursor, {
    userId: input.userId,
    memberId: scope.member.id,
    role: scope.member.role as "owner" | "admin",
    organizationId: scope.organization.id,
    selectedLocationId: scope.selectedLocationId,
    locationScopeHash: locationScopeHash(visibleLocationIds),
  });

  const result = await db.execute(sql`
    select
      c.id::text as "chargeId",
      c.family_id::text as "familyId",
      c.location_id::text as "locationId",
      l.name as "locationName",
      l.timezone as "locationTimezone",
      i.reference as "invoiceReference",
      nullif(btrim(concat_ws(' ', p.given_name, p.family_name)), '') as "payerName",
      c.currency as "currency",
      c.due_at::text as "dueAt",
      to_char(
        c.due_at at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ) as "cursorDueAt",
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
      and (
        ${cursor?.lastDueAt ?? null}::timestamptz is null
        or (c.due_at, i.reference, c.id) > (
          ${cursor?.lastDueAt ?? null}::timestamptz,
          ${cursor?.lastInvoiceReference ?? null}::text,
          ${cursor?.lastChargeId ?? null}::uuid
        )
      )
    group by c.id, l.name, l.timezone, i.reference, p.given_name, p.family_name
    having coalesce(sum(pa.amount_cents), 0) < c.amount_cents
    order by c.due_at asc, i.reference asc, c.id asc
    limit ${PAGE_SIZE + 1}
  `);

  const hasMore = result.rows.length > PAGE_SIZE;
  const pageRows = result.rows.slice(0, PAGE_SIZE);
  const charges: OpenManualPaymentCharge[] = pageRows.map((row) => ({
    chargeId: String(row.chargeId),
    familyId: String(row.familyId),
    locationId: String(row.locationId),
    locationName: String(row.locationName),
    locationTimezone: String(row.locationTimezone),
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
    selectedLocationId: scope.selectedLocationId,
    canManageFamilyCollectionPreferences: scope.canViewOrganizationAggregate,
    charges,
    nextCursor:
      hasMore && pageRows.length > 0
        ? encodeCursor({
            version: 1,
            userId: input.userId,
            memberId: scope.member.id,
            role: scope.member.role as "owner" | "admin",
            organizationId: scope.organization.id,
            selectedLocationId: scope.selectedLocationId,
            locationScopeHash: locationScopeHash(visibleLocationIds),
            // Keep PostgreSQL's full microsecond precision; converting through
            // Date would truncate it and could repeat rows at a page boundary.
            lastDueAt: String(pageRows.at(-1)?.cursorDueAt),
            lastInvoiceReference: String(pageRows.at(-1)?.invoiceReference),
            lastChargeId: String(pageRows.at(-1)?.chargeId),
          })
        : null,
  };
}
