/**
 * Public facade of monthly invoicing. Routes, scripts, components and tests
 * import from here; the implementation lives in ./monthly-invoice/:
 *
 * - inputs.ts            command types, period/key schemas, roles
 * - errors.ts            conflict(): 409 OperationalError
 * - paging.ts            page sizes and batched keyset reads
 * - reference.ts         `MENSUAL-YYYYMM-<familyId>-<siteHash16>` and the 23505 check
 * - quote-model.ts       quote types and the quote hash
 * - quote-reads.ts       reads behind the quote (SQL pinned by the snapshot)
 * - blocking-reasons.ts  per-enrollment and per-family blocking reasons
 * - quote-families.ts    families, athlete lines and tariff conflicts
 * - quote.ts             getMonthlyInvoiceOptions / buildMonthlyInvoiceOptions
 * - issued-reads.ts      issued invoice, lines, charge and replay state
 * - issue-locks.ts       lock order of an issuance and the family cohort it locks
 * - replay.ts            replay by idempotency key and by period
 * - issue.ts             issueMonthlyInvoice
 */
export type {
  IssueMonthlyInvoiceInput,
  MonthlyInvoiceOptionsInput,
} from "./monthly-invoice/inputs";
export { monthlyInvoiceReference } from "./monthly-invoice/reference";
export { getMonthlyInvoiceOptions } from "./monthly-invoice/quote";
export {
  loadIssuedLines,
  loadMonthlyChargeState,
  loadMonthlyReplayState,
} from "./monthly-invoice/issued-reads";
export { loadMonthlyFamilyMemberships } from "./monthly-invoice/issue-locks";
export { issueMonthlyInvoice } from "./monthly-invoice/issue";
