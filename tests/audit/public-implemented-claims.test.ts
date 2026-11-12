/**
 * Lo que la web pública cuenta como disponible debe estar activo, y lo que
 * está dormido solo puede aparecer en el bloque «En preparación», sin fechas
 * (matriz competitiva, apartados 4 y 5). Lo activado el 12-11-2026 se anuncia
 * sin prometer lo que todavía no hace (correo, portal de familias). Revisa el catálogo, el texto escrito
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
 * Built but not announced: family portal (261) and clash warnings (284). The
 * clash warnings read the class coaches of PR 276, but they are a minimal,
 * unvalidated version (docs/producto/avisos-de-choque.md) and are not
 * promised publicly.
 */
const DORMANT: RegExp[] = [
  /\bchoques?\b/i,
  /portal (de|para) (las )?familias|portal familiar|enlace para familias/i,
  // Paraphrases of the same dormant features.
  /familias (consultan|ven) (sus )?cuotas/i,
  /planific/i,
  /(avisa|aviso).{0,30}(solap|choque|coinciden)/i,
];

/**
 * Activated in production on 12-11-2026 (candidate migrations applied and
 * ZALTYKO_TEAM_ACCESS_ENABLED=true): invitations (277), class coaches (276),
 * objectives and observations (271), session script (279) and trial requests
 * (262). They must not be shown as «En preparación» any more.
 */
const ACTIVATED: RegExp[] = [
  /\binvita(r|ci[oó]n|ciones)\b|acceso (para|de) (las )?entrenador/i,
  /entrenadoras? titular|\btitular(es)? por clase|sustituci[oó]n|sustituciones/i,
  /\bobjetivos?\b|\bobservaci[oó]n(es)?\b/i,
  /gui[oó]n de (la|cada) sesi[oó]n/i,
  /solicitud(es)? de prueba/i,
];

/** What the activated features do not do yet: never claimed as available. */
const NOT_YET: RegExp[] = [
  // Invitations and trial requests send no email (G4 is off).
  /(enviamos|recibir[aá]n?|reciben?|llega) (un |el |su )?(correo|email)/i,
  /\b(se|te) (env[ií]a|enviar[aá])n? (un |el )?(correo|email)/i,
  // The family portal shows no observations (FAMILY_PORTAL_SHOWS_OBSERVATIONS).
  /familias? (ve[nr]?|consulta[rn]?|recibe[nr]?|lee[nr]?) (las |sus )?(observaciones|objetivos)/i,
  /observaciones.{0,40}(visibles|se muestran|se comparten) (a|con|para) (las )?familias/i,
  // A trial request does not book a session nor join a waitlist from the inbox.
  /(?<!no |ni )reserva(r|s|n)? (la |una )?sesi[oó]n de prueba/i,
  /lista de espera/i,
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
  ...ESSENTIAL_FAQS.flatMap((item) => [item.question, item.answer]),
];
const highlight = (id: string) => IMPLEMENTED_HIGHLIGHTS.find((item) => item.id === id)!;

const matching = (text: string, patterns: RegExp[]) => patterns.filter((pattern) => pattern.test(text)).map(String);

describe("lo que se anuncia como disponible está activo", () => {
  it("cada función destacada nombra lo que la respalda y sus ficheros existen", () => {
    expect(IMPLEMENTED_HIGHLIGHTS.map((item) => item.id)).toEqual([
      "equipo",
      "titulares",
      "guion-y-seguimiento",
      "solicitudes-de-prueba",
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

  it("lo activado el 12-11-2026 se anuncia con sus candidatas aplicadas como evidencia", () => {
    const candidates: Record<string, string[]> = {
      equipo: ["20261105120000_canonical_team_access_candidate.sql"],
      titulares: ["20261111180000_coach_assignment_candidate.sql"],
      "guion-y-seguimiento": [
        "20261111120000_athlete_progress_candidate.sql",
        "20261111200000_session_plans_candidate.sql",
      ],
      "solicitudes-de-prueba": ["20261110120000_admission_requests_candidate.sql"],
    };
    for (const [id, files] of Object.entries(candidates)) {
      for (const file of files) {
        expect(highlight(id).evidence.files, id).toContain(`docs/deployment/candidates/${file}`);
      }
      expect(matching(`${highlight(id).featureName} ${highlight(id).text}`, ACTIVATED).length, id).toBeGreaterThan(0);
    }
  });

  it("el acceso de entrenadoras se anuncia como es: enlace que se comparte a mano, solo Hoy y el pase de lista de sus sedes", () => {
    // No email: the invitation link is copied and shared by the academy.
    expect(read("src/modules/staff/domain/team-access-contract.ts")).toContain('return "manual_link";');
    // A coach only reaches attendance (with «Hoy») of her sites.
    expect(read("src/components/owner-dashboard/owner-workspace-capabilities.ts")).toContain(
      'coachOperationsOnly: member.role === "coach"'
    );
    expect(read("src/components/owner-dashboard/OwnerWorkspaceNavigation.tsx").match(/coachAllowed: true/g)).toHaveLength(1);
    expect(read("src/modules/owner-dashboard/domain/coach-access.ts")).toContain('COACH_HOME_PATH = "/owner/attendance"');

    const team = highlight("equipo").text;
    expect(team).toContain("no envía el correo");
    expect(team).toContain("copias el enlace");
    expect(team).toContain("sesiones de hoy y al pase de lista de sus sedes");
    expect(coachFaq?.answer).toMatch(/^Sí, por invitación\./);
    expect(coachFaq?.answer).toContain("no envía el correo");
    expect(coachFaq?.answer).toContain("sesiones de hoy de sus sedes");
  });

  it("las observaciones y las solicitudes no prometen lo que todavía no hacen", () => {
    expect(read("src/modules/athlete-progress/domain/athlete-progress.ts")).toContain(
      "FAMILY_PORTAL_SHOWS_OBSERVATIONS = false as const"
    );
    expect(highlight("guion-y-seguimiento").text).toContain("solo los ve el equipo de la academia");
    // The trial request inbox sends no email.
    expect(read("src/modules/admissions/application/admission-requests.ts")).not.toMatch(
      /from ["'][^"']*(mail|resend|notification)[^"']*["']/i
    );
    expect(highlight("solicitudes-de-prueba").text).toContain("no envía correos ni reserva la sesión de prueba");
    for (const claim of availableClaims) expect(matching(claim, NOT_YET), claim).toEqual([]);
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

  it("ninguna FAQ dice que algo está en preparación", () => {
    for (const item of ESSENTIAL_FAQS) expect(item.answer, item.question).not.toMatch(/en preparaci[oó]n|^Todavía no\./i);
  });

  it("cada elemento de «En preparación» es una función dormida, sin fechas, y ya no incluye lo activado", () => {
    expect(IN_PREPARATION).toEqual(["Portal de familias"]);
    for (const item of IN_PREPARATION) {
      expect(matching(item, DORMANT).length, item).toBeGreaterThan(0);
      expect(matching(item, ACTIVATED), item).toEqual([]);
      expect(matching(item, VAGUE_DATES), item).toEqual([]);
    }
    const home = visibleSource("src/app/(site)/mat/HomeSections.tsx");
    expect(home).toContain("En preparación");
    expect(home).toContain("sin fecha comprometida");
  });

  it("en llms-full.txt solo la línea «En preparación» nombra funciones dormidas, y no las activadas", () => {
    const lines = read("src/app/llms-full.txt/route.ts").split("\n");
    const preparation = lines.filter((line) => line.startsWith("En preparación, sin fecha"));
    expect(preparation).toEqual(["En preparación, sin fecha y no disponible todavía: portal de familias."]);
    expect(matching(preparation[0], ACTIVATED)).toEqual([]);
    for (const line of lines.filter((line) => !preparation.includes(line))) {
      expect(matching(line, DORMANT), line).toEqual([]);
      expect(matching(line, NOT_YET), line).toEqual([]);
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
      ...HAND_WRITTEN.map(visibleSource),
      read("src/app/llms-full.txt/route.ts"),
    ];
    for (const text of texts) expect(matching(text, GLOSSARY_PROHIBITED), text.slice(0, 80)).toEqual([]);
    // «Pasar lista» es el nombre de la acción y de la pantalla; dentro de una frase se dice «el pase de lista».
    for (const text of [
      ...IN_PREPARATION,
      ...IMPLEMENTED_HIGHLIGHTS.map((item) => item.text),
      ...ESSENTIAL_FAQS.map((item) => item.answer),
    ]) {
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
    // Con el acceso de entrenadoras activo, la promesa recupera la mitad del equipo.
    expect(PUBLIC_PROMISE).toContain("tu equipo ve las sesiones de hoy y pasa lista en un toque");
    expect(HERO_LEAD).toContain("tu equipo ve las sesiones de hoy y pasa lista en un toque");
    expect(read("src/app/llms-full.txt/route.ts")).toContain(PUBLIC_PROMISE);
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
