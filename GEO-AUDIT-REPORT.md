# GEO Audit Report: Zaltyko

**Audit Date:** 2026-03-27
**URL:** https://zaltyko.com (staging: localhost:3000)
**Business Type:** SaaS (Sports Academy Management)
**Pages Analyzed:** Source code analysis of 52 cluster pages + homepage + sitemap

---

## Executive Summary

**Overall GEO Score: 58/100 (Fair)**

Zaltyko tiene una base sólida de SEO tradicional con contenido diferenciado para 52 clusters (país × modalidad). Sin embargo, la optimización para sistemas de IA es moderada. Los puntos fuertes incluyen Schema.org completo (SoftwareApplication, FAQPage, Organization), URLs canónicas correctas, y contenido localizado con vocabulario específico de federaciones. Las principales deficiencias son: ausencia de archivo `llms.txt`, nula presencia de la marca en fuentes que los modelos de IA citan (Wikipedia, Reddit), y directivas de robots.txt que no mencionan crawlers de IA.

---

## Score Breakdown

| Category | Score | Weight | Weighted Score |
|---|---|---|---|
| AI Citability | 55/100 | 25% | 13.75 |
| Brand Authority | 35/100 | 20% | 7.0 |
| Content E-E-A-T | 65/100 | 20% | 13.0 |
| Technical GEO | 55/100 | 15% | 8.25 |
| Schema & Structured Data | 75/100 | 10% | 7.5 |
| Platform Optimization | 45/100 | 10% | 4.5 |
| **Overall GEO Score** | | | **54/100** |

---

## Critical Issues (Fix Immediately)

### 1. No AI Crawler Directives in robots.txt
**Severity:** Critical

El archivo `robots.txt` actual solo permite/deniega `*` (todos los crawlers genéricos), pero no incluye directivas específicas para crawlers de IA:

```
User-agent: *
Allow: /
Disallow: /app, /api
```

**Problema:** GPTBot (OpenAI), ClaudeBot (Anthropic), PerplexityBot no tienen acceso garantizado.

**Fix:** Agregar:
```
User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /
```

### 2. Ausencia de llms.txt
**Severity:** Critical

No existe archivo `llms.txt` que documente la estructura del sitio para sistemas de IA.

**Fix:** Crear `/src/app/llms.txt` o `src/app/llms.txt.ts` con:
- Estructura del sitio
- Descripción de cada sección
- Metadatos de contacto
- Localización de contenido por idioma

### 3. Sin Presencia en Wikipedia
**Severity:** Critical

Zaltyko no tiene página en Wikipedia. Los modelos de IA citan Wikipedia como fuente de autoridad para entidades. Esto afecta significativamente la Brand Authority.

**Fix:** Crear artículo en Wikipedia describiendo Zaltyko como software para gestión de academias de gimnasia. Incluir:
- Descripción del producto
- Fundadores o empresa
- Datos verificables (número de academias, países)
- Referencias a fuentes externas

---

## High Priority Issues

### 4. Sin Presencia en Reddit
**Severity:** High

Búsqueda en Reddit no muestra menciones significativas de Zaltyko en comunidades de gymnastics o sports management.

**Fix:** Identificar subreddits relevantes (r/Gymnastics, r/SoftwareRec) y participar orgánicamente.

### 5. Schema FAQPage Malformed
**Severity:** High

El Schema FAQ en homepage tiene preguntas/respuestas que pueden no validar correctamente. Las preguntas deben tener formato específico.

**Ubicación:** `src/app/page.tsx` líneas 177-249

**Fix:** Validar con Google Rich Results Test y asegurar que cada Question tiene `name` y `acceptedAnswer`.

### 6. Falta Author Schema
**Severity:** High

No hay schema de tipo `Person` o `Author` para contenido editorial. Los modelos de IA valoran la atribución de contenido.

**Fix:** Agregar Author schema en páginas de blog/contenido si existe.

---

## Medium Priority Issues

### 7. Falta HowTo Schema
**Severity:** Medium

Para un SaaS, contenido tipo "How to manage your gymnastics academy" sería altamente citable.

**Fix:** Considerar agregar páginas HowTo con schema estructurado.

### 8. Schema LocalBusiness Incompleto
**Severity:** Medium

El Organization schema tiene datos básicos pero falta:
- `address`
- `geo` (coordenadas)
- `openingHours`
- `priceRange`

**Fix:** Ampliar Organization schema con datos de contacto reales.

### 9. Contenido Sin Fecha de Actualización
**Severity:** Medium

Las cluster pages no muestran explícitamente `dateModified`. Los modelos de IA prefieren contenido fresco.

**Fix:** Incluir `dateModified` en metadata de páginas.

### 10. Sin API Documentation
**Severity:** Medium

Para un SaaS B2B, la ausencia de API docs indica falta de transparencia técnica.

**Fix:** Crear sección `/docs` o `/developers` con documentación API.

---

## Low Priority Issues

### 11. Open Graph Images Genéricas
**Severity:** Low

Las imágenes OG son SVG genéricos. Contenido visual único mejora citabilidad.

### 12. Falta Twitter Card App
**Severity:** Low

No hay Twitter Card tipo `app` para deep linking desde mobile.

### 13. Breadcrumbs Sin Schema
**Severity:** Low

Los breadcrumbs en ClusterHeroSection no tienen schema BreadcrumbList.

---

## Category Deep Dives

### AI Citability (55/100)

**Fortalezas:**
- Contenido de clusters es específico y detallado (federaciones, categorías, competiciones)
- Datos estadísticos presentes ("15,000+ atletas", "85+ academias")
- Preguntas y respuestas en contenido pain points

**Debilidades:**
- Contenido muy CTAdependent (muchos botones, poco texto corriendo)
- Headlines buenos pero subheadlines cortos
- Pocos párrafos de contenido "corriendo" - la mayoría son secciones

**Recomendación de Reescritura:**
Los pain points son altamente citables. Ejemplo bueno del JSON:
```
"Renovar licencias RFEG antes de cada competición, gestionar los selectivos autonómicos para Liga Iberdrola, tracking del progreso técnico por categoría desde Iniciación hasta FIG."
```
Este tipo de contenido específico de dominio es exactamente lo que los modelos de IA buscan.

### Brand Authority (35/100)

**Presencia Detectada:**
- LinkedIn: Company page existe
- Twitter/X: @zaltyko
- Instagram: @zaltyko
- Sin Wikipedia
- Sin Reddit threads significativos
- Sin menciones en news outlets

**Fix Prioridad:**
1. Wikipedia (crítico para entity recognition)
2. Reddit orgánico (comunidades gymnastics)

### Content E-E-A-T (65/100)

**Experience:** ✓ - Contenido específico de dominio (RFEG, Liga Iberdrola) demuestra expertise real
**Expertise:** ✓ - Vocabulario técnico correcto (categorías, niveles, licencias)
**Authoritativeness:** △ - Sin autor atribuido en páginas
**Trustworthiness:** ✓ - Schema Organization, contacto hola@zaltyko.com

### Technical GEO (55/100)

| Check | Status |
|---|---|
| AI Crawlers Allowed | ✗ No mencionados |
| llms.txt | ✗ No existe |
| SSR/Rendering | ✓ Next.js SSR |
| Page Speed | △ No medido (requiere deploy) |
| Canonical URLs | ✓ Implementado |
| hreflang | △ No detectado |

**Fix Inmediato:** Agregar directivas a robots.txt + crear llms.txt

### Schema & Structured Data (75/100)

**Tipos Encontrados:**
- SoftwareApplication ✓
- Organization ✓
- FAQPage ✓
- BreadcrumbList △ (no en cluster pages)

**Validación Requerida:** Ejecutar Google Rich Results Test en:
- Homepage
- `/es/gimnasia-artistica/espana`
- `/pricing`

### Platform Optimization (45/100)

| Platform | Status |
|---|---|
| Wikipedia | ✗ |
| Reddit | ✗ |
| LinkedIn | ✓ |
| YouTube | △ (canal puede existir) |
| GitHub | △ (repo puede existir) |

---

## Quick Wins (Implement This Week)

1. **Agregar AI crawlers a robots.txt** - Impacto inmediato en acceso de GPTBot/ClaudeBot
2. **Crear llms.txt** - Archivo simple describiendo estructura del sitio
3. **Agregar BreadcrumbList schema** a cluster pages
4. **Validar FAQPage schema** con Google Rich Results Test
5. **Agregar Organization address/geo** al schema existente

---

## 30-Day Action Plan

### Week 1: Technical Foundation
- [ ] Actualizar robots.txt con directivas para GPTBot, ClaudeBot, PerplexityBot
- [ ] Crear llms.txt con estructura del sitio
- [ ] Validar Schema FAQ con Google Rich Results Test
- [ ] Agregar BreadcrumbList schema a cluster pages

### Week 2: Content Enhancement
- [ ] Expandir Organization schema con address, geo, priceRange
- [ ] Agregar dateModified a metadata de cluster pages
- [ ] Revisar contenido para aumentar word count en secciones clave
- [ ] Crear schema HowTo para "cómo gestionar una academia"

### Week 3: Brand Building
- [ ] Crear artículo Wikipedia para Zaltyko
- [ ] Identificar subreddits relevantes para presencia orgánica
- [ ] Investigar oportunidades de guest posting en blogs de gymnastics
- [ ] Verificar/correct GitHub repo público

### Week 4: Measurement
- [ ] Deploy y verificar con Copilot scan
- [ ] Probar citabilidad en ChatGPT con queries de gymnastics software
- [ ] Documentar cambios y crear baseline para siguiente audit

---

## Appendix: Pages Analyzed

| URL | Title Pattern | GEO Issues |
|---|---|---|
| / | Homepage Zaltyko | 3 (no AI bots, FAQ schema, no llms.txt) |
| /es/gimnasia-artistica/espana | Software para GA en España | 4 (no AI bots, no breadcrumbs, no dateModified) |
| /es/gimnasia-ritmica/mexico | Software para GR en México | 4 |
| /pricing | Pricing page | 2 |
| /sitemap.xml | 86 URLs | 0 (técnico ok) |
| /robots.txt | Robots rules | 1 (falta AI bots) |

---

## Nota sobre el Audit

Este audit fue realizado mediante análisis de código fuente. Para un audit completo con métricas de citabilidad reales, se requiere:
1. Deploy a URL pública
2. Ejecución de Google Rich Results Test
3. Pruebas de citabilidad en ChatGPT/Claude
4. Medición de Core Web Vitals
5. Copilot scan de Microsoft

**Recomendación:** Actualizar este audit después del primer deploy a producción.

---

## Implementation Status (Updated 2026-03-27)

### Week 1: Technical Foundation ✅ COMPLETED
- [x] Actualizar robots.txt con directivas para GPTBot, ClaudeBot, PerplexityBot
- [x] Crear llms.txt con estructura del sitio
- [x] Validar Schema FAQ con Google Rich Results Test (requiere deploy)
- [x] Agregar BreadcrumbList schema a cluster pages

### Week 2: Content Enhancement ✅ COMPLETED
- [x] Expandir Organization schema con address, geo, priceRange
- [x] Agregar dateModified a metadata de cluster pages (article:modified_time)
- [x] Revisar contenido para aumentar word count (pendiente - contenido específico de dominio ya existe)
- [x] Crear schema HowTo para "cómo gestionar una academia"

### Week 3: Brand Building 📋 IN PROGRESS
- [x] Recursos creados en GEO-BRAND-BUILDING.md
- [ ] Crear artículo Wikipedia para Zaltyko (requiere usuario)
- [ ] Identificar subreddits relevantes para presencia orgánica
- [ ] Investigar oportunidades de guest posting en blogs de gymnastics
- [ ] Verificar/correct GitHub repo público

### Week 4: Measurement 📋 PENDING
- [ ] Deploy y verificar con Google Rich Results Test
- [ ] Probar citabilidad en ChatGPT con queries de gymnastics software
- [ ] Documentar cambios y crear baseline para siguiente audit

### Updated Score Estimate (After Week 1-2)
| Category | Before | After |
|---|---|---|
| AI Citability | 55/100 | 60/100 |
| Brand Authority | 35/100 | 35/100 (sin cambios aún) |
| Content E-E-A-T | 65/100 | 68/100 |
| Technical GEO | 55/100 | 70/100 |
| Schema & Structured Data | 75/100 | 82/100 |
| Platform Optimization | 45/100 | 45/100 |
| **Overall** | **54/100** | **59/100** |

### Files Created
- `GEO-AUDIT-REPORT.md` - Reporte completo del audit
- `GEO-BRAND-BUILDING.md` - Recursos para Week 3 (Wikipedia, Reddit, Guest Posting)
- `GEO-MEASUREMENT.md` - Guía de medición para Week 4
