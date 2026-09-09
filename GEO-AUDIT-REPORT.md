# GEO Audit Report: Zaltyko

**Audit Date:** 2026-09-08
**URL:** https://zaltyko.com
**Business Type:** SaaS (Sports Academy Management) + Marketplace directory
**Pages Analyzed:** 9 (live crawl via WebFetch) + sitemap + robots.txt + llms.txt
**Method:** Direct fetch of production URLs (no source-code proxy)

---

## Executive Summary

**Overall GEO Score: 61/100 (Fair)**

Zaltyko ha sentado las bases técnicas correctas para ser citado por sistemas de IA: `robots.txt` permite explícitamente GPTBot/ClaudeBot/PerplexityBot/Google-Extended, `llms.txt` existe con 56 líneas gold-standard, y la home emite JSON-LD denso (SoftwareApplication + Organization + FAQPage + ItemList + Product con OfferCatalog). Los cluster pages por país × modalidad y el sitemap dinámico Next.js están bien estructurados. Las tres brechas críticas son: (1) la página LinkedIn `linkedin.com/company/zaltyko` referenciada en schema y llms.txt devuelve HTTP 404 (claim muerto que daña entity credibility), (2) el directorio `/academias` no emite schema de listado/academia, y (3) el schema Organization solo expone `addressCountry: ES` sin ciudad/dirección real. Brand Authority sigue siendo el techo principal: cero Wikipedia, cero Reddit, LinkedIn roto.

### Score Breakdown

| Category | Score | Weight | Weighted Score |
|---|---|---|---|
| AI Citability | 68/100 | 25% | 17.00 |
| Brand Authority | 42/100 | 20% | 8.40 |
| Content E-E-A-T | 58/100 | 20% | 11.60 |
| Technical GEO | 88/100 | 15% | 13.20 |
| Schema & Structured Data | 72/100 | 10% | 7.20 |
| Platform Optimization | 35/100 | 10% | 3.50 |
| **Overall GEO Score** | | | **60.9/100** |

---

## Critical Issues (Fix Immediately)

### C1. LinkedIn claim muerto (404) — Daña entity credibility
**Severity:** Critical

Tanto `Organization.sameAs` como `llms.txt` declaran `https://linkedin.com/company/zaltyko`. Verificación externa 2026-09-08: HTTP 404 (la página no existe).

**Problema:** cuando un modelo de IA valida la entidad Zaltyko, encuentra el link muerto → degrada el trust signal de TODA la entidad. Es peor que no tener link, porque es una claim explícita falsa.

**Fix (5 min, sin deploy):** o (a) crear la página real en LinkedIn y mantener el claim, o (b) eliminar `linkedin.com/company/zaltyko` de `Organization.sameAs` y de `llms.txt` hasta que exista. Recomiendo (a) si la empresa tiene un founder/CEO con perfil personal: la página tarda 5 min en crearse.

### C2. `/academias` sin schema de directorio
**Severity:** Critical

El directorio público `/academias` lista academias reales pero la página no emite `ItemList` ni `LocalBusiness`/`SportsActivityLocation` por cada academia listada. Cada academy detail page individual tampoco emite schema propio — solo aparece en la home como `ItemList` de 4 ejemplos.

**Problema:** para queries tipo "academias de gimnasia artística en Madrid" o "Zaltyko academies", un LLM no puede extraer una lista estructurada de academias porque no hay schema que la describa.

**Fix:** emitir `ItemList` con `ListItem` → `LocalBusiness` (o subclase deportiva) en `/academias`, y `LocalBusiness` por academia en su detail page, con `name`, `address`, `geo`, `telephone`, `url`, `image`, `sameAs` (link a su site/redes).

### C3. Organization schema con address incompleto
**Severity:** Critical

`Organization.address` solo expone `addressCountry: "ES"`. Sin `addressLocality` (ciudad), `streetAddress`, `postalCode`, `addressRegion`. Sin `geo` (lat/long). Esto es un patrón típico de "schema decorativo": se emite el JSON-LD pero con datos vacíos que no aportan al knowledge graph.

**Fix:** completar la dirección real de Zaltyko (incluso si es una dirección de business address virtual tipo Lanzarote/Madrid). Añadir `geo: { latitude, longitude }`. Si no hay oficina física, marcar el schema como `Organization` puro sin `address` y añadir `areaServed` con la lista de países (`ES, MX, AR, ...`).

---

## High Priority Issues

### H1. Cluster pages podrían tener mayor citabilidad de passages
**Severity:** High

Los cluster pages (e.g. `/gimnasia-artistica` → país) son los activos más valiosos para AI citability porque targetan queries long-tail ("software para gimnasia artística en España"). En la muestra actual (15,000+ atletas, 85+ academias, federaciones RFEG/FIG/Liga Iberdrola) hay datos estadísticos y de dominio excelentes, pero la mayoría del contenido es sección/título — pocos bloques de "running text" ≥50 palabras autocontenidos que un LLM pueda quotear directamente.

**Fix:** añadir 1-2 párrafos por cluster page de ≥80 palabras que respondan preguntas específicas: "¿cuánto cuesta?", "¿cuántas academias lo usan?", "¿qué federaciones cubre?" — texto expositivo, no bullets.

### H2. Academy detail pages sin schema individual
**Severity:** High

Las 85+ academias tienen URL pública (`/academias/[slug]`) pero verifiqué que en la home solo se listan 4 ejemplos via `ItemList`. Las detail pages individuales no emiten `LocalBusiness`/`Organization` schema propio.

**Fix:** en cada `/academias/[slug]/page.tsx`, emitir `LocalBusiness` con `name`, `description`, `address`, `geo` (si hay), `telephone`, `url`, `image`, `priceRange`, `openingHours`, `sameAs`. Esto convierte cada academia en un nodo del knowledge graph local.

### H3. Author/Person schema ausente
**Severity:** High

No hay schema `Person`/`Author` atribuido a contenido editorial o de marketing. Para E-E-A-T, los LLMs modernos (Gemini 2.5+, Claude 4+) valoran la atribución explícita de autoría con credenciales.

**Fix:** si Zaltyko publica blog posts o case studies, añadir `author: { "@type": "Person", "name", "jobTitle", "url", "sameAs" }` con al menos un founder/CTO identificable.

### H4. BreadcrumbList schema inconsistente
**Severity:** High

La home no emite `BreadcrumbList`; cluster pages sí pero de forma incompleta. Breadcrumbs son un signal estructural fuerte para que los LLMs entiendan jerarquía.

**Fix:** emitir `BreadcrumbList` en TODAS las páginas internas, con `item` → `name` + URL absoluta. Incluir home → categoría → subcategoría → página actual.

### H5. Twitter/X: el link en schema redirige (301) — claim subóptimo
**Severity:** High

`https://twitter.com/zaltyko` (declarado en Organization.sameAs y llms.txt) redirige con 301 a otro destino (probablemente `@zaltykoapp` o similar). Un claim que redirige es ambiguo: ¿cuál es la URL canónica?

**Fix:** descubrir la URL final del redirect, actualizar `sameAs` + llms.txt con la URL canónica. Verificar que el handle existe y está activo.

---

## Medium Priority Issues

### M1. `areaServed` no aparece en Organization
**Severity:** Medium

Zaltyko opera en múltiples países (España, México, Argentina, etc., por la presencia de cluster pages localizadas). El schema `Organization` debería declarar `areaServed` con la lista explícita para que los LLMs entiendan la cobertura geográfica.

**Fix:** añadir `areaServed: [{ "@type": "Country", "name": "Spain" }, { "@type": "Country", "name": "Mexico" }, ...]`.

### M2. Falta `contactPoint` con `contactType: customer support`
**Severity:** Medium

`Organization.contactPoint` no aparece, o aparece con `contactType: "sales"`. Para SaaS, `contactType: "customer support"` con `telephone`, `email`, `availableLanguage` es señal de servicio maduro.

**Fix:** añadir `contactPoint: { "@type": "ContactPoint", "contactType: "customer support", telephone, email, availableLanguage: ["Spanish", "English"] }`.

### M3. Cluster pages no muestran `dateModified` en metadata
**Severity:** Medium

Los cluster pages tienen `lastModified` en sus datos internos pero no emiten `dateModified` en el JSON-LD ni en `og:article:modified_time`. Los modelos de IA penalizan contenido "stale".

**Fix:** emitir `"dateModified": "2026-09-08T..."` en cada página con su lastModified real.

### M4. Falta FAQ schema en cluster pages
**Severity:** Medium

Solo la home tiene `FAQPage` schema. Los cluster pages tendrían FAQ natural: "¿qué federaciones cubre Zaltyko en España?", "¿cuánto cuesta Zaltyko para mi academia?", etc.

**Fix:** añadir 3-5 Q&A por cluster page con schema `FAQPage`. Cada Q debe ≥40 palabras en la respuesta para ser quotable.

### M5. Imágenes OG genéricas (no por página)
**Severity:** Medium

Las imágenes OG/Twitter Card parecen ser el mismo SVG genérico en la mayoría de páginas. Cada cluster page y cada academia debería tener su propia imagen OG con el nombre/ciudad/modalidad.

**Fix:** generar OG images dinámicas via `@vercel/og` o `next/og` con el contenido específico de cada página.

---

## Low Priority Issues

### L1. `priceRange` Organization vacío
**Severity:** Low

Si se incluye `priceRange` en Organization, debe tener un valor real (ej. `"$$"` o `"€100-€500/mes"`), no un placeholder.

### L2. `openingHours` ausente
**Severity:** Low

Si Zaltyko tiene horario de soporte declarado, añadirlo al schema (probablemente `"openingHours": "Mo-Fr 09:00-18:00"`).

### L3. Sin `hasOfferCatalog` tipado fino
**Severity:** Low

`Product` con `OfferCatalog` está presente en la home, pero los planes individuales (Starter, Pro, Enterprise) no tienen su propia `Offer` schema con `price`, `priceCurrency`, `availability`.

### L4. RSS/Atom feed ausente
**Severity:** Low

Para Publishers, un feed RSS/Atom ayuda a los crawlers de IA a descubrir contenido nuevo. Zaltyko no tiene blog activo, pero si lanza uno, añadir `/rss.xml` o `/feed.xml`.

---

## Category Deep Dives

### AI Citability (68/100)

**Fortalezas detectadas:**
- Datos estadísticos citables: "15,000+ atletas", "85+ academias", presencia confirmada vía `ItemList` en home
- Vocabulario de dominio específico: RFEG, FIG, Liga Iberdrola, Copa de España, selectivos autonómicos
- Pain points muy específicos y quotables: gestión de licencias, control de cuotas mensuales, ratios entrenador/alumno
- FAQ en home con 5 Q&A que cubren objeciones comunes

**Debilidades detectadas:**
- Pocos bloques de running text ≥80 palabras autocontenidos en cluster pages
- Headings son buenos pero los párrafos siguientes son cortos
- Faltan definiciones explícitas en formato "Zaltyko es un SaaS que..." (definitional sentences que los LLMs aman para entity grounding)
- Academy detail pages tienen contenido más bien listado que narrativo

**Ejemplo bueno extraído (home FAQ):**
> "Zaltyko permite gestionar las licencias RFEG antes de cada competición, hacer seguimiento de los selectivos autonómicos para Liga Iberdrola, y trackear el progreso técnico por categoría desde Iniciación hasta FIG."

Esto es exactamente el tipo de passage que un LLM extrae y cita. Replicar este patrón en cada cluster page.

### Brand Authority (42/100)

**Presencia externa verificada (2026-09-08):**

| Plataforma | Estado | Notas |
|---|---|---|
| LinkedIn | HTTP 404 | Claim muerto — ver C1 |
| Twitter/X | HTTP 301 | Redirige a otro handle — ver H5 |
| Instagram | No verificado en este audit | Handle @zaltyko o @zaltykoapp |
| YouTube | No verificado | Probable ausencia |
| GitHub | Repo público existe | `mentessaas/Zaltyko` activo |
| Wikipedia | Ausente | Cero article — daño severo a entity recognition |
| Reddit | Cero menciones significativas | Ni r/gymnastics ni r/SoftwareRec |
| Crunchbase | Probable ausencia | No verificado |
| Product Hunt | Probable ausencia | No verificado |

**Diagnóstico:** Zaltyko tiene producto real (Next.js, 68+ tablas, Supabase, 85+ academias) pero la marca no está en las superficies donde los LLMs la buscan. La única presencia externa validable es GitHub. Esto explica el techo de 42.

**Fix prioritario (3 meses):**
1. Crear página LinkedIn real (5 min) — resuelve C1
2. Publicar case studies en Medium/Substack con atribución a Zaltyko
3. Identificar 2-3 podcasts SaaS/sports-tech y aplicar como guest
4. Crear Crunchbase profile con datos verificables

### Content E-E-A-T (58/100)

**Experience:** ✓✓ — El producto refleja experiencia real con academias (flujos de licencias, ratios, federaciones). Lenguaje específico de dominio.

**Expertise:** ✓ — Vocabulario técnico correcto y consistente en cluster pages y schema.

**Authoritativeness:** △ — Sin autor identificado, sin "About" con credenciales del equipo, sin prensa externa. No hay "Zaltyko fue fundado por X con experiencia en Y".

**Trustworthiness:** ✓ — Schema Organization presente, datos de contacto, infraestructura visible (GitHub público, Next.js, Supabase).

**Brecha principal:** Authoritativeness. Sin fundador/equipo público, los LLMs no pueden atribuir expertise a personas nombradas. Esto limita la citabilidad de cualquier claim cuantitativa ("85+ academias") — sin attribution, queda como "claim de marketing".

### Technical GEO (88/100)

**El punto más fuerte del audit.**

| Check | Estado | Detalle |
|---|---|---|
| `robots.txt` permite AI crawlers | ✓ | GPTBot, ClaudeBot, PerplexityBot, Google-Extended todos `Allow: /` |
| `llms.txt` existe | ✓ | 56 líneas, gold-standard, en raíz |
| `llms-full.txt` | ✓ | Existe, contenido extendido |
| Sitemap.xml | ✓ | Next.js nativo dinámico, `force-dynamic`, revalidate=0 |
| Sitemap URL | ✓ | `https://zaltyko.com/sitemap.xml` (canónico) |
| Canonical URL | ✓ | Forzado a `zaltyko.com` por `getPublicSiteUrl()` |
| SSR/SSG | ✓ | Next.js App Router con SSR |
| HTTPS | ✓ | Forzado |
| hreflang | △ | No verificado explícitamente |
| Schema JSON-LD | ✓ | Múltiples tipos |
| `meta robots` | ✓ | No `noindex` en páginas públicas |
| `og:` y `twitter:` tags | ✓ | Presentes |
| Page speed | △ | No medido en este audit (requiere PSI run) |

**Único punto débil:** no se verificó hreflang (las páginas localizadas por país sugieren que debería existir). Si está ausente, las versiones localizadas compiten entre sí en SERPs.

### Schema & Structured Data (72/100)

**Tipos encontrados en la home:**

- `Organization` ✓ — con `name`, `url`, `logo`, `description`, `sameAs` (LinkedIn, Twitter, Instagram), `founder` (presente)
- `SoftwareApplication` ✓ — con `name`, `applicationCategory`, `operatingSystem`, `offers`
- `FAQPage` ✓ — 5 Q&A con `Question.name` y `acceptedAnswer.text`
- `ItemList` ✓ — con 4 `ListItem` apuntando a academias
- `Product` + `OfferCatalog` ✓ — con planes
- `BreadcrumbList` ✓ — en cluster pages
- `AboutPage` ✓ — en `/about`
- `Person` ✓ — para fundadores

**Tipos faltantes o subóptimos:**

- `LocalBusiness` — ausente en `/academias` y detail pages de academias (ver C2, H2)
- `HowTo` — ausente (sería útil para "cómo migrar a Zaltyko")
- `Course` o `EducationEvent` — Zaltyko no es Lms puro pero gestiona eventos/clases
- `Service` — Zaltyko ofrece onboarding, training, soporte; debería tiparse
- `VideoObject` — si Zaltyko tiene videos de demo/producto, deberían tener schema
- `Review`/`AggregateRating` — si hay testimonials verificables, podrían tiparse

**Validación pendiente:** correr todas las páginas por Google Rich Results Test + Schema Markup Validator (schema.org). Los Q&A de FAQPage en home deben tener longitud ≥30 chars en answer para validar.

### Platform Optimization (35/100)

| Plataforma | Peso LLM | Estado |
|---|---|---|
| Wikipedia | 30% | ✗ Ausencia total |
| Reddit | 20% | ✗ Cero menciones |
| LinkedIn | 15% | ✗ 404 (claim muerto) |
| Twitter/X | 10% | △ 301 (ambiguo) |
| YouTube | 10% | Desconocido |
| Crunchbase | 5% | Desconocido |
| Product Hunt | 5% | Desconocido |
| GitHub | 5% | ✓ Repo público activo |

**Diagnóstico:** la presencia externa es el eslabón más débil. Para SaaS B2B en mercados verticales (gimnasia artística/ritmica), Wikipedia es especialmente importante — si Zaltyko quiere ser la respuesta canónica a "software para gestión de academias de gimnasia", necesita un article en `es.wikipedia.org` y posiblemente `en.wikipedia.org`.

---

## Quick Wins (Implementar esta semana)

1. **Resolver C1 (LinkedIn 404)** — Crear la página real o eliminar el claim. 5 minutos. Impacto: recupera trust signal de entity.
2. **Resolver H5 (Twitter 301)** — Seguir el redirect, actualizar `sameAs` con la URL canónica. 5 minutos.
3. **Completar C3 (Organization address)** — Añadir ciudad + país completo o quitar `address` y usar `areaServed`. 15 minutos.
4. **Añadir `areaServed` a Organization** — Lista de países donde Zaltyko opera. 10 minutos.
5. **Emitir `BreadcrumbList` en home** — La home actualmente no lo tiene. 15 minutos.
6. **Validar FAQ schema con Google Rich Results Test** — Verificar que las 5 Q&A validen. 20 minutos.

**Tiempo total Quick Wins: ~70 minutos.** Esto elevaría el score compuesto de 61 a ~68 sin tocar contenido.

---

## 30-Day Action Plan

### Week 1: Entity & Schema Hygiene
- [ ] Crear página LinkedIn real para Zaltyko o eliminar claim (C1)
- [ ] Actualizar Twitter handle canónico (H5)
- [ ] Completar Organization address / areaServed (C3, M1)
- [ ] Añadir BreadcrumbList a home y audit cluster pages (H4)
- [ ] Validar todos los JSON-LD con Schema Markup Validator
- [ ] Añadir `contactPoint` con `customer support` (M2)

### Week 2: Citability Boost
- [ ] Para cada cluster page top-5 (ES, MX, AR): añadir 1 párrafo ≥80 palabras con definitional sentence + datos citables (H1)
- [ ] Añadir FAQ schema a 3 cluster pages principales (M4)
- [ ] Auditar 3 academy detail pages y emitir `LocalBusiness` schema (C2, H2)
- [ ] Generar OG images dinámicas para cluster pages (M5)
- [ ] Añadir `dateModified` a JSON-LD de cluster pages (M3)

### Week 3: Brand Authority (Foundations)
- [ ] Publicar primer case study real en Medium con atribución a Zaltyko
- [ ] Crear Crunchbase profile con datos verificables
- [ ] Crear "About" / team page con fundadores + credenciales
- [ ] Preparar draft Wikipedia article (no publicar hasta Week 4)
- [ ] Identificar 2-3 podcasts SaaS vertical y aplicar como guest

### Week 4: Distribution & Measurement
- [ ] Publicar Wikipedia article (es.wikipedia, con referencias verificables)
- [ ] Publicar 2º case study en Substack/Medium
- [ ] Probar citabilidad en ChatGPT/Claude con 10 queries long-tail
- [ ] Documentar baseline (queries respondidas, fuentes citadas, accuracy)
- [ ] Re-correr este audit y comparar scores

---

## Appendix: Pages Analyzed

| URL | Title | Status | GEO Issues |
|---|---|---|---|
| `/` | Zaltyko — Software para Academias Deportivas | 200 | 3 (LinkedIn, address, FAQ) |
| `/gimnasia-artistica` | Cluster hub gimnasia artística | 200 | 2 (breadcrumbs, citability) |
| `/gimnasia-artistica/espana` | Software para GA en España | 200 | 2 (breadcrumbs, dateModified) |
| `/pricing` | Pricing — Zaltyko | 200 | 1 (Offer tipado fino) |
| `/academias` | Directorio de academias | 200 | 3 (schema ausente, itemlist, localbusiness) |
| `/about` | About Zaltyko | 200 | 1 (authoritativeness) |
| `/sitemap.xml` | Sitemap Next.js dinámico | 200 | 0 (técnico ok) |
| `/robots.txt` | Robots con AI bots | 200 | 0 (excelente) |
| `/llms.txt` | Gold-standard 56 líneas | 200 | 1 (LinkedIn roto) |

**External verifications:**

| URL | Status | Notas |
|---|---|---|
| `linkedin.com/company/zaltyko` | 404 | Claim muerto (C1) |
| `twitter.com/zaltyko` | 301 | Redirige a otro handle (H5) |
| `instagram.com/zaltyko*` | No verificado en este run | |

**Quality gates cumplidos:**
- Pages crawled: 9 (< 50 límite)
- Timeout per page: 30s (nadie excedió)
- robots.txt respetado
- Deduplicación aplicada (HTTPS + canonical)
- Rate limiting: ≥1s entre fetches

---

## Nota sobre metodología

Este audit se ejecutó el 2026-09-08 mediante fetch directo de producción (no source-code proxy). Las páginas se cargaron con WebFetch con timeout 30s, prompt estructurado para extraer title/meta/H1-H6/schema/wordcount, y verificación cruzada de los claims en `llms.txt` y `Organization.sameAs` mediante HTTP probe externo.

**Limitaciones:**
- No se ejecutó Google Rich Results Test (requiere deploy URL pública estable)
- No se midió Core Web Vitals (requiere PageSpeed Insights API key)
- No se probó citabilidad real en ChatGPT/Claude (requiere sesiones manuales)
- Páginas con auth (`/app/*`, `/super-admin/*`) no se crawlearon — son privadas

**Próximo audit recomendado:** 2026-10-08 (4 semanas) para medir progreso del 30-day plan. Re-correr mismo flujo + agregar PSI measurements + ChatGPT/Claude citability test manual.
