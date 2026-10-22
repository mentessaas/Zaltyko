import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { academies } from "./academies";

/**
 * products — catálogo de cada academia (merch, camps, registrations, packs).
 * Sprint T2 MVP. Sin variantes (T2.5). Sin POS físico (T4).
 */
export const productTypeValues = [
  "physical",
  "digital",
  "camp_registration",
  "session_pack",
] as const;
export type ProductType = (typeof productTypeValues)[number];

export const productVisibilityValues = ["public", "members_only"] as const;
export type ProductVisibility = (typeof productVisibilityValues)[number];

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    sku: text("sku"),
    name: text("name").notNull(),
    description: text("description"),
    productType: text("product_type").notNull().default("physical"),
    priceCents: integer("price_cents").notNull(),
    currency: text("currency").notNull().default("EUR"),
    isActive: boolean("is_active").notNull().default(true),
    isFeatured: boolean("is_featured").notNull().default(false),
    stockQuantity: integer("stock_quantity"), // null = ilimitado
    lowStockThreshold: integer("low_stock_threshold").default(5),
    imageUrls: text("image_urls").array().default([]),
    metadata: jsonb("metadata").default({}),
    visibility: text("visibility").notNull().default("public"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    academyIdx: index("products_academy_idx").on(t.academyId),
    academyActiveIdx: index("products_academy_active_idx").on(
      t.academyId,
      t.isActive
    ),
    skuIdx: index("products_sku_idx").on(t.academyId, t.sku),
  })
);

/**
 * stock_movements — auditoría de cambios de stock.
 * source: 'sale' | 'manual_adjust' | 'return' | 'restock'
 */
export const stockMovementSourceValues = [
  "sale",
  "manual_adjust",
  "return",
  "restock",
  "initial",
] as const;

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    change: integer("change").notNull(), // positivo = entrada, negativo = salida
    source: text("source").notNull(),
    sourceId: uuid("source_id"), // p.ej. sale_id
    notes: text("notes"),
    createdByUserId: uuid("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    productIdx: index("stock_movements_product_idx").on(t.productId),
    productCreatedIdx: index("stock_movements_product_created_idx").on(
      t.productId,
      t.createdAt
    ),
  })
);

/**
 * sales — cabecera de una compra en la tienda de la academia.
 * Stripe Connect: la academia recibe el pago en su cuenta conectada;
 * Zaltyko no procesa los fondos directamente (cero PCI scope).
 */
export const saleStatusValues = [
  "pending",
  "paid",
  "refunded",
  "failed",
  "cancelled",
] as const;
export type SaleStatus = (typeof saleStatusValues)[number];

export const sales = pgTable(
  "sales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    customerEmail: text("customer_email").notNull(),
    customerName: text("customer_name"),
    subtotalCents: integer("subtotal_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    currency: text("currency").notNull().default("EUR"),
    status: text("status").notNull().default("pending"),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeAccountId: text("stripe_account_id"), // Connect destination
    paidAt: timestamp("paid_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    notes: text("notes"),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    academyIdx: index("sales_academy_idx").on(t.academyId),
    academyStatusIdx: index("sales_academy_status_idx").on(
      t.academyId,
      t.status
    ),
    statusCreatedIdx: index("sales_status_created_idx").on(
      t.status,
      t.createdAt
    ),
  })
);

/**
 * sale_lines — items de cada sale (uno por producto).
 */
export const saleLines = pgTable(
  "sale_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    lineTotalCents: integer("line_total_cents").notNull(),
  },
  (t) => ({
    saleIdx: index("sale_lines_sale_idx").on(t.saleId),
    productIdx: index("sale_lines_product_idx").on(t.productId),
  })
);

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type StockMovement = typeof stockMovements.$inferSelect;
export type NewStockMovement = typeof stockMovements.$inferInsert;
export type Sale = typeof sales.$inferSelect;
export type NewSale = typeof sales.$inferInsert;
export type SaleLine = typeof saleLines.$inferSelect;
export type NewSaleLine = typeof saleLines.$inferInsert;
