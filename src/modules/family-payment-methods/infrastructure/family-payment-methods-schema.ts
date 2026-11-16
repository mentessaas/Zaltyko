import { sql } from "drizzle-orm";
import { check, foreignKey, index, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import {
  familyGuardians,
  familyPayers,
  familyPaymentAuthorizations,
  organizationPaymentProviderAccounts,
  organizations,
  zaltyko,
} from "@/db/schema/zaltyko-core";

/**
 * Pago automático de cuotas (cobro automático, Fase 2): intentos de guardar
 * una tarjeta o una domiciliación de la persona pagadora en la cuenta Stripe
 * conectada de su academia.
 *
 * Espejo del candidato SQL
 * docs/deployment/candidates/20261116180000_family_payment_methods_candidate.sql,
 * que requiere autorización de Elvis y no está aplicado en ningún entorno.
 * La columna nueva de family_payment_authorizations (`paymentMethodKind`) sí
 * vive en src/db/schema/zaltyko-core.ts, porque esa tabla ya está en
 * `supabase/migrations`.
 *
 * Igual que payment-reminders, coach-assignment y session-plans, esta tabla NO
 * se exporta desde `src/db/schema/index.ts` ni desde `src/db/zaltyko-schema.ts`,
 * y `drizzle.config.ts` no la lee: un `db:generate`/`push` la crearía sin RLS
 * ni REVOKE. Vive fuera de `src/db/schema/` porque `pnpm validate:rls` exige a
 * cada tabla con academia de ese directorio RLS y política en el historial
 * aplicado (`supabase/migrations`), y este candidato no está en él.
 *
 * Consultarla solo tras isFamilyPaymentMethodsStorageAvailable().
 * Solo referencias opacas (cus_, seti_) y evidencia recortada del
 * consentimiento: nunca datos de tarjeta ni de banco.
 */

export const familyPaymentSetupAttempts = zaltyko.table(
  "family_payment_setup_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    familyId: uuid("family_id").notNull(),
    familyPayerId: uuid("family_payer_id").notNull(),
    guardianId: uuid("guardian_id").notNull(),
    paymentProviderAccountId: uuid("payment_provider_account_id").notNull(),
    paymentMethodKind: text("payment_method_kind").notNull(),
    providerCustomerReference: text("provider_customer_reference").notNull(),
    providerSetupReference: text("provider_setup_reference").notNull(),
    consentVersion: text("consent_version").notNull(),
    consentTextSha256: text("consent_text_sha256").notNull(),
    consentedAt: timestamp("consented_at", { withTimezone: true }).notNull(),
    clientIpPrefix: text("client_ip_prefix"),
    userAgentExcerpt: text("user_agent_excerpt"),
    status: text("status").notNull().default("open"),
    // Null salvo en `completed`.
    authorizationId: uuid("authorization_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("family_payment_setup_attempts_organization_id_id_uq").on(table.organizationId, table.id),
    uniqueIndex("family_payment_setup_attempts_setup_uq").on(
      table.organizationId,
      table.paymentProviderAccountId,
      table.providerSetupReference
    ),
    index("family_payment_setup_attempts_customer_idx").on(
      table.organizationId,
      table.paymentProviderAccountId,
      table.familyPayerId,
      table.createdAt.desc()
    ),
    check("family_payment_setup_attempts_method_kind_check", sql.raw("payment_method_kind in ('card', 'sepa_debit')")),
    check(
      "family_payment_setup_attempts_customer_reference_not_blank",
      sql.raw("btrim(provider_customer_reference) <> ''")
    ),
    check("family_payment_setup_attempts_setup_reference_not_blank", sql.raw("btrim(provider_setup_reference) <> ''")),
    check("family_payment_setup_attempts_consent_version_not_blank", sql.raw("btrim(consent_version) <> ''")),
    check("family_payment_setup_attempts_consent_digest_valid", sql.raw("consent_text_sha256 ~ '^[a-f0-9]{64}$'")),
    check(
      "family_payment_setup_attempts_client_ip_prefix_length",
      sql.raw("client_ip_prefix is null or char_length(client_ip_prefix) <= 64")
    ),
    check(
      "family_payment_setup_attempts_user_agent_excerpt_length",
      sql.raw("user_agent_excerpt is null or char_length(user_agent_excerpt) <= 120")
    ),
    check("family_payment_setup_attempts_status_check", sql.raw("status in ('open', 'completed', 'abandoned')")),
    check(
      "family_payment_setup_attempts_completed_authorization_valid",
      sql.raw("(status = 'completed') = (authorization_id is not null)")
    ),
    foreignKey({
      name: "family_payment_setup_attempts_payer_fk",
      columns: [table.organizationId, table.familyId, table.familyPayerId],
      foreignColumns: [familyPayers.organizationId, familyPayers.familyId, familyPayers.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "family_payment_setup_attempts_provider_account_fk",
      columns: [table.organizationId, table.paymentProviderAccountId],
      foreignColumns: [organizationPaymentProviderAccounts.organizationId, organizationPaymentProviderAccounts.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "family_payment_setup_attempts_guardian_fk",
      columns: [table.organizationId, table.familyId, table.guardianId],
      foreignColumns: [familyGuardians.organizationId, familyGuardians.familyId, familyGuardians.guardianId],
    }).onDelete("restrict"),
    foreignKey({
      name: "family_payment_setup_attempts_authorization_fk",
      columns: [table.organizationId, table.authorizationId],
      foreignColumns: [familyPaymentAuthorizations.organizationId, familyPaymentAuthorizations.id],
    }).onDelete("restrict"),
  ]
);

export type FamilyPaymentSetupAttemptRow = typeof familyPaymentSetupAttempts.$inferSelect;
