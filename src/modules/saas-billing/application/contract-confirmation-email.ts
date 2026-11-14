import { sql } from "drizzle-orm";

import { db } from "@/db";
import { sendEmailWithLogging } from "@/lib/email/email-service";
import { escapeHtml } from "@/lib/email/escape-html";
import { getAppUrl } from "@/lib/env";
import { getCommercialLaunchProfile } from "@/lib/launch/commercial-launch-profile";
import { logger } from "@/lib/logger";
import {
  IMMEDIATE_START_CONSENT_TEXT,
  IMMEDIATE_START_CONSENT_VERSION,
} from "../domain/immediate-start-consent";
import {
  formatEuroCentsExact,
  quoteSpanishVat,
  SPANISH_VAT_GENERAL_RATE_PERCENT,
} from "../domain/spanish-vat";
import type {
  SaasBillingInterval,
  SaasStripeEnvironment,
  SelfServePlanCode,
} from "./saas-billing-config";
import { isShortPaidQaOrganization } from "./short-paid-checkout-envelope";

/**
 * Correo de confirmación de la contratación SaaS (LSSI art. 28; TRLGDCU art.
 * 98.7). Se envía una sola vez por suscripción, tras el primer `invoice.paid`
 * (billing_reason `subscription_create`) que concede el plan. No es una
 * factura: la factura completa (serie ZA) la emite FacturaDirecta vía n8n.
 *
 * Solo enlaza a los Términos y a la Política de privacidad publicados; no
 * contiene texto legal propio salvo la casilla de inicio inmediato que el
 * cliente marcó (constante ya publicada en la pantalla del plan).
 */
export const SAAS_CONTRACT_CONFIRMATION_TEMPLATE = "saas-contract-confirmation";

export interface SaasContractConfirmation {
  environment: SaasStripeEnvironment;
  organizationId: string;
  /** Miembro (Owner) que inició el Checkout: su cuenta recibe el correo. */
  requestedByMemberId: string | null;
  planCode: SelfServePlanCode;
  billingInterval: SaasBillingInterval;
  subscriptionReference: string;
  invoiceReference: string;
  /** Importe sin impuestos, en céntimos de euro. */
  baseCents: number;
  taxCents: number;
  totalCents: number;
  periodStartedAt: Date;
  periodEndsAt: Date;
  /** Email que el cliente dejó en Checkout; solo se usa si falta el de la cuenta. */
  checkoutEmail: string | null;
  immediateStartConsentAccepted: boolean;
}

export type ContractConfirmationDelivery = "sent" | "skipped" | "failed";

const PLAN_LABELS: Record<SelfServePlanCode, string> = {
  starter: "Starter",
  growth: "Growth",
};

const INTERVAL_LABELS: Record<SaasBillingInterval, string> = {
  month: "mensual",
  year: "anual",
};

const longDate = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "long",
  timeZone: "Europe/Madrid",
});

function nonNegativeCents(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

/**
 * Datos de la confirmación a partir de un `invoice.paid` ya validado por el
 * webhook. Devuelve null cuando no es la primera factura de la suscripción
 * (renovaciones y cambios de plan no son una contratación nueva), cuando los
 * importes no son coherentes o para las organizaciones del ensayo QA
 * congelado, que no deben generar envíos.
 */
export function saasContractConfirmationFromPaidInvoice(input: {
  environment: SaasStripeEnvironment;
  organizationId: string;
  requestedByMemberId: string | null;
  planCode: SelfServePlanCode;
  billingInterval: SaasBillingInterval;
  subscriptionReference: string;
  invoice: Record<string, unknown>;
  subscriptionMetadata: Record<string, string>;
  periodStartedAt: Date;
  periodEndsAt: Date;
}): SaasContractConfirmation | null {
  const { invoice } = input;
  if (invoice.billing_reason !== "subscription_create") return null;
  if (isShortPaidQaOrganization(input.organizationId)) return null;
  const invoiceReference = typeof invoice.id === "string" ? invoice.id : null;
  const totalCents = nonNegativeCents(invoice.total);
  const baseCents =
    nonNegativeCents(invoice.total_excluding_tax) ??
    nonNegativeCents(invoice.subtotal_excluding_tax) ??
    nonNegativeCents(invoice.subtotal);
  if (!invoiceReference || totalCents === null || baseCents === null) return null;
  if (totalCents < baseCents) return null;
  const checkoutEmail =
    typeof invoice.customer_email === "string" && invoice.customer_email.trim()
      ? invoice.customer_email.trim().toLowerCase()
      : null;
  return {
    environment: input.environment,
    organizationId: input.organizationId,
    requestedByMemberId: input.requestedByMemberId,
    planCode: input.planCode,
    billingInterval: input.billingInterval,
    subscriptionReference: input.subscriptionReference,
    invoiceReference,
    baseCents,
    taxCents: totalCents - baseCents,
    totalCents,
    periodStartedAt: input.periodStartedAt,
    periodEndsAt: input.periodEndsAt,
    checkoutEmail,
    immediateStartConsentAccepted:
      input.subscriptionMetadata.immediate_start_consent ===
      IMMEDIATE_START_CONSENT_VERSION,
  };
}

/** Clave idempotente: una confirmación por suscripción y entorno. */
export function saasContractConfirmationDedupeKey(
  confirmation: Pick<SaasContractConfirmation, "environment" | "subscriptionReference">
): string {
  return `saas-contract-confirmation:${confirmation.environment}:${confirmation.subscriptionReference}`;
}

export interface SaasContractConfirmationContent {
  subject: string;
  html: string;
  text: string;
}

/** Contenido del correo. Función pura: no lee entorno ni base de datos. */
export function buildSaasContractConfirmationEmail(input: {
  confirmation: SaasContractConfirmation;
  organizationName: string | null;
  appUrl: string;
  seller: { legalName: string; taxId: string | null; supportEmail: string };
}): SaasContractConfirmationContent {
  const { confirmation, seller } = input;
  const appUrl = input.appUrl.replace(/\/+$/, "");
  const plan = PLAN_LABELS[confirmation.planCode];
  const interval = INTERVAL_LABELS[confirmation.billingInterval];
  const isTest = confirmation.environment === "test";
  const vatMatches =
    confirmation.taxCents > 0 &&
    quoteSpanishVat(confirmation.baseCents).taxCents === confirmation.taxCents;
  const taxLabel = vatMatches ? `IVA (${SPANISH_VAT_GENERAL_RATE_PERCENT} %)` : "IVA";
  const panelUrl = new URL("/owner/subscription", `${appUrl}/`);
  panelUrl.searchParams.set("organizationId", confirmation.organizationId);
  const termsUrl = `${appUrl}/terminos`;
  const privacyUrl = `${appUrl}/politica-privacidad`;
  const organizationName = input.organizationName?.trim() || null;

  const rows: Array<[string, string]> = [
    ["Plan", `${plan} (${interval})`],
    ["Precio sin IVA", formatEuroCentsExact(confirmation.baseCents)],
    [taxLabel, formatEuroCentsExact(confirmation.taxCents)],
    ["Total cobrado", formatEuroCentsExact(confirmation.totalCents)],
    ["Fecha de inicio", longDate.format(confirmation.periodStartedAt)],
    ["Próxima renovación", longDate.format(confirmation.periodEndsAt)],
  ];

  const subject = `${isTest ? "[Modo prueba] " : ""}Confirmación de tu contratación: Zaltyko ${plan} ${interval}`;
  const intro = organizationName
    ? `Confirmamos la contratación del plan ${plan} de Zaltyko para ${organizationName}, con pago ${interval}.`
    : `Confirmamos la contratación del plan ${plan} de Zaltyko, con pago ${interval}.`;
  const renewal =
    "La suscripción se renueva automáticamente al final de cada periodo hasta que la canceles.";
  const cancel =
    "Puedes cancelar o cambiar de plan cuando quieras desde el panel, en Suscripción. Si cancelas, el plan sigue activo hasta el final del periodo pagado.";
  const invoiceNotice =
    "Este correo no es una factura. La factura completa te llegará aparte, emitida por Zaltyko a través de FacturaDirecta.";
  const consent = confirmation.immediateStartConsentAccepted
    ? `Al contratar marcaste esta casilla: «${IMMEDIATE_START_CONSENT_TEXT}»`
    : null;
  const testNotice = isTest
    ? "Cobro en modo de prueba de Stripe: no se ha cobrado dinero real."
    : null;
  const sellerLine = seller.taxId
    ? `Zaltyko es un servicio de ${seller.legalName} (NIF ${seller.taxId}).`
    : `Zaltyko es un servicio de ${seller.legalName}.`;

  const text = [
    "Hola:",
    "",
    intro,
    "Guarda este correo como constancia.",
    ...(testNotice ? ["", testNotice] : []),
    "",
    ...rows.map(([label, value]) => `- ${label}: ${value}`),
    "",
    renewal,
    "",
    `Cómo cancelar: ${cancel}`,
    panelUrl.toString(),
    "",
    invoiceNotice,
    ...(consent ? ["", consent] : []),
    "",
    "La contratación se rige por los Términos y condiciones vigentes y la Política de privacidad:",
    `- Términos y condiciones: ${termsUrl}`,
    `- Política de privacidad: ${privacyUrl}`,
    "",
    `¿Dudas? Escríbenos a ${seller.supportEmail}.`,
    "",
    sellerLine,
  ].join("\n");

  const e = escapeHtml;
  const paragraph = (content: string) =>
    `<p style="margin: 0 0 16px 0; color: #374151; font-size: 15px; line-height: 1.5;">${content}</p>`;
  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${e(subject)}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 32px 16px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px;">
          <tr>
            <td style="padding: 32px 28px 8px 28px;">
              <h1 style="margin: 0 0 16px 0; color: #111827; font-size: 22px; font-weight: 600;">Confirmación de tu contratación</h1>
              ${paragraph("Hola:")}
              ${paragraph(`${e(intro)} Guarda este correo como constancia.`)}
              ${testNotice ? paragraph(`<strong>${e(testNotice)}</strong>`) : ""}
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 0 0 16px 0;">
                ${rows
                  .map(
                    ([label, value]) => `<tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; color: #6b7280; font-size: 14px;">${e(label)}</td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; color: #111827; font-size: 14px; text-align: right; font-weight: 600;">${e(value)}</td>
                </tr>`
                  )
                  .join("\n                ")}
              </table>
              ${paragraph(e(renewal))}
              ${paragraph(`<strong>Cómo cancelar.</strong> ${e(cancel)} <a href="${e(panelUrl.toString())}" style="color: #2563eb;">Ir a Suscripción</a>`)}
              ${paragraph(`<strong>Factura.</strong> ${e(invoiceNotice)}`)}
              ${consent ? paragraph(e(consent)) : ""}
              ${paragraph(`La contratación se rige por los <a href="${e(termsUrl)}" style="color: #2563eb;">Términos y condiciones</a> vigentes y la <a href="${e(privacyUrl)}" style="color: #2563eb;">Política de privacidad</a>.`)}
              ${paragraph(`¿Dudas? Escríbenos a <a href="mailto:${e(seller.supportEmail)}" style="color: #2563eb;">${e(seller.supportEmail)}</a>.`)}
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 28px; background-color: #f9fafb; border-radius: 0 0 8px 8px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 12px; line-height: 1.5;">${e(sellerLine)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  return { subject, html, text };
}

async function resolveConfirmationContext(
  confirmation: SaasContractConfirmation
): Promise<{ accountEmail: string | null; organizationName: string | null }> {
  // Email de la cuenta (auth.users) del Owner que contrató; nunca un email de
  // metadatos. Si el miembro ya no existe se usa el email de Checkout.
  const result = await db.execute(sql`
    select o.name as organization_name,
           (select lower(btrim(u.email))
              from zaltyko.organization_members m
              inner join auth.users u on u.id = m.user_id
             where m.id = ${confirmation.requestedByMemberId}::uuid
               and m.organization_id = o.id
               and u.email is not null
               and btrim(u.email) <> ''
             limit 1) as account_email
    from zaltyko.organizations o
    where o.id = ${confirmation.organizationId}::uuid
    limit 1
  `);
  const row = result.rows[0] as
    | { organization_name: string | null; account_email: string | null }
    | undefined;
  return {
    accountEmail: row?.account_email ?? null,
    organizationName: row?.organization_name ?? null,
  };
}

/**
 * Envía la confirmación. Nunca lanza: un fallo se registra (log y email_logs
 * en estado failed) y el webhook sigue. La idempotencia la da la clave
 * `dedupeKey` en email_logs (índice único sobre idempotency_key), además de
 * la deduplicación por id de evento del propio webhook.
 */
export async function sendSaasContractConfirmationEmail(
  confirmation: SaasContractConfirmation
): Promise<ContractConfirmationDelivery> {
  const logContext = {
    organizationId: confirmation.organizationId,
    subscriptionReference: confirmation.subscriptionReference,
    invoiceReference: confirmation.invoiceReference,
    environment: confirmation.environment,
  };
  try {
    const context = await resolveConfirmationContext(confirmation);
    const recipient = context.accountEmail ?? confirmation.checkoutEmail;
    if (!recipient) {
      logger.warn("saas_billing.contract_confirmation_without_recipient", logContext);
      return "skipped";
    }
    const profile = getCommercialLaunchProfile();
    const content = buildSaasContractConfirmationEmail({
      confirmation,
      organizationName: context.organizationName,
      appUrl: getAppUrl(),
      seller: {
        legalName: profile.legalName,
        taxId: profile.taxId,
        supportEmail: profile.supportEmail,
      },
    });
    const accepted = await sendEmailWithLogging({
      purpose: "transactional",
      to: recipient,
      subject: content.subject,
      html: content.html,
      text: content.text,
      replyTo: profile.supportEmail,
      template: SAAS_CONTRACT_CONFIRMATION_TEMPLATE,
      metadata: logContext,
      dedupeKey: saasContractConfirmationDedupeKey(confirmation),
    });
    if (!accepted) {
      logger.info("saas_billing.contract_confirmation_not_sent", logContext);
      return "skipped";
    }
    return "sent";
  } catch (error) {
    logger.error("saas_billing.contract_confirmation_failed", error, logContext);
    return "failed";
  }
}
