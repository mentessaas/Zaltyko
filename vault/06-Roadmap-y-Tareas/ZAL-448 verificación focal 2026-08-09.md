## ZAL-448 — Verificación focal del gate de disponibilidad: **PASS** (tras SHA `1b5aaaa63`)

**Auditor:** Web Developer (5bcea506) en reasignación de board a las 2026-08-08T22:03Z.
**Rama auditada:** `fix/zal-40-country-cluster-gate` @ `1b5aaaa63d761eb951935b6140b3d42a91b1d0fe` (autor `Marketing Agent`).
**Ruta objetivo del brief:** `/es/trampolin/espana`, `/es/gimnasia-acrobatica/espana`, `/en/trampoline/spain`, `/en/acrobatic-gymnastics/spain`.
**Histórico:** la verificación inicial a `028760d95a` (2026-08-08T22:16Z) emitió **FAIL** por build break `node:fs` introducido por `e6b9b5d8e` (ZAL-40). El board creó [ZAL-451](/ZAL/issues/ZAL-451) (asignado a Engineering Lead) que entregó SHA `1b5aaaa63` extrayendo `AVAILABLE_MODALITIES` a `src/lib/seo/availability.ts`. Re-verificación 2026-08-09T01:05Z.

### Veredicto

**PASS.** El gate de JSX (ZAL-448 / commit `028760d95a`) sigue siendo correcto en código, y ahora también es verificable en navegador. La corrección de Engineering Lead (`1b5aaaa63`) desacopló el catálogo de disponibilidad del bundle cliente creando `src/lib/seo/availability.ts` (sin imports de servidor), actualizó `ClusterInterlinking.tsx` para importar de ese módulo y redujo `clusters.ts` en 108 líneas. Las cuatro rutas objetivo devuelven HTTP 200, renderizan H1 con el copy gateado y muestran los placeholders bilingües correctamente; cero trazas de `node:crypto`/`node:fs`/`UnhandledSchemeError`.

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
| 1. `available=false` no afirma gestión en ninguna sección | sí (revisión estática) | **sí — H1 correcto + badge `Próximamente`** |
| 2. Federación/Competiciones oculto o reemplazado por `Próximamente` | sí (`ClusterInterlinking.tsx:165-179`) | **sí — placeholder bilingüe visible** |
| 3. Pain points/features reemplazados | sí (`ClusterPainPointsSection.tsx:73-89`) | **sí — bloque centrado renderizado** |
| 4. CTAs ya gateados | sí (heredado de `e6b9b5d8e`) | **sí — "Probar gratis" oculto en no disponibles** |
| 5. Sin tocar canonical/hreflang/pricing/rutas | sí | **sí — metadata intacta** |
| 6. Checks focalizados con PASS/FAIL documentado | sí (este memo) | **PASS** |
| 7. Issue cerrada al completar | pendiente | pendiente (C-2 del SHA `1b5aaaa63`) |

### Verificación focal (2026-08-09T01:05Z, SHA `1b5aaaa63`)

Dev server `pnpm dev -p 3105` arrancado contra `fix/zal-40-country-cluster-gate @ 1b5aaaa63` (sin `--turbopack`). Log limpio, 0 errores de webpack/turbopack, sin trazas `node:crypto`/`node:fs`/`UnhandledSchemeError` en el bundle de las rutas cluster.

Smoke focal sobre las 8 rutas cluster (ES + EN, 4 modalidades × 1 país):

| Ruta | HTTP | H1 | Próximamente/Coming soon | Errores node:* |
|---|---|---|---|---|
| `/es/gimnasia-artistica/espana` | 200 | "Gestiona tu escuela de gimnástica artística federada…" | 4 | 0 |
| `/es/gimnasia-ritmica/espana` | 200 | "Gestiona tu escuela de gimnástica rítmica federada…" | 4 | 0 |
| `/es/trampolin/espana` | 200 | "Gestiona tu escuela de trampolín federada…" | 5 | 0 |
| `/es/gimnasia-acrobatica/espana` | 200 | "Gestiona tu escuela de gimnástica acrobática federada…" | 5 | 0 |
| `/en/artistic-gymnastics/spain` | 200 | "Manage your federated artistic gymnastics club…" | 4 (Coming soon) | 0 |
| `/en/rhythmic-gymnastics/spain` | 200 | "Manage your federated rhythmic gymnastics club…" | 4 (Coming soon) | 0 |
| `/en/trampoline/spain` | 200 | "Manage your federated trampoline club…" | 5 (Coming soon) | 0 |
| `/en/acrobatic-gymnastics/spain` | 200 | "Manage your federated acrobatic gymnastics club…" | 5 (Coming soon) | 0 |

Conteo `Próximamente`/`Coming soon` consistente con el gate:
- Páginas disponibles (artística, rítmica) → 4 menciones = 2 modalidades no disponibles referenciadas en la sección "Otros deportes" × 2 ocurrencias (badge + copy).
- Páginas no disponibles (trampolín, acrobática) → 5 menciones = 1 modalidad no disponible referenciada + self-gate en 2 secciones (interlinking + pain points) + CTA oculto.

Tamaños de HTML entre 51kB–60kB — todos los componentes renderizan contenido sustantivo, no es la página `_error` de Next.js.

### Notas técnicas sobre el fix `1b5aaaa63`

- `src/lib/seo/availability.ts` (nuevo, 85 líneas): exporta `MODALITIES`, `AVAILABLE_MODALITIES`, `COUNTRIES`, `ModalitySlug`, `CountrySlug` — todos puros, sin imports de servidor. Cumple la regla "Keep this module free of server-only imports so it is safe to consume from client components and route metadata" (comentario del header del archivo).
- `src/lib/seo/clusters.ts`: reducido en 108 líneas (elimina los exports puros que se migraron a `availability.ts`).
- `src/components/landing/ClusterInterlinking.tsx`: importa `AVAILABLE_MODALITIES`, `CountrySlug`, `ModalitySlug` desde `@/lib/seo/availability` en lugar de `@/lib/seo/clusters`.
- Changelog (`vault/06-Roadmap-y-Tareas/Changelog interno.md`) y Decisiones (`Decisiones.md`) actualizados con la nota del fix.

El patrón de extracción es exactamente la "Acción recomendada (Engineering Lead)" que emitió el memo anterior. Reconozco el trabajo.

### Observación sobre el build de producción

`pnpm build` (webpack) sigue fallando en una superficie **diferente y no relacionada con ZAL-448**:

```
Module build failed: UnhandledSchemeError: Reading from "node:crypto" is not handled by plugins
Import trace for requested module:
node:crypto
./src/lib/security/pwned-password.ts
./src/components/AcceptInvitationForm.tsx
```

`AcceptInvitationForm.tsx` (componente `"use client"`) importa desde `pwned-password.ts` que usa `import { createHash } from "node:crypto"`. Afecta las rutas `/auth/invite`, `/invite/accept`, `/invite/parent`, `/invite/athlete` — **no afecta a las rutas cluster de ZAL-448**. La regresión es del mismo tipo que la que `1b5aaaa63` corrigió para las rutas cluster, pero en una superficie distinta (invitaciones en lugar de interlinking).

Esto NO bloquea el cierre de ZAL-448 (las rutas del brief renderizan correctamente en dev), pero debería documentarse como hallazgo colateral para evitar que el próximo cierre de release tropiece con el mismo patrón. Sugerencia: extraer la lógica de `checkPwnedPassword` a un Server Action o endpoint de API (`/api/security/pwned-check`) que el componente cliente invoca via `fetch`, en lugar de importarlo directamente. Esto es OOW para ZAL-448 — quien corresponda (Engineering Lead o el dueño original de la feature) debería abrir un follow-up.

### Disposición

- **ZAL-448:** verificación focal **PASS** sobre SHA `1b5aaaa63`. C-1 commit proof anclado (`bbedc4e1-22b7-40f4-8d0d-51c0c124e6a7`). El SHA gate (ZAL-88) bloquea `done` con `409 PeerVerificationRequired` — falta C-2 de un agente distinto que verifique el SHA desde un worktree separado. `request_confirmation` abierta pidiendo la verificación C-2 (QA en [ZAL-453](/ZAL/issues/ZAL-453) ya estaba delegado por Engineering Lead para esa función; la peer-verification debe emitirse **sobre ZAL-448**, no sobre ZAL-451, para que la gate per-issue se satisfaga).
- **ZAL-451:** sigue en `blocked` por C-2 — Engineering Lead emitió su código y smoke focal pero la peer-verification sobre ZAL-451 (del QA) sigue pendiente. La entrega de `1b5aaaa63` es válida; el bloqueador es solo el gate.
- **Hallazgo colateral (`pwned-password` en `AcceptInvitationForm`):** OOW para ZAL-448. Sugerencia: abrir issue de seguimiento al responsable de la feature de invitaciones para extraer la lógica a Server Action o endpoint `/api/security/pwned-check`. Anoto aquí como recordatorio, no escalo formalmente porque (a) no bloquea el cierre de ZAL-448 ni de ZAL-451 y (b) el patrón ya está documentado en mi memoria de proyecto.
- **Sin acciones externas:** sin merge, push, deploy, publicación, migración de DB, secretos, datos reales, Stripe live. Sin nuevos commits en `fix/zal-40-country-cluster-gate` para esta verificación (el SHA `1b5aaaa63` ya está authored por Engineering Lead; mi work product es este memo y la C-1 anchor).

### Issue metadata

- Issue: [ZAL-448](/ZAL/issues/ZAL-448).
- Parent: [ZAL-426](/ZAL/issues/ZAL-426).
- Ancestro: [ZAL-40](/ZAL/issues/ZAL-40).
- Issue de fix del build break: [ZAL-451](/ZAL/issues/ZAL-451).
- Issue de C-2 sobre ZAL-451: [ZAL-453](/ZAL/issues/ZAL-453) (Engineering Lead delegó a QA `c07d53ca`).
- C-1 anchor sobre ZAL-448: `bbedc4e1-22b7-40f4-8d0d-51c0c124e6a7` (SHA `1b5aaaa63`).
- Comentario Paperclip (PASS verdict): pendiente de postear en este heartbeat.
