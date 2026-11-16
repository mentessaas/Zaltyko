/**
 * Conectar Stripe (cobro automático, Fase 1): adaptador fino sobre Stripe
 * Accounts v2.
 *
 * Solo traduce Stripe → `ConnectAccountSnapshot` y crea enlaces de alta. Sin
 * base de datos ni decisiones de negocio (eso vive en el dominio y en el
 * servicio). Nunca registra en logs el cuerpo de la cuenta: solo se devuelven
 * ids opacos `acct_…` y códigos de estado.
 *
 * La cuenta se crea para cargos directos: Stripe cobra sus comisiones a la
 * academia y asume las pérdidas (`fees_collector`/`losses_collector` =
 * `stripe`), con el Dashboard completo. Sin `application_fee` ni
 * configuración `recipient`.
 */
import type Stripe from "stripe";

import { getStripeClient } from "@/lib/stripe/client";
import type { ConnectAccountSnapshot } from "@/modules/payments-connect/domain/account-projection";

export interface ConnectAccountsGateway {
  createAccount(input: {
    organizationId: string;
    environment: "test";
    displayName: string;
    contactEmail: string | null;
  }): Promise<ConnectAccountSnapshot>;
  retrieveAccount(accountId: string): Promise<ConnectAccountSnapshot>;
  createOnboardingLink(input: {
    accountId: string;
    returnUrl: string;
    refreshUrl: string;
  }): Promise<{ url: string }>;
  parseAccountEvent(
    rawBody: string,
    signature: string,
    secret: string
  ): { eventId: string; type: string; accountId: string | null; livemode: boolean };
}

/**
 * Clave de idempotencia estable por academia y entorno: un doble clic o dos
 * pestañas a la vez devuelven la misma cuenta de Stripe.
 */
export function connectAccountIdempotencyKey(
  organizationId: string,
  environment: "test" | "live"
): string {
  return `zaltyko-connect-account:${environment}:${organizationId}`;
}

/** Partes de la cuenta v2 que lee el adaptador (las demás vienen a `null`). */
const ACCOUNT_INCLUDE: Stripe.V2.Core.AccountRetrieveParams.Include[] = [
  "configuration.merchant",
  "requirements",
  "identity",
];

/** Convierte la cuenta v2 en lo mínimo que necesita la proyección del dominio. */
function toSnapshot(account: Stripe.V2.Core.Account): ConnectAccountSnapshot {
  const capabilities = account.configuration?.merchant?.capabilities;
  return {
    id: account.id,
    closed: account.closed === true,
    cardPaymentsStatus: capabilities?.card_payments?.status ?? null,
    sepaDebitPaymentsStatus: capabilities?.sepa_debit_payments?.status ?? null,
    requirementEntries: (account.requirements?.entries ?? []).map((entry) => ({
      deadlineStatus: entry.minimum_deadline.status,
      awaitingActionFrom: entry.awaiting_action_from,
    })),
  };
}

/**
 * Eventos cuyo `related_object` es la cuenta conectada:
 * `v2.core.account.*` y `v2.core.account[…].*`. Se excluyen
 * `v2.core.account_link.*` (sin objeto relacionado) y
 * `v2.core.account_person.*` (el objeto es una persona, no la cuenta).
 */
function isAccountEventType(type: string): boolean {
  return type.startsWith("v2.core.account.") || type.startsWith("v2.core.account[");
}

function accountIdFromNotification(notification: Stripe.V2.Core.EventNotification): string | null {
  if (!isAccountEventType(notification.type)) return null;
  if (!("related_object" in notification)) return null;
  // Un tipo desconocido para el SDK puede traer `related_object: null`.
  const related: { id?: unknown } | null = notification.related_object;
  return related && typeof related.id === "string" && related.id !== "" ? related.id : null;
}

export function createStripeConnectGateway(stripe?: Stripe): ConnectAccountsGateway {
  // Se resuelve en cada llamada: crear el adaptador no exige la clave de Stripe.
  const client = (): Stripe => stripe ?? getStripeClient();

  return {
    async createAccount(input) {
      const params: Stripe.V2.Core.AccountCreateParams = {
        display_name: input.displayName,
        ...(input.contactEmail ? { contact_email: input.contactEmail } : {}),
        dashboard: "full",
        identity: { country: "es" },
        defaults: {
          currency: "eur",
          locales: ["es-ES"],
          responsibilities: { fees_collector: "stripe", losses_collector: "stripe" },
        },
        configuration: {
          merchant: {
            capabilities: {
              card_payments: { requested: true },
              sepa_debit_payments: { requested: true },
            },
          },
        },
        metadata: {
          zaltyko_organization_id: input.organizationId,
          zaltyko_environment: input.environment,
        },
        include: ACCOUNT_INCLUDE,
      };
      const account = await client().v2.core.accounts.create(params, {
        idempotencyKey: connectAccountIdempotencyKey(input.organizationId, input.environment),
      });
      return toSnapshot(account);
    },

    async retrieveAccount(accountId) {
      const account = await client().v2.core.accounts.retrieve(accountId, {
        include: ACCOUNT_INCLUDE,
      });
      return toSnapshot(account);
    },

    async createOnboardingLink(input) {
      const link = await client().v2.core.accountLinks.create({
        account: input.accountId,
        use_case: {
          type: "account_onboarding",
          account_onboarding: {
            configurations: ["merchant"],
            return_url: input.returnUrl,
            refresh_url: input.refreshUrl,
            collection_options: { fields: "eventually_due" },
          },
        },
      });
      return { url: link.url };
    },

    parseAccountEvent(rawBody, signature, secret) {
      // Verifica la firma; si no es válida, el SDK lanza y el error se propaga.
      const notification = client().parseEventNotification(rawBody, signature, secret);
      return {
        eventId: notification.id,
        type: notification.type,
        accountId: accountIdFromNotification(notification),
        livemode: notification.livemode,
      };
    },
  };
}
