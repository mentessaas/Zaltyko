#!/usr/bin/env tsx
/**
 * Script para verificar que la aplicación esté lista para producción
 * Ejecuta: pnpm tsx scripts/verify-production-ready.ts
 */

import { existsSync } from "fs";
import { readFileSync } from "fs";
import { join } from "path";

const errors: string[] = [];
const warnings: string[] = [];

console.log("🔍 Verificando preparación para producción...\n");

// 1. Verificar archivos críticos
const criticalFiles = [
  "next.config.mjs",
  "vercel.json",
  "package.json",
  "src/lib/env.ts",
  "src/app/layout.tsx",
  "instrumentation-client.ts",
  "sentry.server.config.ts",
  "sentry.edge.config.ts",
];

console.log("📁 Verificando archivos críticos...");
for (const file of criticalFiles) {
  if (!existsSync(file)) {
    errors.push(`❌ Archivo faltante: ${file}`);
  } else {
    console.log(`  ✅ ${file}`);
  }
}

// 2. Verificar configuración de Sentry
console.log("\n🔐 Verificando configuración de Sentry...");
const nextConfig = readFileSync("next.config.mjs", "utf-8");
if (!nextConfig.includes("withSentryConfig")) {
  warnings.push("⚠️  Sentry no está configurado en next.config.mjs");
} else {
  console.log("  ✅ Sentry configurado");
}

// 3. Verificar Analytics
console.log("\n📊 Verificando Analytics...");
const layout = readFileSync("src/app/layout.tsx", "utf-8");
if (!layout.includes("@vercel/analytics")) {
  warnings.push("⚠️  Vercel Analytics no está importado");
} else {
  console.log("  ✅ Vercel Analytics configurado");
}

if (!layout.includes("@vercel/speed-insights")) {
  warnings.push("⚠️  Vercel Speed Insights no está importado");
} else {
  console.log("  ✅ Vercel Speed Insights configurado");
}

// 4. Verificar cron jobs
console.log("\n⏰ Verificando cron jobs...");
const vercelJson = JSON.parse(readFileSync("vercel.json", "utf-8"));
if (!vercelJson.crons || vercelJson.crons.length === 0) {
  warnings.push("⚠️  No hay cron jobs configurados");
} else {
  console.log(`  ✅ ${vercelJson.crons.length} cron job(s) configurado(s)`);
  vercelJson.crons.forEach((cron: any) => {
    console.log(`     - ${cron.path} (${cron.schedule})`);
  });
}

// 5. Verificar variables de entorno requeridas
console.log("\n🔑 Verificando variables de entorno...");
const envExample = existsSync(".env.example")
  ? readFileSync(".env.example", "utf-8")
  : "";

const requiredVars = [
  "DATABASE_URL_POOL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_APP_URL",
  "CRON_SECRET",
];

for (const varName of requiredVars) {
  if (!envExample.includes(varName)) {
    warnings.push(`⚠️  Variable ${varName} no está documentada en .env.example`);
  } else {
    console.log(`  ✅ ${varName} documentada`);
  }
}

// 6. Verificar que no haya console.log en producción
console.log("\n📝 Verificando uso de console.log...");
const srcFiles = [
  "src/app/api/cron/class-reminders/route.ts",
  "src/app/api/cron/daily-alerts/route.ts",
];

for (const file of srcFiles) {
  if (existsSync(file)) {
    const content = readFileSync(file, "utf-8");
    if (content.includes("console.log") && !content.includes("logger")) {
      warnings.push(`⚠️  ${file} usa console.log en lugar de logger`);
    } else {
      console.log(`  ✅ ${file} usa logger`);
    }
  }
}

// 7. Verificar documentación
console.log("\n📚 Verificando documentación...");
const docsFiles = [
  "docs/DEPLOYMENT.md",
  "docs/PRODUCTION_CHECKLIST.md",
  "README.md",
];

for (const file of docsFiles) {
  if (existsSync(file)) {
    console.log(`  ✅ ${file} existe`);
  } else {
    warnings.push(`⚠️  Documentación faltante: ${file}`);
  }
}

// Resumen
console.log("\n" + "=".repeat(50));
console.log("📋 RESUMEN");
console.log("=".repeat(50));

if (errors.length === 0 && warnings.length === 0) {
  console.log("\n✅ ¡Todo está listo para producción!");
  console.log("\nPróximos pasos:");
  console.log("1. Configura todas las variables de entorno en Vercel");
  console.log("2. Ejecuta: pnpm build");
  console.log("3. Revisa el checklist en docs/PRODUCTION_CHECKLIST.md");
  console.log("4. Haz deploy a Vercel");
  process.exit(0);
} else {
  if (errors.length > 0) {
    console.log("\n❌ ERRORES CRÍTICOS:");
    errors.forEach((error) => console.log(`  ${error}`));
  }

  if (warnings.length > 0) {
    console.log("\n⚠️  ADVERTENCIAS:");
    warnings.forEach((warning) => console.log(`  ${warning}`));
  }

  console.log("\n💡 Revisa los errores y advertencias antes de hacer deploy.");
  process.exit(errors.length > 0 ? 1 : 0);
}

