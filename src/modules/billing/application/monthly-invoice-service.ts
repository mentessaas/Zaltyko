import { createHash } from "node:crypto";

import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  athletes,
  charges,
  enrollmentPriceAssignments,
  enrollments,
  families,
  familyGuardians,
  familyMembers,
  familyPayers,
  guardians,
  invoiceLines,
  invoices,
  locations,
  outboxEvents,
  people,
  pricePlans,
  type Invoice,
} from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import { issueInvoiceInTransaction } from "@/modules/billing/application/ledger-service";
import { calendarDueDateToUtc } from "@/modules/billing/domain/calendar-due-date";
import { operationalActorSchema } from "@/modules/shared/application/actor";
import {
  OperationalError,
  type OperationalErrorCode,
} from "@/modules/shared/domain/operational-error";
import { assertOperationalAccess } from "@/modules/shared/infrastructure/operational-authorization";
import {
  appendAuditEntry,
  appendOutboxEvent,
  assertIdempotencyPayload,
  lockCommand,
} from "@/modules/shared/infrastructure/transactional-records";

const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const keySchema = z.string().trim().min(8).max(180);
const financialRoles = ["owner", "admin"] as const;

export type MonthlyInvoiceOptionsInput = {
  organizationId: string;
  locationId: string;
  servicePeriod: string;
  actor: z.infer<typeof operationalActorSchema>;
};

export type IssueMonthlyInvoiceInput = MonthlyInvoiceOptionsInput & {
  familyId: string;
  familyPayerId: string;
  dueDate: string;
  quoteHash: string;
  idempotencyKey: string;
};

function periodBounds(servicePeriod: string): { start: string; end: string } {
  const parsed = periodSchema.safeParse(servicePeriod);
  if (!parsed.success) {
    throw new OperationalError(
      "INVALID_DATE_RANGE",
      "El periodo debe tener formato YYYY-MM.",
      422
    );
  }
  const [year, month] = servicePeriod.split("-").map(Number);
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { start: `${servicePeriod}-01`, end };
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

type QuoteLine = {
  enrollmentId: string;
  athleteId: string;
  athleteName: string | null;
  pricePlanId: string;
  pricePlanName: string;
  assignmentId: string;
  unitAmountCents: number;
  currency: string;
};

type QuoteFamily = {
  familyId: string;
  athleteNames: string[];
  payers: Array<{
    familyPayerId: string;
    displayName: string | null;
    isPrimary: boolean;
  }>;
  enrollments: Array<{
    enrollmentId: string;
    athleteId: string;
    athleteName: string | null;
    status: string;
    billable: boolean;
    blockingReasons: string[];
    assignedPrice: {
      pricePlanId: string;
      name: string;
      amountCents: number;
      currency: string;
      startsOn: string;
      endsOn: string | null;
    } | null;
  }>;
  lines: QuoteLine[];
  totalAmountCents: number;
  currency: string | null;
  blockingReasons: string[];
  canIssue: boolean;
  quoteHash: string | null;
  existingInvoiceId: string | null;
  existingInvoiceVoided: boolean;
};

async function buildMonthlyInvoiceOptions(
  tx: TransactionClient,
  input: MonthlyInvoiceOptionsInput
) {
  const bounds = periodBounds(input.servicePeriod);
  await assertOperationalAccess(tx, {
    organizationId: input.organizationId,
    locationId: input.locationId,
    actor: input.actor,
    allowedRoles: financialRoles,
  });

  const [location] = await tx
    .select({ id: locations.id, timezone: locations.timezone })
    .from(locations)
    .where(
      and(
        eq(locations.organizationId, input.organizationId),
        eq(locations.id, input.locationId),
        eq(locations.isActive, true)
      )
    )
    .limit(1);
  if (!location) {
    throw new OperationalError("NOT_FOUND", "Sede no encontrada", 404);
  }

  const plans = await tx
    .select({
      id: pricePlans.id,
      name: pricePlans.name,
      amountCents: pricePlans.amountCents,
      currency: pricePlans.currency,
      cadence: pricePlans.cadence,
    })
    .from(pricePlans)
    .where(
      and(
        eq(pricePlans.organizationId, input.organizationId),
        eq(pricePlans.isActive, true),
        eq(pricePlans.cadence, "monthly")
      )
    )
    .orderBy(asc(pricePlans.name))
    .limit(100);
  const planById = new Map(plans.map((plan) => [plan.id, plan]));

  const enrollmentRows = await tx
    .select({
      enrollmentId: enrollments.id,
      athleteId: enrollments.athleteId,
      athleteName: sql<string>`nullif(btrim(concat_ws(' ', ${people.givenName}, ${people.familyName})), '')`,
      status: enrollments.status,
      startsOn: enrollments.startsOn,
      endsOn: enrollments.endsOn,
    })
    .from(enrollments)
    .innerJoin(
      athletes,
      and(
        eq(athletes.organizationId, enrollments.organizationId),
        eq(athletes.id, enrollments.athleteId),
        eq(athletes.isActive, true)
      )
    )
    .innerJoin(
      people,
      and(
        eq(people.organizationId, athletes.organizationId),
        eq(people.id, athletes.personId)
      )
    )
    .where(
      and(
        eq(enrollments.organizationId, input.organizationId),
        eq(enrollments.locationId, input.locationId),
        inArray(enrollments.status, ["active", "pending"]),
        lte(enrollments.startsOn, bounds.end),
        or(isNull(enrollments.endsOn), gte(enrollments.endsOn, bounds.start))
      )
    )
    .orderBy(asc(people.familyName), asc(people.givenName), asc(enrollments.id))
    .limit(1000);

  const athleteIds = [...new Set(enrollmentRows.map((row) => row.athleteId))];
  const enrollmentIds = enrollmentRows.map((row) => row.enrollmentId);
  const memberRows = athleteIds.length
    ? await tx
        .select({
          familyId: familyMembers.familyId,
          athleteId: familyMembers.athleteId,
          startsOn: familyMembers.startsOn,
          endsOn: familyMembers.endsOn,
          familyIsActive: families.isActive,
        })
        .from(familyMembers)
        .innerJoin(
          families,
          and(
            eq(families.organizationId, familyMembers.organizationId),
            eq(families.id, familyMembers.familyId)
          )
        )
        .where(
          and(
            eq(familyMembers.organizationId, input.organizationId),
            inArray(familyMembers.athleteId, athleteIds),
            lte(familyMembers.startsOn, bounds.end),
            or(
              isNull(familyMembers.endsOn),
              gte(familyMembers.endsOn, bounds.start)
            )
          )
        )
        .limit(2000)
    : [];
  const assignmentRows = enrollmentIds.length
    ? await tx
        .select()
        .from(enrollmentPriceAssignments)
        .where(
          and(
            eq(enrollmentPriceAssignments.organizationId, input.organizationId),
            inArray(enrollmentPriceAssignments.enrollmentId, enrollmentIds),
            lte(enrollmentPriceAssignments.startsOn, bounds.end),
            or(
              isNull(enrollmentPriceAssignments.endsOn),
              gte(enrollmentPriceAssignments.endsOn, bounds.start)
            )
          )
        )
        .orderBy(asc(enrollmentPriceAssignments.startsOn))
        .limit(2000)
    : [];

  const familyIds = [...new Set(memberRows.map((row) => row.familyId))];
  const payerRows = familyIds.length
    ? await tx
        .select({
          familyId: familyPayers.familyId,
          familyPayerId: familyPayers.id,
          isPrimary: familyPayers.isPrimary,
          displayName: sql<string>`nullif(btrim(concat_ws(' ', ${people.givenName}, ${people.familyName})), '')`,
          startsOn: familyPayers.startsOn,
          endsOn: familyPayers.endsOn,
        })
        .from(familyPayers)
        .innerJoin(
          familyGuardians,
          and(
            eq(familyGuardians.organizationId, familyPayers.organizationId),
            eq(familyGuardians.familyId, familyPayers.familyId),
            eq(familyGuardians.guardianId, familyPayers.guardianId),
            eq(familyGuardians.isActive, true)
          )
        )
        .innerJoin(
          guardians,
          and(
            eq(guardians.organizationId, familyPayers.organizationId),
            eq(guardians.id, familyPayers.guardianId),
            eq(guardians.isActive, true)
          )
        )
        .innerJoin(
          people,
          and(
            eq(people.organizationId, guardians.organizationId),
            eq(people.id, guardians.personId)
          )
        )
        .where(
          and(
            eq(familyPayers.organizationId, input.organizationId),
            inArray(familyPayers.familyId, familyIds),
            lte(familyPayers.startsOn, bounds.start),
            or(
              isNull(familyPayers.endsOn),
              gte(familyPayers.endsOn, bounds.end)
            )
          )
        )
        .orderBy(asc(familyPayers.familyId), asc(familyPayers.isPrimary))
        .limit(1000)
    : [];

  const memberByAthlete = new Map<string, typeof memberRows>();
  for (const row of memberRows) {
    const current = memberByAthlete.get(row.athleteId) ?? [];
    current.push(row);
    memberByAthlete.set(row.athleteId, current);
  }
  const assignmentsByEnrollment = new Map<string, typeof assignmentRows>();
  for (const row of assignmentRows) {
    const current = assignmentsByEnrollment.get(row.enrollmentId) ?? [];
    current.push(row);
    assignmentsByEnrollment.set(row.enrollmentId, current);
  }
  const payersByFamily = new Map<string, typeof payerRows>();
  for (const row of payerRows) {
    const current = payersByFamily.get(row.familyId) ?? [];
    current.push(row);
    payersByFamily.set(row.familyId, current);
  }

  const familyMap = new Map<string, QuoteFamily>();
  const unassignedEnrollments: Array<{
    enrollmentId: string;
    athleteId: string;
    athleteName: string | null;
    status: string;
    blockingReasons: string[];
  }> = [];

  for (const enrollment of enrollmentRows) {
    const memberships = memberByAthlete.get(enrollment.athleteId) ?? [];
    const overlapAssignments =
      assignmentsByEnrollment.get(enrollment.enrollmentId) ?? [];
    const coversEnrollmentMonth =
      enrollment.startsOn <= bounds.start &&
      (enrollment.endsOn === null || enrollment.endsOn >= bounds.end);
    const enrollmentReasons: string[] = [];
    if (enrollment.status === "pending") {
      enrollmentReasons.push("ENROLLMENT_PENDING");
    } else if (!coversEnrollmentMonth) {
      enrollmentReasons.push("ENROLLMENT_PERIOD_INCOMPLETE");
    }
    if (memberships.length === 0) {
      enrollmentReasons.push("FAMILY_REQUIRED");
    } else if (memberships.length > 1) {
      enrollmentReasons.push("FAMILY_MEMBERSHIP_AMBIGUOUS");
    } else {
      const member = memberships[0];
      if (
        member.startsOn > bounds.start ||
        (member.endsOn !== null && member.endsOn < bounds.end)
      ) {
        enrollmentReasons.push("FAMILY_MEMBERSHIP_PERIOD_INCOMPLETE");
      }
      if (!member.familyIsActive) enrollmentReasons.push("FAMILY_INACTIVE");
    }

    let assignment =
      overlapAssignments.length === 1 ? overlapAssignments[0] : null;
    if (overlapAssignments.length === 0) {
      enrollmentReasons.push("PRICE_ASSIGNMENT_REQUIRED");
    } else if (overlapAssignments.length > 1) {
      enrollmentReasons.push("PRICE_ASSIGNMENT_AMBIGUOUS");
      assignment = null;
    } else if (
      overlapAssignments[0].startsOn > bounds.start ||
      (overlapAssignments[0].endsOn !== null &&
        overlapAssignments[0].endsOn < bounds.end)
    ) {
      enrollmentReasons.push("PRICE_ASSIGNMENT_PERIOD_INCOMPLETE");
    }

    let assignedPrice: QuoteFamily["enrollments"][number]["assignedPrice"] =
      null;
    let quoteLine: QuoteLine | null = null;
    if (assignment) {
      const plan = planById.get(assignment.pricePlanId);
      if (!plan) {
        enrollmentReasons.push("PRICE_PLAN_NOT_AVAILABLE");
      } else if (assignment.currency !== plan.currency) {
        enrollmentReasons.push("PRICE_ASSIGNMENT_CURRENCY_MISMATCH");
      } else if (assignment.unitAmountCents <= 0) {
        enrollmentReasons.push("PRICE_PLAN_ZERO_AMOUNT");
      } else {
        assignedPrice = {
          pricePlanId: plan.id,
          name: plan.name,
          amountCents: assignment.unitAmountCents,
          currency: assignment.currency,
          startsOn: assignment.startsOn,
          endsOn: assignment.endsOn,
        };
        quoteLine = {
          enrollmentId: enrollment.enrollmentId,
          athleteId: enrollment.athleteId,
          athleteName: enrollment.athleteName,
          pricePlanId: plan.id,
          pricePlanName: plan.name,
          assignmentId: assignment.id,
          unitAmountCents: assignment.unitAmountCents,
          currency: assignment.currency,
        };
      }
    }

    if (memberships.length === 0) {
      unassignedEnrollments.push({
        enrollmentId: enrollment.enrollmentId,
        athleteId: enrollment.athleteId,
        athleteName: enrollment.athleteName,
        status: enrollment.status,
        blockingReasons: enrollmentReasons,
      });
      continue;
    }

    for (const membership of memberships) {
      let family = familyMap.get(membership.familyId);
      if (!family) {
        family = {
          familyId: membership.familyId,
          athleteNames: [],
          payers: (payersByFamily.get(membership.familyId) ?? []).map(
            (payer) => ({
              familyPayerId: payer.familyPayerId,
              displayName: payer.displayName,
              isPrimary: payer.isPrimary,
            })
          ),
          enrollments: [],
          lines: [],
          totalAmountCents: 0,
          currency: null,
          blockingReasons: [],
          canIssue: false,
          quoteHash: null,
          existingInvoiceId: null,
          existingInvoiceVoided: false,
        };
        familyMap.set(membership.familyId, family);
      }
      if (
        enrollment.athleteName &&
        !family.athleteNames.includes(enrollment.athleteName)
      ) {
        family.athleteNames.push(enrollment.athleteName);
      }
      family.enrollments.push({
        enrollmentId: enrollment.enrollmentId,
        athleteId: enrollment.athleteId,
        athleteName: enrollment.athleteName,
        status: enrollment.status,
        billable:
          enrollment.status === "active" && enrollmentReasons.length === 0,
        blockingReasons: enrollmentReasons,
        assignedPrice,
      });
      if (
        enrollment.status === "active" &&
        quoteLine &&
        enrollmentReasons.length === 0
      ) {
        family.lines.push(quoteLine);
      }
    }
  }

  const familyResults = [...familyMap.values()];
  const existingRows = familyIds.length
    ? await tx
        .select({
          familyId: invoices.familyId,
          invoiceId: invoices.id,
          status: invoices.status,
          voidedAt: invoices.voidedAt,
        })
        .from(invoices)
        .innerJoin(
          invoiceLines,
          and(
            eq(invoiceLines.organizationId, invoices.organizationId),
            eq(invoiceLines.invoiceId, invoices.id),
            eq(invoiceLines.lineType, "monthly_fee"),
            eq(invoiceLines.servicePeriodStart, bounds.start),
            eq(invoiceLines.servicePeriodEnd, bounds.end)
          )
        )
        .where(
          and(
            eq(invoices.organizationId, input.organizationId),
            eq(invoices.locationId, input.locationId),
            inArray(invoices.familyId, familyIds)
          )
        )
        .limit(1000)
    : [];
  const existingByFamily = new Map<string, (typeof existingRows)[number]>();
  for (const row of existingRows) existingByFamily.set(row.familyId, row);

  for (const family of familyResults) {
    family.blockingReasons = [
      ...new Set(
        family.enrollments.flatMap((item) =>
          item.status === "active" ? item.blockingReasons : []
        )
      ),
    ];
    if (!family.payers.length)
      family.blockingReasons.push("FAMILY_PAYER_REQUIRED");
    if (!family.lines.length)
      family.blockingReasons.push("NO_ACTIVE_ENROLLMENTS");
    const currencies = new Set(family.lines.map((line) => line.currency));
    if (currencies.size > 1) family.blockingReasons.push("CURRENCY_MISMATCH");
    family.currency = currencies.size === 1 ? [...currencies][0] : null;
    family.totalAmountCents = family.lines.reduce(
      (total, line) => total + line.unitAmountCents,
      0
    );
    family.lines.sort((a, b) => a.enrollmentId.localeCompare(b.enrollmentId));
    const existing = existingByFamily.get(family.familyId);
    if (existing) {
      family.existingInvoiceId = existing.invoiceId;
      family.existingInvoiceVoided =
        existing.voidedAt !== null || existing.status === "void";
      family.blockingReasons.push(
        family.existingInvoiceVoided
          ? "INVOICE_VOIDED"
          : "PERIOD_ALREADY_INVOICED"
      );
    }
    family.blockingReasons = [...new Set(family.blockingReasons)];
    family.canIssue = family.blockingReasons.length === 0;
    if (family.canIssue) {
      family.quoteHash = fingerprint({
        organizationId: input.organizationId,
        locationId: input.locationId,
        familyId: family.familyId,
        servicePeriod: input.servicePeriod,
        lines: family.lines.map((line) => ({
          enrollmentId: line.enrollmentId,
          assignmentId: line.assignmentId,
          pricePlanId: line.pricePlanId,
          amountCents: line.unitAmountCents,
          currency: line.currency,
        })),
        totalAmountCents: family.totalAmountCents,
        currency: family.currency,
      });
    }
  }

  return {
    organizationId: input.organizationId,
    locationId: input.locationId,
    servicePeriod: input.servicePeriod,
    servicePeriodStart: bounds.start,
    servicePeriodEnd: bounds.end,
    timezone: location.timezone,
    pricingNote: "Cuota mensual completa por inscripción; no se prorratea.",
    pricePlans: plans,
    families: familyResults.map((family) => ({
      ...family,
      lines: family.lines.map((line) => ({
        enrollmentId: line.enrollmentId,
        athleteName: line.athleteName,
        pricePlanId: line.pricePlanId,
        pricePlanName: line.pricePlanName,
        amountCents: line.unitAmountCents,
        currency: line.currency,
      })),
    })),
    unassignedEnrollments,
  };
}

export async function getMonthlyInvoiceOptions(
  input: MonthlyInvoiceOptionsInput
) {
  return db.transaction((tx) => buildMonthlyInvoiceOptions(tx, input));
}

function conflict(
  code: OperationalErrorCode,
  detail: string,
  extra?: Record<string, unknown>
) {
  return new OperationalError(code, detail, 409, extra);
}

async function loadInvoice(
  tx: TransactionClient,
  organizationId: string,
  invoiceId: string
): Promise<Invoice> {
  const [invoice] = await tx
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.organizationId, organizationId),
        eq(invoices.id, invoiceId)
      )
    )
    .limit(1);
  if (!invoice)
    throw new OperationalError("NOT_FOUND", "Factura no encontrada", 404);
  return invoice;
}

async function loadIssuedLines(
  tx: TransactionClient,
  organizationId: string,
  invoiceId: string
) {
  return tx
    .select({
      enrollmentId: invoiceLines.enrollmentId,
      athleteName: sql<string>`nullif(btrim(concat_ws(' ', ${people.givenName}, ${people.familyName})), '')`,
      amountCents: invoiceLines.amountCents,
      currency: invoiceLines.currency,
    })
    .from(invoiceLines)
    .leftJoin(
      enrollments,
      and(
        eq(enrollments.organizationId, invoiceLines.organizationId),
        eq(enrollments.id, invoiceLines.enrollmentId)
      )
    )
    .leftJoin(
      athletes,
      and(
        eq(athletes.organizationId, enrollments.organizationId),
        eq(athletes.id, enrollments.athleteId)
      )
    )
    .leftJoin(
      people,
      and(
        eq(people.organizationId, athletes.organizationId),
        eq(people.id, athletes.personId)
      )
    )
    .where(
      and(
        eq(invoiceLines.organizationId, organizationId),
        eq(invoiceLines.invoiceId, invoiceId)
      )
    )
    .orderBy(asc(invoiceLines.enrollmentId));
}

async function loadMonthlyChargeState(
  tx: TransactionClient,
  organizationId: string,
  invoiceId: string
): Promise<{
  chargeStatus: "due" | "partially_paid" | "paid" | "void" | "mixed";
  collectionMode: "manual";
  charges: Array<{
    id: string;
    status: "due" | "partially_paid" | "paid" | "void";
  }>;
}> {
  const rows = await tx
    .select({
      id: charges.id,
      status: charges.status,
      collectionMode: charges.collectionMode,
    })
    .from(charges)
    .where(
      and(
        eq(charges.organizationId, organizationId),
        eq(charges.invoiceId, invoiceId)
      )
    );
  if (
    rows.length === 0 ||
    rows.some((row) => row.collectionMode !== "manual")
  ) {
    throw new OperationalError(
      "MONTHLY_INVOICE_BLOCKED",
      "El estado del cargo mensual no coincide con la emisión manual esperada.",
      500
    );
  }
  const statuses = [...new Set(rows.map((row) => row.status))];
  return {
    chargeStatus: statuses.length === 1 ? statuses[0] : "mixed",
    collectionMode: "manual",
    charges: rows.map(({ id, status }) => ({ id, status })),
  };
}

export async function issueMonthlyInvoice(
  command: IssueMonthlyInvoiceInput
): Promise<{
  invoice: Invoice;
  replayed: boolean;
  lines: Awaited<ReturnType<typeof loadIssuedLines>>;
  chargeStatus: "due" | "partially_paid" | "paid" | "void" | "mixed";
  collectionMode: "manual";
  charges: Array<{
    id: string;
    status: "due" | "partially_paid" | "paid" | "void";
  }>;
}> {
  const input = {
    ...command,
    servicePeriod: periodSchema.parse(command.servicePeriod),
    dueDate: z.string().date().parse(command.dueDate),
    quoteHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .parse(command.quoteHash),
    idempotencyKey: keySchema.parse(command.idempotencyKey),
  };
  const bounds = periodBounds(input.servicePeriod);

  return db.transaction(async (tx) => {
    await lockCommand(
      tx,
      input.organizationId,
      `monthly-family:${input.familyId}:${input.servicePeriod}`
    );
    // Shared lock order with family association: family row, sorted athletes,
    // then sorted enrollment rows. This makes the quote a stable family snapshot.
    await lockCommand(
      tx,
      input.organizationId,
      `monthly-family-scope:${input.familyId}`
    );
    await tx.execute(sql`
      select id from zaltyko.families
      where organization_id = ${input.organizationId}::uuid
        and id = ${input.familyId}::uuid
      for update
    `);
    const [location] = await tx
      .select({ timezone: locations.timezone })
      .from(locations)
      .where(
        and(
          eq(locations.organizationId, input.organizationId),
          eq(locations.id, input.locationId),
          eq(locations.isActive, true)
        )
      )
      .limit(1);
    if (!location) {
      throw new OperationalError("NOT_FOUND", "Sede no encontrada", 404);
    }
    const dueAt = calendarDueDateToUtc(input.dueDate, location.timezone);
    const familyAthletes = await tx
      .select({ athleteId: familyMembers.athleteId })
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.organizationId, input.organizationId),
          eq(familyMembers.familyId, input.familyId),
          lte(familyMembers.startsOn, bounds.end),
          or(
            isNull(familyMembers.endsOn),
            gte(familyMembers.endsOn, bounds.start)
          )
        )
      );
    const familyAthleteIds = [
      ...new Set(familyAthletes.map((row) => row.athleteId)),
    ].sort();
    if (familyAthleteIds.length) {
      await tx.execute(sql`
        select id from zaltyko.athletes
        where organization_id = ${input.organizationId}::uuid
          and id in (${sql.join(
            familyAthleteIds.map((id) => sql`${id}::uuid`),
            sql`, `
          )})
        order by id for update
      `);
    }
    const [priorMarker] = await tx
      .select()
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.organizationId, input.organizationId),
          eq(outboxEvents.eventName, "invoice.monthly_issued"),
          eq(outboxEvents.idempotencyKey, input.idempotencyKey)
        )
      )
      .limit(1);
    if (priorMarker) {
      assertIdempotencyPayload(priorMarker.payload, {
        familyId: input.familyId,
        familyPayerId: input.familyPayerId,
        locationId: input.locationId,
        servicePeriod: input.servicePeriod,
        dueAt,
        quoteHash: input.quoteHash,
      });
      const invoiceId = priorMarker.payload.invoiceId;
      if (typeof invoiceId !== "string") {
        throw conflict(
          "IDEMPOTENCY_CONFLICT",
          "La factura previa no está disponible."
        );
      }
      const invoice = await loadInvoice(tx, input.organizationId, invoiceId);
      await assertOperationalAccess(tx, {
        organizationId: input.organizationId,
        locationId: invoice.locationId ?? input.locationId,
        actor: input.actor,
        allowedRoles: financialRoles,
      });
      return {
        invoice,
        replayed: true,
        lines: await loadIssuedLines(tx, input.organizationId, invoice.id),
        ...(await loadMonthlyChargeState(tx, input.organizationId, invoice.id)),
      };
    }

    const beforeLockOptions = await buildMonthlyInvoiceOptions(tx, input);
    const candidate = beforeLockOptions.families.find(
      (family) => family.familyId === input.familyId
    );
    if (!candidate) {
      throw new OperationalError(
        "NOT_FOUND",
        "No hay inscripciones de esta familia en la sede y periodo elegidos.",
        404
      );
    }
    const enrollmentIds = candidate.enrollments
      .map((item) => item.enrollmentId)
      .sort();
    for (const enrollmentId of enrollmentIds) {
      await lockCommand(
        tx,
        input.organizationId,
        `monthly-enrollment:${enrollmentId}:${input.servicePeriod}`
      );
    }
    if (enrollmentIds.length) {
      await tx.execute(sql`
        select id from zaltyko.enrollments
        where organization_id = ${input.organizationId}::uuid
          and id in (${sql.join(
            enrollmentIds.map((id) => sql`${id}::uuid`),
            sql`, `
          )})
        order by id for update
      `);
    }

    const options = await buildMonthlyInvoiceOptions(tx, input);
    const family = options.families.find(
      (item) => item.familyId === input.familyId
    );
    if (!family) {
      throw conflict(
        "QUOTE_STALE",
        "La cotización cambió. Actualiza la vista previa."
      );
    }

    const existing = await tx
      .select({
        invoice: invoices,
        enrollmentId: invoiceLines.enrollmentId,
      })
      .from(invoices)
      .innerJoin(
        invoiceLines,
        and(
          eq(invoiceLines.organizationId, invoices.organizationId),
          eq(invoiceLines.invoiceId, invoices.id),
          eq(invoiceLines.lineType, "monthly_fee"),
          eq(invoiceLines.servicePeriodStart, bounds.start),
          eq(invoiceLines.servicePeriodEnd, bounds.end)
        )
      )
      .where(
        and(
          eq(invoices.organizationId, input.organizationId),
          eq(invoices.familyId, input.familyId),
          eq(invoices.locationId, input.locationId)
        )
      );
    if (existing.length) {
      const invoice = existing[0].invoice;
      if (invoice.voidedAt || invoice.status === "void") {
        throw conflict(
          "INVOICE_VOIDED",
          "La factura del periodo está anulada. La reemisión requiere una decisión específica.",
          { invoiceId: invoice.id }
        );
      }
      const marker = await tx
        .select()
        .from(outboxEvents)
        .where(
          and(
            eq(outboxEvents.organizationId, input.organizationId),
            eq(outboxEvents.eventName, "invoice.monthly_issued"),
            eq(outboxEvents.aggregateId, invoice.id)
          )
        )
        .limit(1);
      const currentEnrollmentIds = existing
        .map((row) => row.enrollmentId)
        .filter((id): id is string => id !== null)
        .sort();
      const quotedEnrollmentIds = family.lines
        .map((line) => line.enrollmentId)
        .sort();
      const sameSelection =
        JSON.stringify(currentEnrollmentIds) ===
        JSON.stringify(quotedEnrollmentIds);
      if (
        marker[0] &&
        sameSelection &&
        marker[0].payload.familyPayerId === input.familyPayerId &&
        marker[0].payload.locationId === input.locationId &&
        marker[0].payload.dueAt === dueAt &&
        marker[0].payload.quoteHash === input.quoteHash
      ) {
        return {
          invoice,
          replayed: true,
          lines: await loadIssuedLines(tx, input.organizationId, invoice.id),
          ...(await loadMonthlyChargeState(
            tx,
            input.organizationId,
            invoice.id
          )),
        };
      }
      throw conflict(
        "PERIOD_ALREADY_INVOICED",
        "Ya existe una factura para esta familia y periodo con otra selección o cotización.",
        { invoiceId: invoice.id }
      );
    }

    if (!family.canIssue || !family.quoteHash || !family.currency) {
      throw new OperationalError(
        "MONTHLY_INVOICE_BLOCKED",
        "Completa la familia, el responsable y las tarifas mensuales de todas las inscripciones activas antes de emitir.",
        422,
        { blockingReasons: family.blockingReasons }
      );
    }
    if (
      !family.payers.some(
        (payer) => payer.familyPayerId === input.familyPayerId
      )
    ) {
      throw new OperationalError(
        "FAMILY_PAYER_INVALID",
        "El responsable elegido no está activo y vigente para este mes.",
        422
      );
    }
    if (family.quoteHash !== input.quoteHash) {
      throw conflict(
        "QUOTE_STALE",
        "La cotización cambió. Actualiza la vista previa."
      );
    }

    const existingEnrollmentCharges = await tx
      .select({
        enrollmentId: invoiceLines.enrollmentId,
        invoiceId: invoiceLines.invoiceId,
      })
      .from(invoiceLines)
      .where(
        and(
          eq(invoiceLines.organizationId, input.organizationId),
          inArray(
            invoiceLines.enrollmentId,
            family.lines.map((line) => line.enrollmentId)
          ),
          eq(invoiceLines.lineType, "monthly_fee"),
          eq(invoiceLines.servicePeriodStart, bounds.start),
          eq(invoiceLines.servicePeriodEnd, bounds.end)
        )
      );
    if (existingEnrollmentCharges.length) {
      throw conflict(
        "ENROLLMENT_ALREADY_BILLED",
        "Una o más inscripciones ya tienen una cuota para este periodo.",
        { invoiceId: existingEnrollmentCharges[0].invoiceId }
      );
    }

    const reference = `MENSUAL-${input.servicePeriod.replace("-", "")}-${input.familyId}`;
    const invoice = await issueInvoiceInTransaction(
      tx,
      {
        organizationId: input.organizationId,
        locationId: input.locationId,
        familyId: input.familyId,
        familyPayerId: input.familyPayerId,
        reference,
        currency: family.currency,
        dueAt,
        idempotencyKey: input.idempotencyKey,
        actor: input.actor,
        lines: family.lines.map((line) => ({
          enrollmentId: line.enrollmentId,
          pricePlanId: line.pricePlanId,
          lineType: "monthly_fee",
          quantity: 1,
          unitAmountCents: line.amountCents,
          servicePeriodStart: bounds.start,
          servicePeriodEnd: bounds.end,
        })),
      },
      { collectionMode: "manual" }
    );

    await appendOutboxEvent(tx, {
      organizationId: input.organizationId,
      locationId: input.locationId,
      eventName: "invoice.monthly_issued",
      aggregateType: "invoice",
      aggregateId: invoice.id,
      idempotencyKey: input.idempotencyKey,
      payload: {
        invoiceId: invoice.id,
        familyId: input.familyId,
        familyPayerId: input.familyPayerId,
        locationId: input.locationId,
        servicePeriod: input.servicePeriod,
        dueAt,
        quoteHash: input.quoteHash,
        totalAmountCents: family.totalAmountCents,
        currency: family.currency,
        enrollmentIds: family.lines.map((line) => line.enrollmentId).sort(),
      },
    });
    await appendAuditEntry(tx, {
      organizationId: input.organizationId,
      locationId: input.locationId,
      actorUserId: input.actor.userId,
      action: "invoice.monthly_issued",
      targetType: "invoice",
      targetId: invoice.id,
      idempotencyKey: `${input.idempotencyKey}:monthly`,
      after: {
        familyId: input.familyId,
        familyPayerId: input.familyPayerId,
        servicePeriod: input.servicePeriod,
        totalAmountCents: family.totalAmountCents,
        currency: family.currency,
        collectionMode: "manual",
      },
    });
    return {
      invoice,
      replayed: false,
      lines: await loadIssuedLines(tx, input.organizationId, invoice.id),
      ...(await loadMonthlyChargeState(tx, input.organizationId, invoice.id)),
    };
  });
}
