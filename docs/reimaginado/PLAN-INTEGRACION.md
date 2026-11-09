# Plan de integración: Zaltyko reimaginado («Magnesio sobre tapiz»)

**Fecha:** 2026-11-08
**Decisión del usuario:** el reimaginado es la base que se sigue; el retoque con ui-indexador y el original quedan como referencia.
**Estado:** plan. Todavía no se ha escrito nada en otro checkout, no hay commits, push ni PR, y nada ha llegado a producción.

## Hallazgos

### 1. La preview y la línea activa no comparten historia
- El reimaginado parte de `d5b8d961` («ci: replay owner bootstrap reference seed», 2026-10-25). La preview recuperada está en ese mismo commit, en `codex/owner-isolated-validation-20261023`. El HEAD de referencia de AGENTS.md (`4f5c57c6`) es un ancestro de este commit.
- `origin/main` (`f84fd6dc`) y `claude/release-candidate-20261107` (`7f75f16a`, último commit hoy a las 16:57, en `trabajos/Zaltyko-main-bridge-20261025`) **no tienen ancestro común** con `d5b8d961`. Git no puede fusionarlas: hay que trasladar los archivos uno a uno.

**Fuente:** `git merge-base`, `git worktree list` y `git rev-list`, ejecutados el 2026-11-08.
**Importancia:** alta. Un merge o un rebase fallaría o mezclaría dos historias.

### 2. Qué se traslada sin conflicto
El reimaginado toca **170 archivos versionados** (+2163 / −2224 líneas) y añade **11 rutas nuevas sin seguimiento**:
- `DESIGN.md` y `PRODUCT.md`;
- `docs/reimaginado/` y `.impeccable/`;
- `src/components/brand/`, `src/components/mat/` y `src/lib/mat/`;
- `src/app/(site)/mat/`;
- `src/components/ui/disclosure-accordion.tsx`;
- la fuente Archivo con su licencia OFL.

Comparados blob a blob con `claude/release-candidate-20261107`:

| Grupo | Archivos | Cómo se integra |
|---|---|---|
| Idénticos en la release candidate | **137** | Se copia el archivo del reimaginado tal cual. Shell, panel, gimnastas, grupos, clases, ajustes y primitivas de UI. |
| Cambiados también en la release candidate | **33** | Fusión a mano, archivo por archivo (ver el punto 3). |
| Ausentes en la release candidate | 0 | — |

**Fuente:** comparación de `git rev-parse <rama>:<archivo>` para cada archivo modificado.
**Importancia:** alta. Cuatro de cada cinco archivos se trasladan sin riesgo de pisar trabajo ajeno.

### 3. Los 33 archivos que hay que fusionar a mano
- **Base del tema (tres archivos):**
  - Archivos: `tailwind.config.mjs` (+15 líneas en la RC), `src/app/globals.css` (+7) y `src/app/layout.tsx` (33 cambios: la RC carga Manrope y Space Grotesk).
  - Por qué van primero: el mundo nuevo depende de los tres.
  - Cómo: conservar lo que añadió la RC y sustituir solo la paleta, las sombras, los radios y la fuente.
- **Web pública (siete archivos):**
  - Archivos: `Navbar`, `Footer`, `pricing.tsx`, `home/HeroSection`, `home/FinalCtaSection`, `src/app/page.tsx` y `src/app/pricing/page.tsx`.
  - Riesgo: la RC cambió aquí el copy de precios («no prometer el cobro de pago mientras la facturación real está cerrada»). Ese copy tiene que sobrevivir a la fusión.
- **Entrada:** `login-form.tsx`, `RegisterForm.tsx` y `dashboard/account-form.tsx`.
- **Área de propietario (diecinueve archivos):** `src/app/owner/*` y `src/components/owner-dashboard/*`, más `OptimizedOwnerProfile`. La RC trabajó mucho aquí (facturas mensuales, cobros SaaS, salud). Mis cambios en esta zona son de estilo: franjas, colores literales y sombras. Lo prudente es **rehacer el estilo sobre la versión de la RC**, no copiar la mía.
- **API:** `src/app/api/academies/[academyId]/settings/route.ts`. Es un arreglo de producto: la variante deportiva ya no cae en «rítmica» por defecto. Hay que comprobar si la RC lo corrigió por otra vía antes de aplicarlo.

**Fuente:** `git diff --stat d5b8d961 claude/release-candidate-20261107` sobre esos archivos.
**Importancia:** alta para la base del tema y el área de propietario; media para el resto.

### 4. Otra rama de la misma historia toca cuatro de estos archivos
`codex/mvp-monthly-invoice-pg-20261025` va 24 commits por delante de `d5b8d961` y modifica:
- `src/app/owner/payments/page.tsx`;
- `OwnerClassesManager.tsx`;
- `OwnerGroupsManager.tsx`;
- `OwnerWorkspaceNavigation.tsx`.

**Importancia:** media. Si esa rama acaba en la preview, chocará con el estilo del reimaginado en esos cuatro archivos.

### 5. Riesgo de secretos al hacer commit
El árbol de `d5b8d961` **no tiene `.gitignore`**. En el reimaginado aparecen como «sin seguimiento», y por tanto entrarían en un `git add -A`, estos archivos:
- `.env.local`, que contiene credenciales;
- `.next/`;
- `tsconfig.tsbuildinfo`.

La release candidate sí tiene `.gitignore`.

**Importancia:** crítica. Cualquier commit en esta copia debe añadir las rutas explícitamente, nunca con `-A` ni con `.`.

### 6. Quién usa cada checkout
- **La preview recuperada:** según AGENTS.md, la usan los frentes Backend, Owner y QA. Ahora está limpia: sin cambios versionados, solo `.DS_Store` y `supabase/.temp/`. AGENTS.md pide no escribir en ella a la vez que otros sin coordinar responsabilidades.
- **La release candidate:** vive en `trabajos/Zaltyko-main-bridge-20261025` y tuvo commits hoy, así que hay trabajo en curso.

## Destino recomendado

**La release candidate (`claude/release-candidate-20261107`), no la preview.**
- **Por qué:** la preview está en una historia sin ancestro común con `main`. Integrar el diseño allí habría que repetirlo después para llegar a `main`. La RC sí es la línea que avanza hacia `main`.
- **Cuándo sí la preview:** solo si su propósito es revisar el diseño junto al backend de octubre. En ese caso la integración es trivial, porque comparten commit base: bastaría aplicar el diff.

## Pasos propuestos (cada uno necesita tu autorización)

1. **Congelar el reimaginado en su rama.**
   - Commit en `claude/reimaginado-20261108`, añadiendo rutas explícitas.
   - Fuera del commit: `.env.local`, `.next/` y `tsconfig.tsbuildinfo`, además de `.impeccable/review/*.png` si no quieres capturas en el repositorio.
   - Sin push.
2. **Rama de integración nueva desde la RC.**
   - Crear `claude/reimaginado-sobre-rc-20261108` desde `7f75f16a`, en un worktree propio.
   - No se toca `Zaltyko-main-bridge-20261025` mientras alguien trabaje en él.
3. **Traslado limpio:** copiar los 137 archivos idénticos y las 11 rutas nuevas, y añadir la fuente Archivo con su licencia.
4. **Fusión manual de la base del tema** (`tailwind.config.mjs`, `globals.css` y `layout.tsx`), conservando lo que añadió la RC.
5. **Fusión manual de la web pública y la entrada**, manteniendo el copy de precios de la RC.
6. **Área de propietario:** rehacer el estilo sobre los archivos de la RC: reglas en lugar de franjas, colores del mundo y sombras de contacto.
7. **Arreglo de la API de ajustes:** aplicarlo solo si la RC no lo resolvió ya.
8. **Verificación local:**
   - `tsc` y eslint;
   - capturas de las 18 pantallas de la comparación;
   - revisión independiente de diseño.
   - vitest, e2e y el build de producción, solo si los autorizas expresamente.
9. **Coordinación:** avisar a los frentes Backend, Owner y QA antes de cualquier cambio en la preview o de abrir un PR. Las tres capas de facturación no se tocan.

## Fuera de alcance
- Cuerpo de `/super-admin`.
- Plantillas de correo, PDF y Stripe.
- Editores de marca y escaparate.
- Despliegue y producción.
- Credenciales, CI y PR históricos.

## Siguiente paso
Tu autorización para el paso 1 (commit local en la rama del reimaginado, con rutas explícitas). Con ella el trabajo queda a salvo antes de empezar a trasladarlo.

## Avance de la integración (2026-11-08)

**Hecho (pasos 2 y 3):**
- Se creó la rama `claude/reimaginado-sobre-rc-20261108` desde `7f75f16a`, con su propio worktree en `trabajos/Zaltyko-reimaginado-sobre-rc-20261108`. El checkout `Zaltyko-main-bridge-20261025` no se tocó: tiene cambios sin commitear de otro frente (privacidad, términos y perfil de lanzamiento) que no coinciden con ningún archivo de este traslado.
- Se trasladaron desde `a2ce70d7` los **153 archivos** sin conflicto: 137 modificados y 16 nuevos. Están en el índice, sin commit.
- Comprobación estática, sin instalar dependencias:
  - todos los imports `@/…` de lo trasladado tienen destino;
  - todos los nombres importados existen en la release candidate;
  - ningún archivo trasladado ha dejado de exportar algo que exportaba en la base.

**Aún no compila visualmente:** lo trasladado usa los tokens (`mat`, `chalk`, `signal`, `ramp`), las clases de material (`.mat-field`, `.floor-label`…) y la fuente Archivo. Todo eso vive en la base del tema, que sigue con la versión de la release candidate hasta el paso 4.

**Dependencias instaladas con autorización expresa (2026-11-08):** `pnpm install --frozen-lockfile` con pnpm 9.15.9 y Node 22.22.3, usando el `pnpmfile.cjs` del repositorio. `pnpm-lock.yaml` y `package.json` no cambiaron.

**Verificado sobre la rama de integración:**
- `tsc --noEmit` en todo el proyecto: exit 0.
- `eslint --quiet` sobre los 146 archivos TypeScript trasladados: exit 0.

**Sin verificar:** las capturas, vitest, e2e y el build de producción.

**Pendiente de fusión manual (34 archivos):**
- `src/app/(site)/Footer.tsx`
- `src/app/(site)/Navbar.tsx`
- `src/app/(site)/home/FinalCtaSection.tsx`
- `src/app/(site)/home/HeroSection.tsx`
- `src/app/(site)/pricing.tsx`
- `src/app/api/academies/[academyId]/settings/route.ts`
- `src/app/dashboard/account-form.tsx`
- `src/app/globals.css`
- `src/app/layout.tsx`
- `src/app/owner/error.tsx`
- `src/app/owner/health-score/setup/page.tsx`
- `src/app/owner/health-score/setup/preview/page.tsx`
- `src/app/owner/loading.tsx`
- `src/app/owner/payments/page.tsx`
- `src/app/owner/setup/page.tsx`
- `src/app/owner/setup/preview/page.tsx`
- `src/app/page.tsx`
- `src/app/pricing/page.tsx`
- `src/components/RegisterForm.tsx`
- `src/components/login-form.tsx`
- `src/components/owner-dashboard/AcademyTargetProfileForm.tsx`
- `src/components/owner-dashboard/InsightInbox.tsx`
- `src/components/owner-dashboard/OwnerAttendanceManager.tsx`
- `src/components/owner-dashboard/OwnerClassesManager.tsx`
- `src/components/owner-dashboard/OwnerDashboardView.tsx`
- `src/components/owner-dashboard/OwnerEnrollmentsManager.tsx`
- `src/components/owner-dashboard/OwnerGroupsManager.tsx`
- `src/components/owner-dashboard/OwnerMonthlyInvoiceWorkspace.tsx`
- `src/components/owner-dashboard/OwnerSaasBillingManager.tsx`
- `src/components/owner-dashboard/OwnerSetupForm.tsx`
- `src/components/owner-dashboard/OwnerWorkspaceNavigation.tsx`
- `src/components/profiles/OptimizedOwnerProfile.tsx`
- `tailwind.config.mjs`
- `PRODUCT.md`

## Paso 4: base del tema y alcance (2026-11-09)

**Decisión del usuario:** todo en «Magnesio sobre tapiz», incluido el panel del club (`/owner`). Sustituye la dirección violeta aprobada el 2026-11-07, recogida en `docs/qa/classes-design-and-shared-ui-2026-11-07.md`.

**Hecho:**
- **Fusión a tres bandas** (base `d5b8d961`, release candidate `7f75f16a`, reimaginado `a2ce70d7`):
  - `tailwind.config.mjs` y `globals.css`: sin conflictos. Se conservan la paleta `z` y `scroll-padding-bottom` de la barra del propietario.
  - `layout.tsx`: un conflicto. Se conserva `OptionalTelemetryBoundary`, que sustituye a Google Ads, Vercel Analytics y SpeedInsights. Se mantienen el contrato de dirección y la fuente Archivo.
- **Tokens `z-*`:** redirigidos al mundo. Son 1.026 usos en 45 archivos y se resuelven sin editar esos archivos.
- **`owner-ui.ts`:** base común adaptada al mundo. Afecta a las ~30 pantallas del panel.
- **Pantallas de `/owner`:**
  - 21 franjas laterales pasan a regla superior.
  - 10 colores literales pasan a valores del mundo.
  - Se comprimen los radios arbitrarios de 7 archivos.
  - La fila de grupo seleccionada queda sin pestaña lateral.
  - Los 19 archivos de `/owner` de la lista manual se quedan con la versión de la release candidate más este estilo. Sus cambios funcionales se mantienen.

**Verificado:**
- `tsc --noEmit`: exit 0.
- `eslint --quiet` sobre `owner-dashboard`, `app/owner`, el tema y el layout: exit 0.
- Servidor local en :3104, con capturas de home, precios, login y `/app/…/dashboard`: carga sin errores de página. `/app` se ve igual que el reimaginado.

**No verificado:** `/owner`, que redirige al login porque pide una sesión real de Supabase. Tampoco vitest, e2e ni el build de producción.

**Siguiente:** fusión manual de la web pública (siete archivos, conservando el copy de precios de la RC), de la entrada (tres archivos), de la API de ajustes y de `PRODUCT.md`.

## Pasos 5 a 7: web pública, entrada, API y PRODUCT.md (2026-11-09)

**Criterio:** la release candidate decidió qué se publica (commit `5c1e32d0`, «restrict first release to essential academy operations»). Su catálogo `src/lib/launch/essential-public-catalog.ts` y el test `tests/audit/public-claims.catalog.test.ts` mandan sobre el texto. Del reimaginado se toma la presentación.

**Hecho:**
- **Home (`src/app/page.tsx`):** se reconstruyó. Los metadatos y el JSON-LD son los de la RC, con `ESSENTIAL_FAQS`. Las secciones del tapiz se alimentan del catálogo:
  - `ModuleRegister` toma sus textos de `ESSENTIAL_FEATURES`, y `MatFaq` de `ESSENTIAL_FAQS`.
  - Afirmaciones retiradas: importación CSV o Excel, lista de espera, portal familiar, evaluaciones con rúbricas, eventos y competiciones, multisede y «2 meses gratis».
  - El bloque «Pide atención hoy» pasa a «Pendiente hoy», con datos que el lanzamiento ya calcula: listas por pasar, cuotas pendientes e inscripciones en prueba.
  - Se quitaron de la home `CountryMatrix` y `LatestGuides`. Se borraron `mat/faq-data.ts` y `mat/LatestGuides.tsx`, que siguen en el commit `a2ce70d7`.
- **Navegación y pie:** los enlaces de la RC (sin Blog, Academias ni Eventos, y con «Identificación del titular») dentro de la estructura del reimaginado.
- **Precios:**
  - Se mantiene `paidCheckoutOpen` con el texto de apertura para academias fundadoras.
  - Se mantienen «Precios sin IVA», «Más capacidad», «Anual · ahorra 2 meses», «Aislamiento por academia» y `aria-label="Periodicidad de precios"`.
  - Se mantiene el JSON-LD con `valueAddedTaxIncluded: false`.
- **Fusiones limpias:**
  - Entrada: login, registro y `account-form`.
  - `HeroSection` y `FinalCtaSection`.
  - API de ajustes: la RC no había corregido el valor por defecto «rítmica», así que el arreglo entra tal cual.
- **El último aviso ámbar del registro** pasa al lavado de señal.
- **`PRODUCT.md`:** se conserva la versión de la RC y se le añade la sección «Dirección visual y alcance público (2026-11-09)». La versión del reimaginado afirmaba capacidades que el lanzamiento no publica.

**Verificado:**
- `tsc --noEmit`: exit 0. `eslint --quiet` sobre `(site)`, home, precios, entrada y la API de ajustes: exit 0.
- Comprobación estática de las cadenas que vigila el test de afirmaciones públicas:
  - en la home, las secciones retiradas, `ESSENTIAL_FAQS` y el portal familiar;
  - en precios, sus nueve cadenas obligatorias y la ausencia de `aria-disabled`;
  - en `(site)`, las cadenas prohibidas.
  - Todo pasa. No se ejecutó vitest.
- Capturas a 1440 y a 390 de home, precios, login y registro: código 200, sin errores de página ni de consola.

**Fusión manual completa: los 34 archivos.** La rama sigue sin commit.

**Pendiente:**
- `/owner` sin revisión visual (pide una sesión real de Supabase).
- vitest, e2e y el build de producción, que necesitan autorización expresa.
- Las demás páginas públicas de la RC (`/features`, `/faq`, módulos y legales) solo heredan colores y fuente del tema; no se rediseñaron una a una.
- La coordinación con los frentes Backend, Owner y QA antes de un PR.

## Paso 8: vitest (2026-11-09, con autorización expresa)

**Primera ejecución:** `vitest run --project web`, con las suites de Postgres excluidas por defecto. Resultado: 5.698 tests pasan, 8 fallan en 7 archivos y 6 se saltan.

**Fallos de comportamiento o texto, corregidos en el código:**
- **`TodayClassesWidget`:** el botón vuelve a decir «Pasar asistencia» (contrato de navegación a la hoja de asistencia).
- **`UpcomingClasses`:** el título usa `Calendario de ${classLabelPlural}`, con la terminología de la academia.
- **`DashboardPage`:** mientras la academia está en puesta en marcha, el panel del siguiente paso va antes de «Hoy» y de las acciones rápidas (contrato de prioridad del onboarding).
- **`AlertsWidget`:** fallo real de modo oscuro. El texto `text-foreground` quedaba sobre fondos literales claros. Ahora cada severidad tiene su variante `dark:` y el panel usa `dark:bg-card`.
- **`Button`, variante destructiva:** el hover usa `bg-signal-ink/90` en lugar de un color literal.

**Aserciones que fijaban clases del diseño anterior,** reescritas con los equivalentes del sistema nuevo. Su intención se mantiene y cada una lleva un comentario:
- `alerts-theme`: de `bg-amber-500/10` a `dark:bg-muted` y `dark:bg-card`.
- `components-critical`: de `bg-zaltyko-coral` a `bg-signal-ink`.
- `public-navbar-mobile-menu`:
  - el velo `bg-zaltyko-navy/25` pasa a `bg-mat-night/40 lg:hidden`;
  - `shadow-soft lg:flex` pasa a `gap-1 lg:flex`;
  - el hover pasa a `hover:bg-white/10`;
  - se sigue prohibiendo `md:flex`.
- `public-marketing-theme`: la barra pública es siempre de tapiz oscuro. En lugar de pedir `dark:`, el test comprueba `mat-field-deep` y `text-white`.

**Segunda ejecución:** 5.706 tests pasan y 6 se saltan, en 715 archivos (exit 0). `tests/audit/public-claims.catalog.test.ts` pasa de verdad, no solo en la comprobación estática.

**Hallazgo abierto: el modo oscuro de la app no está diseñado.** Es anterior a la integración: el reimaginado solo se revisó en claro. Capturas en modo oscuro de `/app`:
- la barra superior sigue blanca y el texto de ejemplo del buscador no se ve;
- los paneles reglados quedan blancos sobre noche;
- los nombres de gimnasta, «Editar» y las pestañas quedan en azul tapiz sobre noche, con poco contraste;
- los chips «Activo» casi no se leen.

Hay que decidir entre diseñar el modo oscuro del mundo o desactivarlo temporalmente.

## Paso 9: modo oscuro del mundo (2026-11-09)

**Decisión del usuario:** diseñar el modo oscuro en lugar de desactivarlo.

**Hecho:**
- **The Night Mat Rule en `globals.css`:** 25 reglas para las clases literales del mundo y 13 para los alias `zaltyko-*`. Están en `@layer components`, así que las variantes `dark:` explícitas mandan. Dentro de superficies de tapiz se restaura el valor de día. El detalle está en `DESIGN.md`, sección «Modo oscuro».
- **Retoques puntuales:** los puntos de «Pendiente hoy» de la home pasan a `dark:bg-mat-lane`. Las alertas del panel ya se habían arreglado en el paso 8.

**Verificado:**
- Capturas en oscuro a 1440 de panel, gimnastas, grupos, entrenamientos, ajustes, home, precios y login: legibles y sin errores de página.
- Las mismas pantallas en claro, sin cambios.
- `tsc`: exit 0. eslint: exit 0.
- vitest `web`: 5.706 tests pasan y 6 se saltan, en 715 archivos (exit 0).

**No verificado:**
- `/owner` de noche, porque pide una sesión real de Supabase.
- `/super-admin` y las páginas públicas secundarias.

## Paso 10: páginas secundarias, superadmin y coordinación (2026-11-09)

**Coordinación:** por indicación del usuario, se trabaja con la sesión «Zaltyko development continuation» y no con los frentes de Codex.
- **Esa sesión, revisión de backend y contratos, sin ejecutar nada pesado:**
  - aprobó el cambio de `settings/route.ts`;
  - revisó en lectura los contratos E2E de geometría de `/owner`;
  - llevará el commit a `codex/mvp-main-bridge-20261025` (PR 234) y lanzará las CI, para que no haya dos escritores.
- **Esta sesión, diseño y UI.**
- **Decisión de alcance:** el usuario confirmó también allí «Todo en Magnesio» para `/owner`.

**Hecho:**
- **`/owner` (`owner-ui.ts`),** según la revisión de contratos E2E:
  - `pageTitle` a 28 px en móvil y 40 px desde `lg`;
  - títulos de sección y de tarjeta en `text-xl sm:text-2xl`;
  - cifra de métrica escalonada `text-3xl sm:text-4xl lg:text-5xl`;
  - todos con `min-w-0 break-words [overflow-wrap:anywhere]`.
  - La navegación de `/owner` no tiene cambios respecto a la RC: barra móvil de 5 objetivos, enlaces de Operaciones y landmarks. Las mayúsculas van solo por CSS, así que los nombres exactos que buscan los tests no cambian.
- **Páginas secundarias activas** (`/features`, `/ayuda`, `/contact`, `/terminos`, `/politica-privacidad`, `/faq`, `/auth/forgot-password`, `/integraciones`, `/docs`, `/changelog`):
  - capturadas de día y de noche a 1440 y a 390, sin desborde horizontal ni errores;
  - en `FeaturesSection`, el rótulo «Impacto» y los ticks eran azul oscuro sobre la banda azul; pasan a azul de calle, y la pestaña activa lleva cinta blanca. Se mantiene `bg-zaltyko-primary-dark`, que exige un test.
  - El resto de rutas antiguas (`/blog`, `/comparativas`, módulos, clústeres SEO…) redirige a `/features` o da 404 por el recorte del lanzamiento.
- **`/super-admin`** (oscuro siempre):
  - cabecera sin antetítulo en píldora ni título en dos tonos;
  - KPI en marcador reglado de noche, en lugar de `DashboardCard` blancas con franja;
  - indicadores secundarios en celdas de noche;
  - series de los gráficos con la paleta del mundo;
  - lateral con `ZaltykoLockup` y el ítem activo en cinta blanca.
- **Test nuevo** en `tests/api-academy-settings-sport-config.test.ts`, pedido por la revisión de backend. Un GET sin variante guardada da `artistic_female` para el tipo artística y `general` para el tipo general o desconocido; si hay variante guardada, se respeta.

## Paso 11: revisión de la otra sesión (2026-11-09)

**Integrado:** `dcf97043` entró en la PR 234 por fast-forward. Encima, la otra sesión añadió `cc289020`: `DIRECTION_CONTRACT` ya no se pinta como div oculto en cada página, porque eran notas internas visibles para cualquier visitante. Ahora vive en `DESIGN.md`. Las CI están en marcha sobre `cc289020`.

**Observaciones de la revisión, corregidas en esta rama encima de `cc289020`:**
1. **Colores de marca por defecto** (`academy-settings-model.ts`): la reasignación masiva de colores literales había cambiado también los colores de marca por defecto de la academia. Son contenido de la academia, no interfaz, y una academia sin marca guardada los habría persistido al pulsar Guardar. Vuelven a los valores de la RC (`#1FC7B6`, `#2B2E83`, `#FF6B57`). En el resto de `src` no cambió ningún otro valor por defecto de marca; solo `themeColor`, que es interfaz.
2. **`noticeError` frente a `noticeWarning`:** el error lleva ahora regla superior de 3 px en tinta de señal y texto semibold, así que no depende solo del color.
3. **`chipSuccess`:** pasa a cinta sólida de tapiz con texto blanco. «Al día» y «pagado» vuelven a destacar y siguen legibles de noche.

**Verificado:** `tsc` y eslint, exit 0. vitest de owner, ajustes y marca: 139 archivos y 1.597 tests, todos pasan.
