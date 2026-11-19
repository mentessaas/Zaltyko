import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ESSENTIAL_FAQS } from "@/lib/launch/essential-public-catalog";

const REPO = process.cwd();
const homepage = readFileSync(join(REPO, "src/app/page.tsx"), "utf8");

describe("international public copy", () => {
  it("separa el alcance administrativo y las cuotas manuales de la contratación SaaS", () => {
    const marketFaq = ESSENTIAL_FAQS.find((item) => item.question === "¿Para qué academias está pensado?");
    const plansFaq = ESSENTIAL_FAQS.find((item) => item.question === "¿Qué planes y precios hay?");

    expect(marketFaq?.answer).toContain("España y México");
    expect(marketFaq?.answer).toContain("EUR o MXN");
    expect(marketFaq?.answer).toContain("se registran manualmente");
    expect(marketFaq?.answer).toContain("no hay conversión automática");
    expect(marketFaq?.answer).toContain("ni emisión de facturas fiscales mexicanas");
    expect(marketFaq?.answer).toContain("en otro país, contáctanos");

    expect(plansFaq?.answer).toContain("contratación internacional todavía no está habilitada");
    expect(plansFaq?.answer).toContain("19 €/mes o 190 €/año");
    expect(plansFaq?.answer).toContain("49 €/mes o 490 €/año");
    expect(plansFaq?.answer).toContain("Network parte de 99€/mes");
  });

  it("el metadata público ya no limita el alcance a España", () => {
    const description = homepage.match(/const description = "([^"]+)";/)?.[1];

    expect(description).toContain("España y México");
    expect(description).not.toContain("en España.");
  });
});
