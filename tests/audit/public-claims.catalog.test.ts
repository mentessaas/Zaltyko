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
import { ESSENTIAL_FAQS, ESSENTIAL_FEATURES } from "@/lib/launch/essential-public-catalog";
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
    expect(pro.cta).toBe("Crear academia gratis");
    // Starter is the low-touch self-serve entry: create the account and
    // configure the academy first, then activate the trial/paid plan from
    // Billing once the academy exists.
    expect(pro.ctaHref).toBe("/auth/register?role=owner");
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
    expect(premium.cta).toBe("Crear academia gratis");
    expect(premium.ctaHref).toBe("/auth/register?role=owner");
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

  it("la portada publica solo capacidades esenciales y no estadísticas o módulos avanzados", () => {
    const home = readSiteFile("src/app/page.tsx");
    for (const retired of ["ComparisonSection", "SocialProofSection", "ModulesSection", "SeoExtendedSection"]) {
      expect(home).not.toContain(retired);
    }
    expect(ESSENTIAL_FEATURES).toHaveLength(5);
    expect(ESSENTIAL_FEATURES.flatMap(item => item.features).join(" ")).not.toMatch(/Health Score|retención|portal familiar|cobro automático|rúbrica/i);
    expect(comparison).not.toContain("Cobros automáticos");
  });

  it("explica el cobro familiar manual del lanzamiento sin prometer automatización", () => {
    const paymentsPage = readSiteFile("src/app/(site)/modules/pagos-administracion/page.tsx");
    const integrations = readSiteFile("src/app/integraciones/page.tsx");
    const homeModules = readSiteFile("src/app/(site)/home/ModulesSection.tsx");
    const seoExtended = readSiteFile("src/app/(site)/home/SeoExtendedSection.tsx");
    const help = readSiteFile("src/app/ayuda/page.tsx");
    const llmsFull = readSiteFile("src/app/llms-full.txt/route.ts");
    const planCatalog = readSiteFile("src/lib/plans/catalog.ts");

    expect(paymentsPage).toContain("En este lanzamiento no se realizan cargos automáticos a las familias");
    expect(paymentsPage).toContain("registrar manualmente los pagos");
    expect(integrations).toContain("no activa el cobro automático de las cuotas de sus familias");
    expect(homeModules).toContain("Registro manual de pagos");
    expect(seoExtended).toContain("Pagos registrados y pendientes a la vista");
    expect(help).toContain("No en este lanzamiento");
    expect(llmsFull).toContain("Zaltyko no inicia cargos automáticos a las familias");
    expect(planCatalog).toContain("Asistencia y cuotas mensuales con registro manual de pagos");
    expect(homeModules).not.toContain("avisos automáticos a familias");
    expect(seoExtended).not.toContain("Cobros automáticos y recordatorios programados");
  });

  it("FaqSection contiene respuesta RGPD sobre menores", () => {
    expect(ESSENTIAL_FAQS.map(item => `${item.question} ${item.answer}`).join(" ")).toContain("protección de datos de menores");
    expect(ESSENTIAL_FAQS.map(item => `${item.question} ${item.answer}`).join(" ")).toContain("aísla los datos por academia");
    expect(ESSENTIAL_FAQS.map(item => `${item.question} ${item.answer}`).join(" ")).toContain("controles de acceso por rol");
    expect(ESSENTIAL_FAQS.map(item => item.answer).join(" ")).toContain("hasta archivar el excedente o contratar capacidad suficiente");
    expect(ESSENTIAL_FAQS.map(item => item.answer).join(" ")).toContain("web adaptable a móvil");
  });

  it("Network mantiene el mismo precio base y matiz sales-assisted en las FAQs", () => {
    const home = readSiteFile("src/app/page.tsx");
    const faqPage = readSiteFile("src/app/(site)/faq/page.tsx");
    expect(faqPage).toContain("ESSENTIAL_FAQS");
    expect(faq).toContain("ESSENTIAL_FAQS");
    expect(home).toContain("ESSENTIAL_FAQS");
    for (const copy of [ESSENTIAL_FAQS.map(item => item.answer).join(" ")]) {
      expect(copy).toContain("Network parte de 99€/mes");
      expect(copy).toContain("propuesta final");
    }
  });

  it("la FAQ de cancelación distingue Free de los planes de pago", () => {
    const faqPage = readSiteFile("src/app/(site)/faq/page.tsx");
    expect(faqPage).toContain("ESSENTIAL_FAQS");
    expect(ESSENTIAL_FAQS.map(item => item.answer).join(" ")).toContain("Al finalizar el periodo de acceso, la academia vuelve a Free");
  });

  it("PricingSection comunica prueba explícita y comparación mensual/anual", () => {
    const copy = pricing.replace(/\s+/g, " ");
    expect(copy).toContain("Precios sin IVA");
    expect(copy).toContain("7 días de Starter sin tarjeta");
    expect(copy).toContain("una activación por academia cada 12 meses");
    expect(copy).toContain("Empieza gratis y configura tu academia");
    expect(copy).toContain("Aislamiento por academia");
    expect(copy).toContain("Puesta en marcha guiada");
    expect(copy).toContain('aria-label="Periodicidad de precios"');
    expect(copy).toContain("Importe anual cobrado de una vez");
    expect(copy).toContain("Consultar una migración");
    expect(copy).not.toContain("aria-disabled");
  });

  it("el indicador de límites usa las mismas cuotas que el catálogo", () => {
    const indicator = readSiteFile("src/components/onboarding/LimitIndicator.tsx");
    expect(indicator).toContain("PRODUCT_PLANS.map");
    expect(indicator).toContain("benefits: plan.features");
    expect(indicator).not.toContain('"2 grupos"');
    expect(indicator).not.toContain('"5 clases"');
  });

  it("las páginas legales no mezclan denominaciones societarias", () => {
    const terms = readSiteFile("src/app/terminos/page.tsx");
    const privacy = readSiteFile("src/app/politica-privacidad/page.tsx");
    expect(terms).not.toContain("Zaltyko S.L.");
    expect(privacy).not.toContain("Mentes SaaS S.L.");
    expect(terms).toContain("Zaltyko se reserva");
    expect(privacy).toContain("operada bajo la marca Zaltyko");
    expect(terms).toContain("26 de octubre de 2026");
    expect(privacy).toContain("26 de octubre de 2026");
    // Both documents must expose the same actual seller and pending-status notice.
    expect(terms).toContain("<SellerIdentification />");
    expect(privacy).toContain("<SellerIdentification />");
  });

  it("los CTAs públicos no confunden cuenta con academia", () => {
    const siteRoot = join(REPO, "src/app/(site)");
    const files = walk(siteRoot);
    const ambiguousCta = files.filter((file) => readFileSync(file, "utf8").includes("Crea tu academia gratis"));
    expect(ambiguousCta).toEqual([]);
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

describe("L2 — claims de módulos alineados con capacidades verificadas", () => {
  const payments = readSiteFile("src/app/(site)/modules/pagos-administracion/page.tsx");
  const reports = readSiteFile("src/app/(site)/modules/dashboard-reportes/page.tsx");
  const features = readSiteFile("src/app/(site)/FeaturesSection.tsx");
  const athletes = readSiteFile("src/app/(site)/modules/gestion-atletas/page.tsx");
  const demo = readSiteFile("src/app/(site)/home/DemoSection.tsx");
  const socialProof = readSiteFile("src/app/(site)/home/TestimonialsSection.tsx");
  const authenticatedPlanComparison = readSiteFile("src/components/billing/PlanComparison.tsx");

  it("no promete contabilidad integrada, pagos fraccionados ni importación de familias", () => {
    for (const needle of [
      "contable",
      "contabilidad externa",
      "pagos fraccionados",
      "fraccionar",
      "importa a las familias",
      "cargo el día 1",
    ]) {
      expect(payments.toLowerCase()).not.toContain(needle);
      expect(reports.toLowerCase()).not.toContain(needle);
    }
  });

  it("la FAQ esencial no promete importaciones sin validar", () => {
    const faqPage = readSiteFile("src/app/(site)/faq/page.tsx");
    expect(faqPage).toContain("ESSENTIAL_FAQS");
    expect(ESSENTIAL_FAQS.map(item => item.answer).join(" ")).not.toMatch(/importa[rn]?|Excel|CSV/i);
  });

  it("describe las exportaciones como apoyo operativo revisable", () => {
    expect(payments).toContain("registrar manualmente los pagos");
    expect(payments).not.toContain("reportes por módulo para revisarlos con tu equipo");
    expect(reports).toContain("Reportes para tu equipo");
    expect(reports).toContain("compártelos con tu equipo");
  });

  it("usa el token de fondo oscuro real para conservar contraste en las pestañas", () => {
    expect(features).toContain("bg-zaltyko-primary-dark");
    expect(features).not.toContain("bg-primary-dark");
  });

  it("las pantallas de planes no prometen un portal familiar fuera del lanzamiento", () => {
    for (const file of [
      "src/app/dashboard/account-form.tsx", "src/components/billing/BillingPanel.tsx",
      "src/components/billing/BillingSummary.tsx", "src/components/profiles/OptimizedOwnerProfile.tsx",
      "src/lib/limits.ts", "src/lib/plans/catalog.ts",
    ]) {
      const copy = readSiteFile(file).toLowerCase();
      expect(copy).not.toMatch(/portal familiar|portal familias|portal de familias/);
    }
    expect(readSiteFile("src/components/onboarding/LimitIndicator.tsx")).toContain("benefits: plan.features");
  });

  it("el escaparate no promete un portal para familias", () => {
    const home = readSiteFile("src/app/page.tsx").toLowerCase();
    expect(home).not.toMatch(/portal familiar|portal de familias/);
    expect(ESSENTIAL_FEATURES.flatMap(item => item.features).join(" ")).not.toMatch(/portal familiar/i);
  });

  it("no publica funciones de eventos o documentos que aún no son operativas", () => {
    const normalized = features.toLowerCase();
    expect(normalized).not.toContain("listas de viaje y alojamiento");
    expect(normalized).not.toContain("checklist de equipo por atleta");
    expect(normalized).not.toContain("múltiples sedes");
    expect(athletes).toContain("Avisos visibles para documentos por vencer");
  });

  it("no deja placeholders ni controles inertes en la landing", () => {
    expect(socialProof.toLowerCase()).not.toContain("próximamente");
    expect(socialProof.toLowerCase()).not.toContain("placeholder");
    expect(demo).not.toContain('Haz clic para ver el demo (90 segundos)');
    expect(demo).not.toContain('<button');
    expect(demo).toContain('href="/contact?type=demo"');
  });

  it("la comparación autenticada no publica límites que el catálogo no aplica", () => {
    expect(authenticatedPlanComparison).toContain("Gimnastas:");
    expect(authenticatedPlanComparison).toContain("Clases:");
    expect(authenticatedPlanComparison).not.toContain("Coaches:");
    expect(authenticatedPlanComparison).not.toContain("Storage:");
    expect(authenticatedPlanComparison).not.toContain("storage_gb");
  });
});
