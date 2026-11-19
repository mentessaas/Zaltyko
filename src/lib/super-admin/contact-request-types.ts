export const CONTACT_REQUEST_REASONS = [
  "demo",
  "network",
  "sales",
  "migracion",
  "support",
  "billing",
  "partnership",
  "market_access",
  "other",
] as const;

export type ContactRequestReason = (typeof CONTACT_REQUEST_REASONS)[number];
