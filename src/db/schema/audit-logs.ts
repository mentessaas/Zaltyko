import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { profileRoleEnum } from "./enums";

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id"),
    userId: uuid("user_id"),
    userEmail: text("user_email"), // Cache del email para búsquedas
    action: text("action").notNull(),
    module: text("module").notNull(), // athletes, classes, billing, etc.
    resourceType: text("resource_type"), // athlete, class, invoice, etc.
    resourceId: uuid("resource_id"),
    resourceName: text("resource_name"), // Nombre legible del recurso
    description: text("description"), // Descripción legible de la acción
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    meta: jsonb("meta"), // Datos adicionales de la acción
    status: text("status").notNull().default("success"), // success, failed, warning
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantCreatedIdx: index("audit_logs_tenant_created_idx").on(table.tenantId, table.createdAt),
    userIdx: index("audit_logs_user_idx").on(table.userId),
    moduleIdx: index("audit_logs_module_idx").on(table.module),
    actionIdx: index("audit_logs_action_idx").on(table.action),
    resourceIdx: index("audit_logs_resource_idx").on(table.resourceType, table.resourceId),
    tenantModuleIdx: index("audit_logs_tenant_module_idx").on(table.tenantId, table.module, table.createdAt),
  })
);

// Tipos de acciones del sistema
export const auditActionEnum = [
  // Auth
  "auth.login",
  "auth.logout",
  "auth.login_failed",
  "auth.password_change",
  "auth.password_reset",

  // Users
  "users.create",
  "users.update",
  "users.delete",
  "users.invite",
  "users.suspend",
  "users.role_change",

  // Athletes
  "athletes.create",
  "athletes.update",
  "athletes.delete",
  "athletes.import",
  "athletes.export",
  "athletes.status_change",

  // Classes
  "classes.create",
  "classes.update",
  "classes.delete",
  "classes.schedule",
  "classes.cancel",
  "classes.enrollment",

  // Billing
  "billing.invoice_create",
  "billing.invoice_update",
  "billing.payment_received",
  "billing.payment_failed",
  "billing.charge_create",

  // Events
  "events.create",
  "events.update",
  "events.delete",
  "events.publish",
  "events.registration",

  // Settings
  "settings.update",
  "settings.branding_update",
  "settings.integration_update",
] as const;

export type AuditAction = typeof auditActionEnum[number];

// Módulos del sistema para audit
export const auditModuleEnum = [
  "auth",
  "users",
  "athletes",
  "classes",
  "billing",
  "coaches",
  "reports",
  "settings",
  "events",
  "communications",
  "support",
  "marketplace",
  "empleo",
] as const;

export type AuditModule = typeof auditModuleEnum[number];