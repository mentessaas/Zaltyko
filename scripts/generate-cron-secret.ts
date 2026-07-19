#!/usr/bin/env tsx
/**
 * Genera un secret seguro para CRON_SECRET
 * Ejecuta: pnpm tsx scripts/generate-cron-secret.ts
 */

import { randomBytes } from "crypto";

const secret = randomBytes(32).toString("base64");

console.log("🔐 CRON_SECRET generado:");
console.log("");
console.log(secret);
console.log("");
console.log("📋 Copia este valor y agrégalo como variable de entorno CRON_SECRET en Vercel");

