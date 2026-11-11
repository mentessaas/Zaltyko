/**
 * Lock order of a monthly issuance. It is shared with family association and
 * payment commands, so the order of every statement here is part of the
 * contract (pinned by the characterization trace and the PG suite):
 *
 * 1. lockIssuanceScope: period command lock, site row, family command locks,
 *    family row, then the family's athletes sorted by id.
 * 2. lockQuotedRows (after the first quote): enrollment command locks, then
 *    enrollments, price assignments, tariff coverage, class templates and price
 *    plans, each sorted by id.
 */
import { and, eq, sql } from "drizzle-orm";

import { locations } from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import { calendarDueDateToUtc } from "@/modules/billing/domain/calendar-due-date";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { lockCommand } from "@/modules/shared/infrastructure/transactional-records";

import type { IssueMonthlyInvoiceInput, PeriodBounds } from "./inputs";
import { loadMonthlyFamilyMemberships } from "./issued-reads";

/**
 * Takes the site and family locks, resolves the due date in the site's
 * timezone and locks the family's athletes. Returns the due instant.
 *
 * @internal Solo para issueMonthlyInvoice. El orden de bloqueos de la emisión
 * (periodo, sede, familia, gimnastas y filas cotizadas) solo se garantiza a
 * través de issueMonthlyInvoice; fuera de él puede bloquear en otro orden e
 * interbloquear con asociaciones de familia y cobros. Importa desde
 * monthly-invoice-service.
 */
export async function lockIssuanceScope(
  tx: TransactionClient,
  input: IssueMonthlyInvoiceInput,
  bounds: PeriodBounds
): Promise<{ dueAt: string }> {
  await lockCommand(
    tx,
    input.organizationId,
    `monthly-period:${input.locationId}:${input.servicePeriod}`
  );
  const lockedLocation = await tx.execute(sql`
      select id from zaltyko.locations
      where organization_id = ${input.organizationId}::uuid
        and id = ${input.locationId}::uuid
        and is_active = true
      for update
    `);
  if (lockedLocation.rows.length === 0) {
    throw new OperationalError("NOT_FOUND", "Sede no encontrada", 404);
  }
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
  // The shared family-scope lock above serializes this complete cohort read
  // with family association changes while stable pages are fetched.
  const familyAthletes = await loadMonthlyFamilyMemberships(
    tx,
    input.organizationId,
    input.familyId,
    bounds
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
  return { dueAt };
}

/**
 * Locks every row the quote of the family depends on, so the quote taken
 * right after is stable until commit.
 *
 * @internal Solo para issueMonthlyInvoice. El orden de bloqueos de la emisión
 * (periodo, sede, familia, gimnastas y filas cotizadas) solo se garantiza a
 * través de issueMonthlyInvoice; fuera de él puede bloquear en otro orden e
 * interbloquear con asociaciones de familia y cobros. Importa desde
 * monthly-invoice-service.
 */
export async function lockQuotedRows(
  tx: TransactionClient,
  input: IssueMonthlyInvoiceInput,
  bounds: PeriodBounds,
  enrollmentIds: readonly string[]
): Promise<void> {
  for (const enrollmentId of enrollmentIds) {
    await lockCommand(
      tx,
      input.organizationId,
      `monthly-enrollment:${enrollmentId}:${input.servicePeriod}`
    );
  }
  const lockedEnrollments = enrollmentIds.length
    ? await tx.execute(sql`
        select id, class_template_id from zaltyko.enrollments
        where organization_id = ${input.organizationId}::uuid
          and id in (${sql.join(
            enrollmentIds.map((id) => sql`${id}::uuid`),
            sql`, `
          )})
        order by id for update
      `)
    : { rows: [] as Array<Record<string, unknown>> };
  const classTemplateIds = [
    ...new Set(
      lockedEnrollments.rows.map((row) => String(row.class_template_id))
    ),
  ].sort();
  const assignmentLocks = enrollmentIds.length
    ? await tx.execute(sql`
        select id, price_plan_id from zaltyko.enrollment_price_assignments
        where organization_id = ${input.organizationId}::uuid
          and location_id = ${input.locationId}::uuid
          and enrollment_id in (${sql.join(
            enrollmentIds.map((id) => sql`${id}::uuid`),
            sql`, `
          )})
          and starts_on <= ${bounds.end}::date
          and (ends_on is null or ends_on >= ${bounds.start}::date)
        order by id for update
      `)
    : { rows: [] as Array<Record<string, unknown>> };
  const pricePlanIds = [
    ...new Set(assignmentLocks.rows.map((row) => String(row.price_plan_id))),
  ].sort();
  if (classTemplateIds.length && pricePlanIds.length) {
    await tx.execute(sql`
        select id from zaltyko.price_plan_class_template_coverage
        where organization_id = ${input.organizationId}::uuid
          and location_id = ${input.locationId}::uuid
          and price_plan_id in (${sql.join(
            pricePlanIds.map((id) => sql`${id}::uuid`),
            sql`, `
          )})
          and class_template_id in (${sql.join(
            classTemplateIds.map((id) => sql`${id}::uuid`),
            sql`, `
          )})
          and starts_on <= ${bounds.end}::date
          and (ends_on is null or ends_on >= ${bounds.start}::date)
        order by id for update
      `);
  }
  if (classTemplateIds.length) {
    await tx.execute(sql`
        select id from zaltyko.class_templates
        where organization_id = ${input.organizationId}::uuid
          and location_id = ${input.locationId}::uuid
          and id in (${sql.join(
            classTemplateIds.map((id) => sql`${id}::uuid`),
            sql`, `
          )})
        order by id for update
      `);
  }
  if (pricePlanIds.length) {
    await tx.execute(sql`
        select id from zaltyko.price_plans
        where organization_id = ${input.organizationId}::uuid
          and id in (${sql.join(
            pricePlanIds.map((id) => sql`${id}::uuid`),
            sql`, `
          )})
        order by id for update
      `);
  }
}
