import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  marketplaceListings,
  marketplaceOrders,
  type NewMarketplaceListing,
  type MarketplaceListing,
} from "@/db/schema/marketplace";

/**
 * Servicio de marketplace B2B entre academias.
 *
 * Sprint T3 MVP: listings activos + creación de orden con comisión Zaltyko.
 * Stripe Connect: el dinero va a la cuenta conectada del vendedor; Zaltyko
 * cobra el `commission_cents` como application_fee en el destination charge.
 *
 * Comisión por defecto según plan:
 *   Free/Starter → 10%
 *   Growth       → 5%
 *   Network      → 0%  (commission_cents = 0)
 */

// ============================================================================
// LISTINGS
// ============================================================================

export type CreateListingInput = Omit<
  NewMarketplaceListing,
  "id" | "createdAt" | "updatedAt" | "quantitySold"
> & { commissionRatePct?: number };

export async function listActiveListings(
  limit = 50
): Promise<MarketplaceListing[]> {
  return db
    .select()
    .from(marketplaceListings)
    .where(
      and(
        eq(marketplaceListings.status, "active"),
        sql`${marketplaceListings.publishedAt} IS NOT NULL`,
        sql`(${marketplaceListings.expiresAt} IS NULL OR ${marketplaceListings.expiresAt} > now())`,
        sql`${marketplaceListings.quantityAvailable} > ${marketplaceListings.quantitySold}`
      )
    )
    .orderBy(sql`${marketplaceListings.publishedAt} DESC`)
    .limit(limit);
}

export async function getListing(listingId: string): Promise<MarketplaceListing | null> {
  const [row] = await db
    .select()
    .from(marketplaceListings)
    .where(eq(marketplaceListings.id, listingId))
    .limit(1);
  return row ?? null;
}

export async function createListing(
  input: CreateListingInput
): Promise<MarketplaceListing> {
  const commissionRatePct = input.commissionRatePct ?? 10;
  const commissionCents = Math.round((input.priceCents * commissionRatePct) / 100);
  const { commissionRatePct: _drop, ...rest } = input;
  const [row] = await db
    .insert(marketplaceListings)
    .values({
      ...rest,
      quantitySold: 0,
      zaltykoCommissionCents: commissionCents,
    })
    .returning();
  if (!row) throw new Error("Failed to create listing");
  return row;
}

export async function updateListing(
  listingId: string,
  patch: Partial<CreateListingInput>
): Promise<MarketplaceListing | null> {
  const [row] = await db
    .update(marketplaceListings)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(marketplaceListings.id, listingId))
    .returning();
  return row ?? null;
}

export async function withdrawListing(listingId: string): Promise<void> {
  await db
    .update(marketplaceListings)
    .set({ status: "withdrawn", updatedAt: new Date() })
    .where(eq(marketplaceListings.id, listingId));
}

// ============================================================================
// ORDERS
// ============================================================================

export type CreateOrderInput = {
  listingId: string;
  buyerAcademyId: string;
  quantity: number;
};

/**
 * Crea una orden en estado pending_payment.
 * Valida stock, decrementa quantityAvailable (no quantitySold hasta confirmar pago),
 * calcula commission según listing.zaltykoCommissionCents.
 */
export async function createPendingOrder(
  input: CreateOrderInput
): Promise<{
  orderId: string;
  totalCents: number;
  commissionCents: number;
  netToSellerCents: number;
  currency: string;
  sellerStripeAccountId: string | null;
}> {
  return db.transaction(async (tx) => {
    const [listing] = await tx
      .select()
      .from(marketplaceListings)
      .where(eq(marketplaceListings.id, input.listingId))
      .limit(1);
    if (!listing) throw new Error("Listing not found");
    if (listing.status !== "active") throw new Error("Listing not active");
    if (
      listing.sellerAcademyId === input.buyerAcademyId
    ) {
      throw new Error("Cannot buy your own listing");
    }
    const remaining = listing.quantityAvailable - listing.quantitySold;
    if (remaining < input.quantity) {
      throw new Error(`Insufficient stock: ${remaining} available`);
    }

    // Decrementar available (reserva) — quantitySold se incrementa al pagar.
    await tx
      .update(marketplaceListings)
      .set({
        quantityAvailable: sql`${marketplaceListings.quantityAvailable} - ${input.quantity}`,
        updatedAt: new Date(),
      })
      .where(eq(marketplaceListings.id, input.listingId));

    const total = listing.priceCents * input.quantity;
    const commission = listing.zaltykoCommissionCents * input.quantity;
    const net = total - commission;

    // Recuperar stripeAccountId del vendedor (academia) via tabla separada stripeAccounts
    const { academies, stripeAccounts } = await import("@/db/schema");
    const [seller] = await tx
      .select({ stripeAccountId: stripeAccounts.stripeAccountId })
      .from(academies)
      .leftJoin(stripeAccounts, eq(stripeAccounts.academyId, academies.id))
      .where(eq(academies.id, listing.sellerAcademyId))
      .limit(1);

    const [order] = await tx
      .insert(marketplaceOrders)
      .values({
        listingId: input.listingId,
        sellerAcademyId: listing.sellerAcademyId,
        buyerAcademyId: input.buyerAcademyId,
        quantity: input.quantity,
        totalCents: total,
        commissionCents: commission,
        netToSellerCents: net,
        currency: listing.currency,
        status: "pending_payment",
      })
      .returning();

    if (!order) throw new Error("Failed to create order");

    return {
      orderId: order.id,
      totalCents: total,
      commissionCents: commission,
      netToSellerCents: net,
      currency: listing.currency,
      sellerStripeAccountId: seller?.stripeAccountId ?? null,
    };
  });
}

export async function markOrderPaid(
  orderId: string,
  stripePaymentIntentId: string
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(marketplaceOrders)
      .set({
        status: "paid",
        paidAt: new Date(),
        stripePaymentIntentId,
        updatedAt: new Date(),
      })
      .where(eq(marketplaceOrders.id, orderId));

    // Incrementar quantitySold en el listing
    const [order] = await tx
      .select({ listingId: marketplaceOrders.listingId, quantity: marketplaceOrders.quantity })
      .from(marketplaceOrders)
      .where(eq(marketplaceOrders.id, orderId))
      .limit(1);
    if (order) {
      await tx
        .update(marketplaceListings)
        .set({
          quantitySold: sql`${marketplaceListings.quantitySold} + ${order.quantity}`,
          updatedAt: new Date(),
        })
        .where(eq(marketplaceListings.id, order.listingId));
    }
  });
}

export async function getOrder(orderId: string) {
  const [row] = await db
    .select()
    .from(marketplaceOrders)
    .where(eq(marketplaceOrders.id, orderId))
    .limit(1);
  return row ?? null;
}
