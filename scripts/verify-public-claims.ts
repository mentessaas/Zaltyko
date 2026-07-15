#!/usr/bin/env tsx

/**
 * Auditor E2E de claims públicos.
 *
 * Capas:
 *   L1+L5+L6  Playwright HTTP smoke + module landings + JSON-LD/sitemap
 *   L2+L3     Vitest catalog ↔ copy + trial policy
 *   L4        Stripe live Prices + webhook signature rejection
 *
 * Verdict por claim: PASS / FAIL / WARN / SKIPPED.
 * Exit code 0 si no hay FAIL; 1 si hay algún FAIL.
 *
 * Uso:
 *   pnpm tsx scripts/verify-public-claims.ts
 *
 * Variables de entorno relevantes (todas opcionales):
 *   BASE_URL                  default http://127.0.0.1:3000
 *   STRIPE_SECRET_KEY         si está, ejecuta L4
 *   VERIFY_PUBLIC_CLAIMS_SKIP_STRIPE=true   para saltar L4 explícitamente
 */

import { spawnSync } from "node:child_process";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", override: false });
loadEnv({ path: ".env", override: false });

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const SKIP_STRIPE = process.env.VERIFY_PUBLIC_CLAIMS_SKIP_STRIPE === "true";

async function main(): Promise<number> {

interface Row {
  claim: string;
  layer: "L1" | "L2" | "L3" | "L4" | "L5" | "L6";
  result: "PASS" | "FAIL" | "WARN" | "SKIPPED";
  detail: string;
}

const rows: Row[] = [];

function pass(claim: string, layer: Row["layer"], detail: string) {
  rows.push({ claim, layer, result: "PASS", detail });
}
function fail(claim: string, layer: Row["layer"], detail: string) {
  rows.push({ claim, layer, result: "FAIL", detail });
}
function warn(claim: string, layer: Row["layer"], detail: string) {
  rows.push({ claim, layer, result: "WARN", detail });
}
function skip(claim: string, layer: Row["layer"], detail: string) {
  rows.push({ claim, layer, result: "SKIPPED", detail });
}

function runGate(label: string, cmd: string, args: string[], env: Record<string, string> = {}): boolean {
  process.stdout.write(`\n[gate] ${label} — ${cmd} ${args.join(" ")}\n`);
  const result = spawnSync(cmd, args, {
    stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, ...env },
  });
  return result.status === 0;
}

// ─── L2+L3 ──────────────────────────────────────────────────────────────────

console.log("\n=== L2 + L3: catálogo y policy ===");

const vitestOk = runGate(
  "Vitest catalog + trial policy",
  "pnpm",
  ["vitest", "run", "tests/audit/public-claims.catalog.test.ts"],
);

if (vitestOk) {
  const tests = [
    ["L2", "Free 30 gimnastas / 1 academia / 3 grupos / 10 clases"],
    ["L2", "Starter 19€/mes hasta 75 gimnastas"],
    ["L2", "Growth 49€/mes hasta 200 gimnastas"],
    ["L2", "Network 99€/mes sales-assisted (sin self-checkout)"],
    ["L2", "BILLABLE_PRODUCT_PLANS excluye Network"],
    ["L3", "Trial: TRIAL_DURATION_DAYS === 7"],
    ["L3", "Trial: TRIAL_COOLDOWN_DAYS === 365"],
    ["L3", "Trial: academia fresca elegible"],
    ["L3", "Trial: con trial activo NO elegible (active_trial)"],
    ["L3", "Trial: hace 30 días en cooldown"],
    ["L3", "Trial: con plan de pago NO elegible"],
    ["L2", "ComparisonSection: copy de features clave"],
    ["L2", "FaqSection: respuesta RGPD sobre menores"],
    ["L2", "PricingSection: banner trial + anual deshabilitado"],
    ["L2", "Guardrail: '100% seguro' ausente"],
    ["L2", "Guardrail: 'RGPD Compliant' ausente"],
    ["L2", "Guardrail: '52 páginas' ausente"],
    ["L2", "Guardrail: '2 horas' ausente"],
  ];
  for (const [layer, claim] of tests) {
    pass(claim, layer as Row["layer"], "vitest public-claims.catalog OK");
  }
} else {
  fail(
    "L2/L3 — vitest public-claims.catalog falló",
    "L2",
    "revisa la salida de vitest arriba; algún aserto difiere de catalog/trial-policy",
  );
}

// ─── L1 + L5 + L6 ──────────────────────────────────────────────────────────

console.log("\n=== L1 + L5 + L6: HTTP smoke + módulos + JSON-LD/sitemap ===");

const playwrightOk = runGate(
  "Playwright public-claims (chromium)",
  "pnpm",
  ["playwright", "test", "tests/audit/public-claims.spec.ts", "--project=chromium"],
  { BASE_URL },
);

if (playwrightOk) {
  const checks: Array<[Row["layer"], string]> = [
    ["L1", "40 rutas públicas devuelven 200 o redirect documentado"],
    ["L5", "7 landings /modules/* tienen H1 coherente"],
    ["L6", "sitemap.xml expone rutas cluster ES y EN"],
    ["L6", "robots.txt apunta al sitemap"],
    ["L6", "JSON-LD Product en /pricing con precios 0/19/49/99 EUR"],
    ["L6", "JSON-LD FAQPage en home con 8 preguntas (incluye RGPD)"],
    ["L6", "Pricing cards renderizan 'Incluido' + '19 €/mes' + '49 €/mes' + '99 €/mes'"],
    ["L6", "Pricing anual toggle deshabilitado (aria-disabled + próximamente)"],
    ["L6", "Soporte: hola@zaltyko.com y '9:00 - 18:00 (CET)' visibles"],
  ];
  for (const [layer, claim] of checks) {
    pass(claim, layer, "playwright public-claims OK");
  }
} else {
  fail(
    "L1/L5/L6 — playwright public-claims falló",
    "L1",
    "revisa la salida de playwright arriba",
  );
}

// ─── L4 Stripe live ─────────────────────────────────────────────────────────

console.log("\n=== L4: Stripe live ===");

if (SKIP_STRIPE) {
  skip("Stripe Prices 19/49 EUR", "L4", "VERIFY_PUBLIC_CLAIMS_SKIP_STRIPE=true");
} else if (!process.env.STRIPE_SECRET_KEY) {
  skip(
    "Stripe Prices 19/49 EUR + webhook firma",
    "L4",
    "STRIPE_SECRET_KEY no presente en .env",
  );
} else {
  // Import dinámico para no cargar Stripe si no hace falta
  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2026-03-25.dahlia",
    timeout: 10_000,
  });

  try {
    const prices = await stripe.prices.list({
      active: true,
      currency: "eur",
      type: "recurring",
      limit: 100,
    });

    const found19 = prices.data.find(
      (p) => p.unit_amount === 1900 && p.currency === "eur" && p.active && p.type === "recurring",
    );
    const found49 = prices.data.find(
      (p) => p.unit_amount === 4900 && p.currency === "eur" && p.active && p.type === "recurring",
    );

    if (found19) {
      pass(`Stripe Price 19€ EUR recurring activo`, "L4", `id=${found19.id} lookup_key=${found19.lookup_key ?? "—"}`);
    } else {
      fail(
        "Stripe Price 19€ EUR recurring",
        "L4",
        "no se encontró price con unit_amount=1900 currency=eur active=true type=recurring",
      );
    }

    if (found49) {
      pass(`Stripe Price 49€ EUR recurring activo`, "L4", `id=${found49.id} lookup_key=${found49.lookup_key ?? "—"}`);
    } else {
      fail(
        "Stripe Price 49€ EUR recurring",
        "L4",
        "no se encontró price con unit_amount=4900 currency=eur active=true type=recurring",
      );
    }

    // Webhook sin firma debe rechazar con 400 + SIGNATURE_VERIFICATION_FAILED
    const url = `${BASE_URL}/api/stripe/webhook`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "noop" }),
      });
      const body = await res.text();
      if (res.status === 400 && body.includes("SIGNATURE_VERIFICATION_FAILED")) {
        pass("Webhook rechaza firma ausente → 400 SIGNATURE_VERIFICATION_FAILED", "L4", `status=${res.status}`);
      } else {
        fail(
          "Webhook rechaza firma ausente",
          "L4",
          `esperado 400 con SIGNATURE_VERIFICATION_FAILED, recibido ${res.status} body=${body.slice(0, 120)}`,
        );
      }
    } catch (e) {
      fail(
        "Webhook rechaza firma ausente",
        "L4",
        `fetch a ${url} falló: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  } catch (e) {
    fail(
      "Stripe live Prices",
      "L4",
      `SDK error: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

// ─── Verdict ────────────────────────────────────────────────────────────────

console.log("\n");
console.log("┌──────────────────────────────────────────────────────────────────────────┐");
console.log("│ Veredicto final                                                          │");
console.log("├──────────┬─────┬──────────┬──────────────────────────────────────────────┤");
console.log("│ Capa     │ Res │ Claim    │ Detalle                                      │");
console.log("├──────────┼─────┼──────────┼──────────────────────────────────────────────┤");

const order: Row["result"][] = ["FAIL", "WARN", "PASS", "SKIPPED"];
const sorted = [...rows].sort((a, b) => {
  if (a.layer !== b.layer) return a.layer.localeCompare(b.layer);
  return order.indexOf(a.result) - order.indexOf(b.result);
});

for (const r of sorted) {
  const layer = r.layer.padEnd(8);
  const result =
    r.result === "PASS"
      ? "PASS"
      : r.result === "FAIL"
        ? "FAIL"
        : r.result === "WARN"
          ? "WARN"
          : "SKIP ";
  const claim = r.claim.length > 50 ? r.claim.slice(0, 47) + "..." : r.claim.padEnd(50);
  const detail = r.detail.length > 60 ? r.detail.slice(0, 57) + "..." : r.detail;
  console.log(`│ ${layer} │ ${result} │ ${claim} │ ${detail} │`);
}

const failures = rows.filter((r) => r.result === "FAIL").length;
const warnings = rows.filter((r) => r.result === "WARN").length;
const passed = rows.filter((r) => r.result === "PASS").length;
const skipped = rows.filter((r) => r.result === "SKIPPED").length;

const totalsStr = `${passed} PASS · ${warnings} WARN · ${failures} FAIL · ${skipped} SKIPPED`;
const totalsPad = " ".repeat(Math.max(0, 34 - totalsStr.length));

console.log("├──────────┴─────┴──────────┴──────────────────────────────────────────────┤");
console.log(`│ Totales: ${totalsStr}${totalsPad}│`);
console.log("└──────────────────────────────────────────────────────────────────────────┘");

if (failures > 0) {
  console.error(`\n❌ ${failures} claim(s) con FAIL bloqueante. Aplicar correcciones.`);
  return 1;
}
console.log(`\n✅ 0 FAIL — todos los claims verificados son consistentes con la realidad.`);
return 0;
}

main().then((code) => process.exit(code));
