import { pgEnum } from "drizzle-orm/pg-core";

export const permissionEnum = pgEnum("permission", [
  "athletes:read", "athletes:create", "athletes:update", "athletes:delete",
  "classes:read", "classes:create", "classes:update", "classes:delete", "classes:schedule",
  "billing:read", "billing:create", "billing:update", "billing:payments", "billing:invoices", "billing:reports",
  "coaches:read", "coaches:create", "coaches:update", "coaches:delete",
  "reports:read", "reports:create", "reports:export",
  "settings:read", "settings:write", "settings:branding", "settings:users",
  "events:read", "events:create", "events:update", "events:delete",
  "communications:read", "communications:send", "communications:templates",
]);

export type Permission =
  | "athletes:read" | "athletes:create" | "athletes:update" | "athletes:delete"
  | "classes:read" | "classes:create" | "classes:update" | "classes:delete" | "classes:schedule"
  | "billing:read" | "billing:create" | "billing:update" | "billing:payments" | "billing:invoices" | "billing:reports"
  | "coaches:read" | "coaches:create" | "coaches:update" | "coaches:delete"
  | "reports:read" | "reports:create" | "reports:export"
  | "settings:read" | "settings:write" | "settings:branding" | "settings:users"
  | "events:read" | "events:create" | "events:update" | "events:delete"
  | "communications:read" | "communications:send" | "communications:templates";
