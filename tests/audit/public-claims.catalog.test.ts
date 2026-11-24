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
  PUBLIC_PRODUCT_PLANS,
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
  it("Gratis: 0€, 30 gimnastas, dos personas y grupos y clases sin tope", () => {
    const free = PRODUCT_PLAN_BY_CODE.free;
    expect(free.priceEurCents).toBe(0);
    expect(free.athleteLimit).toBe(30);
    expect(free.academyLimit).toBe(1);
    expect(free.groupLimit).toBeNull();
    expect(free.classLimit).toBeNull();
    expect(free.teamMemberLimit).toBe(2);
    expect(free.checkoutMode).toBe("included");
    expect(free.ctaHref).toBe("/auth/register?role=owner");
  });

  it("Club: 29€/mes y 290€/año con capacidad ilimitada", () => {
    const club = PRODUCT_PLAN_BY_CODE.club;
    expect(club.priceEurCents).toBe(2397);
    expect(club.annualPriceEurCents).toBe(23967);
    expect(club.athleteLimit).toBeNull();
    expect(club.academyLimit).toBe(1);
    expect(club.groupLimit).toBeNull();
    expect(club.classLimit).toBeNull();
    expect(club.teamMemberLimit).toBeNull();
    expect(club.publicName).toBe("Club");
    expect(club.checkoutMode).toBe("self-serve");
  });

  it("los planes heredados conservan su importe y reciben derechos de Club", () => {
    expect(PRODUCT_PLAN_BY_CODE.pro.priceEurCents).toBe(1900);
    expect(PRODUCT_PLAN_BY_CODE.premium.priceEurCents).toBe(4900);
    for (const plan of [PRODUCT_PLAN_BY_CODE.pro, PRODUCT_PLAN_BY_CODE.premium]) {
      expect(plan.athleteLimit).toBeNull();
      expect(plan.groupLimit).toBeNull();
      expect(plan.classLimit).toBeNull();
      expect(plan.publicName).toBe("Club (heredado)");
    }
  });

  it("Network se conserva solo como plan heredado", () => {
    const network = PRODUCT_PLAN_BY_CODE.network;
    expect(network.publicName).toBe("Club (heredado)");
    expect(network.description).not.toMatch(/99 ?€/i);
  });

  it("BILLABLE_PRODUCT_PLANS excluye Network para nuevas contrataciones", () => {
    expect(BILLABLE_PRODUCT_PLANS.map((p) => p.code)).not.toContain("network");
    expect(BILLABLE_PRODUCT_PLANS.length).toBe(PRODUCT_PLANS.length - 1);
  });

  it("PUBLIC_PRODUCT_PLANS solo ofrece Gratis y Club", () => {
    expect(PUBLIC_PRODUCT_PLANS.map((p) => p.code)).toEqual(["free", "club"]);
    expect(readSiteFile("src/app/(site)/pricing.tsx")).toContain("PUBLIC_PRODUCT_PLANS.map");
    expect(readSiteFile("src/app/(site)/mat/HomeSections.tsx")).toContain("PUBLIC_PRODUCT_PLANS.map");
    const network = PRODUCT_PLAN_BY_CODE.network;
    expect([network.description, network.shortDescription, ...network.features].join(" ")).not.toMatch(/Network 99|99 ?€|contacto/i);
  });
});

describe("L3 — trial policy constants y funciones puras", () => {
  it("Duración y cooldown coinciden con copy pública", () => {
    expect(TRIAL_DURATION_DAYS).toBe(30);
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
    expect(planCatalog).toContain("Gestión diaria, asistencia y cuotas a mano");
    expect(homeModules).not.toContain("avisos automáticos a familias");
    expect(seoExtended).not.toContain("Cobros automáticos y recordatorios programados");
  });

  it("FaqSection contiene respuesta RGPD sobre menores", () => {
    const minors = ESSENTIAL_FAQS.find(item => item.question === "¿Qué pasa con los datos de los menores?");
    expect(minors?.answer).toContain("aísla los datos por academia");
    expect(minors?.answer).toContain("controles de acceso por rol");
    // Sin prometer cumplimiento normativo: los controles no sustituyen las obligaciones de la academia.
    expect(minors?.answer).toContain("no sustituyen las obligaciones de la academia");
    expect(ESSENTIAL_FAQS.map(item => item.answer).join(" ")).toContain("hasta archivar el excedente o contratar capacidad suficiente");
    // El uso desde el móvil se cuenta donde importa: el pase de lista de las entrenadoras.
    expect(ESSENTIAL_FAQS.map(item => item.answer).join(" ")).toContain("pasa lista desde el móvil, sin instalar nada");
  });

  it("la FAQ es corta y orientada a las objeciones antes de registrarse", () => {
    expect(ESSENTIAL_FAQS.length).toBeLessThanOrEqual(8);
    expect(ESSENTIAL_FAQS.map(item => item.question)).toEqual([
      "¿Cuánto cuesta? ¿Hay un plan gratis?",
      "¿Sirve para mi academia y mi país?",
      "¿Puedo traer mis gimnastas desde un Excel?",
      "¿Cuánto tardo en empezar?",
      "¿Pueden entrar mis entrenadoras?",
      "¿Zaltyko cobra a las familias?",
      "¿Qué pasa con los datos de los menores?",
      "¿Qué pasa al terminar la prueba o si cancelo?",
    ]);
    for (const item of ESSENTIAL_FAQS) {
      // De una a tres frases, sin jerga interna.
      expect(item.answer.split(/[.!?](?:\s|$)/).filter(Boolean).length, item.question).toBeLessThanOrEqual(3);
      expect(item.answer, item.question).not.toMatch(/\bSaaS\b|\bonboarding\b|\bowner\b/i);
    }
    // El alta de la dirección no pide tarjeta: el formulario solo pide nombre, correo, contraseña y aceptación.
    expect(readSiteFile("src/components/RegisterForm.tsx")).not.toMatch(/cardNumber|CardElement|PaymentElement|@stripe/i);
    expect(ESSENTIAL_FAQS[0].answer).toContain("sin tarjeta");
    // Las cuotas a las familias nunca se cobran solas.
    expect(ESSENTIAL_FAQS.find(item => item.question === "¿Zaltyko cobra a las familias?")?.answer).toMatch(/^No\./);
  });

  it("las FAQs no ofrecen Network: no es contratable ni tiene producto multi-sede", () => {
    // The home FAQPage JSON-LD is built from the catalog in home-structured-data.ts.
    const homeStructuredData = readSiteFile("src/lib/launch/home-structured-data.ts");
    const faqPage = readSiteFile("src/app/(site)/faq/page.tsx");
    expect(faqPage).toContain("ESSENTIAL_FAQS");
    expect(faq).toContain("ESSENTIAL_FAQS");
    expect(homeStructuredData).toContain("mainEntity: ESSENTIAL_FAQS.map");
    expect(readSiteFile("src/app/page.tsx")).toContain("<Schema json={structuredData.faqPage} />");
    for (const copy of [ESSENTIAL_FAQS.map(item => item.answer).join(" ")]) {
      expect(copy).not.toContain("Network");
      expect(copy).not.toContain("99 €/mes");
      expect(copy).not.toMatch(/multi-?sede/i);
    }
  });

  it("la FAQ de cancelación distingue Free de los planes de pago", () => {
    const faqPage = readSiteFile("src/app/(site)/faq/page.tsx");
    expect(faqPage).toContain("ESSENTIAL_FAQS");
    expect(ESSENTIAL_FAQS.map(item => item.answer).join(" ")).toContain("Al terminar, la academia vuelve a Gratis");
  });

  it("PricingSection comunica prueba explícita y comparación mensual/anual", () => {
    const copy = pricing.replace(/\s+/g, " ");
    expect(copy).toContain("Precios finales con IVA");
    expect(copy).toContain("base antes de IVA");
    expect(copy).toContain("Prueba Club durante 30 días, sin tarjeta");
    expect(copy).toContain("Los 10 primeros clubes de Málaga");
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

  it("la FAQ esencial solo habla de importación en la pregunta de la importación activa (PR 278)", () => {
    const faqPage = readSiteFile("src/app/(site)/faq/page.tsx");
    expect(faqPage).toContain("ESSENTIAL_FAQS");
    const importFaq = ESSENTIAL_FAQS.find(item => item.question === "¿Puedo traer mis gimnastas desde un Excel?");
    expect(importFaq?.answer).toContain("vista previa");
    expect(importFaq?.answer).toContain("mismo nombre y fecha de nacimiento");
    expect(importFaq?.answer).toContain("no se crean de nuevo");
    expect(importFaq?.answer).toContain("propiedad o la administración");
    expect(importFaq?.answer).toContain("Las cuotas, los pagos y el historial no se importan");
    expect(
      ESSENTIAL_FAQS.filter(item => item !== importFaq).map(item => item.answer).join(" ")
    ).not.toMatch(/importa[rn]?|Excel|CSV/i);
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

  it("el catálogo incluye el portal familiar en Club y no en Gratis", () => {
    for (const file of [
      "src/app/dashboard/account-form.tsx", "src/components/billing/BillingSummary.tsx", "src/components/profiles/OptimizedOwnerProfile.tsx",
    ]) {
      const copy = readSiteFile(file).toLowerCase();
      expect(copy).not.toMatch(/portal familiar|portal familias|portal de familias/);
    }
    expect(PRODUCT_PLAN_BY_CODE.club.features.join(" ")).toMatch(/portal familiar/i);
    expect(PRODUCT_PLAN_BY_CODE.free.features.join(" ")).not.toMatch(/portal familiar/i);
    expect(readSiteFile("src/lib/limits.ts")).toContain("Portal familiar y avisos");
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
