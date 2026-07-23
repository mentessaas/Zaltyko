/**
 * Public claims audit — L2 (catalog ↔ copy) and L3 (trial/limits policy).
 *
 * Pure deterministic assertions: no DB, no network. Runs in the standard
 * `pnpm vitest run` gate so any drift between the source of truth
 * (`src/lib/plans/catalog.ts`, `src/lib/billing/trial-policy.ts`) and the
 * published copy (`src/app/(site)/home/*`, `src/app/(site)/pricing.tsx`)
 * fails the build.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  BILLABLE_PRODUCT_PLANS,
  PRODUCT_PLAN_BY_CODE,
  PRODUCT_PLANS,
} from "@/lib/plans/catalog";
import {
  TRIAL_COOLDOWN_DAYS,
  TRIAL_DURATION_DAYS,
  evaluateTrialPolicy,
} from "@/lib/billing/trial-policy";

const REPO = process.cwd();

function readSiteFile(...parts: string[]) {
  return readFileSync(join(REPO, ...parts), "utf8");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      walk(full, out);
    } else if (/\.(tsx?|jsx?|mdx?)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe("L2 — plans catalog matches published copy", () => {
  it("Free plan: 0€, 30 atletas, 1 academia, 3 grupos, 10 clases", () => {
    const free = PRODUCT_PLAN_BY_CODE.free;
    expect(free.priceEurCents).toBe(0);
    expect(free.athleteLimit).toBe(30);
    expect(free.academyLimit).toBe(1);
    expect(free.groupLimit).toBe(3);
    expect(free.classLimit).toBe(10);
    expect(free.checkoutMode).toBe("included");
    expect(free.ctaHref).toBe("/auth/register?role=owner");
  });

  it("Starter (pro): 19€, 75 atletas, 1 academia, 5 grupos, 20 clases", () => {
    const pro = PRODUCT_PLAN_BY_CODE.pro;
    expect(pro.priceEurCents).toBe(1900);
    expect(pro.athleteLimit).toBe(75);
    expect(pro.academyLimit).toBe(1);
    expect(pro.groupLimit).toBe(5);
    expect(pro.classLimit).toBe(20);
    expect(pro.publicName).toBe("Starter");
    expect(pro.cta).toBe("Solicitar demo");
    expect(pro.ctaHref).toBe("/contact?type=demo&plan=starter");
    expect(pro.checkoutMode).toBe("self-serve");
  });

  it("Growth (premium): 49€, 200 atletas, 1 academia, 10 grupos, 40 clases", () => {
    const premium = PRODUCT_PLAN_BY_CODE.premium;
    expect(premium.priceEurCents).toBe(4900);
    expect(premium.athleteLimit).toBe(200);
    expect(premium.academyLimit).toBe(1);
    expect(premium.groupLimit).toBe(10);
    expect(premium.classLimit).toBe(40);
    expect(premium.publicName).toBe("Growth");
    expect(premium.cta).toBe("Solicitar demo");
    expect(premium.ctaHref).toBe("/contact?type=demo&plan=growth");
    expect(premium.highlight).toBe(true);
    expect(premium.checkoutMode).toBe("self-serve");
  });

  it("Network: 99€, ilimitado, sales-assisted (no self-serve checkout)", () => {
    const network = PRODUCT_PLAN_BY_CODE.network;
    expect(network.priceEurCents).toBe(9900);
    expect(network.athleteLimit).toBeNull();
    expect(network.academyLimit).toBeNull();
    expect(network.groupLimit).toBeNull();
    expect(network.classLimit).toBeNull();
    expect(network.cta).toBe("Hablar con Zaltyko");
    expect(network.ctaHref).toBe("/contact?type=network");
    expect(network.checkoutMode).toBe("sales-assisted");
  });

  it("BILLABLE_PRODUCT_PLANS excluye network (sin Stripe self-checkout)", () => {
    expect(BILLABLE_PRODUCT_PLANS.map((p) => p.code)).not.toContain("network");
    expect(BILLABLE_PRODUCT_PLANS.length).toBe(PRODUCT_PLANS.length - 1);
  });
});

describe("L3 — trial policy constants y funciones puras", () => {
  it("Duración y cooldown coinciden con copy pública", () => {
    expect(TRIAL_DURATION_DAYS).toBe(7);
    expect(TRIAL_COOLDOWN_DAYS).toBe(365);
  });

  it("Academia fresca sin trial previo: elegible", () => {
    const now = new Date("2026-07-14T10:00:00Z");
    const r = evaluateTrialPolicy({
      now,
      activeTrial: null,
      lastTrialStartedAt: null,
      hasPaidPlan: false,
    });
    expect(r.eligible).toBe(true);
    expect(r.active).toBe(false);
    expect(r.reason).toBe("eligible");
  });

  it("Con trial activo: NO elegible (reason: active_trial)", () => {
    const now = new Date("2026-07-14T10:00:00Z");
    const r = evaluateTrialPolicy({
      now,
      activeTrial: {
        startedAt: new Date("2026-07-10T10:00:00Z"),
        endsAt: new Date("2026-07-17T10:00:00Z"),
      },
      lastTrialStartedAt: null,
      hasPaidPlan: false,
    });
    expect(r.eligible).toBe(false);
    expect(r.active).toBe(true);
    expect(r.reason).toBe("active_trial");
  });

  it("Trial hace 30 días: en cooldown (reason: cooldown)", () => {
    const now = new Date("2026-07-14T10:00:00Z");
    const r = evaluateTrialPolicy({
      now,
      activeTrial: null,
      lastTrialStartedAt: new Date("2026-06-14T10:00:00Z"),
      hasPaidPlan: false,
    });
    expect(r.eligible).toBe(false);
    expect(r.active).toBe(false);
    expect(r.reason).toBe("cooldown");
  });

  it("Con plan de pago: NO elegible (reason: paid_plan_active)", () => {
    const now = new Date("2026-07-14T10:00:00Z");
    const r = evaluateTrialPolicy({
      now,
      activeTrial: null,
      lastTrialStartedAt: null,
      hasPaidPlan: true,
    });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("paid_plan_active");
  });
});

describe("L2 — copy pública presente en componentes", () => {
  const comparison = readSiteFile("src/app/(site)/home/ComparisonSection.tsx");
  const faq = readSiteFile("src/app/(site)/home/FaqSection.tsx");
  const pricing = readSiteFile("src/app/(site)/pricing.tsx");

  it("ComparisonSection afirma features clave", () => {
    expect(comparison).toContain("Cobros automáticos");
    expect(comparison).toContain("Pase de lista por sesión");
    expect(comparison).toContain("Evaluaciones con rúbrica");
    expect(comparison).toContain("7 días de Starter sin tarjeta");
    expect(comparison).toContain("Importación base desde Excel");
  });

  it("FaqSection contiene respuesta RGPD sobre menores", () => {
    expect(faq).toContain("protección de datos de menores");
    expect(faq).toContain("aísla los datos por academia");
    expect(faq).toContain("controles de acceso por rol");
    expect(faq).toContain("No hay permanencia ni penalizaciones");
    expect(faq).toContain("verificado en móvil");
  });

  it("PricingSection tiene banner de trial y anual deshabilitado", () => {
    expect(pricing).toContain("7 días de Starter sin tarjeta");
    expect(pricing).toContain("una activación por academia cada 12 meses");
    expect(pricing).toContain("Aislamiento por academia");
    expect(pricing).toContain("Puesta en marcha guiada");
    expect(pricing).toContain("próximamente");
    expect(pricing).toContain('aria-disabled="true"');
  });
});

describe("L2 — guardrails ausentes en sitio público", () => {
  // Scans the (site) tree for claims retired by `Mensajes aprobados.md`.
  // Only fails if the bad string appears in user-facing .tsx / .mdx.
  const forbiddenStrings = [
    "100% seguro",
    "RGPD Compliant",
    "RGPD compliant",
    "52 páginas",
    "2 horas", // duración cerrada prohibida
  ];

  // Strings that we tolerate in literal context (e.g. durations in pricing copy
  // that aren't claiming setup time) — currently none; we ban all "X horas".
  // Add an exception map here if a false-positive appears.

  it.each(forbiddenStrings)(
    "no contiene la cadena prohibida: %s",
    (needle) => {
      const siteRoot = join(REPO, "src/app/(site)");
      const files = walk(siteRoot);
      const offenders: { file: string; line: number; text: string }[] = [];
      for (const file of files) {
        const text = readFileSync(file, "utf8");
        if (!text.includes(needle)) continue;
        text.split("\n").forEach((line, i) => {
          if (line.includes(needle)) {
            offenders.push({ file: file.replace(REPO + "/", ""), line: i + 1, text: line.trim() });
          }
        });
      }
      if (offenders.length > 0) {
        const detail = offenders
          .map((o) => `  ${o.file}:${o.line} → ${o.text}`)
          .join("\n");
        throw new Error(
          `Guardrail reintroducido ("${needle}") en:\n${detail}`,
        );
      }
    },
  );
});
