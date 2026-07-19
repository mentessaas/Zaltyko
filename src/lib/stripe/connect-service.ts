import Stripe from "stripe";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, stripeAccounts } from "@/db/schema";
import { getStripeClient } from "@/lib/stripe/client";
import { getAppUrl } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Servicio de Stripe Connect (Standard).
 *
 * Cada academia conecta su propia cuenta de Stripe. La academia es merchant of
 * record; los fondos van directos a su cuenta. Zaltyko solo persiste el
 * `stripe_account_id` (acct_…) y el estado de habilitacion. Nunca claves
 * secretas ni custodia de fondos.
 */

export type ConnectOnboardingStatus =
  | "pending"
  | "onboarding"
  | "enabled"
  | "restricted"
  | "disabled";

export interface ConnectAccountRow {
  id: string;
  tenantId: string;
  academyId: string;
  stripeAccountId: string;
  country: string | null;
  defaultCurrency: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  onboardingStatus: string;
  lastSyncedAt: Date | null;
}

/**
 * Deriva el estado de onboarding a partir del objeto Account de Stripe.
 */
export function mapOnboardingStatus(account: Stripe.Account): ConnectOnboardingStatus {
  const requirements = account.requirements;
  const hasBlockingRequirements =
    (requirements?.currently_due?.length ?? 0) > 0 ||
    (requirements?.past_due?.length ?? 0) > 0 ||
    !!requirements?.disabled_reason;

  if (account.charges_enabled && account.payouts_enabled) {
    return "enabled";
  }
  if (!account.details_submitted) {
    return "onboarding";
  }
  if (hasBlockingRequirements) {
    return account.charges_enabled ? "restricted" : "disabled";
  }
  return "onboarding";
}

/**
 * Lee la fila stripe_accounts de una academia (o null si no existe).
 */
export async function getConnectAccount(academyId: string): Promise<ConnectAccountRow | null> {
  const [row] = await db
    .select()
    .from(stripeAccounts)
    .where(eq(stripeAccounts.academyId, academyId))
    .limit(1);
  return (row as ConnectAccountRow) ?? null;
}

interface EnsureAccountParams {
  academyId: string;
  tenantId: string;
  country?: string | null;
  email?: string | null;
  academyName?: string | null;
}

/**
 * Devuelve la cuenta conectada de la academia, creandola en Stripe si no existe.
 * Idempotente por academia: usa el unique index (academy_id) para no duplicar.
 */
export async function getOrCreateConnectAccount(
  params: EnsureAccountParams
): Promise<ConnectAccountRow> {
  const existing = await getConnectAccount(params.academyId);
  if (existing) {
    return existing;
  }

  const stripe = getStripeClient();
  const account = await stripe.accounts.create(
    {
      type: "standard",
      country: params.country ?? undefined,
      email: params.email ?? undefined,
      business_profile: params.academyName ? { name: params.academyName } : undefined,
      metadata: {
        academyId: params.academyId,
        tenantId: params.tenantId,
      },
    },
    { idempotencyKey: `connect_account_${params.academyId}` }
  );

  const [row] = await db
    .insert(stripeAccounts)
    .values({
      tenantId: params.tenantId,
      academyId: params.academyId,
      stripeAccountId: account.id,
      country: account.country ?? params.country ?? null,
      defaultCurrency: account.default_currency ?? "eur",
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      onboardingStatus: mapOnboardingStatus(account),
      lastSyncedAt: new Date(),
    })
    .onConflictDoNothing({ target: stripeAccounts.academyId })
    .returning();

  if (row) {
    return row as ConnectAccountRow;
  }

  // Otra request gano la carrera: releer la fila existente.
  const latest = await getConnectAccount(params.academyId);
  if (!latest) {
    throw new Error(`CONNECT_ACCOUNT_CLAIM_FAILED:${params.academyId}`);
  }
  return latest;
}

/**
 * Crea un AccountLink de onboarding hosted por Stripe. Stripe realiza el KYC.
 */
export async function createOnboardingLink(
  stripeAccountId: string,
  academyId: string
): Promise<string> {
  const stripe = getStripeClient();
  const baseUrl = getAppUrl();
  const link = await stripe.accountLinks.create({
    account: stripeAccountId,
    // StripeConnectCard vive en la pestaña "Cobros" de Ajustes, no en /billing.
    refresh_url: `${baseUrl}/app/${academyId}/settings?connect=refresh`,
    return_url: `${baseUrl}/app/${academyId}/settings?connect=return`,
    type: "account_onboarding",
  });
  return link.url;
}

/**
 * Crea un enlace al dashboard Express/Standard (login link) si aplica. Para
 * cuentas Standard el dueño gestiona su cuenta en dashboard.stripe.com, asi que
 * devolvemos null y la UI enlaza a Stripe directamente.
 */

/**
 * Recupera el Account desde Stripe y sincroniza la fila local. Se usa tras el
 * retorno de onboarding y desde el webhook account.updated.
 */
export async function syncConnectAccountFromStripe(
  account: Stripe.Account
): Promise<ConnectAccountRow | null> {
  const onboardingStatus = mapOnboardingStatus(account);
  const [row] = await db
    .update(stripeAccounts)
    .set({
      country: account.country ?? null,
      defaultCurrency: account.default_currency ?? "eur",
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      onboardingStatus,
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(stripeAccounts.stripeAccountId, account.id))
    .returning();

  if (!row) {
    logger.warn("account.updated recibido para cuenta Connect no registrada", {
      stripeAccountId: account.id,
    });
    return null;
  }

  // Reutiliza el flag de onboarding existente: la academia queda "con pagos
  // configurados" cuando Connect habilita cobros de verdad (no un flag falso).
  if (onboardingStatus === "enabled") {
    const typedRow = row as ConnectAccountRow;
    await db
      .update(academies)
      .set({ paymentsConfiguredAt: new Date() })
      .where(eq(academies.id, typedRow.academyId));

    // Preserva el marcado de onboarding que antes hacia el endpoint falso
    // /api/payments/configure.
    try {
      const { markChecklistItem, markWizardStep } = await import("@/lib/onboarding");
      await markChecklistItem({
        academyId: typedRow.academyId,
        tenantId: typedRow.tenantId,
        key: "enable_payments",
      });
      await markWizardStep({
        academyId: typedRow.academyId,
        tenantId: typedRow.tenantId,
        step: "payments-team",
      });
    } catch (error) {
      logger.warn("No se pudo marcar el onboarding de pagos", { error: String(error) });
    }
  }

  return row as ConnectAccountRow;
}

/**
 * Recupera el estado actual desde Stripe por academyId y lo sincroniza.
 */
export async function refreshConnectAccountStatus(
  academyId: string
): Promise<ConnectAccountRow | null> {
  const local = await getConnectAccount(academyId);
  if (!local) return null;

  const stripe = getStripeClient();
  const account = await stripe.accounts.retrieve(local.stripeAccountId);
  return syncConnectAccountFromStripe(account);
}

/**
 * ¿Puede esta academia cobrar con tarjeta a las familias? Requiere cuenta
 * conectada con charges habilitados.
 */
export function isConnectReady(account: ConnectAccountRow | null): boolean {
  return !!account && account.chargesEnabled && account.onboardingStatus === "enabled";
}
