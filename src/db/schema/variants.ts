import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { products } from "./store";

/**
 * product_variants — talla, color, o cualquier atributo configurable.
 * Sprint T4.3.
 *
 * Cada variant tiene su propio stock y precio (puede diferir del producto padre).
 */
export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sku: text("sku"),
    /** Nombre visible, p.ej. "Talla S" o "Rojo". */
    name: text("name").notNull(),
    /** Atributos estructurados: { size: "S", color: "rojo" } */
    attributes: text("attributes").array().default([]),
    priceCents: integer("price_cents").notNull(),
    currency: text("currency").notNull().default("EUR"),
    stockQuantity: integer("stock_quantity"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    // CHECK constraint pendiente de modelar via migration real (Sprint T4.3).
    // El syntax `CHECK (...)` inline no es válido en Drizzle column body;
    // debe añadirse como `check()` en el segundo argumento de pgTable o
    // directamente en SQL de migración. Comentado temporalmente porque
    // rompía `pnpm typecheck` global al estar importado desde
    // `src/db/schema/index.ts`.
    // CHECK ("price_cents" >= 0)
  },
  (t) => ({
    productIdx: index("product_variants_product_idx").on(t.productId),
    productSortIdx: index("product_variants_product_sort_idx").on(
      t.productId,
      t.sortOrder
    ),
  })
);

export type ProductVariant = typeof productVariants.$inferSelect;
export type NewProductVariant = typeof productVariants.$inferInsert;
