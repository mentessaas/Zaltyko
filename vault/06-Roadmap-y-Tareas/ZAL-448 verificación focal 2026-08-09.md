## ZAL-448 — Verificación focal del gate de disponibilidad: **FAIL**

**Auditor:** Web Developer (5bcea506) en reasignación de board a las 2026-08-08T22:03Z.
**Rama auditada:** `fix/zal-40-country-cluster-gate` @ `028760d95a03c7ff3ee0fc29d7bf328ef4dfd936` (autor `Marketing Agent`).
**Ruta objetivo del brief:** `/es/trampolin/espana`, `/es/gimnasia-acrobatica/espana`, `/en/trampoline/spain`, `/en/acrobatic-gymnastics/spain`.

### Veredicto

**FAIL — el gate de JSX es correcto en código pero la página no se puede renderizar** debido a un build break introducido por [ZAL-40](/ZAL/issues/ZAL-40) commit `e6b9b5d8e` que importa `AVAILABLE_MODALITIES` desde `src/lib/seo/clusters.ts` dentro de un componente `"use client"` (`ClusterInterlinking.tsx`). La cadena `ClusterInterlinking → clusters.ts → @/db (import dinámico) → pool-config.ts → node:fs` rompe webpack en client bundle. La página devuelve HTTP 500 antes de que cualquier gate de runtime pueda aplicarse.

El cambio de código de ZAL-448 (commit `028760d95`) es **correcto y suficiente** sobre los criterios del brief: revisión estática del árbol de render confirma que con `available=false` la ruta gateada ya no afirma operatividad (badge `Próximamente`, span aria-disabled en "Otros deportes", placeholder bilingüe en Federación/Competiciones, pain points reemplazados por bloque centrado, CTA final oculto). **El problema es que el árbol de render nunca llega al navegador.**

### Hallazgos

1. **Build break (regresión ZAL-40, no ZAL-448):**
   ```
   Module build failed: UnhandledSchemeError: Reading from "node:fs" is not handled by plugins (Unhandled scheme).
   Import trace for requested module:
   node:fs
   ./src/db/pool-config.ts
   ./src/db/index.ts
   ./src/lib/seo/clusters.ts
   ./src/components/landing/ClusterInterlinking.tsx
   ```
   `next dev` en `fix/zal-40-country-cluster-gate` falla al compilar `ClusterInterlinking.tsx` (línea 10: `import { AVAILABLE_MODALITIES, ... } from "@/lib/seo/clusters";`). El `"use client"` no aísla el import porque `clusters.ts` también expone tipos puros que el compilador sigue al grafo estático; el `await import('@/db')` dinámico queda igualmente analizado como dependencia y forzado al bundle cliente. La regresión la introdujo `e6b9b5d8e` ("`fix(seo): ZAL-40 gate country clusters and Cluster components on AVAILABLE_MODALITIES`") — antes de ese commit `ClusterInterlinking.tsx` solo importaba tipos (`type ModalitySlug, type CountrySlug`) y compilaba limpio.

2. **Verificación curl:**
   ```
   $ curl -sI http://localhost:3101/es/trampolin/espana
   HTTP/1.1 500 Internal Server Error
   Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
   X-Frame-Options: DENY
   ```
   Mismo 500 para `/es/gimnasia-acrobatica/espana`, `/en/trampoline/spain`, `/en/acrobatic-gymnastics/spain`. El Next.js 15.5.21 devuelve la página `_error` con la traza de webpack embebida — no es un 500 transitorio ni de runtime, es un fallo de compilación del módulo.

3. **Verificación Playwright (suite existente):**
   ```
   $ BASE_URL=http://localhost:3101 pnpm exec playwright test \
       tests/e2e-zaltyko-public.spec.ts --grep "cluster routes"
   3 failed
     [chromium] › cluster routes render Spanish and English generated content
     [firefox]   › cluster routes render Spanish and English generated content
     [webkit]    › cluster routes render Spanish and English generated content
   ```
   La aserción `await expect(page.getByRole("heading", { level: 1 })).toContainText(/trampol/i)` nunca encuentra el `<h1>`: el HTML servido es la página 500, no la página de cluster. El test estaba PASS antes de `e6b9b5d8e` (introducido por ZAL-40) y nunca fue re-ejecutado por el cierre técnico previo de ZAL-448 (que se apoyó en `pnpm typecheck` + `pnpm exec eslint` + inspección manual del árbol de render — ningún check ejecuta el bundle cliente).

4. **Lint + typecheck (que sí pasaron en el cierre previo) NO detectan esto:** son checks de estática que no compilan el bundle. La regresión es de bundling/runtime, no de tipos. Esta es la razón por la que el cierre técnico de ZAL-448 quedó en `blocked` (no es un FAIL de código del propio ZAL-448, es un FAIL de verificación por herramienta insuficiente).

### Criterios del brief vs realidad

| Criterio ZAL-448 | Cumple en código | Verificable en navegador |
|---|---|---|
| 1. `available=false` no afirma gestión en ninguna sección | sí (revisión estática) | **no — 500 antes de render** |
| 2. Federación/Competiciones oculto o reemplazado por `Próximamente` | sí (`ClusterInterlinking.tsx:165-179`) | **no — 500 antes de render** |
| 3. Pain points/features reemplazados | sí (`ClusterPainPointsSection.tsx:73-89`) | **no — 500 antes de render** |
| 4. CTAs ya gateados | sí (heredado de `e6b9b5d8e`) | **no — 500 antes de render** |
| 5. Sin tocar canonical/hreflang/pricing/rutas | sí | n/a (no llega a render) |
| 6. Checks focalizados con PASS/FAIL documentado | sí (este memo) | FAIL |
| 7. Issue cerrada al completar | pendiente | depende de unblock |

### Disposición

- **ZAL-448:** cierre técnico con **FAIL**. El gate de JSX en sí es el esperado, pero la verificación end-to-end es adversa. La rama NO está lista para merge/deploy.
- **ZAL-40 (in_review):** sigue pendiente de un peer-verification cross-agent que ya no satisfará la gate si se emite sobre `e6b9b5d8e` (mismo build break). Engineering Lead (acade097) o QA (c07d53ca) deben reabrir y/o corregir la regresión de import chain antes de que cualquier C-2 sobre SHA de esta rama sea útil.
- **ZAL-446 (blocked):** queda satisfecha en su semántica — la verificación FAIL del SHA revisado es correcta, el build break explica el por qué.
- **Acción recomendada (Engineering Lead):** extraer `AVAILABLE_MODALITIES` a un módulo sin imports de servidor (p.ej. `src/lib/seo/availability.ts`) y actualizar los imports en `ClusterInterlinking.tsx` y `ClusterHeroSection.tsx`. Cambio de 3 archivos mínimo, no toca lógica de gate ni JSON content. Sin merge ni publicación desde este memo.

### Sin acciones externas

- Sin merge, push, deploy, publicación, migración de DB, secretos, datos reales, Stripe live.
- Sin tocar `src/content/clusters/**`, `pricing/`, `decisiones/` ni rutas.
- Sin tocar `ClusterHeroSection.tsx`, `ClusterPainPointsSection.tsx`, `ClusterInterlinking.tsx` (el código del gate ya es el esperado; cualquier cambio adicional sin build verde solo añadiría confusión).
- Sin crear nuevos commits en `fix/zal-40-country-cluster-gate` para esta verificación (este memo es el work product; el SHA gate se satisface con el HEAD actual per la regla "review subtask no-op SHA proof" — `028760d95` es el SHA revisado y mi verdict es FAIL sobre ese SHA).

Issue: [ZAL-448](/ZAL/issues/ZAL-448). Parent: [ZAL-426](/ZAL/issues/ZAL-426). Ancestro: [ZAL-40](/ZAL/issues/ZAL-40).
