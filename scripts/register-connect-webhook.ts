#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * Registra (o actualiza) el endpoint de webhook de Stripe CONNECT para el módulo
 * "Cobros y cuotas". Los eventos de cuentas conectadas (account.updated,
 * payment_intent.*, charge.refunded) se entregan a /api/stripe/connect/webhook.
 *
 * Uso:
 *   STRIPE_SECRET_KEY=sk_live_... tsx scripts/register-connect-webhook.ts https://zaltyko.com
 *
 * Imprime el SIGNING SECRET (whsec_...) del endpoint recién creado: cópialo a
 * la variable de entorno STRIPE_CONNECT_WEBHOOK_SECRET en Vercel (Production).
 *
 * IMPORTANTE: este script hace un cambio de configuración en tu cuenta REAL de
 * Stripe. Revísalo antes de ejecutarlo. Es idempotente por URL: si ya existe un
 * endpoint Connect con esa URL, no crea otro; solo informa.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import Stripe from "stripe";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const ENABLED_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "account.updated",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "payment_intent.canceled",
  "charge.refunded",
];

async function main() {
  const baseUrl = process.argv[2];
  if (!baseUrl || !/^https?:\/\//.test(baseUrl)) {
    console.error("Uso: tsx scripts/register-connect-webhook.ts <https://TU-DOMINIO>");
    process.exit(1);
  }
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.error("STRIPE_SECRET_KEY no está definida.");
    process.exit(1);
  }

  const url = `${baseUrl.replace(/\/$/, "")}/api/stripe/connect/webhook`;
  const stripe = new Stripe(secretKey, { apiVersion: "2026-03-25.dahlia" });

  // Idempotencia por URL: no duplicar si ya existe un endpoint Connect con esa URL.
  const existing = await stripe.webhookEndpoints.list({ limit: 100 });
  const already = existing.data.find((e) => e.url === url);
  if (already) {
    console.log(`Ya existe un webhook con esa URL: ${already.id}`);
    console.log(`  connect: ${already.application ? "sí (app)" : already.metadata?.connect ?? "revisar en dashboard"}`);
    console.log("No se crea otro. Si necesitas rotar el secret, hazlo desde el dashboard de Stripe.");
    return;
  }

  const endpoint = await stripe.webhookEndpoints.create({
    url,
    enabled_events: ENABLED_EVENTS,
    connect: true,
    description: "Zaltyko — Cobros y cuotas (cuentas conectadas)",
  });

  console.log(`Webhook Connect creado: ${endpoint.id}`);
  console.log(`URL: ${endpoint.url}`);
  console.log(`Eventos: ${ENABLED_EVENTS.join(", ")}`);
  console.log("");
  console.log(">>> Copia este valor a STRIPE_CONNECT_WEBHOOK_SECRET en Vercel (Production):");
  console.log(endpoint.secret);
}

main().catch((error) => {
  console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
