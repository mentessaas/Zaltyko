---
status: open
owner: producto
priority: P1 (smoke rojo en main; tabs públicas potencialmente rotas en producción)
related:
  - PR #108 (R1 cerrado — version skew fix)
  - PR #109 (este PR — tracking/diagnóstico R2)
  - run 34064862265 (CI post-merge en main)
created: 2026-09-07
---

# R2 — features tabs hydration smoke regression

## Resumen ejecutivo

Tras mergear #108 (R1, fix de version skew Playwright), el smoke test en CI
deja de fallar por el error de versiones, pero **aparece un fallo nuevo** en
el test `features tabs switch visible content`:

```
Error: Timeout 30000ms exceeded while waiting on the predicate

  16 |       { timeout: 30_000 },
  17 |     )
> 18 |     .toBe(true);
     |      ^
  19 | }
  20 |
  21 | test.describe("Zaltyko public site smoke", () => {
    at expectReactHydrated (tests/e2e-zaltyko-public.spec.ts:18:6)
    at tests/e2e-zaltyko-public.spec.ts:61:11
```

El test nunca llega a `billingTab.click()` (línea 62) ni a los `expect`
siguientes. El `<TabsTrigger name="Cobros">` no recibe `__reactProps$` en
30 segundos. El test pasa otros 2 (sitemap, contact form) y deja 3 sin correr
(modo `serial`). **Resultado: 2 passed · 1 failed · 3 did not run.**

## Run afectado

- Workflow: `CI`
- Run ID: `34064862265`
- Branch: `main`
- Commit: `0aa400fc58c8fb9f4cb967fba807edc3fb1e6efc` (squash de #108)
- Started: `2026-09-06T22:43:50Z`
- Finished: `2026-09-06T22:51:11Z`
- Smoke job: `101572293810`, conclusion `failure`, duración `2m51s`
- E2E Public / Auth: `skipped` (gate `needs: smoke-test`)

## ¿Es regresión de #108?

**No.** #108 cambia únicamente `package.json` (playwright 1.58.2 → 1.63.0),
`pnpm-workspace.yaml` (overrides matching) y `pnpm-lock.yaml` (regenerado).
No toca código de aplicación ni de tests. El skew anterior reventaba el
runtime de Playwright antes de ejecutar ningún test (error
`test.describe() not expected here`), así que **este test nunca llegó a
correr en main** desde que se rompió el skew. La regresión es
**pre-existente** y estaba enmascarada.

Para confirmarlo, idealmente habría que correr el test con Playwright 1.58.2
contra el código actual — si también falla, queda demostrado que no es
introducido por #108. Pero el lockfile ya no tiene 1.58.2; haría falta un
worktree temporal o reverter el fix puntualmente.

## Causa probable (a confirmar)

`src/app/(site)/FeaturesSection.tsx` renderiza las 8 pestañas (Gimnastas,
Coaches, **Cobros**, Evaluaciones, Eventos, Datos, Integraciones,
Seguridad) usando `<Tabs>` / `<TabsTrigger>` / `<TabsContent>` de
`@/components/ui/tabs` (shadcn). El estado se controla con
`useState(features[0].id)` (línea 156).

`expectReactHydrated` (líneas 9-19 del test) hace polling por 30s buscando
`Object.keys(element).some((k) => k.startsWith("__reactProps$"))` en el
locator. Si en ese intervalo React no ha hidratado el botón, falla.

Hipótesis a investigar en R2:

1. **Bundle JS tarda en llegar** — ¿el cliente está descargando chunks
   pesados que demoran la hidratación? Revisar Network waterfall del trace
   adjunto (`trace.zip`).
2. **El `<TabsTrigger>` no es un button hidratable** — la implementación de
   shadcn TabsTrigger en `@/components/ui/tabs.tsx` podría delegar el
   `onClick` al contenedor padre, dejando el botón sin `__reactProps$`
   directos. Verificar el código de `tabs.tsx`.
3. **Error de hidratación silencioso** — React 18+/19 puede descartar la
   hidratación si encuentra mismatch y aborta. Revisar la consola del
   trace para ver si hay warnings/errors.
4. **El selector `getByRole("tab", { name: "Cobros" })` matchea un
   contenedor sin handlers** — improbable, pero el trace sirve para
   descartar.

Adjuntos disponibles en el run de CI:

- `test-results/.../test-failed-1.png` (screenshot del estado)
- `test-results/.../video.webm` (replay del fallo)
- `test-results/.../error-context.md` (contexto del locator)
- `test-results/.../trace.zip` (trace completo, descargable con
  `pnpm exec playwright show-trace <path>`)

Acceso desde GitHub Actions → run 34064862265 → job Smoke Tests →
artifacts.

## Log relevante (extracto del job `101572293810`)

```
Running 6 tests using 1 worker

  ✓  1 [chromium] › tests/e2e-zaltyko-public.spec.ts:25:7 › dynamic sitemap and robots expose current public routes (1.8s)
  ✓  2 [chromium] › tests/e2e-zaltyko-public.spec.ts:38:7 › contact form posts to API and shows success feedback (6.4s)
  ✘  3 [chromium] › tests/e2e-zaltyko-public.spec.ts:58:7 › features tabs switch visible content (33.2s)
  -  4 [chromium] › tests/e2e-zaltyko-public.spec.ts:67:7 › cluster routes render Spanish and English generated content
  -  5 [chromium] › tests/e2e-zaltyko-public.spec.ts:75:7 › help center links resolve to real guide pages
  -  6 [chromium] › tests/e2e-zaltyko-public.spec.ts:89:9 › demo dynamic public detail pages do not depend on remote seed data

  ✓  7 [chromium] › tests/e2e-zaltyko-public.spec.ts:25:7 › ... (retry #1) (1.1s)
  ✓  8 [chromium] › tests/e2e-zaltyko-public.spec.ts:38:7 › ... (retry #1) (5.4s)
  ✘  9 [chromium] › tests/e2e-zaltyko-public.spec.ts:58:7 › ... (retry #1) (33.1s)
  ✘ 15 [chromium] › tests/e2e-zaltyko-public.spec.ts:58:7 › ... (retry #2) (33.0s)

  1 failed
    [chromium] › tests/e2e-zaltyko-public.spec.ts:58:7 › features tabs switch visible content
  3 did not run
  2 passed (2.0m)

ELIFECYCLE  Command failed with exit code 1.
```

El test es **consistente**: falla idéntico en 3 intentos consecutivos
(33s exactos cada uno = timeout agotado, no flaky). El retry solo re-corre
los tests fallidos; los 3 siguientes quedan bloqueados por `serial` mode.

## Decisiones pendientes para R2

- **A) Investigar primero, fix después**: reproducir en local, abrir
  trace, identificar causa raíz de la no-hidratación. Es la opción
  correcta si la regresión es real (tabs rotas en producción).
- **B) Revertir el assert a uno basado en `toBeVisible()` o
  `waitFor({ state: "attached" })`**: workaround rápido que libera smoke,
  pero esconde el problema si las tabs están realmente rotas para usuarios
  reales.
- **C) Hipótesis C: verificar manualmente `https://zaltyko.com/features`**
  en navegador real antes de decidir A vs B. Si las tabs funcionan en
  navegador humano, el test está mal escrito (patrón `__reactProps$`
  frágil); si no funcionan, es bug de producción urgente.

## Bloqueos / dependencias

- Ninguno en código. Es trabajo de diagnóstico + fix.
- No requiere migraciones ni cambios de DB.
- No requiere cambios de infraestructura (Vercel, secrets).

## Próximo paso concreto

1. Descargar `trace.zip` del run `34064862265` → job `Smoke Tests` →
   artifact.
2. `pnpm exec playwright show-trace <path>` localmente.
3. Mirar en el trace: ¿qué pasa entre `gotoPublic("/features")` y el
   timeout? ¿Hay errores de consola? ¿Cuántos network requests? ¿Llega
   JS bundle? ¿Aparece el `<button>` con handlers?
4. Reproducir localmente con `pnpm test:e2e:public:ci` apuntando a
   `BASE_URL=http://localhost:3000` después de `pnpm dev`.
5. Decidir A / B / C según hallazgos.

## Estado de producción

- Deploy (`34064862243`) corrió en main → `success`.
- `https://zaltyko.com` ya está sirviendo el código con Playwright 1.63.0.
- **No verificado manualmente**: si `/features` está rota, los usuarios
  reales no pueden cambiar de tab. P1 funcional si se confirma.
