---
status: closed
owner: producto
priority_actual: P0 (CSP bloqueaba hidratación de TODA página interactiva en producción; no solo features tabs)
related:
  - PR #108 (R1 cerrado — version skew fix)
  - PR #109 (vault: tracking + diagnóstico inicial)
  - PR #110 (C — nonce propagation + CSP gaps + force-dynamic)
  - run 34064862265 (CI post-merge en main, síntoma)
created: 2026-09-07
closed: 2026-09-07
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

---

## Cierre R2 — 2026-09-07

### Severidad real (P0, no P1)

El síntoma capturado por el smoke (features tabs no hidratan) era la punta
del iceberg. La causa raíz era un CSP estricto que bloqueaba la hidratación
de **toda página interactiva en producción**, no solo `/features`:

- `<Tabs>` de features — bloqueado
- `ContactForm` (botón "Enviar mensaje") — bloqueado
- `ThemeProvider` de `next-themes` (script inline de detección de tema) — bloqueado
- `GoogleAdsTracking` (gtag init inline + script externo) — bloqueado
- cualquier `"use client"` con estado o handlers — bloqueado

El smoke solo exponía 1 síntoma porque es serial y muere en el primer fallo.

### Causa raíz

`middleware.ts` emitía una CSP con un nonce por-request, pero el nonce **no
llegaba a todos los scripts** que el navegador necesitaba ejecutar:

1. `next-themes` `<ThemeProvider>` inyecta su script inline de detección
   de tema sin nonce → navegador lo bloquea → React no arranca.
2. `<GoogleAdsTracking>` emitía `<Script>` y `<Script id="google-ads-init">`
   sin prop `nonce` → ambos bloqueados.
3. Tres directivas del CSP estaban incompletas (`frame-src https://vercel.live`,
   `worker-src 'self' blob:`, `manifest-src https://vercel.com`,
   `connect-src https://*.sentry-cdn.com`) → Vercel Live y Sentry CDN
   fallaban en dev/prod.

Plus un bug separado en `/auth/login` (Next.js 15 + `cookies()` requiere
`force-dynamic` explícito, sin él el route aborta con `Dynamic server usage`
→ 500 en producción).

### Plan ejecutado (D → C)

1. **D: confirmar CSP bloquea hidratación**. Con CSP permisivo (sin nonce,
   `unsafe-inline`, `unsafe-eval`): 6/6 smoke tests pasan. Con CSP estricto
   actual: 1/6 pasa (sitemap), el resto muere por timeout de hidratación.
   Confirmado.
2. **C: nonce injection + gaps CSP + force-dynamic**:
   - `src/app/layout.tsx`: lee `x-nonce` de `headers()` y lo propaga a
     `<html nonce>`, `<GoogleAdsTracking nonce>`, `<AppProviders nonce>`.
   - `src/app/providers.tsx`: pasa nonce a `<ThemeProvider nonce>` (cierra
     el gap de `next-themes`).
   - `src/components/GoogleAdsTracking.tsx`: añade `nonce` a ambos `<Script>`.
   - `middleware.ts`: añade directivas faltantes y `'unsafe-eval'` solo
     cuando `NODE_ENV !== "production"` (Next.js dev usa `eval()` para HMR).
   - `src/app/auth/login/page.tsx`: `export const dynamic = "force-dynamic"`.

### Verificación

```
pnpm test:e2e:public:ci
Running 6 tests using 1 worker
  ✓  1 [chromium] › dynamic sitemap and robots expose current public routes (5.8s)
  ✓  2 [chromium] › contact form posts to API and shows success feedback (16.5s)
  ✓  3 [chromium] › features tabs switch visible content (12.1s)  ← R2 original
  ✓  4 [chromium] › cluster routes render Spanish and English generated content (17.1s)
  ✓  5 [chromium] › help center links resolve to real guide pages (23.4s)
  ✓  6 [chromium] › demo dynamic public detail pages do not depend on remote seed data (27.9s)
  6 passed (1.7m)
```

Test 2 (contact form) **fallaba antes del fix** por el mismo root cause;
test 3 era el síntoma original de R2. Ambos verdes ahora.

### Pendiente de verificación post-merge

- [ ] Vercel preview de #110: `/features` cambia tabs, `/contacto` envía,
      `/auth/login` carga sin 500.
- [ ] Smoke en main post-merge verde.
- [ ] Verificación manual final en `https://zaltyko.com/features` para
      confirmar UX idéntica a antes del CSP.

### Lecciones

- El smoke serial con `__reactProps$` polling no distinguía "no hidratado"
  de "botón equivocado" — un patrón de test frágil cuando el CSP bloquea
  scripts. Considerar reemplazar `expectReactHydrated` por
  `expect(button).toBeEnabled()` + `expect(button).toHaveAttribute(...)`
  cuando el botón correcto sea identificable sin marcadores internos de React.
- Validar siempre que el nonce del middleware alcance **todos** los
  scripts inline (los de las dependencias, no solo los del código de
  aplicación). La auditoría fue: `<html>` → framework scripts OK → terceros
  propios OK → dependencias (next-themes) FALLABA → terceros de terceros
  (Google Ads) FALLABA. Cuatro puntos de fuga.
- El síntoma "un test falla" puede esconder "toda la app está rota". El
  modo serial del smoke enmascaró esto aquí; un modo parallel habría
  mostrado 5 fallos correlacionados a la vez.
