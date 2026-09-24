import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { products, stockMovements, sales, saleLines } from "@/db/schema";
import type { NewProduct, Product, NewStockMovement } from "@/db/schema/store";

/**
 * Servicio de tienda interna por academia.
 * Sprint T2 MVP: CRUD de productos + decremento de stock en venta + lectura pública.
 */

// PRODUCTS

export type CreateProductInput = Omit<NewProduct, "id" | "createdAt" | "updatedAt">;

export async function listProductsByAcademy(academyId: string): Promise<Product[]> {
  return db
    .select()
    .from(products)
    .where(eq(products.academyId, academyId))
    .orderBy(products.isFeatured, products.name);
}

export async function listPublicProductsByAcademy(academyId: string): Promise<Product[]> {
  return db
    .select()
    .from(products)
    .where(
      and(
        eq(products.academyId, academyId),
        eq(products.isActive, true),
        eq(products.visibility, "public"),
        sql`${products.publishedAt} IS NOT NULL`
      )
    )
    .orderBy(products.isFeatured, products.name);
}

export async function getProduct(productId: string): Promise<Product | null> {
  const [row] = await db
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  return row ?? null;
}

export async function createProduct(input: CreateProductInput): Promise<Product> {
  const [row] = await db.insert(products).values(input).returning();
  return row;
}

export async function updateProduct(
  productId: string,
  patch: Partial<CreateProductInput>
): Promise<Product | null> {
  const [row] = await db
    .update(products)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(products.id, productId))
    .returning();
  return row ?? null;
}

export async function deleteProduct(productId: string): Promise<void> {
  await db.delete(products).where(eq(products.id, productId));
}

// STOCK

export async function applyStockMovement(input: NewStockMovement): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(stockMovements).values(input);
    await tx
      .update(products)
      .set({
        stockQuantity: sql`COALESCE(${products.stockQuantity}, 0) + ${input.change}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(products.id, input.productId),
          sql`${products.stockQuantity} IS NOT NULL`
        )
      );
  });
}

// SALES

export type CartLineInput = { productId: string; quantity: number };
export type CreateSaleInput = {
  academyId: string;
  tenantId: string;
  customerEmail: string;
  customerName?: string;
  lines: CartLineInput[];
  metadata?: Record<string, unknown>;
};

export async function createPendingSale(
  input: CreateSaleInput
): Promise<{ saleId: string; totalCents: number; currency: string }> {
  return db.transaction(async (tx) => {
    if (input.lines.length === 0) throw new Error("Cart is empty");

    const productIds = input.lines.map((l) => l.productId);
    const rows = await tx
      .select()
      .from(products)
      .where(
        and(
          inArray(products.id, productIds),
          eq(products.academyId, input.academyId),
          eq(products.isActive, true)
        )
      );

    if (rows.length !== productIds.length) {
      throw new Error("One or more products are unavailable");
    }

    const byId = new Map(rows.map((r) => [r.id, r]));
    let subtotal = 0;
    const linesToInsert: {
      productId: string;
      quantity: number;
      unitPriceCents: number;
      lineTotalCents: number;
    }[] = [];
    for (const l of input.lines) {
      const p = byId.get(l.productId);
      if (!p) throw new Error(`Product ${l.productId} not available`);
      if (l.quantity <= 0) throw new Error("Quantity must be positive");
      if (p.stockQuantity !== null && p.stockQuantity < l.quantity) {
        throw new Error(`Insufficient stock for ${p.name}`);
      }
      const lineTotal = p.priceCents * l.quantity;
      subtotal += lineTotal;
      linesToInsert.push({
        productId: p.id,
        quantity: l.quantity,
        unitPriceCents: p.priceCents,
        lineTotalCents: lineTotal,
      });
    }

    for (const l of linesToInsert) {
      const p = byId.get(l.productId);
      if (p?.stockQuantity !== null) {
        await tx
          .update(products)
          .set({
            stockQuantity: sql`${products.stockQuantity} - ${l.quantity}`,
            updatedAt: new Date(),
          })
          .where(eq(products.id, l.productId));
        await tx.insert(stockMovements).values({
          productId: l.productId,
          change: -l.quantity,
          source: "sale",
          sourceId: null,
          notes: `Decrement from pending sale ${input.customerEmail}`,
          createdByUserId: null,
        });
      }
    }

    const [sale] = await tx
      .insert(sales)
      .values({
        tenantId: input.tenantId,
        academyId: input.academyId,
        customerEmail: input.customerEmail,
        customerName: input.customerName ?? null,
        subtotalCents: subtotal,
        totalCents: subtotal,
        currency: rows[0].currency,
        status: "pending",
        metadata: input.metadata ?? {},
      })
      .returning();

    if (!sale) throw new Error("Failed to create sale");

    await tx.insert(saleLines).values(
      linesToInsert.map((l) => ({ ...l, saleId: sale.id }))
    );

    return {
      saleId: sale.id,
      totalCents: sale.totalCents,
      currency: sale.currency,
    };
  });
}

export async function markSalePaid(
  saleId: string,
  stripePaymentIntentId: string,
  stripeAccountId: string
): Promise<void> {
  await db
    .update(sales)
    .set({
      status: "paid",
      paidAt: new Date(),
      stripePaymentIntentId,
      stripeAccountId,
      updatedAt: new Date(),
    })
    .where(eq(sales.id, saleId));
}

export async function getSale(saleId: string) {
  const [sale] = await db.select().from(sales).where(eq(sales.id, saleId)).limit(1);
  if (!sale) return null;
  const lines = await db.select().from(saleLines).where(eq(saleLines.saleId, saleId));
  return { sale, lines };
}
