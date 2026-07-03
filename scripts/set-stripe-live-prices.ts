/**
 * Puebla plans.stripe_price_id / stripe_product_id con los IDs LIVE de Stripe.
 *
 * La tabla `plans` tiene 3 códigos: free (sin precio), pro, premium.
 * Hoy pro/premium tienen placeholders ("price_pro_PLACEHOLDER"), por eso el
 * checkout de pago falla. Este script los reemplaza por los IDs reales.
 *
 * Uso (tras crear los Products/Prices LIVE en el dashboard de Stripe):
 *   STRIPE_PRICE_PRO=price_xxx STRIPE_PRODUCT_PRO=prod_xxx \
 *   STRIPE_PRICE_PREMIUM=price_yyy STRIPE_PRODUCT_PREMIUM=prod_yyy \
 *   npx tsx scripts/set-stripe-live-prices.ts
 *
 * Conecta con el patrón SSL de producción (src/db/index.ts) y actualiza en transacción.
 */
import "dotenv/config";
import { Pool } from "pg";
import { getDatabaseUrl } from "@/lib/env";

async function main() {
  const rows = [
    { code: "pro", price: process.env.STRIPE_PRICE_PRO, product: process.env.STRIPE_PRODUCT_PRO },
    { code: "premium", price: process.env.STRIPE_PRICE_PREMIUM, product: process.env.STRIPE_PRODUCT_PREMIUM },
  ];

  for (const r of rows) {
    if (!r.price) throw new Error(`Falta STRIPE_PRICE_${r.code.toUpperCase()}`);
    if (!r.price.startsWith("price_")) throw new Error(`${r.code}: price_id inválido (${r.price})`);
    if (r.price.includes("PLACEHOLDER")) throw new Error(`${r.code}: sigue siendo placeholder`);
  }

  const u = new URL(getDatabaseUrl());
  const pool = new Pool({
    host: u.hostname,
    port: parseInt(u.port || "5432"),
    database: u.pathname.replace("/", ""),
    user: u.username,
    password: decodeURIComponent(u.password),
    ssl: { rejectUnauthorized: false },
  });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    for (const r of rows) {
      await c.query(
        `UPDATE plans SET stripe_price_id = $1, stripe_product_id = $2 WHERE code = $3`,
        [r.price, r.product ?? null, r.code]
      );
      console.log(`OK ${r.code} -> ${r.price}`);
    }
    await c.query("COMMIT");
    console.log("Planes actualizados a precios LIVE.");
  } catch (e: any) {
    await c.query("ROLLBACK");
    console.error("ROLLBACK —", e.message);
    process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
  }
}

main();
