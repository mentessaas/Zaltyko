import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { marketplaceOrders } from "@/db/schema";
import {
  marketplaceDisputes,
  marketplaceRatings,
  type MarketplaceDispute,
  type MarketplaceRating,
} from "@/db/schema/trust";

/**
 * Servicio de trust pack del marketplace.
 *
 * Disputes: cualquiera de las dos partes puede abrir una. Zaltyko no media
 * automáticamente en T5 — solo el owner puede resolver como buyer o seller.
 * T5.5: Zaltyko mediation role.
 *
 * Ratings: bidireccional (buyer → seller y seller → buyer). Solo después de
 * status='paid'. 1-5 estrellas + comentario opcional.
 */

export async function openDispute(opts: {
  orderId: string;
  raisedByAcademyId: string;
  reason: "not_received" | "damaged" | "not_as_described" | "wrong_item" | "other";
  description: string;
}): Promise<MarketplaceDispute> {
  const [order] = await db
    .select()
    .from(marketplaceOrders)
    .where(eq(marketplaceOrders.id, opts.orderId))
    .limit(1);
  if (!order) throw new Error("Order not found");
  if (
    order.buyerAcademyId !== opts.raisedByAcademyId &&
    order.sellerAcademyId !== opts.raisedByAcademyId
  ) {
    throw new Error("Only buyer or seller can raise a dispute");
  }
  if (order.status !== "paid" && order.status !== "shipped" && order.status !== "delivered") {
    throw new Error("Order not in a disputable state");
  }

  const [row] = await db
    .insert(marketplaceDisputes)
    .values({
      orderId: opts.orderId,
      raisedByAcademyId: opts.raisedByAcademyId,
      reason: opts.reason,
      description: opts.description,
      status: "open",
    })
    .returning();
  if (!row) throw new Error("Failed to open dispute");

  // Marcar la orden como disputed
  await db
    .update(marketplaceOrders)
    .set({ status: "disputed", updatedAt: new Date() })
    .where(eq(marketplaceOrders.id, opts.orderId));

  return row;
}

export type DisputeResolver = "buyer" | "seller" | "zaltyko";

export async function resolveDispute(opts: {
  disputeId: string;
  resolvedBy: DisputeResolver;
  notes: string;
}): Promise<void> {
  const statusMap = {
    buyer: "resolved_buyer",
    seller: "resolved_seller",
    zaltyko: "resolved_seller", // Zaltyko mediation cierra a favor del seller por default
  } as const;
  await db
    .update(marketplaceDisputes)
    .set({
      status: statusMap[opts.resolvedBy],
      resolutionNotes: opts.notes,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(marketplaceDisputes.id, opts.disputeId));
}

export async function getDisputeForOrder(orderId: string): Promise<MarketplaceDispute | null> {
  const [row] = await db
    .select()
    .from(marketplaceDisputes)
    .where(eq(marketplaceDisputes.orderId, orderId))
    .orderBy(sql`${marketplaceDisputes.createdAt} DESC`)
    .limit(1);
  return row ?? null;
}

export async function rateCounterparty(opts: {
  orderId: string;
  raterAcademyId: string;
  stars: number;
  comment?: string;
}): Promise<MarketplaceRating> {
  if (opts.stars < 1 || opts.stars > 5) {
    throw new Error("stars must be between 1 and 5");
  }
  const [order] = await db
    .select()
    .from(marketplaceOrders)
    .where(eq(marketplaceOrders.id, opts.orderId))
    .limit(1);
  if (!order) throw new Error("Order not found");
  if (order.status !== "paid" && order.status !== "shipped" && order.status !== "delivered") {
    throw new Error("Can only rate paid orders");
  }
  if (opts.raterAcademyId !== order.buyerAcademyId && opts.raterAcademyId !== order.sellerAcademyId) {
    throw new Error("Only buyer or seller can rate");
  }

  const direction = opts.raterAcademyId === order.buyerAcademyId ? "buyer_to_seller" : "seller_to_buyer";
  const ratedAcademyId = direction === "buyer_to_seller" ? order.sellerAcademyId : order.buyerAcademyId;

  const [row] = await db
    .insert(marketplaceRatings)
    .values({
      orderId: opts.orderId,
      listingId: order.listingId,
      raterAcademyId: opts.raterAcademyId,
      ratedAcademyId,
      reviewerId: opts.raterAcademyId, // academy como reviewer (simplificación)
      direction,
      stars: opts.stars,
      rating: opts.stars, // alias de stars (column:2 redundante intencionalmente para queries)
      comment: opts.comment ?? null,
    })
    .returning();
  if (!row) throw new Error("Failed to rate");
  return row;
}

export async function getRatingsForAcademy(academyId: string) {
  return db
    .select({
      rating: marketplaceRatings,
      order: marketplaceOrders,
    })
    .from(marketplaceRatings)
    .innerJoin(marketplaceOrders, eq(marketplaceOrders.id, marketplaceRatings.orderId))
    .where(eq(marketplaceRatings.ratedAcademyId, academyId))
    .orderBy(sql`${marketplaceRatings.createdAt} DESC`)
    .limit(50);
}
