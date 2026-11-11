/**
 * Monthly quote (cotización): which families of a site can be invoiced for a
 * month, with their lines, blocking reasons and quote hash. The statement
 * order below is pinned by the characterization trace (OPTIONS_READS).
 */
import { db } from "@/db";
import type { TransactionClient } from "@/lib/db-transactions";
import { assertOperationalAccess } from "@/modules/shared/infrastructure/operational-authorization";

import {
  finalizeFamilyQuotes,
  indexExistingInvoices,
} from "./blocking-reasons";
import {
  financialRoles,
  periodBounds,
  type MonthlyInvoiceOptionsInput,
} from "./inputs";
import { assembleQuoteFamilies } from "./quote-families";
import {
  readActiveLocation,
  readAthleteFamilyMemberships,
  readEnrollmentPriceAssignments,
  readExistingMonthlyInvoices,
  readFamilyPayers,
  readMonthlyPricePlans,
  readPeriodEnrollments,
  readReferenceOwners,
  readTariffCoverage,
} from "./quote-reads";
import { monthlyInvoiceReference } from "./reference";

/**
 * @internal Cotización dentro de una transacción ajena. Solo la usan
 * getMonthlyInvoiceOptions (lectura) e issueMonthlyInvoice (antes y después de
 * bloquear las filas cotizadas). Fuera de ahí no toma los bloqueos de la
 * emisión: el orden de bloqueos exige pasar por issueMonthlyInvoice. Importa
 * desde monthly-invoice-service.
 */
export async function buildMonthlyInvoiceOptions(
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

  const location = await readActiveLocation(tx, input);
  const plans = await readMonthlyPricePlans(tx, input);
  const enrollmentRows = await readPeriodEnrollments(tx, input, bounds);

  const athleteIds = [...new Set(enrollmentRows.map((row) => row.athleteId))];
  const enrollmentIds = enrollmentRows.map((row) => row.enrollmentId);
  const memberRows = await readAthleteFamilyMemberships(
    tx,
    input,
    bounds,
    athleteIds
  );
  const assignmentRows = await readEnrollmentPriceAssignments(
    tx,
    input,
    bounds,
    enrollmentIds
  );
  const coverageRows = await readTariffCoverage(
    tx,
    input,
    bounds,
    enrollmentRows,
    assignmentRows
  );

  const familyIds = [...new Set(memberRows.map((row) => row.familyId))];
  const payerRows = await readFamilyPayers(tx, input, bounds, familyIds);

  const { familyResults, unassignedEnrollments } = assembleQuoteFamilies({
    bounds,
    plans,
    enrollmentRows,
    memberRows,
    assignmentRows,
    coverageRows,
    payerRows,
  });

  const existingRows = await readExistingMonthlyInvoices(
    tx,
    input,
    bounds,
    familyIds
  );
  const { existingByFamily, siteLessFamilies, existingInvoiceIds } =
    indexExistingInvoices(existingRows);

  // The ledger keeps invoices_reference_uq UNIQUE (organization_id, reference).
  // Look up the reference each family would get so the quote does not offer an
  // issuance that the insert would reject. The family's own invoice for this
  // site and period is already reported above and is ignored here.
  const referenceByFamily = new Map(
    familyIds.map((familyId) => [
      familyId,
      monthlyInvoiceReference({
        servicePeriod: input.servicePeriod,
        familyId,
        locationId: input.locationId,
      }),
    ])
  );
  const referenceOwners = await readReferenceOwners(tx, input, [
    ...new Set(referenceByFamily.values()),
  ]);
  const takenReferences = new Set(
    referenceOwners
      .filter((row) => !existingInvoiceIds.has(row.invoiceId))
      .map((row) => row.reference)
  );

  finalizeFamilyQuotes(familyResults, {
    organizationId: input.organizationId,
    locationId: input.locationId,
    servicePeriod: input.servicePeriod,
    existingByFamily,
    siteLessFamilies,
    referenceByFamily,
    takenReferences,
  });

  return {
    organizationId: input.organizationId,
    locationId: input.locationId,
    servicePeriod: input.servicePeriod,
    servicePeriodStart: bounds.start,
    servicePeriodEnd: bounds.end,
    timezone: location.timezone,
    pricingNote:
      "Una cuota mensual completa por gimnasta; las clases incluidas se declaran explícitamente. No se prorratea.",
    pricePlans: plans,
    families: familyResults.map((family) => ({
      ...family,
      totalAmountCents: family.blockingReasons.includes("CURRENCY_MISMATCH")
        ? null
        : family.totalAmountCents,
      lines: family.lines.map((line) => ({
        athleteId: line.athleteId,
        athleteName: line.athleteName,
        pricePlanId: line.pricePlanId,
        pricePlanName: line.pricePlanName,
        amountCents: line.unitAmountCents,
        currency: line.currency,
        coveredEnrollments: line.coveredEnrollments,
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
