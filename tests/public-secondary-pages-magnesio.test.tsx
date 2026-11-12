/**
 * Web pública secundaria y páginas legales con el lenguaje de la portada
 * («Magnesio sobre tapiz», auditoría de coherencia visual 2026-11-12, PR-3a y
 * PR-3b). Solo cambia la presentación: aquí se fija que las páginas usan la
 * barra, la cabecera de tapiz y el pie comunes, que no vuelven los degradados,
 * las píldoras ni el antetítulo espaciado, y que el texto visible sigue
 * diciendo lo mismo que los datos estructurados y el texto legal.
 */
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(site)/Navbar", () => ({ default: function Navbar() { return null; } }));
vi.mock("@/app/(site)/Footer", () => ({ default: function Footer() { return null; } }));

import FaqPage from "@/app/(site)/faq/page";
import HelpPage from "@/app/ayuda/page";
import HelpArticlePage from "@/app/help/[slug]/page";
import TermsOfServicePage from "@/app/terminos/page";
import PrivacyPolicy from "@/app/politica-privacidad/page";
import { getHelpArticle } from "@/lib/help/articles";

const read = (path: string) => readFileSync(path, "utf8");

const PAGES = [
  "src/app/features/page.tsx",
  "src/app/(site)/faq/page.tsx",
  "src/app/contact/page.tsx",
  "src/app/ayuda/page.tsx",
  "src/app/help/[slug]/page.tsx",
  "src/app/terminos/page.tsx",
  "src/app/politica-privacidad/page.tsx",
];

function decode(text: string) {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Texto visible: sin scripts, sin comentarios y sin etiquetas. */
function visibleText(html: string) {
  return decode(
    html
      .replace(/<script[\s\S]*?<\/script>/g, " ")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

function jsonLd(html: string): Array<Record<string, unknown>> {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) =>
    JSON.parse(match[1])
  );
}

function faqEntities(html: string) {
  const faq = jsonLd(html).find((item) => item["@type"] === "FAQPage");
  expect(faq, "FAQPage JSON-LD").toBeTruthy();
  return faq!.mainEntity as Array<{ name: string; acceptedAnswer: { text: string } }>;
}

describe("piezas comunes de la web pública", () => {
  it("todas las páginas usan la barra, la cabecera de tapiz y el pie comunes", () => {
    for (const file of PAGES) {
      const source = read(file);
      expect(source, file).toContain('from "@/app/(site)/mat/PublicPage"');
      expect(source, file).toContain("<PublicPageShell");
      expect(source, file).toContain("<PublicPageHeader");
      // La barra y el pie llegan por el shell, no se montan a mano.
      expect(source, file).not.toContain('from "@/app/(site)/Navbar"');
      expect(source, file).not.toContain('from "@/app/(site)/Footer"');
    }
    const shared = read("src/app/(site)/mat/PublicPage.tsx");
    expect(shared).toContain('import Navbar from "@/app/(site)/Navbar"');
    expect(shared).toContain('import Footer from "@/app/(site)/Footer"');
    expect(shared).toContain('<main id="main-content"');
    // Banda de tapiz con marco de cinta, titular condensado en mayúsculas.
    expect(shared).toContain("mat-field relative overflow-hidden pt-16");
    expect(shared).toContain("border-x-[3px] border-t-[3px] border-white/80");
    expect(shared).toContain("font-display max-w-4xl font-black uppercase text-white");
  });

  it("sin degradados, píldoras, antetítulo espaciado ni alias heredados de texto", () => {
    for (const file of [...PAGES, "src/app/(site)/mat/PublicPage.tsx", "src/components/contact/ContactForm.tsx", "src/components/legal/SellerIdentification.tsx"]) {
      const source = read(file);
      expect(source, file).not.toMatch(/bg-gradient-to|bg-clip-text/);
      expect(source, file).not.toContain("rounded-full");
      expect(source, file).not.toMatch(/tracking-\[0\.(18|35)em\]|tracking-wider/);
      expect(source, file).not.toMatch(/zaltyko-text-(main|secondary)|zaltyko-primary|zaltyko-accent/);
      expect(source, file).not.toMatch(/\b(gray|emerald|red|blue)-\d{2,3}\b/);
    }
  });

  it("los botones son los del sistema: cinta sobre tapiz y principal de 8 px", () => {
    const shared = read("src/app/(site)/mat/PublicPage.tsx");
    expect(shared).toContain("rounded-md bg-white px-7 text-base font-extrabold text-mat-deep");
    expect(shared).toContain("rounded-md border-2 border-white/60");
    const form = read("src/components/contact/ContactForm.tsx");
    expect(form).toContain('buttonVariants({ size: "lg" })');
    expect(read("src/app/help/[slug]/page.tsx")).toContain("buttonVariants()");
  });

  it("el formulario de contacto sigue fuera de la entrada animada", () => {
    const contact = read("src/app/contact/page.tsx");
    const reveal = contact.indexOf("</Reveal>");
    expect(reveal).toBeGreaterThan(0);
    expect(contact.indexOf("<ContactForm")).toBeGreaterThan(reveal);
  });
});

describe("contenido visible y datos estructurados siguen diciendo lo mismo", () => {
  it("/faq muestra abiertas todas las preguntas del FAQPage", () => {
    const html = renderToStaticMarkup(<FaqPage />);
    const text = visibleText(html);
    const entities = faqEntities(html);
    expect(entities.length).toBeGreaterThan(0);
    for (const entity of entities) {
      expect(text).toContain(normalize(entity.name));
      expect(text).toContain(normalize(entity.acceptedAnswer.text));
    }
    expect(html.match(/<details[^>]*\sopen=""/g)?.length).toBe(entities.length);
    expect(text).toContain("Preguntas Frecuentes");
    expect(text).toContain("Contacta con nosotros");
  });

  it("/ayuda muestra abiertas sus preguntas y enlaza cada guía", () => {
    const html = renderToStaticMarkup(<HelpPage />);
    const text = visibleText(html);
    const entities = faqEntities(html);
    expect(entities).toHaveLength(4);
    for (const entity of entities) {
      expect(text).toContain(normalize(entity.name));
      expect(text).toContain(normalize(entity.acceptedAnswer.text));
    }
    expect(html.match(/<details[^>]*\sopen=""/g)?.length).toBe(entities.length);
    expect(html).toContain('href="/help/crear-cuenta"');
    expect(text).toContain("Cómo crear tu cuenta");
  });

  it("la guía conserva su h1, sus pasos y el enlace de vuelta", async () => {
    const article = getHelpArticle("crear-cuenta")!;
    const html = renderToStaticMarkup(await HelpArticlePage({ params: Promise.resolve({ slug: "crear-cuenta" }) }));
    expect(html).toMatch(/<h1 id="help-article-title"[^>]*>Cómo crear tu cuenta<\/h1>/);
    const text = visibleText(html);
    article.steps.forEach((step, index) => expect(text).toContain(`Paso ${index + 1}: ${step}`));
    expect(text).toContain("Volver al centro de ayuda");
    expect(text).toContain(article.summary);
  });

  it.each([
    ["src/app/terminos/page.tsx", TermsOfServicePage, "Condiciones de uso de Zaltyko"],
    ["src/app/politica-privacidad/page.tsx", PrivacyPolicy, "Protegemos los datos que confías a Zaltyko"],
  ] as const)("%s conserva el texto legal completo y la fecha", (file, Page, title) => {
    const source = read(file);
    expect(source).toContain('const updatedAt = "26 de octubre de 2026";');
    const block = source.slice(source.indexOf("const sections = ["), source.indexOf("export const metadata"));
    const literals = [...block.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((match) => JSON.parse(`"${match[1]}"`) as string);
    expect(literals.length).toBeGreaterThan(20);

    const html = renderToStaticMarkup(<Page />);
    const text = visibleText(html);
    for (const literal of literals) expect(text).toContain(normalize(literal));
    expect(text).toContain("Última actualización: 26 de octubre de 2026");
    expect(text).toContain(title);
    expect(text).toContain("Volver al inicio");
    // Identificación del titular, con su ancla del pie.
    expect(html).toContain('id="titular"');
    expect(text).toContain("Identificación de Zaltyko");
  });
});
