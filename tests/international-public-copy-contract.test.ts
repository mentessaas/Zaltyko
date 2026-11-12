import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ESSENTIAL_FAQS } from "@/lib/launch/essential-public-catalog";

const REPO = process.cwd();
const homepage = readFileSync(join(REPO, "src/app/page.tsx"), "utf8");

describe("international public copy", () => {
  it("separa el alcance administrativo y las cuotas manuales de la contratación SaaS", () => {
    const marketFaq = ESSENTIAL_FAQS.find((item) => item.question === "¿Sirve para mi academia y mi país?");
    const plansFaq = ESSENTIAL_FAQS.find((item) => item.question === "¿Cuánto cuesta? ¿Hay un plan gratis?");

    expect(marketFaq?.answer).toContain("España y México");
    expect(marketFaq?.answer).toContain("EUR o MXN");
    expect(marketFaq?.answer).toContain("se registran manualmente");
    expect(marketFaq?.answer).toContain("no hay conversión automática");
    expect(marketFaq?.answer).toContain("ni emisión de facturas fiscales");

    expect(plansFaq?.answer).toContain("contratación internacional todavía no está habilitada");
    expect(plansFaq?.answer).toContain("19 €/mes o 190 €/año");
    expect(plansFaq?.answer).toContain("49 €/mes o 490 €/año");
    expect(plansFaq?.answer).toContain("parte de 99 €/mes");
  });

  it("el metadata público ya no limita el alcance a España", () => {
    const description = homepage.match(/const description = "([^"]+)";/)?.[1];

    expect(description).toContain("España y México");
    expect(description).toContain("cualquier país");
    expect(description).not.toContain("en España.");
  });

  it("el alta es abierta a cualquier país y lo específico de cada país llega más adelante, sin fecha", () => {
    const marketFaq = ESSENTIAL_FAQS.find((item) => item.question === "¿Sirve para mi academia y mi país?");
    const answer = marketFaq?.answer ?? "";
    const hero = readFileSync(join(REPO, "src/app/(site)/mat/MatHero.tsx"), "utf8");
    const llms = readFileSync(join(REPO, "src/app/llms.txt/route.ts"), "utf8");
    const llmsFull = readFileSync(join(REPO, "src/app/llms-full.txt/route.ts"), "utf8");

    expect(answer).toContain("Zaltyko funciona en cualquier país");
    expect(answer).toContain("Nos centramos primero en España y México");
    expect(answer).toContain("llegará más adelante, sin fecha comprometida");
    // Ya no se pide contacto para poder registrarse; el contacto es para priorizar un país.
    expect(answer).not.toContain("consultar el acceso");
    expect(answer).toContain("Si quieres que prioricemos tu país, contáctanos");
    // Honestidad: no se afirma que las funciones de un país ya existan ni hay fechas.
    expect(answer).not.toMatch(/ya (est[aá]n|existen|disponibles)/i);
    expect(answer).not.toMatch(/pronto|pr[oó]ximamente|en breve|\b20\d{2}\b/i);

    expect(hero).toContain('"Abierto a cualquier país"');
    expect(hero).not.toContain("Para España y México");
    expect(llms).toContain("alta abierta a academias de cualquier país");
    expect(llms).not.toContain("Lanzamiento en España, español y euros.");
    expect(llmsFull).toContain("alta abierta a academias de cualquier país");
  });
});
