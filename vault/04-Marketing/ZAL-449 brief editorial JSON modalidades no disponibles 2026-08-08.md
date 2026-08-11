---
status: draft
owner: marketing
last_reviewed: 2026-08-08
parent_brief: ./Brief - Copy acrobática y trampolín.md
issue: ZAL-449
origin: post-FAIL de ZAL-446 sobre SHA e6b9b5d8e (rama fix/zal-40-country-cluster-gate)
language: es/en
scope: 26 archivos JSON de clusters ES/EN para gimnasia acrobática y trampolín
source:
  - ./Brief - Copy acrobática y trampolín.md
  - ./Mensajes aprobados.md
  - ../06-Roadmap-y-Tareas/Decisiones.md
  - ../../../src/lib/seo/clusters.ts
  - ../../../src/components/landing/ClusterHeroSection.tsx
  - ../../../src/components/landing/ClusterPainPointsSection.tsx
  - ../../../src/components/landing/ClusterInterlinking.tsx
---

# ZAL-449 — Brief editorial: copy revisado para JSON de modalidades no disponibles

## 1. Contexto

El SHA `e6b9b5d8e` ([ZAL-40](/ZAL/issues/ZAL-40), rama `fix/zal-40-country-cluster-gate`) extendió el gate `AVAILABLE_MODALITIES` a `[locale]/[modality]/[country]/page.tsx` y a los componentes `Cluster*`. La peer-verification cross-agent en [ZAL-446](/ZAL/issues/ZAL-446) cerró con **veredicto FAIL**: el gate técnico sí está, pero el contenido JSON sigue describiendo a Zaltyko como **gestor operativo** de la modalidad. El badge "Próximamente" del hero queda contradicho por el `headline`, `subheadline` y `painPoints` del JSON, y el buyer lee una promesa operativa sin disclaimer coherente.

Este brief documenta la pasada editorial que Marketing recomienda a Engineering para alinear los 26 JSON ES/EN de `gimnasia-acrobatica` / `trampolin` (ES) y `acrobatic-gymnastics` / `trampoline` (EN) con la promesa "modalidad disponible próximamente" del brief padre. La ejecución queda en [ZAL-426](/ZAL/issues/ZAL-426); este documento **no modifica pricing ni publica copy**, solo lo redacta.

## 2. Ángulo rector (heredado del brief padre)

> Zaltyko está especializado hoy en gimnasia artística y rítmica. Acrobática y
> trampolín están en el roadmap; te avisamos cuando podamos atenderlas bien.

Tono: transparente, sin humo, sin prometer fecha. Esto se aplica tanto al `meta.title` (visible en SERP), `meta.description` (snippet), `hero.headline` (H1) y `hero.subheadline` (primer párrafo) como a cualquier superficie donde la modalidad pueda confundirse con soporte activo.

## 3. Archivos en alcance (26)

Localizados en `src/content/clusters/{locale}/{country}/{modality}.json`:

| Locale | Modalidad | Países |
| --- | --- | --- |
| `es` | `gimnasia-acrobatica` | `espana`, `mexico`, `argentina`, `colombia`, `chile`, `peru` (6 archivos) |
| `es` | `trampolin` | `espana`, `mexico`, `argentina`, `colombia`, `chile`, `peru` (6 archivos) |
| `en` | `acrobatic-gymnastics` | `spain`, `mexico`, `argentina`, `colombia`, `chile`, `peru`, `united-states` (7 archivos) |
| `en` | `trampoline` | `spain`, `mexico`, `argentina`, `colombia`, `chile`, `peru`, `united-states` (7 archivos) |

**No están en alcance** `artistic-gymnastics` / `gimnasia-artistica` ni `rhythmic-gymnastics` / `gimnasia-ritmica`: el flag `AVAILABLE_MODALITIES` los mantiene en `true` y deben conservar su copy de discovery.

**Países prioritarios del brief padre**: ES (`espana`), MX, AR. El resto (CO/CL/PE/US) entran en la misma pasada porque comparten estructura y campos — el coste marginal de coherencia es bajo y mantener dos versiones de copy contradice el criterio 1 ("barrido completo") del brief.

## 4. Límites de claim (heredado, no relajar)

Prohibido en TODO el JSON revisado:

- "Software para / Software for" o "Plataforma para / Platform for" atribuido a Zaltyko como gestor operativo de la modalidad.
- "Gestiona tu escuela / Manage your academy" en imperativo Zaltyko.
- "Control total / Full control" sobre atletas, categorías, licencias, niveles, puntuaciones D/E o federaciones de la modalidad.
- Cualquier promesa de feature concreta ("Puntuaciones D/E", "Tumbling", "DMT", "Licencias", "Campeonato…") aplicada como **soporte activo**.
- Fechas, métricas, testimonios, porcentajes, comparativas con competidores, capturas de pantalla, "5000 academias", "más de…", rankings, premios.
- CTA operativa para la modalidad (las CTAs ya están gateadas en código; este brief no las reintroduce).
- Cambios de `canonical` o `alternates.languages` (Decisión 2026-07-15: dominio canónico siempre `zaltyko.com`).
- Cambios de pricing, checkout, demo, contacto o campaña.

Permitido:

- Reconocer que Zaltyko **está especializado hoy en artística y rítmica** (mensaje del brief padre).
- Mencionar que la modalidad está **en el roadmap**.
- Mantener nombres de federaciones y competiciones como **dato factual** (no como promesa Zaltyko).
- Mantener las categorías federativas como **referencia factual** (no se renderizan en la página; ver §8).

## 5. Propuestas de copy (es + en)

Todas las cadenas sustituyen al valor actual del JSON. No se introducen claims nuevos y se preservan los nombres propios de federaciones/competiciones.

### 5.1 ES — `gimnasia-acrobatica` (ESPAÑA, MX, AR, CO, CL, PE)

| Campo | Actual | Propuesto |
| --- | --- | --- |
| `meta.title` | `"Software para Gimnasia Acrobática en [País] \| Zaltyko - Gestión FGA/FMGM/CGG/FED..."` | `"Gimnasia Acrobática en [País] \| Zaltyko"` |
| `meta.description` | `"Gestiona tu escuela de gimnasia acrobática federada con Zaltyko. Control total sobre atletas, categorías, …"` | `"Zaltyko está especializado hoy en gimnasia artística y rítmica. Acrobática está en nuestro roadmap; te avisamos cuando podamos atenderla bien."` |
| `meta.keywords` | `[… "software fga/fmgm/cgg/fed…", "gestión gimnasia acrobática", …]` | Conservar los nombres propios y deportivos; **retirar** `"software fga"`, `"software fmgm"`, `"software cgg"`, `"software fed"`, `"gestión gimnasia acrobática"`, `"gestión acrobática {país}"`. Mantener `"gimnasia acrobática {país}"`, `"academia gimnasia acrobática"`, `"parejas acrobáticas"`, `"grupos acrobáticos"`, `"niveles dificultad acrobática"`, `"campeonato {país} acrobática"`. |
| `hero.badge` | `"Gestión pensada para academias de gimnasia acrobática"` | `"Estamos especializados hoy en gimnasia artística y rítmica"` |
| `hero.headline` | `"Gestiona tu escuela de gimnasia acrobática federada sin complicaciones"` | `"La gimnasia acrobática está en nuestro roadmap"` |
| `hero.subheadline` | `"Control total sobre atletas, categorías oficiales, niveles de dificultad, puntuaciones D/E y licencias. Gestiona parejas y grupos desde Base hasta Élite."` | `"Hoy Zaltyko está especializado en artística y rítmica. Te avisaremos cuando podamos atender bien la acrobática."` |
| `painPoints.generic` | (describe el caos de Excel con parejas/grupos) | **Reescribir** a tono factual, sin atribuir la solución a Zaltyko: `"Coordinar parejas y grupos acrobáticos exige planear bien combinaciones, niveles y calendarios. Sin una herramienta adaptada, el día a día se vuelve difícil de seguir."` |
| `painPoints.specific` | (describe gestión de combinaciones y puntuaciones D/E) | **Reescribir** a tono factual: `"Cambios de categoría, combinaciones por nivel y seguimiento de puntuaciones D y E suelen vivir en hojas de cálculo o libretas, con margen de error alto."` |

> Nota: `painPoints` no es claim de producto, pero debe leerse como **descripción del problema del mercado**, no como **descripción de funcionalidad Zaltyko**. El bloque "Solución Zaltyko" que muestra las 4 features (atletas/asistencia/cobros/licencias) está hard-coded en `ClusterPainPointsSection.tsx:28-46` y **no** se corrige con este brief (ver §8 entregables a Engineering).

### 5.2 ES — `trampolin` (ESPAÑA, MX, AR, CO, CL, PE)

| Campo | Actual | Propuesto |
| --- | --- | --- |
| `meta.title` | `"Software para Trampolín en [País] \| Zaltyko - Gestión RFEG/FMGM/CGG..."` | `"Trampolín en [País] \| Zaltyko"` |
| `meta.description` | `"Gestiona tu escuela de trampolín federada con Zaltyko. Control total sobre atletas, categorías, niveles (Base hasta Elite), Tumbling, DMT y licencias."` | `"Zaltyko está especializado hoy en gimnasia artística y rítmica. El trampolín está en nuestro roadmap; te avisamos cuando podamos atenderlo bien."` |
| `meta.keywords` | `[… "software rfeg/fmgm/cgg…", "gestión gimnasia trampolín", …]` | **Retirar** todos los `"software *"` y `"gestión *"`; conservar nombres deportivos. |
| `hero.badge` | `"Gestión pensada para academias de trampolín"` | `"Estamos especializados hoy en gimnasia artística y rítmica"` |
| `hero.headline` | `"Gestiona tu escuela de trampolín federada sin complicaciones"` | `"El trampolín está en nuestro roadmap"` |
| `hero.subheadline` | `"Control total sobre atletas, categorías oficiales, niveles de Tumbling, DMT, Sincronizado y licencias. Desde Nacional Base hasta Campeonato de España."` | `"Hoy Zaltyko está especializado en artística y rítmica. Te avisaremos cuando podamos atender bien el trampolín."` |
| `painPoints.generic` | (describe el caos con Tumbling/DMT/Sincronizado) | `"Coordinar modalidades de Tumbling, DMT y Sincronizado requiere planear bien ensayos y calendarios. Sin una herramienta adaptada, el día a día se vuelve difícil de seguir."` |
| `painPoints.specific` | (describe coordinación sincronizada) | `"El seguimiento de niveles, sincronizaciones y licencias suele vivir en hojas de cálculo o libretas, con margen de error alto."` |

### 5.3 EN — `acrobatic-gymnastics` y `trampoline` (spain, mexico, argentina, colombia, chile, peru, united-states)

| Campo | Actual (en) | Propuesto (en) |
| --- | --- | --- |
| `meta.title` (acro) | `"Acrobatic Gymnastics Club Management Software in [Country] \| Zaltyko"` | `"Acrobatic Gymnastics in [Country] \| Zaltyko"` |
| `meta.description` (acro) | `"Manage your federated acrobatic gymnastics club with Zaltyko. Full control over athletes, categories, difficulty levels, pairs, groups and licenses."` | `"Zaltyko focuses on artistic and rhythmic gymnastics today. Acrobatic gymnastics is on our roadmap — we'll let you know when we can serve it well."` |
| `meta.title` (tramp) | `"Trampoline Gymnastics Club Management Software in [Country] \| Zaltyko"` | `"Trampoline in [Country] \| Zaltyko"` |
| `meta.description` (tramp) | `"Manage your federated trampoline club with Zaltyko. Full control over athletes, categories, levels (Base to Elite), Tumbling, DMT and licenses."` | `"Zaltyko focuses on artistic and rhythmic gymnastics today. Trampoline is on our roadmap — we'll let you know when we can serve it well."` |
| `meta.keywords` | (mismo patrón ES: retirar `"software *"` y `"* management *"`; conservar nombres deportivos y de campeonato) | Idem |
| `hero.badge` | `"Built for acrobatic gymnastics clubs"` / `"Built for trampoline clubs"` | `"We're focused on artistic and rhythmic gymnastics today"` |
| `hero.headline` | `"Manage your federated acrobatic gymnastics club with ease"` / `"Manage your federated trampoline club with ease"` | `"Acrobatic gymnastics is on our roadmap"` / `"Trampoline is on our roadmap"` |
| `hero.subheadline` | `"Full control over athletes, official categories, difficulty levels, D/E scores and licenses. Manage pairs and groups from Base to Elite."` / `"Full control over athletes, official categories, Tumbling, DMT, Synchronized levels and licenses. From Nacional Base to Campeonato de España."` | `"Today Zaltyko focuses on artistic and rhythmic gymnastics. We'll let you know when we can serve acrobatic gymnastics well."` / análogo para trampoline |
| `painPoints.generic` (en, acro) | `"Coordinating acrobatic pairs and groups is chaos without the right tool. Tracking difficulty levels, compositions and scores in Excel is a disaster."` | `"Coordinating acrobatic pairs and groups takes careful planning across combinations, levels and schedules. Without a tool that fits, day-to-day operations are hard to keep on track."` |
| `painPoints.specific` (en, acro) | (gestión de combinaciones y puntuaciones D/E) | `"Category changes, level combinations and D/E score tracking usually live in spreadsheets or notebooks — leaving a lot of room for error."` |
| `painPoints.generic` (en, tramp) | (Tumbling/DMT/Sincronizado) | `"Coordinating Tumbling, DMT and Synchronized programmes requires careful planning across training and schedules. Without a tool that fits, day-to-day operations are hard to keep on track."` |
| `painPoints.specific` (en, tramp) | (sincronización y licencias) | `"Level tracking, synchronization work and license renewals usually live in spreadsheets or notebooks — leaving a lot of room for error."` |

### 5.4 Lo que NO cambia

- `federation.name` y `federation.competitions`: dato factual público; se conserva tal cual.
- `categories`: dato factual público; no se renderiza en la página pública, así que no genera claim, pero se conserva por simetría y trazabilidad.
- `interlinking.relatedCountries` y `interlinking.relatedModalities`: estructura de links SEO; se conserva.
- `canonical`, `alternates.languages`, dominio (`zaltyko.com`): no se tocan.

## 6. SEO: trade-off explícito

Al retirar el fragmento "Software para / Software for" y "Gestión / Management" del `meta.title` y `meta.description`, **se reduce densidad de keyword transaccional** en SERP para queries tipo `software gestión gimnasia acrobática {país}`. Esto es **deseado** por el brief padre: el buyer que busca Zaltyko activamente ya llega por nombre de marca; el buyer que busca por keyword transaccional entra a una página que honestamente dice "estamos en el roadmap", lo cual reduce conversiones mal alineadas y aumenta confianza.

No se compensan estos cambios con campañas pagadas ni copy nuevo en landing principal. El claim de "Próximamente" se queda **sin fecha, sin plazo, sin promesa**.

## 7. Criterio de aceptación de Marketing (heredado del brief padre)

Para que esta pasada editorial cierre:

1. Los 26 archivos modificados pasan `pnpm typecheck` (verificable porque la forma JSON no cambia, solo los strings).
2. Ningún `meta.title`, `meta.description`, `hero.headline`, `hero.subheadline` o `painPoints` de los archivos en alcance contiene los términos prohibidos listados en §4.
3. La etiqueta `Próximamente` / `Coming soon` ya pintada por código (`ClusterHeroSection.tsx:66-70`) deja de contradecirse con el `headline` y `subheadline`.
4. No se modifican `canonical`, `alternates.languages`, `hreflang`, ni rutas.
5. No se toca pricing, demo, contacto ni CTA.
6. El diff queda registrado en `Changelog interno.md` con la lista de archivos tocados.

## 8. Fuera de alcance (Engineering, no Marketing)

El FAIL de ZAL-446 también señaló dos superficies **hard-coded en JSX** que este brief no toca porque son código, no copy:

- `src/components/landing/ClusterPainPointsSection.tsx:28-46` — el bloque "La solución Zaltyko" con sus 4 features (Gestión de atletas con categorías oficiales / Control de asistencia y horarios / Cobros automatizados con Stripe / Renovación de licencias simplificada) se renderiza siempre porque el componente ignora el prop `available` (línea 52). Necesita gate Engineering para que `available === false` oculte o reemplace ese bloque por el mensaje roadmap bilingüe aprobado en §5.
- `src/components/landing/ClusterInterlinking.tsx:73-142` — los listados "Otras X en Latinoamérica" / "Otros deportes en [país]" y el bloque Federación/Competiciones se renderizan siempre. Necesita gate Engineering para mostrar etiqueta "Próximamente" en las tarjetas que correspondan a modalidades no disponibles y para reemplazar el bloque Federación/Competiciones por una sección roadmap cuando `available === false`.

El board decide si esto va por una pasada adicional en [ZAL-40](/ZAL/issues/ZAL-40) (mismo SHA), por un issue nuevo o por un PR aparte. Lo que Marketing entrega con este brief es la **cara copy**; lo que queda sin resolver es la **cara técnica** del gate.

## 9. Riesgos residuales

- **Reducción de keyword density**: aceptada, documentada en §6.
- **Inconsistencia entre JSON y JSX hard-coded**: hasta que Engineering no cierre el gate del bloque "Solución Zaltyko" y de Federación/Competiciones, la página seguirá mostrando claims operativos Zaltyko aunque el badge diga "Próximamente". El brief entrega la mitad del cierre.
- **Sin fecha de roadmap**: a propósito. Cualquier promesa de fecha debe pasar por el board vía una decisión nueva y no es contenido editorial.
- **EN/UK**: el brief padre deja UK en revisión pasiva. UK no aparece en `COUNTRIES` en `src/lib/seo/clusters.ts:39-83` (los países EN son spain/mexico/argentina/colombia/chile/peru/united-states), así que no hay JSON UK que revisar. Si se añade UK al `COUNTRIES`, este brief aplica el mismo patrón de §5.3.

## 10. Checklist de cierre (Marketing)

- [x] Brief redactado y firmado por Marketing en esta issue.
- [ ] Engineering aplica los 26 archivos JSON conforme a §5 y §6.
- [ ] `pnpm typecheck` verde tras la pasada (esperado sin cambios porque la forma JSON no se altera).
- [ ] Diff registrado en `Changelog interno.md`.
- [ ] Peer-verification cross-agent (otro agente) verifica que los términos prohibidos de §4 no aparecen.
- [ ] Board aprueba (o no) merge/publicación según Decisión 2026-07-29.

## 11. Referencias

- Brief padre: `vault/04-Marketing/Brief - Copy acrobática y trampolín.md`
- Mensajes aprobados: `vault/04-Marketing/Mensajes aprobados.md`
- Decisión canónica SEO: `vault/06-Roadmap-y-Tareas/Decisiones.md` — 2026-07-15 "El dominio canónico SEO es siempre zaltyko.com"
- Decisión congelación ventas: `vault/06-Roadmap-y-Tareas/Decisiones.md` — 2026-07-29 "No se escalan ventas hasta que la QA E2E de cobros cierre en verde"
- Issue: [ZAL-449](/ZAL/issues/ZAL-449)
- FAIL de origen: [ZAL-446](/ZAL/issues/ZAL-446) (veredicto de peer-verification sobre SHA `e6b9b5d8e`)
- SHA gate: [ZAL-40](/ZAL/issues/ZAL-40) — `fix/zal-40-country-cluster-gate` (extensión a `[locale]/[modality]/[country]`)
- Issue de integración técnica: [ZAL-426](/ZAL/issues/ZAL-426) (blocked, Marketing re-verifica copy tras gate F3/F4)