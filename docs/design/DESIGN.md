---
name: Zaltyko
description: SaaS multi-tenant para academias deportivas (gimnasia artística/rítmica) — un sistema de color calmado y ordenado, no un panel dev-tool.
colors:
  primary: "#00796B"        # Deep Teal — acción, marca, links, botones primarios, focus
  primary-deep: "#00695C"   # hover/active del acento principal; stop de gradiente del brand mark
  electric: "#1FC7B6"       # Electric Teal — acento vibrante reservado a focus-ring, charts, badges puntuales, glow
  indigo: "#2B2E83"         # Deep Indigo — color de dato (charts, info densa) y acento secundario
  coral: "#FF6B57"          # Coral Accent — danger/destructive + foco de atención 1 vez por pantalla
  amber: "#FF6B57"          # alias legacy del token coral (alias = mismo valor, no nuevo color)
  navy: "#0F172A"           # Midnight Navy — texto principal y superficie dark
  bg: "#F8FAFC"             # Quiet Canvas — fondo de página light
  bg-quiet: "#F5F8F8"       # fondo `--background` (root CSS var), un paso más cálido que bg
  paper: "#FFFFFF"          # superficies de card/panel light
  border: "#CBD5E1"         # border calmado (mist)
  border-quiet: "#E2E8F0"   # un paso más discreto, para divisores internos
  text-main: "#0F172A"
  text-secondary: "#475569"
  text-light: "#64748B"
  success: "#16A34A"
  warning: "#D97706"
  danger: "#DC2626"
typography:
  display:
    fontFamily: "'Space Grotesk', ui-sans-serif, system-ui"
    fontWeight: 600
  body:
    fontFamily: "'Inter', ui-sans-serif, system-ui"
    fontWeight: 400
  numeric:
    fontFamily: "'Inter', ui-sans-serif, system-ui"
    fontWeight: 600
    tabularNums: true   # cifra grande en dashboard = Inter con tabular-nums, NO mono
rounded:
  control: "6px"   # botones, inputs, chips
  card: "10px"     # tarjetas, filas, paneles
  modal: "16px"    # modales, sheets, overlays
  pill: "9999px"   # badges, eyebrows, status chips
spacing:
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.control}"
    padding: "0.5rem 1rem"
  button-primary-hover:
    backgroundColor: "{colors.primary-deep}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.text-main}"
    rounded: "{rounded.control}"
    padding: "0.5rem 1rem"
  card:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.card}"
    padding: "1.25rem"
  surface-elevated:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.card}"
    padding: "1.25rem"
    shadow: "shadow-soft"
  surface-subtle:
    backgroundColor: "{colors.bg}"
    rounded: "{rounded.card}"
    padding: "1.25rem"
---

# Design System: Zaltyko

> **Estatus:** v1 — `in_progress` (ZAL-567, 2026-08-10). Documento vivo. Cambios en tokens → PR con diff en `tailwind.config.mjs` + `src/app/globals.css` y entrada en `vault/06-Roadmap-y-Tareas/Changelog interno.md`. No reemplaza `docs/design-system.md` (legacy morado) ni `docs/styleguide.md` — esos quedan `superseded` y archivados tras migración completa a este documento.
>
> **Auditoría de gradients:** ver [GRADIENT_AUDIT.md](./GRADIENT_AUDIT.md). Lista exhaustiva con disposición (eliminar / documentar excepción) — cierre de este ítem.

## Overview

**Creative North Star: "Quiet operating room for academies"**

Zaltyko es un SaaS multi-tenant para academias deportivas (gimnasia artística y rítmica, expandible). La dirección visual vigente — explícita en `vault/00-Inicio/Guia de trabajo para agentes.md` y `vault/01-Producto/` — exige que el producto se sienta **calmado, ordenado, hecho por gente que entiende la operación de una academia** — no un panel dev-tool frío, ni un portfolio de marketing agresivo.

El sistema rechaza: gradient text, glass-for-its-own-sake, neon/alternate accent themes, más de un sistema de card/botón/tabla en paralelo, y cifras-mono. Motion es contenido — reveals con propósito, no marquees ni pulses compitiendo por atención.

**Características clave:**

- **Un acento interactivo** (Deep Teal) y un acento de dato (Deep Indigo), sobre una base neutral quiet (F8FAFC / FFFFFF). Nada de arcoíris de acentos.
- **Las cifras son la hero en el dashboard.** `Inter` con `tabular-nums` en columnas de monto; nunca `font-mono` (mono se reserva para IDs, hashes, atajos de teclado literal).
- **Un sistema de botón + un sistema de card.** Las 19 listas/tablas divergentes convergen en el `DataTable` unificado ([ZAL-559](https://github.com/mentessaas/Zaltyko/issues/ZAL-559) → `src/components/ui/data-table.tsx`).
- **`backdrop-filter`/`.glass-panel` se reserva al shell del dashboard** (topbar fijo, dropdowns flotantes) — no decoración general de cards.
- **Motion:** todas las animaciones respetan `prefers-reduced-motion` (ya activo globalmente en `globals.css`).
- **Cero hex/rgb literales en componentes.** Toda la pintura pasa por tokens semánticos (`bg-background`, `text-foreground`, `bg-zaltyko-primary`, etc.). Excepción documentada: chart series (Recharts) usan `--chart-N` por necesidad de la librería.

## Colors

### Primary (un solo acento interactivo)

- **Deep Teal** (`#00796B`): el acento principal — botones primarios, links, focus rings, selection. Aplicar con mesura; no es color de fondo.
- **Deep Teal Deep** (`#00695C`): hover/active del primario, y stop de gradiente del brand mark (`hero-glow` en `tailwind.config.mjs`).

### Secondary (un acento de dato, dos roles)

- **Deep Indigo** (`#2B2E83`): acento secundario — color de dato (charts info/secondary series), backgrounds de página `#` módulos (`bg-indigo/5`), badges de información densa. **No** se usa como botón interactivo (Deep Teal ya cubre ese rol).
- **Electric Teal** (`#1FC7B6`): acento vibrante — reservado a `ring` (focus-visible), charts de highlight, glows puntuales (`shadow-glow`), top strips premium en cards seleccionadas. No es un color de body ni de botón.

### Status

- **Coral Accent** (`#FF6B57`): `destructive` + foco de atención (badges "urgente", toasts de error). Máximo **una** ocurrencia visible por pantalla — si hay más, alguna pasa a amber.
- **Amber** (`#FF6B57` hoy, mismo hex que coral): alias legacy del token coral. Decisión pendiente: reasignar a un amarillo real (`#F59E0B`) cuando se justifique por necesidad de producto. Mientras tanto, **coral y amber son el mismo color** — los dos nombres existen en `tailwind.config.mjs` para no romper call sites, pero resuelven al mismo hex.
- **Success / Warning / Danger**: ver paleta de status estándar (`success: #16A34A`, `warning: #D97706`, `danger: #DC2626`). Contrast WCAG AA verificado contra `bg` (`#F8FAFC`) y `paper` (`#FFFFFF`).

### Neutrales

- **Quiet Canvas** (`#F8FAFC`): fondo de página light. `--background` en `globals.css` resuelve a `#F5F8F8` (un paso más cálido, para reducir contraste duro).
- **Paper** (`#FFFFFF`): superficie de card/panel light.
- **Border** (`#CBD5E1` — `zaltyko-mist`): divisor por defecto. `border-quiet` (`#E2E8F0`) para divisores internos menos prominentes.
- **Text main / secondary / light**: `#0F172A` / `#475569` / `#64748B`. **Ningún texto de body puede quedar por debajo de 4.5:1 contra su superficie** — gateado por axe.

### Dark mode

`B5 modo oscuro real` está **diferido** (ver `vault/06-Roadmap-y-Tareas/Decisiones.md` 2026-08-10) — no hay issue de implementación. Lo que existe en `globals.css` es un swap de tokens para superficies internas del dashboard cuando se navega con `prefers-color-scheme: dark`, suficiente para las pantallas internas pero no pensado como tema público. Cuando se active el modo oscuro real, debe seguir la misma regla: **un solo acento interactivo (Deep Teal → Electric Teal en dark para contraste)** + la misma estructura de secondary/status. Nada de "tema alternativo neón".

### Named Rules

- **The One Accent Rule.** Exactamente **un** color interactivo (Deep Teal). No se introduce un segundo acento neón/alternativo — fue removido en la fase 2 (2026-07-14) porque un acento brillante lee como chrome genérico de dev-tool, la anti-referencia explícita del sistema.
- **The Two-Role Secondary Rule.** Deep Indigo = dato, Electric Teal = highlight. **Nunca** ambos como fill de botón primario.
- **The Status Quota Rule.** Máximo una presencia de destructive (Coral Accent) por viewport. Más de uno diluye la señal de urgencia.

## Typography

**Body / UI:** Inter (variable, weights 400–700). Cargado vía `next/font/google` con subset latin, fallback `ui-sans-serif, system-ui`.
**Display:** Space Grotesk (variable, weight 600). Reservado a h1/h2 de landing y títulos de sección importantes. Body y chrome en Inter — el contraste grotesk-vs-grotesk no es el diferenciador, sí lo es contra cifras grandes en dashboard.
**Mono:** NO se usa `font-mono` salvo literal code/IDs/hashes. Cifras en columnas → `font-variant-numeric: tabular-nums` sobre Inter (clase Tailwind `tabular-nums`). Esta regla es la versión Zaltyko de "numbers are the hero" de BuilderHunt — el siguiente paso de diferenciación tipográfica (Fase 3, no en scope de ZAL-567) es reservar un `font-display-numeric` específico para KPI grandes.

### Hierarchy

- **Display / Hero**: 600 weight, `text-3xl`–`text-5xl`, tracking normal. Landing hero headlines + section titles principales.
- **Title**: 600 weight, `text-xl`–`text-3xl`. h2/h3 del dashboard, títulos de card.
- **Body**: 400 weight, `text-sm`–`text-base`. Default copy.
- **Numeric emphasis**: 600 weight + `tabular-nums`, `text-2xl`+ para KPI. NO `font-mono`.
- **Label**: 500–600 weight, `0.75rem`–`0.875rem`, tracking levemente positivo. Eyebrows, badges uppercase, section labels.

## Layout

Dos anchos de contenedor en `src/app/(site)/`:

- `.container` (max 1280px) para secciones generales.
- `.container-narrow` (max 800px) para copy de lectura (FAQ, sobre-nosotros, ayuda).

Padding lateral `1.25rem` en mobile, `2rem` en ≥md. Section rhythm: `py-20` (5rem) en general, `py-24`/`py-28` para hero/demos, `py-12` para dashboards internos (densidad > breathing).

El shell del dashboard es topbar fijo (z-50) + sidebar fija (z-40) + scroll content — igual que BuilderHunt. El colapso responsive bajo `<md` se trabaja en [ZAL-554](https://github.com/mentessaas/Zaltyko/issues/ZAL-554) (B4 accesibilidad multi-viewport).

## Elevation & Depth

Híbrido: superficies planas con sombra ambient al rest, más un tratamiento glass reservado al shell del dashboard. La sombra **no se propaga** a cards de contenido — eso ya está consolidado en `tailwind.config.mjs` (Fase 2, 2026-07-14).

### Shadow Vocabulary

- **shadow-soft** (`0 2px 8px rgba(15, 23, 42, 0.06)`): base de `.card` y `surface-elevated`.
- **shadow-medium** (`0 8px 24px rgba(15, 23, 42, 0.08)`): overlays/modales.
- **shadow-brand** (`0 8px 30px rgba(0, 121, 107, 0.12)`): hover de cards premium. **Solo** en hover/active, no en reposo.
- **shadow-glow** (`0 0 0 3px rgba(31, 199, 182, 0.15)`): focus ring tint del accent electric.
- **shadow-indigo** (`0 8px 30px rgba(43, 46, 131, 0.12)`): reservado a cards de dato secundario.
- **shadow-lift** (`0 16px 40px -12px rgba(0, 121, 107, 0.25)`): reservado a CTAs primarios en hover fuerte.

Cualquier sombra con tinte de marca (`brand`, `indigo`, `lift`, `glow`) es **acento puntual**, nunca sombra base de reposo de un componente nuevo.

### Named Rules

- **The Shell-Only Glass Rule.** `backdrop-filter` y `.glass-panel` están reservados al shell del dashboard (topbar, dropdowns flotantes). No decoración general de cards. Lo que ya existe como `.glass-card`/`glass-panel` en `globals.css` queda **deprecated** y debe consolidarse en `.surface-elevated` + `.card-hover` en próximas migraciones.

## Shapes

Esquinas generosas y suaves en todo el sistema: `6px` para controles (botones, inputs, chips), `10px` para tarjetas y paneles, `16px` para modales y sheets. Pills (`9999px`) para badges y eyebrows. Borders finos (1px) y bajo contraste al rest, fortaleciéndose solo en hover/focus — nunca decorativos.

## Components

### Buttons

- **Forma:** `6px` radius (`rounded-control`).
- **Primary:** fondo Deep Teal sólido, texto blanco, `shadow-brand` en hover.
- **Secondary:** fondo paper, texto `text-main`, borde `border-quiet`.
- **Ghost:** transparente, texto muted, background tint al hover (`bg-muted`).
- **Destructive:** fondo Coral Accent sólido, texto blanco. Solo en flujos de borrado irreversibles.
- **Hover / Focus:** primary lift + brightness; todo elemento interactivo recibe el shared `:focus-visible` ring (2px ring Electric Teal + 2px offset).

### Badges

- **Forma:** pill (`9999px`), fondo accent-soft (Electric Teal /10), texto accent, borde fino accent-tinted.
- **Status:** pill color = semántica (success/warning/danger/info). Máximo **una** badge destructive por viewport.
- **Source badges** (futuro, para integraciones externas tipo BuilderHunt): cada fuente externa mantiene su brand tint — excepción documentada cuando se introduzca.

### Cards / Containers

- **Esquinas:** `10px` radius (`rounded-card`).
- **Fondo:** Paper.
- **Shadow:** `shadow-soft` al rest; `shadow-brand` solo en `.card-hover` al hover.
- **Border:** fino, `border-quiet` (`#E2E8F0`); se fortalece a `border` (`#CBD5E1`) en hover.
- **Padding interno:** `1.25rem` (20px) por defecto; `1.5rem` (24px) para cards anchas (dashboard tiles).

### Inputs / Fields

- **Estilo:** fondo paper, borde `border-quiet`, `6px` radius, inset shadow ligera para profundidad.
- **Focus:** borde pasa a Deep Teal + `3px` Electric Teal glow ring (`shadow-glow`).
- **Error:** borde destructive + texto helper en Coral Accent.

### Navigation

- Dashboard shell: topbar fijo + sidebar fija con `.glass-panel` (única zona con backdrop-filter).
- Public/landing: nav superior plana (sin glass), colapsa a disclosure único bajo `<md`.

## Tables (DataTable unificado — ZAL-559)

`src/components/ui/data-table.tsx` es la **única** implementación de tabla en Zaltyko. Migración en curso: Atletas + Clases ya migradas ([ZAL-559 commit `e5af0d077`](https://github.com/mentessaas/Zaltyko/commit/e5af0d077)). Resto de pantallas (Pagos, Mensajes, Reportes) entran en waves siguientes.

**`role="grid"` con divs + CSS grid** sobre `<table>` nativo — la virtualización interna necesita spacers + `translateY`, que pelean con sticky group headers y column alignment. El costo es owns el ARIA indices; axe-core valida en CI.

**Cuatro estados explícitos:** loading / error / empty / filtered-empty. **No** se colapsan. Empty ≠ filtered-empty — un empty table dice "no hay nada, crea el primero"; un filtered-empty dice "el filtro no matcheó, limpia para ver todo". Mismo patrón que BuilderHunt.

**Cifras = `tabular-nums`, nunca `font-mono`.** Una columna de montos con `font-mono` lee como dev-tool, no como SaaS operativo. La regla "mono solo para literal code/IDs" se aplica también acá.

## Do's and Don'ts

### Do

- **Do** mantener exactamente un acento interactivo (Deep Teal) y dos roles para el secundario (Deep Indigo = dato, Electric Teal = highlight).
- **Do** reservar `backdrop-filter`/`.glass-panel` al shell del dashboard.
- **Do** respetar `prefers-reduced-motion` para toda animación CSS o JS — ya activo globalmente en `globals.css` (líneas 275-287).
- **Do** rutear todo color UI por tokens semánticos (`bg-background`, `text-foreground`, `bg-zaltyko-primary`, `text-foreground`, etc.). Nunca un hex/rgb literal en un componente.
- **Do** usar `tabular-nums` sobre Inter para cifras en columnas o KPI — nunca `font-mono`.

### Don't

- **Don't** reintroducir **gradient text** (`.text-gradient`, `bg-clip-text text-transparent`). Color sólido del accent únicamente. Esta regla ya está vigente — `.text-gradient` en `globals.css` queda en el archivo solo porque el Hero landing lo usa, y la disposición es "eliminar" según el audit (ver `GRADIENT_AUDIT.md`).
- **Don't** agregar un segundo acento interactivo neón/alternativo.
- **Don't** apilar más de un sistema de card / botón / tabla en paralelo. Cualquier lista debe pasar por `DataTable` (ZAL-559). Cualquier card debe usar `rounded-card` + `shadow-soft` + `border-quiet`.
- **Don't** usar `font-mono` fuera de literal code/IDs/hashes.
- **Don't** pintar destructive (Coral Accent) más de una vez por viewport.
- **Don't** introducir un gradiente de marca sin documentarlo como excepción en este `DESIGN.md` (ver sección "Excepciones documentadas" abajo).

## Excepciones documentadas (gradients con razón)

Por diseño, Zaltyko **rechaza** gradients sueltos. Las siguientes ocurrencias son la **lista cerrada** de excepciones permitidas mientras se complete la limpieza visual. Toda nueva excepción requiere entrada en `vault/06-Roadmap-y-Tareas/Changelog interno.md` + actualización de este `DESIGN.md` + issue dedicado.

Ver la lista exhaustiva con path, línea, racional y disposición (mantener / eliminar / reemplazar) en [`GRADIENT_AUDIT.md`](./GRADIENT_AUDIT.md).

Resumen ejecutivo de las categorías de excepción permitidas:

1. **Top strip de cards premium** (1px altura, opacity 60→100 en hover): `GroupCard`, `EventsList`, `DashboardCard`. Patrón estable, costo de removerlo = pérdida de affordance "esta card es interactiva". **Mantener**, consolidar en utility `.card-strip` en migración futura.
2. **Page-header bg fade** (`bg-gradient-to-b from-zaltyko-primary/5 to-transparent`): 7 páginas públicas (sobre-nosotros, contact, ayuda, features, integraciones, academias, my-dashboard). **Mantener** — es el patrón de respiración entre header y contenido. Si se quisiera eliminar, sería sustituyendo por un `surface-subtle` con padding, no por nada.
3. **Background ambient del `<body>`** (`radial-gradient(circle at 10% 0%, rgba(31, 199, 182, 0.05), transparent 24rem)`): un radial-gradiente al 5% de opacity que da "luz superior". **Mantener**, mover a variable `--ambient-radial` para poder tunear desde aquí.
4. **Shimmer de skeletons** (`linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)`): animación pura de loading, no se ve en estado de reposo. **Mantener** — `prefers-reduced-motion` ya la pausa.
5. **`.animate-shimmer` keyframes** en `globals.css`: idem, animación. **Mantener**.
6. **`hero-glow` (background-image)** en `tailwind.config.mjs`: el glow del hero landing, `linear-gradient(135deg, rgba(43, 46, 131, 0.16), rgba(31, 199, 182, 0.12))`. **Mantener** — está detrás del copy, no compite con texto.

**Eliminaciones obligatorias (ver audit):**

- `.text-gradient` utility en `globals.css` y su único consumidor en `Hero.tsx` ("sin caos ni Excel"). Reemplazar por texto sólido en Deep Teal (`text-primary`).
- `bg-gradient-radial` en Hero.tsx (orbe difuso) y LoginForm.tsx (decoración lateral): sustituir por `bg-muted` + halo con `box-shadow` simple o aceptar la pérdida visual.
- `bg-gradient-to-br` en iconos del `PlanComparison` ("pro", "premium"): sustituir por fondo sólido (`bg-primary` o `bg-coral`) — el gradient acá no comunica nada que un sólido no comunique.
- `bg-gradient-to-br from-amber-50` en el banner de onboarding de `MyDashboardPage.tsx` (línea 244): sustituir por `bg-amber-50` sólido (tailwind ya tiene el color via `amber-*`).

**Excepciones que requieren decisión humana (no resueltas en ZAL-567):**

- `ClusterCTASection.tsx` (líneas 49-54): `from-red-600 via-red-700 to-rose-800` — esto **no** es Zaltyko brand, es branding de un cluster temático (gimnasia artística vs rítmica, etc.). El audit lo marca como "excepción externa" y la decisión es del cluster owner, no de Design System.
- `bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900` en `DemoSection.tsx` (línea 40): placeholder de video. No es marketing — es estado vacío honesto. **Mantener**, documentar.
- `bg-gradient-to-b from-blue-50 to-white` en `faq/page.tsx` (línea 145): rompe la paleta — usa `blue-50` de Tailwind palette, no Zaltyko brand. **Sustituir** por `bg-zaltyko-primary/5` para alinear con el resto de headers públicos.

---

## Cómo se traduce a Tailwind v3 (estado actual)

Zaltyko usa Tailwind v3 + CSS custom properties. Los tokens viven en dos lugares sincronizados:

1. **`tailwind.config.mjs`** — `theme.extend.colors.zaltyko` (paleta cruda), `borderRadius` (control/card/modal), `boxShadow` (soft/medium/brand/indigo/lift/glow), `backgroundImage.hero-glow`.
2. **`src/app/globals.css`** — `:root` con CSS variables (`--primary`, `--secondary`, `--ring`, `--chart-1..5`, `--background`, `--foreground`, `--radius`) en espacio HSL para shadcn/ui.

El mapping en runtime:

| Token semántico | Tailwind class | CSS var |
| --- | --- | --- |
| Acento interactivo | `bg-primary`, `text-primary` | `--primary` (172 100% 24% = Deep Teal) |
| Acento highlight | `ring-ring`, `bg-zaltyko-electric` | `--ring` (175 74% 45% = Electric Teal) |
| Acento dato | `bg-secondary`, `text-secondary` | `--secondary` (238 51% 34% = Deep Indigo) |
| Destructive | `bg-destructive` | `--destructive` (7 100% 67% = Coral) |
| Background light | `bg-background` | `--background` (210 33% 97%) |
| Foreground light | `text-foreground` | `--foreground` (222 47% 11%) |
| Border | `border-border` | `--border` (214 24% 88%) |
| Radius base | `rounded-lg` | `--radius` (1.125rem) |

Cualquier nuevo token se agrega primero a `tailwind.config.mjs` (paleta cruda), después a `:root` en `globals.css` (variable HSL para shadcn), y por último se referencia en este documento. Tres lugares sincronizados, una sola fuente de verdad visual.

## Cambios pendientes (no en scope de ZAL-567)

Marcados como **fuera de scope** para que un agente futuro los aborde sin volver a litigar el sistema entero:

- **`docs/design-system.md` y `docs/styleguide.md`** son legacy (paleta morada vieja) — marcados como `superseded` al cierre de ZAL-567 y movidos a `docs/design/archive/` para evitar confusión con este `DESIGN.md`.
- **Dark mode real (B5)**: diferido sin issue. Cuando se abra, debe respetar The One Accent Rule (Deep Teal → Electric Teal en dark para contraste) y la misma estructura secondary/status.
- **`font-display-numeric` reservado para KPI grandes**: Fase 3 de diferenciación tipográfica. Hoy se cubre con `Inter` + `tabular-nums`.
- **Reasignación de `amber`**: hoy es alias de coral. Si producto necesita amarillo real (`#F59E0B`), abrir issue con racional de uso.
- **Source badges para integraciones externas**: patrón de BuilderHunt. Zaltyko no tiene integraciones externas con brand propio todavía; cuando lleguen, siguen la regla "excepción documentada por fuente".

---

**Owner de este documento:** Product Designer / UX Researcher (agent `175643b5-5564-4f1a-b016-34e5c4190b2b`). Cambios requieren PR + changelog + decisión del Product Lead si tocan paleta o named rules. Cambios cosméticos (copy, ejemplos) los puede hacer el dueño directo.