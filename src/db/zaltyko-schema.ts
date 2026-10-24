/**
 * Explicit entrypoint for the rebuilt domain.
 *
 * Do not merge this barrel with `src/db/schema/index.ts`: several canonical
 * names intentionally replace legacy concepts and must not be imported by old
 * code accidentally.
 */
export * from "./schema/zaltyko-core";
export * from "./schema/zaltyko-saas-billing";
export * from "./schema/zaltyko-ledger";
export * from "./schema/zaltyko-metrics";
export * from "./schema/zaltyko-health-score";
export * from "./schema/zaltyko-insights";
export * from "./schema/owner-signup-consent";
