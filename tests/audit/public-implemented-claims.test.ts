/**
 * Lo que la web pública cuenta como disponible debe estar activo, y lo que
 * está dormido solo puede aparecer en el bloque «En preparación», sin fechas
 * (matriz competitiva, apartados 4 y 5). Revisa el catálogo, el texto escrito
 * a mano de las páginas públicas, los metadatos, llms-full.txt y el JSON-LD
 * que se genera de verdad. Sin red ni base de datos.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ESSENTIAL_FAQS,
  ESSENTIAL_FEATURES,
  HERO_LEAD,
  IMPLEMENTED_HIGHLIGHTS,
  IN_PREPARATION,
  PUBLIC_PROMISE,
} from "@/lib/launch/essential-public-catalog";
import { homeFeatureList, homeStructuredData } from "@/lib/launch/home-structured-data";

const REPO = process.cwd();
const read = (path: string) => readFileSync(join(REPO, path), "utf8");

/**
 * Built but dormant: invitations (277), class coaches (276), objectives and
 * observations (271), session script (279), clash warnings (284), trial
 * request funnel (262), family portal (261).
 */
const DORMANT: RegExp[] = [
  /\binvita(r|ci[oó]n|ciones)\b|invita a tu equipo/i,
  /tu equipo (ve|entra|pasa lista)|(tus )?entrenadoras? (pasan|pasa) lista/i,
  /acceso (para|de) (las )?entrenador/i,
  /entrenadoras? titular|\btitular(es)? por clase|sustituci[oó]n|sustituciones/i,
  /\bobjetivos?\b|\bobservaci[oó]n(es)?\b/i,
  /gui[oó]n de (la|cada) sesi[oó]n|modelo de la clase|planificaci[oó]n de (las )?sesiones/i,
  /\bchoques?\b/i,
  /solicitud(es)? de prueba|\bembudo\b|captaci[oó]n web/i,
  /portal (de|para) (las )?familias|portal familiar|enlace para familias/i,
  // Paraphrases of the same dormant features.
  /(tus )?entrenadoras? (entran|acceden)/i,
  /familias (consultan|ven) (sus )?cuotas/i,
  /planific/i,
  /(avisa|aviso).{0,30}(solap|choque|coinciden)/i,
];
const VAGUE_DATES = [
  /\b(19|20)\d{2}\b/,
  /enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre/i,
  /trimestre|\bpronto\b|pr[oó]ximamente|en breve|este (oto[nñ]o|invierno|verano|a[nñ]o|mes)/i,
];
const NEVER = [/\bSEPA\b/, /domiciliaci[oó]n/i, /cobro autom[aá]tico|cargos? autom[aá]ticos? (a|de) (las )?familias/i];
/** Prohibited by docs/producto/glosario.md in visible text. */
const GLOSSARY_PROHIBITED = [
  /\batletas?\b/i,
  /\bmatr[ií]cula/i,
  /\bfacturas? a (las )?familias/i,
  /\bdashboard\b/i,
  /\b(la|tu|una|cada) organizaci[oó]n\b/i,
  /\bubicaci[oó]n\b/i,
  /\balumn[oa]s?\b/i,
  /planificaci[oó]n/i,
  /\bplantilla\b/i,
];

/** Hand-written public text: source without comments. */
function visibleSource(path: string): string {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");
}
const HAND_WRITTEN = [
  "src/app/(site)/mat/HomeSections.tsx",
  "src/app/(site)/mat/MatHero.tsx",
  "src/app/(site)/pricing.tsx",
  "src/app/(site)/FeaturesSection.tsx",
  "src/app/features/page.tsx",
  "src/app/pricing/page.tsx",
  "src/app/page.tsx",
];

const coachFaq = ESSENTIAL_FAQS.find((item) => item.question === "¿Pueden entrar mis entrenadoras?");
/** Everything presented as available: never a dormant feature. */
const availableClaims = [
  PUBLIC_PROMISE,
  HERO_LEAD,
  ...ESSENTIAL_FEATURES.flatMap((feature) => [feature.label, feature.title, feature.impact, ...feature.features]),
  ...IMPLEMENTED_HIGHLIGHTS.flatMap((item) => [item.title, item.featureName, item.text]),
  ...ESSENTIAL_FAQS.filter((item) => item !== coachFaq).flatMap((item) => [item.question, item.answer]),
];

const matching = (text: string, patterns: RegExp[]) => patterns.filter((pattern) => pattern.test(text)).map(String);

describe("lo que se anuncia como disponible está activo", () => {
  it("cada función destacada nombra lo que la respalda y sus ficheros existen", () => {
    expect(IMPLEMENTED_HIGHLIGHTS.map((item) => item.id)).toEqual([
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

  it("la importación anunciada es la de owner/admin con todas las sedes, y se matiza el duplicado", () => {
    expect(read("src/modules/athlete-import/application/athlete-import/context.ts")).toContain(
      'const IMPORT_ROLES = ["owner", "admin"] as const;'
    );
    expect(read("src/app/owner/athletes/import/page.tsx")).toContain('scope.member.locationScopeMode !== "all"');
    const importText = IMPLEMENTED_HIGHLIGHTS.find((item) => item.id === "importacion")!.text;
    expect(importText).toContain("mismo nombre y fecha de nacimiento");
    expect(importText).not.toMatch(/no se duplican/);
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
});

describe("lo dormido solo aparece en «En preparación», sin fechas", () => {
  it("ninguna frase presentada como disponible nombra una función dormida", () => {
    for (const claim of availableClaims) expect(matching(claim, DORMANT), claim).toEqual([]);
  });

  it("el texto escrito a mano de las páginas públicas no nombra funciones dormidas", () => {
    for (const file of HAND_WRITTEN) expect(matching(visibleSource(file), DORMANT), file).toEqual([]);
  });

  it("la única FAQ sobre algo dormido dice que todavía no está disponible", () => {
    expect(coachFaq?.answer).toMatch(/^Todavía no\./);
    expect(coachFaq?.answer).toContain("está en preparación");
  });

  it("cada elemento de «En preparación» es una función dormida, sin fechas", () => {
    for (const item of IN_PREPARATION) {
      expect(matching(item, DORMANT).length, item).toBeGreaterThan(0);
      expect(matching(item, VAGUE_DATES), item).toEqual([]);
    }
    const home = visibleSource("src/app/(site)/mat/HomeSections.tsx");
    expect(home).toContain("En preparación");
    expect(home).toContain("no tienen fecha comprometida");
  });

  it("en llms-full.txt solo la línea «En preparación» nombra funciones dormidas", () => {
    const lines = read("src/app/llms-full.txt/route.ts").split("\n");
    const preparation = lines.filter((line) => line.startsWith("En preparación, sin fecha y no disponibles todavía:"));
    expect(preparation).toHaveLength(1);
    for (const line of lines.filter((line) => !preparation.includes(line))) {
      expect(matching(line, DORMANT), line).toEqual([]);
    }
  });

  it("no hay fechas vagas ni promesas de cobro automático o SEPA", () => {
    const texts = [
      ...availableClaims,
      ...IN_PREPARATION,
      ...HAND_WRITTEN.map(visibleSource),
      // The explicit negation «Zaltyko no inicia cargos automáticos a las familias» stays.
      ...read("src/app/llms-full.txt/route.ts")
        .split("\n")
        .filter((line) => !line.startsWith("Zaltyko no inicia cargos automáticos")),
    ];
    for (const text of texts) {
      expect(matching(text, NEVER), text.slice(0, 80)).toEqual([]);
      expect(matching(text, VAGUE_DATES.slice(2)), text.slice(0, 80)).toEqual([]);
    }
  });

  it("usa los términos del glosario", () => {
    const texts = [
      ...availableClaims,
      ...IN_PREPARATION,
      ...(coachFaq ? [coachFaq.question, coachFaq.answer] : []),
      ...HAND_WRITTEN.map(visibleSource),
      read("src/app/llms-full.txt/route.ts"),
    ];
    for (const text of texts) expect(matching(text, GLOSSARY_PROHIBITED), text.slice(0, 80)).toEqual([]);
    // «Pasar lista» es el nombre de la acción y de la pantalla; dentro de una frase se dice «el pase de lista».
    for (const text of [...IN_PREPARATION, ...(coachFaq ? [coachFaq.answer] : [])]) {
      expect(text, text).not.toMatch(/\w Pasar lista/);
    }
  });
});

describe("la portada dice lo mismo que sus datos estructurados", () => {
  const page = read("src/app/page.tsx");
  const description = page.match(/const description = "([^"]+)";/)?.[1] ?? "";
  const data = JSON.parse(JSON.stringify(homeStructuredData({ description, url: "https://zaltyko.test" })));

  it("la meta descripción cabe en 160 caracteres y conserva su alcance", () => {
    expect(description.length).toBeGreaterThan(50);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(description).toContain("Software de gestión en español");
    expect(description).toContain("España y México");
  });

  it("el hero usa la promesa sin repetir el H1", () => {
    const hero = read("src/app/(site)/mat/MatHero.tsx");
    expect(hero).toContain("{HERO_LEAD}");
    expect(PUBLIC_PROMISE).toContain("Organiza grupos, clases y asistencia de tu academia de gimnasia en un solo sitio");
    expect(HERO_LEAD).not.toContain("academia de gimnasia");
    expect(page).toContain("<ImplementedNow />");
  });

  it("el JSON-LD generado lista nombres descriptivos, sin duplicados ni funciones dormidas", () => {
    const features: string[] = data.softwareApplication.featureList;
    expect(data.softwareApplication).toMatchObject({ "@type": "SoftwareApplication", description, inLanguage: "es" });
    expect(features).toEqual(homeFeatureList());
    expect(new Set(features).size).toBe(features.length);
    expect(features).toEqual(expect.arrayContaining(IMPLEMENTED_HIGHLIGHTS.map((item) => item.featureName)));
    expect(features).toContain("Protección contra el doble envío en altas, inscripciones, cuotas, pagos y listas");
    for (const title of IMPLEMENTED_HIGHLIGHTS.map((item) => item.title)) expect(features).not.toContain(title);
    for (const feature of features) expect(matching(feature, DORMANT), feature).toEqual([]);
    // No feature appears twice with a different spelling either.
    const keys = features.map((feature) => feature.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("la FAQ estructurada es la visible", () => {
    expect(data.faqPage.mainEntity.map((item: { name: string }) => item.name)).toEqual(
      ESSENTIAL_FAQS.map((item) => item.question)
    );
    expect(data.faqPage.mainEntity.map((item: { acceptedAnswer: { text: string } }) => item.acceptedAnswer.text)).toEqual(
      ESSENTIAL_FAQS.map((item) => item.answer)
    );
  });

  it("los precios no cambian", () => {
    const plans = ESSENTIAL_FAQS.find((item) => item.question === "¿Qué planes y precios hay?")!.answer;
    expect(plans).toContain("Free incluye hasta 30 gimnastas, 3 grupos y 10 clases activas");
    expect(plans).toContain("19 €/mes o 190 €/año");
    expect(plans).toContain("49 €/mes o 490 €/año");
  });
});
