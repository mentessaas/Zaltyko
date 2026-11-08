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
