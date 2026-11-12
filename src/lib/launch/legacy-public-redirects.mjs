// Legacy public URL aliases answered with a permanent redirect from
// next.config.mjs (before middleware and App Router). Plain .mjs so the Next
// config can import it without a TypeScript step; tests/seo/retired-pages.test.ts
// reads the same list.
//
// - /planes, /precios, /contacto: funnel fixes from the 2026-09-24 E2E audit.
// - /nosotros: /sobre-nosotros is retired (middleware answers 301 to /), so
//   the alias goes straight to the final page instead of chaining two hops.
// - /about, /help, /privacy-policy, /tos, /es, /en, /{es,en}/ayuda answered a
//   temporary 307 from their page component; a permanent redirect lets search
//   engines move the old URL's signals to the live page (SEO, 2026-11-12).
/** @type {ReadonlyArray<readonly [source: string, destination: string]>} */
export const LEGACY_PUBLIC_REDIRECTS = Object.freeze([
  ["/planes", "/pricing"],
  ["/precios", "/pricing"],
  ["/contacto", "/contact"],
  ["/nosotros", "/"],
  ["/about", "/"],
  ["/help", "/ayuda"],
  ["/privacy-policy", "/politica-privacidad"],
  ["/tos", "/terminos"],
  ["/es", "/"],
  ["/en", "/"],
  ["/es/ayuda", "/ayuda"],
  ["/en/ayuda", "/ayuda"],
]);
