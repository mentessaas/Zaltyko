import { createHash } from "node:crypto";

/**
 * Hex characters of the site discriminator in a monthly invoice reference.
 *
 * Why a hash of the location id and not the site itself:
 * - The full UUID would give 8 + 6 + 1 + 36 + 1 + 36 = 88 characters, over the
 *   ledger's 80-character reference limit (ledger-service issueInvoiceSchema).
 * - `locations.code` is unique per organization but may be up to 32 characters
 *   (84 in total, also over the limit) and can be edited, so an old reference
 *   could later match a different site that reuses the code.
 * - The location id is immutable; its SHA-256 is uniformly distributed even if
 *   ids were ever time-ordered, unlike a plain UUID prefix.
 *
 * Why 16 hex characters (64 bits): references only need to differ between the
 * sites of one organization for the same family and month. Two sites collide
 * with probability 2^-64; an organization with 1,000 sites has ~5·10^5 pairs,
 * about 3·10^-14 overall. The reference stays at a fixed 68 characters, 12 under
 * the limit. Even then a collision is not silent: the quote reports
 * INVOICE_REFERENCE_TAKEN and the insert is translated into an OperationalError.
 */
const MONTHLY_REFERENCE_SITE_HEX_LENGTH = 16;

/**
 * Reference of a monthly invoice: `MENSUAL-YYYYMM-<familyId>-<siteHash16>`.
 *
 * Invoices issued before the site discriminator keep their stored
 * `MENSUAL-YYYYMM-<familyId>` reference; they never equal a new reference
 * (different length), and replay detection, by idempotency marker and by
 * family + site + period lines, does not read the reference at all.
 */
export function monthlyInvoiceReference(input: {
  servicePeriod: string;
  familyId: string;
  locationId: string;
}): string {
  const siteHash = createHash("sha256")
    .update(`zaltyko:monthly-invoice-site:v1:${input.locationId.toLowerCase()}`)
    .digest("hex")
    .slice(0, MONTHLY_REFERENCE_SITE_HEX_LENGTH);
  return `MENSUAL-${input.servicePeriod.replace("-", "")}-${input.familyId.toLowerCase()}-${siteHash}`;
}

/**
 * Reference a monthly invoice of the family and month got before the site
 * discriminator, `MENSUAL-YYYYMM-<familyId>`, in lower case. That code built it
 * from the family id of the command as sent, and its route accepted any case
 * (z.string().uuid()), so it is compared without case: readReferenceOwners
 * matches `lower(reference)` and the caller indexes it by this lower-case key.
 *
 * @internal Uso exclusivo de monthly-invoice/*; la API pública está en
 * monthly-invoice-service.ts.
 */
export function legacyMonthlyInvoiceReferenceKey(input: {
  servicePeriod: string;
  familyId: string;
}): string {
  return `MENSUAL-${input.servicePeriod.replace("-", "")}-${input.familyId}`.toLowerCase();
}

const INVOICE_REFERENCE_CONSTRAINT = "invoices_reference_uq";

/**
 * True when a database error (or any error in its cause chain) is the
 * reference unique violation.
 *
 * @internal Uso exclusivo de monthly-invoice/*; la API pública está en
 * monthly-invoice-service.ts.
 */
export function isInvoiceReferenceViolation(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const candidate = current as {
      code?: unknown;
      constraint?: unknown;
      cause?: unknown;
    };
    if (
      candidate.code === "23505" &&
      candidate.constraint === INVOICE_REFERENCE_CONSTRAINT
    ) {
      return true;
    }
    current = candidate.cause;
  }
  return false;
}
