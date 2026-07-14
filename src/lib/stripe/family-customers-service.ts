import Stripe from "stripe";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { familyStripeCustomers } from "@/db/schema";
import { getStripeClient } from "@/lib/stripe/client";

/**
 * Servicio de customers de familia sobre cuentas conectadas (Connect Standard).
 *
 * Todas las operaciones de Stripe se ejecutan con `{ stripeAccount }` para que
 * el customer y el metodo de pago vivan en la cuenta de la academia. Zaltyko
 * nunca ve el PAN: solo guarda ids y metadatos de display.
 */

export interface FamilyCustomerRow {
  id: string;
  tenantId: string;
  academyId: string;
  profileId: string;
  stripeCustomerId: string;
  defaultPaymentMethodId: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  cardExpMonth: number | null;
  cardExpYear: number | null;
}

export async function getFamilyCustomer(
  academyId: string,
  profileId: string
): Promise<FamilyCustomerRow | null> {
  const [row] = await db
    .select()
    .from(familyStripeCustomers)
    .where(
      and(
        eq(familyStripeCustomers.academyId, academyId),
        eq(familyStripeCustomers.profileId, profileId)
      )
    )
    .limit(1);
  return (row as FamilyCustomerRow) ?? null;
}

interface EnsureCustomerParams {
  academyId: string;
  tenantId: string;
  profileId: string;
  stripeAccountId: string;
  email?: string | null;
  name?: string | null;
}

export async function getOrCreateFamilyCustomer(
  params: EnsureCustomerParams
): Promise<FamilyCustomerRow> {
  const existing = await getFamilyCustomer(params.academyId, params.profileId);
  if (existing) return existing;

  const stripe = getStripeClient();
  const customer = await stripe.customers.create(
    {
      email: params.email ?? undefined,
      name: params.name ?? undefined,
      metadata: {
        academyId: params.academyId,
        tenantId: params.tenantId,
        profileId: params.profileId,
      },
    },
    {
      stripeAccount: params.stripeAccountId,
      idempotencyKey: `family_customer_${params.academyId}_${params.profileId}`,
    }
  );

  const [row] = await db
    .insert(familyStripeCustomers)
    .values({
      tenantId: params.tenantId,
      academyId: params.academyId,
      profileId: params.profileId,
      stripeCustomerId: customer.id,
    })
    .onConflictDoNothing({
      target: [familyStripeCustomers.academyId, familyStripeCustomers.profileId],
    })
    .returning();

  if (row) return row as FamilyCustomerRow;

  const latest = await getFamilyCustomer(params.academyId, params.profileId);
  if (!latest) {
    throw new Error(`FAMILY_CUSTOMER_CLAIM_FAILED:${params.academyId}:${params.profileId}`);
  }
  return latest;
}

/**
 * Crea un SetupIntent en la cuenta conectada para guardar una tarjeta off-session.
 */
export async function createFamilySetupIntent(
  customerId: string,
  stripeAccountId: string
): Promise<string> {
  const stripe = getStripeClient();
  const setupIntent = await stripe.setupIntents.create(
    {
      customer: customerId,
      payment_method_types: ["card"],
      usage: "off_session",
    },
    { stripeAccount: stripeAccountId }
  );
  if (!setupIntent.client_secret) {
    throw new Error("SETUP_INTENT_NO_CLIENT_SECRET");
  }
  return setupIntent.client_secret;
}

function extractCardDisplay(pm: Stripe.PaymentMethod): {
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
} {
  const card = pm.card;
  return {
    brand: card?.brand ?? null,
    last4: card?.last4 ?? null,
    expMonth: card?.exp_month ?? null,
    expYear: card?.exp_year ?? null,
  };
}

/**
 * Guarda un metodo de pago como predeterminado del customer y persiste el
 * display (brand/last4). El payment method ya fue creado por Stripe Elements
 * en el cliente via el SetupIntent.
 */
export async function saveDefaultPaymentMethod(params: {
  academyId: string;
  profileId: string;
  paymentMethodId: string;
  stripeAccountId: string;
}): Promise<FamilyCustomerRow> {
  const row = await getFamilyCustomer(params.academyId, params.profileId);
  if (!row) {
    throw new Error("FAMILY_CUSTOMER_NOT_FOUND");
  }

  const stripe = getStripeClient();
  const opts: Stripe.RequestOptions = { stripeAccount: params.stripeAccountId };

  // Adjuntar el PM al customer (idempotente: si ya esta adjunto, Stripe lo tolera).
  const pm = await stripe.paymentMethods.retrieve(params.paymentMethodId, {}, opts);
  if (pm.customer !== row.stripeCustomerId) {
    await stripe.paymentMethods.attach(params.paymentMethodId, { customer: row.stripeCustomerId }, opts);
  }

  await stripe.customers.update(
    row.stripeCustomerId,
    { invoice_settings: { default_payment_method: params.paymentMethodId } },
    opts
  );

  const display = extractCardDisplay(pm);
  const [updated] = await db
    .update(familyStripeCustomers)
    .set({
      defaultPaymentMethodId: params.paymentMethodId,
      cardBrand: display.brand,
      cardLast4: display.last4,
      cardExpMonth: display.expMonth,
      cardExpYear: display.expYear,
      updatedAt: new Date(),
    })
    .where(eq(familyStripeCustomers.id, row.id))
    .returning();

  return updated as FamilyCustomerRow;
}

/**
 * Desvincula la tarjeta del customer y limpia el display local.
 */
export async function removeDefaultPaymentMethod(params: {
  academyId: string;
  profileId: string;
  stripeAccountId: string;
}): Promise<void> {
  const row = await getFamilyCustomer(params.academyId, params.profileId);
  if (!row || !row.defaultPaymentMethodId) return;

  const stripe = getStripeClient();
  try {
    await stripe.paymentMethods.detach(row.defaultPaymentMethodId, {}, {
      stripeAccount: params.stripeAccountId,
    });
  } catch {
    // Si ya estaba desvinculado, continuar con la limpieza local.
  }

  await db
    .update(familyStripeCustomers)
    .set({
      defaultPaymentMethodId: null,
      cardBrand: null,
      cardLast4: null,
      cardExpMonth: null,
      cardExpYear: null,
      updatedAt: new Date(),
    })
    .where(eq(familyStripeCustomers.id, row.id));
}
