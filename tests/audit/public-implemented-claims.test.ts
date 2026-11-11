/**
 * Lo que la web pública cuenta como disponible debe estar activo, y lo que
 * está dormido solo puede aparecer como «En preparación», sin fechas
 * (matriz competitiva, apartados 4 y 5). Sin red ni base de datos.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ESSENTIAL_FAQS,
  ESSENTIAL_FEATURES,
  IMPLEMENTED_HIGHLIGHTS,
  IN_PREPARATION,
  PUBLIC_PROMISE,
} from "@/lib/launch/essential-public-catalog";

const REPO = process.cwd();
const read = (path: string) => readFileSync(join(REPO, path), "utf8");

/** Built but dormant: invitations (277), class coaches (276), objectives (271), session plan (279), clash warnings (284), funnel (262), family portal (261). */
const DORMANT = [
  /invitaci[oó]n|invita a tu equipo|tu equipo (ve|entra|pasa lista)/i,
  /acceso (para|de) (las )?entrenador/i,
  /entrenadoras? titular|sustituci[oó]n|sustituciones/i,
  /objetivos? (de las|por) gimnasta|objetivos de las gimnastas/i,
  /planificaci[oó]n de (las )?sesiones|gui[oó]n de la sesi[oó]n/i,
  /choques? de horario|avisos? de choque/i,
  /solicitudes de prueba|embudo|captaci[oó]n web/i,
  /portal (de|para) (las )?familias|portal familiar/i,
];
const NEVER = [/SEPA/, /domiciliaci[oó]n/i, /cobro autom[aá]tico|cargos? autom[aá]ticos? (a|de) (las )?familias/i];
/** Prohibited by docs/producto/glosario.md in public copy. */
const GLOSSARY_PROHIBITED = [/\batletas?\b/i, /\bmatr[ií]cula/i, /\bfacturas? a (las )?familias/i, /\bdashboard\b/i, /\borganizaci[oó]n\b/i, /\bubicaci[oó]n\b/i, /\balumn[oa]s?\b/i];

const availableClaims = [
  PUBLIC_PROMISE,
  ...ESSENTIAL_FEATURES.flatMap((feature) => [feature.label, feature.title, feature.impact, ...feature.features]),
  ...IMPLEMENTED_HIGHLIGHTS.flatMap((item) => [item.title, item.text]),
];
const coachFaq = ESSENTIAL_FAQS.find((item) => item.question === "¿Pueden entrar mis entrenadoras?");

describe("lo que se anuncia como disponible está activo", () => {
  it("cada frase destacada nombra la función que la respalda y sus ficheros existen", () => {
    expect(IMPLEMENTED_HIGHLIGHTS.map((item) => item.id)).toEqual([
      "hoy",
      "importacion",
      "puesta-en-marcha",
      "sedes",
      "historial",
      "sin-duplicados",
    ]);
    for (const item of IMPLEMENTED_HIGHLIGHTS) {
      expect(item.evidence.route.length, item.id).toBeGreaterThan(3);
      for (const file of item.evidence.files) expect(existsSync(join(REPO, file)), `${item.id}: ${file}`).toBe(true);
    }
  });

  it("la importación anunciada es la de owner/admin con todas las sedes y vista previa", () => {
    const service = read("src/modules/athlete-import/application/athlete-import/context.ts");
    expect(service).toContain('const IMPORT_ROLES = ["owner", "admin"] as const;');
    expect(read("src/app/owner/athletes/import/page.tsx")).toContain('scope.member.locationScopeMode !== "all"');
  });

  it("«Nada se duplica» solo nombra órdenes que exigen clave de idempotencia", () => {
    for (const route of [
      "src/app/api/v1/owner/athlete-intake/route.ts",
      "src/app/api/v1/owner/enrollments/route.ts",
      "src/app/api/v1/owner/billing/monthly-invoices/issue/route.ts",
      "src/app/api/v1/owner/billing/manual-payments/route.ts",
      "src/app/api/v1/owner/sessions/[sessionId]/attendance/route.ts",
    ]) {
      expect(read(route).toLowerCase(), route).toContain("idempotency-key");
    }
  });

  it("ninguna función dormida se anuncia como disponible", () => {
    for (const claim of availableClaims) {
      for (const pattern of DORMANT) expect(claim, String(pattern)).not.toMatch(pattern);
    }
    for (const faq of ESSENTIAL_FAQS.filter((item) => item !== coachFaq)) {
      for (const pattern of DORMANT) expect(`${faq.question} ${faq.answer}`, String(pattern)).not.toMatch(pattern);
    }
    // The one FAQ that names coach access says it is not available yet.
    expect(coachFaq?.answer).toMatch(/^Todavía no\./);
    expect(coachFaq?.answer).toContain("está en preparación");
  });

  it("lo dormido solo aparece en «En preparación», sin fechas", () => {
    for (const item of IN_PREPARATION) {
      expect(DORMANT.some((pattern) => pattern.test(item)), item).toBe(true);
      expect(item).not.toMatch(/\b(19|20)\d{2}\b|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|trimestre|pronto|próximamente/i);
    }
    const home = read("src/app/(site)/mat/HomeSections.tsx");
    expect(home).toContain("En preparación");
    expect(home).toContain("no tienen fecha comprometida");
    // llms-full: any line naming a dormant feature is the «En preparación» line.
    for (const line of read("src/app/llms-full.txt/route.ts").split("\n")) {
      if (DORMANT.some((pattern) => pattern.test(line))) expect(line, line).toMatch(/^En preparación, sin fecha y no disponibles todavía:/);
    }
  });

  it("no promete cobro automático ni SEPA", () => {
    for (const claim of [...availableClaims, ...IN_PREPARATION]) {
      for (const pattern of NEVER) expect(claim, String(pattern)).not.toMatch(pattern);
    }
  });

  it("usa los términos del glosario", () => {
    for (const claim of [...availableClaims, ...IN_PREPARATION, ...ESSENTIAL_FAQS.map((item) => `${item.question} ${item.answer}`)]) {
      for (const pattern of GLOSSARY_PROHIBITED) expect(claim, String(pattern)).not.toMatch(pattern);
    }
  });
});

describe("la portada dice lo mismo que sus datos estructurados", () => {
  const page = read("src/app/page.tsx");

  it("la promesa recomendada está en el hero y la descripción la resume", () => {
    expect(read("src/app/(site)/mat/MatHero.tsx")).toContain("{PUBLIC_PROMISE}");
    expect(PUBLIC_PROMISE).toContain("Organiza grupos, clases y asistencia de tu academia de gimnasia en un solo sitio");
    expect(page).toMatch(/const description = "Organiza grupos, clases y asistencia/);
  });

  it("el JSON-LD lista las mismas funciones que la página", () => {
    expect(page).toContain("featureList");
    expect(page).toContain("ESSENTIAL_FEATURES.flatMap((feature) => feature.features)");
    expect(page).toContain("IMPLEMENTED_HIGHLIGHTS.map((item) => item.title)");
    expect(page).toContain("<ImplementedNow />");
  });

  it("los precios no cambian", () => {
    const plans = ESSENTIAL_FAQS.find((item) => item.question === "¿Qué planes y precios hay?")!.answer;
    expect(plans).toContain("Free incluye hasta 30 gimnastas, 3 grupos y 10 clases activas");
    expect(plans).toContain("19 €/mes o 190 €/año");
    expect(plans).toContain("49 €/mes o 490 €/año");
  });
});
