# Plan de mejora Frontend — Zaltyko SaaS

**Fecha:** 24 ago 2026 · **Origen:** Auditoría en profundidad `http://localhost:3000` + código (`1.374 TS/TSX`, `171 pages`, `306 routes`, `70+ tablas`) · **Stack:** Next.js 15.5 App Router + Tailwind 3.4 + shadcn/ui + Manrope/Space Grotesk + Supabase + Drizzle · **Modo:** Solo plan — no se modifica `src/`

---

## 0. Lectura de diseño

> Reading this as: **landing + app SaaS B2B para dirección de academias de gimnasia (artística/rítmica)**, con lenguaje **premium-serio / confianza primero**, leaning toward **Tailwind + shadcn/ui + tokens Zaltyko + Motion CSS**.

Diales: `VARIANCE 6 | MOTION 5 | DENSITY 4` — orden y claridad por encima de pirotecnia. Movimiento motivado (jerarquía, feedback, secuencia), no decorativo.

---

## 1. Auditoría — qué se vio en localhost:3000

### 1.1 Público (`src/app/(site)`, `src/app/page.tsx:80`, `Navbar.tsx:41`, `home/*`)
- **Estructura:** `page.tsx` → `Navbar` + `Hero → SocialProof → Comparison → Modules → ClusterDiscovery → SeoExtended → Faq → FinalCta` + `Footer` + `StickyCtaBar` + `Schema` (SoftwareApplication/Organization/FAQPage). SEO sólido (canonícal, OG, llms.txt, GEO clusters `lib/seo/clusters.ts`).
- **Hero (`HeroSection.tsx:33`):** Split 2-col correcto. H1 `Las cuotas cobradas, los grupos montados y la lista pasada.` ok, pero subtext 27 palabras (supera 20) y falta `loading`/`empty`. CTAs bien (`Crear cuenta gratis` teal `shadow-brand → lift` + `Ver planes` outline), pero `Ver planes` y `Crear cuenta` duplican intención signup en nav. Preview derecha con `rosterPreview` 4 estados y `clipChip` ok, sin animación ni contador vivo.
- **Navbar (`Navbar.tsx:42`):** Fixed, blur, single-line en desktop ok, pero 6 links + 2 CTAs rozan overflow a 1024px. Mobile drawer `slide-in-from-top` sin stagger ni focus trap.
- **Modules (`ModulesSection.tsx:68`):** Bento `lg:grid-cols-4 dense` con 8 módulos, `span lg:col-span-2` solo en el primero → ritmo repetitivo (7 cards iguales tras hero). Icon 12x12 `bg-zaltyko-primary-ultralight` ok, pero todas las cards blanca sobre `zaltyko-white` sin variación visual (bento-background-diversity fail). Hover `hover:border-teal` sin elevación tintada.
- **Comparison (`ComparisonSection.tsx:95`):** Tabla 10 filas Excel vs Genérico vs Zaltyko. Correcta pero franja `surface-subtle` alternada + `border-b` en cada fila = spec-sheet ban para landing. Header Zaltyko `bg-[#00695C]` correcto, pero `highlight` usa `Check` verde sin consistencia coral.
- **SocialProof (`SocialProofSection.tsx:32`):** 4 pasos puesta en marcha (hasta que haya testimonios reales) — limpio, pero sin métricas ni logos, sin marquee ni progreso.
- **Estética:** Brand Book `tailwind.config.mjs:14` (`navy #0F172A`, `indigo #2B2E83`, `teal #00796B`, `electric #1FC7B6`, `coral #FF6B57`, `mist #CBD5E1`) respetado, pero `coral` ausente en CTAs y `electric` solo en `selection`. `globals.css:113` utilities `glass-card`, `surface-subtle`, `zaltyko-motion-lines` bien, pero sombras `brand/indigo` poco usadas.

### 1.2 Privado (`src/app/app/[academyId]/*`, 26 módulos)
- **Shell:** `layout.tsx` + `top-nav.tsx` + `authz.ts:166 withTenant` + `middleware.ts:286` (CSP nonce, rate-limit). 26 rutas verificadas, pero faltan `loading.tsx`/`error.tsx`/`not-found.tsx` por módulo, y `AcademyNavItems` no colapsa bien en <768px (overflow).
- **Atletas/Coaches/Clases/Grupos:** CRUD funcional, skeletons parciales `components/ui/skeletons/*`, pero empty states genéricos, sin `confirm-dialog` unificado para destructivos, tablas `data-table` sin sticky header ni `divide-y` refinado.
- **Billing/Attendance/Reports/AI:** APIs completas (`src/app/api`), charts con `chart-1..5` `globals.css:69`, pero dashboards con métricas en memoria (`lib/metrics.ts`) → flash de 0 en primer render.
- **A11y/perf:** `globals.css:275 prefers-reduced-motion` ok, `focus-visible:ring-ring` ok, pero sin `next/image priority` en hero y sin `font-display: swap` explícito en demo futura.

---

## 2. Qué se va a mejorar (sin tocar `src/` aún)

### 2.1 Principios (no negociables)
- **Una intención por CTA:** `Crear cuenta gratis` (signup) vs `Ver planes` (pricing) — elegir uno como primario por contexto. En home, primario = `Crear cuenta gratis` (teal), secundario = `Ver planes` (outline indigo) — no añadir tercer “Solicitar demo” en hero.
- **Hero cabe en viewport:** H1 max 2 líneas desktop, sub max 20 palabras / 4 líneas, CTAs visibles sin scroll. Si desborda, bajar `text-[clamp(1.875rem,6vw,4.5rem)]` o recortar copy, no aumentar `pt-36`.
- **Eyebrow max 1/3 secciones:** Solo hero + 2 secciones más. Resto sin label diminuto.
- **Bento con ritmo:** Alternar tamaños y fondos (blanco / `primary-ultralight` / `indigo` tint) + al menos 2 celdas con foto real `picsum.photos/seed/{modulo}/800/600`. 8 módulos → 8 celdas exactas, sin hueco.
- **Tablas landing:** No 10 filas con `border-b` en cada una. Para comparativa, usar 2-col cards + 3 checks protagonistas + “Ver detalle” colapsable.
- **Movimiento motivado:** Entrada stagger hero, counters al viewport, marquee único (modalidades), hover `translate-y-1 → shadow-brand`, `active:scale-[0.99]` (ya en `button.tsx:8`). Respetar `prefers-reduced-motion`.

### 2.2 Público — backlog priorizado

**P0 — Conversión (1 sem):**
- Reescribir sub hero a 20 palabras: “Software solo para gimnasia artística y rítmica: grupos, cobros, horarios y familias. De Excel y WhatsApp al orden.” (19). Unificar CTAs (primario teal, secundario outline) y añadir microcopy “Sin tarjeta · Puesta en marcha guiada”.
- Bento módulos: 1 hero (Cobros, `lg:col-span-2` con foto `seed/cobros`) + 2 medianas + 5 estándar, con 2 tints (`primary-ultralight` y `indigo/5`) y hover `card-hover` `globals.css:140`.
- Comparativa: reemplazar tabla 10 filas por 3 cards destacadas + acordeón “Ver todo” (evita spec-sheet).

**P1 — Confianza (1 sem):**
- SocialProof con métricas reales cuando existan; mientras, progress stepper con `delay-75..300` y check animado al scroll.
- Testimonios: horizontal `scroll-snap` con 3 snippets max 3 líneas, sin `—` dentro.
- FAQ: acordeón con `motion` y Schema intacto `page.tsx:164`.

**P2 — Polish (2d):**
- Navbar: condensar labels a 5, pill `border-mist/70 bg-white/80 shadow-soft` ya ok, añadir `prefers-reduced-transparency` fallback para `backdrop-blur`.
- Footer: mantener `zaltyko-motion-lines` `globals.css:144` pero bajar opacidad a `0.35` para no competir.

### 2.3 Privado — backlog priorizado

**P0 — Retención (2–3 sem, tras validar demo):**
- `loading.tsx` + `skeleton-card/avatar/text` por módulo, empty con ilustración + CTA contextual (“Importar gimnastas”), error con `retry`.
- `confirm-dialog` en destructivos, `card-hover` unificado, `data-table` con `sticky header` y `hide-scrollbar`.
- `AcademyNavItems` responsive: `grid-cols-1 md:flex` + scroll pills en mobile.

**P1 — Datos en vivo (1 sem):**
- Reemplazar métricas en memoria por fetch con `revalidate` y skeleton; charts con `chart-1: teal, chart-2: indigo` y `animate-fadeInUp`.

---

## 3. Demo de home — qué se entrega

**Archivo:** `informe Muse/demo-home.html` (standalone, Tailwind CDN, Manrope + Space Grotesk, tokens `zaltyko`, `globals.css` utilities). No toca `src/`.

**Secciones (mínimo 5 layouts distintos):**
1. **Nav** 64–72px single-line, logo 132px, pill de links `border-mist/70`, CTA teal `shadow-brand` → `lift`.
2. **Hero** split 50/50 (no centrado), H1 2 líneas + sub 19 palabras + 2 CTAs, preview derecha con 4 estados y `2/4` vivo, contador `+0.1s` al entrar.
3. **SocialProof** 4 pasos con `delay-75..225` y marquee único de modalidades (una sola vez).
4. **Modules** bento 8 celdas (1+2+2+3) con fotos `picsum`, tints y tags, hover lift.
5. **Comparison** 3 cards destacadas + tabla colapsable (no 10 filas visibles).
6. **Testimonios** carrusel `scroll-snap` 3 items, **FAQ** acordeón, **Final CTA** indigo con `zaltyko-motion-lines` y **Footer** navy.

**Motion:** Stagger `whileInView` (`opacity 0→1, y 12→0, delay i*0.06, ease [0.16,1,0.3,1]`), counters con `useMotionValue`, marquee 1 vez, hover `scale 0.98`, todo tras `prefers-reduced-motion`.

---

## 4. Criterios de aceptación

- Lighthouse: LCP <2.5s (hero `priority`), CLS <0.1, INP <200ms.
- Axe: 0 violaciones AA (contraste `teal #00796B` sobre blanco 4.6:1, focus ring visible).
- Hero sin scroll para CTA en 1280x720 y 390x844.
- Bento: 8 celdas exactas, 2 con foto, sin fila vacía.
- Solo 1 marquee, solo 1 intención por CTA duplicada, eyebrow ≤3 en 9 secciones.
- `prefers-reduced-motion` desactiva loops/parallax.

---

## 5. Ejecución (tras salir de Plan Mode)

1. `Write demo-home.html` con Tailwind CDN + tokens + Motion CSS/JS (standalone).
2. `open demo-home.html` y captura 1440 + 390.
3. Iterar con `Read demo-home.html` hasta pasar checklist §4.
4. Documentar decisiones en `PLAN-frontend.md` y `demo-home/README`.

---

*Plan solo lectura. No se ejecutó `pnpm dev` contra producción ni se tocó `src/`.*
