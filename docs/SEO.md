# SEO en Zaltyko

> Documento operativo. Cualquier cambio en canonicals, robots, sitemap o
> JSON-LD debe coordinarse con marketing (`vault/04-Marketing/Mensajes
> aprobados.md`) y respetar la guía canónica de la vault
> (`vault/00-Inicio/Guia de trabajo para agentes.md`).

## Estado actual (post-Fases 1–5, 2026-09-18)

Score SEO estimado: **~85/100** (subió desde 68/100 del audit 2026-03-26).

| Categoría | Score | Estado |
|---|---|---|
| Crawlability & robots.txt | 95/100 | AI crawlers permitidos, /dev bloqueado, sitemap canónico |
| Sitemap | 90/100 | 87 URLs, `lastModified` real por ruta |
| On-page (titles, descriptions, H1) | 85/100 | H1 con keyword principal |
| Structured data (JSON-LD) | 90/100 | 9 tipos emitidos |
| Internacionalización (hreflang) | 90/100 | Cluster pages con es-MX, es-ES, etc. |
| Performance (Core Web Vitals) | desconocido | requiere Lighthouse CI post-deploy |
| Mobile | 90/100 | responsive + viewport correcto |
| Seguridad / trust signals | 95/100 | HSTS, CSP nonce, frame-options |
| AI Search / GEO | 85/100 | llms.txt + llms-full.txt + robots para AI |
| Content depth | 70/100 | 6 blog posts + 3 comparativas (subió desde 50) |

## Páginas clave y sus schemas

| Ruta | Title | JSON-LD principal |
|---|---|---|
| `/` | "Software para academias de gimnasia" | SoftwareApplication + Organization + FAQPage |
| `/pricing` | "Planes y Precios para Academias de Gimnasia" | Product + OfferCatalog |
| `/features` | "Funcionalidades para academias de gimnasia" | SoftwareApplication |
| `/faq` | "Preguntas frecuentes sobre software para academias de gimnasia" | FAQPage |
| `/academias` | "Directorio de Academias de Gimnasia" | (visual) |
| `/academias/[id]` | `${academia.name}` | SportsActivityLocation + openingHours |
| `/events/[id]` | `${event.title}` | Event |
| `/empleo/[id]` | `${listing.title}` | JobPosting |
| `/coaches/[slug]` | `${coach.name}` | Person |
| `/es/[modality]` | `${modalidad} en Latinoamérica` | WebPage + BreadcrumbList |
| `/es/[modality]/[country]` | `${modalidad} en ${país}` | WebPage + BreadcrumbList + ItemList |
| `/comparativas` | "Comparativas de software para academias" | CollectionPage + ItemList |
| `/comparativas/[slug]` | title del JSON | Article + BreadcrumbList + FAQPage |
| `/blog` | "Blog de Zaltyko" | Blog + blogPost[] |
| `/blog/[slug]` | title del JSON | BlogPosting + BreadcrumbList |

## Endpoints AI/GEO

- `/robots.txt` — permite GPTBot, ClaudeBot, PerplexityBot, Google-Extended
- `/sitemap.xml` — sitemap dinámico (force-dynamic, revalidate=0)
- `/llms.txt` — índice estructural (referencia a llms-full)
- `/llms-full.txt` — contenido completo aprobado en Mensajes aprobados.md
- `/blog/feed.xml` — RSS 2.0 para feed readers
- `/api/cron/indexnow-submit` — push protocol para Bing/IndexNow

## Reglas de indexabilidad

Académicas (`/academias/[id]`):
- Solo indexable si `isPublic = true AND isSuspended = false AND status ∈ {active, trial}`.
- Implementado en:
  - `src/lib/seo/academy-indexability.ts` (regla única)
  - `src/lib/seo/academy-robots-directives.ts` (helper para metadata + header)
  - `middleware.ts` (X-Robots-Tag header)
  - `src/app/sitemap.ts` (filtro DB)

Rutas privadas (noindex via robots.txt):
- `/app/*`, `/dashboard/*`, `/super-admin/*`, `/api/*`, `/dev/*`

## Single source of truth

- **Canonical + sitemap + OG URL**: `src/lib/seo/site-url.ts:getPublicSiteUrl()`.
  Filtra `vercel.app` y `trycloudflare.com` para evitar canónicos en SERP desde
  previews. Si añades una URL pública nueva, usa este helper; nunca hardcodes
  `zaltyko.com`.
- **Cluster pages**: `src/lib/seo/availability.ts` (MODALITIES, COUNTRIES,
  AVAILABLE_MODALITIES). El sitemap y `generateClusterJsonLd` derivan
  exclusivamente de aquí.
- **Hreflang**: `getModalityHreflang`, `getClusterHreflang` en
  `src/lib/seo/clusters.ts`. Si cambias un slug en availability.ts, el hreflang
  se actualiza solo.

## Tests focalizados

```
tests/seo/schema-helpers.test.ts       12 tests  Event/Academy/Job/Coach JSON-LD
tests/seo/comparativas.test.ts         5 tests   helpers de comparativas
tests/seo/blog.test.ts                 5 tests   helpers del blog
tests/seo/sitemap-coverage.test.ts     9 tests   cobertura del sitemap
tests/seo/seo-endpoints-contract.test.ts 8 tests robots + llms contract
tests/api/cron-indexnow-submit.test.ts 4 tests  IndexNow ping contract
tests/academy-seo-fail-closed.test.ts  7 tests  (preexistente) indexabilidad
tests/seo-build-db-contract.test.ts    1 test   (preexistente) build sin DB
tests/academy-detail-fidelity-contract.test.ts 3 tests (preexistente) academy detail
```

Total suite SEO: **54 tests** sobre 9 archivos.

## Checklist de mantenimiento trimestral

- [ ] Revisar Search Console: cobertura, CTR, posiciones
- [ ] Verificar que las academias públicas siguen apareciendo en sitemap
- [ ] Lighthouse CI score ≥ 95 en /, /pricing, /blog/[slug], /academias/[id]
- [ ] Validar `llms-full.txt` contra Mensajes aprobados.md
- [ ] Re-verificar que ningún porcentaje de ahorro/recuadación entró en copy nuevo
- [ ] Confirmar que `aggregateRating` sigue ausente (no inventar)
- [ ] Re-verificar hreflang tras cualquier cambio en availability.ts

## Lo que NO hacer

- ❌ Inventar `aggregateRating` sin reviews reales.
- ❌ Prometer academias ilimitadas en Starter o Growth.
- ❌ Hardcodear `zaltyko.com` — usar `getPublicSiteUrl()`.
- ❌ Añadir Schema.org `VideoObject` hasta que exista un video real.
- ❌ Usar "100% seguro", "RGPD Compliant", "soporte 24/7" sin evidencia.
- ❌ Tocar `src/lib/seo/site-url.ts` sin actualizar sitemap + robots + canonicals.

## Métricas objetivo (4 semanas post-deploy completo)

| Métrica | Baseline | Objetivo |
|---|---|---|
| Tráfico orgánico mensual | desconocido (medir antes en GSC) | +40% |
| Páginas indexadas en GSC | desconocido | +30 |
| Rich results detectados | 0 | ≥ 4 URLs |
| Lighthouse SEO medio (5 páginas) | desconocido | ≥ 95 |
| Posición media "software academias gimnasia" | desconocida | Top 10 |
| CTR medio SERP homepage | desconocido | +25% |
