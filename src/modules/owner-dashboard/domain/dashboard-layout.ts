import { z } from "zod";

export const OWNER_DASHBOARD_MODULES = [
  "kpis",
  "trends",
  "explanation",
  "operations",
] as const;

export type OwnerDashboardModule = (typeof OWNER_DASHBOARD_MODULES)[number];

export const DEFAULT_OWNER_DASHBOARD_ORDER: OwnerDashboardModule[] = [
  ...OWNER_DASHBOARD_MODULES,
];

const moduleSchema = z.enum(OWNER_DASHBOARD_MODULES);

export const ownerDashboardModuleOrderSchema = z
  .array(moduleSchema)
  .length(OWNER_DASHBOARD_MODULES.length)
  .refine((order) => new Set(order).size === OWNER_DASHBOARD_MODULES.length, {
    message: "Cada módulo debe aparecer una sola vez.",
  });
