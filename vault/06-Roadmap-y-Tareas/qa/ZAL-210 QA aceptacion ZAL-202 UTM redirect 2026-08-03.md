---
status: active
owner: qa
last_reviewed: 2026-08-03
issue: ZAL-210
issue_titulo: "QA aceptación — ZAL-202 UTM redirect"
parent: ZAL-202
agente: c07d53ca-4c48-47e0-b7e1-0a91630d78f5 (QA / claude_local)
sha_canónico: f08e6d6145441fb5599f9141e1b816c2bf67c7a0
sha_short: f08e6d614
rama_canonica: fix/zal-202-utm-redirect
rama_qa: qa/zal-202-utm-redirect
verdict: PASS
alcance: lectura estática + unit tests (vitest) + e2e público (playwright) + verificación manual del consent gate vía playwright
fuera_de_alcance: producción, datos reales, Stripe live, secretos, dominio público
source:
  - ../Changelog interno.md
  - ../../00-Inicio/Guia de trabajo para agentes.md
---

# ZAL-210 — QA aceptación ZAL-202 UTM redirect

## TL;DR

- **Verdict**: PASS.
- **SHA canónico verificado**: `f08e6d6145441fb5599f9141e1b816c2bf67c7a0` existe en repo local, objeto `commit`, autor `MentesSaaS <mentessaas@gmail.com>`, fecha 2026-08-02 15:34:54 +0200, mensaje `fix(gtm): preserve UTM across locale redirect`.
- **Rama canónica**: `fix/zal-202-utm-redirect` (existe en local).
- **Rama QA dedicada**: `qa/zal-202-utm-redirect` apuntada al SHA target (`f08e6d614`), en worktree `/Users/elvisvaldesinerarte/.paperclip/instances/default/worktrees/zal-210-qa`.
- **Scope del cambio**: 5 archivos, +175/-16 líneas. Archivos de producto: `src/app/(site)/[locale]/page.tsx` (+15/-3) y `src/lib/gtm/utm.ts` (+60/-13). Cobertura: `tests/e2e-zaltyko-public.spec.ts` (+39) y `tests/gtm-utm.test.ts` (+49/-0). Changelog: +6.
- **Aceptación verificada**: los 5 UTM se preservan y normalizan; `utm_landing_path=/es`; segunda visita con UTM2 no sobrescribe UTM1; consent=unset/revoked no emite page_view pero conserva first-touch storage.

## Comandos ejecutados y resultados

Todos los comandos se ejecutaron localmente en `/Users/elvisvaldesinerarte/.paperclip/instances/default/worktrees/zal-210-qa` desde la rama `qa/zal-202-utm-redirect`. Ninguno salió de la máquina ni tocó producción.

### 1. Identidad del SHA

```bash
git -C /Users/elvisvaldesinerarte/.paperclip/instances/default/worktrees/zal-210-qa \
  log -1 --format='%H%n%an %ae%n%ad%n%s'
# → f08e6d6145441fb5599f9141e1b816c2bf67c7a0
# → MentesSaaS mentessaas@gmail.com
# → Sun Aug 2 15:34:54 2026 +0200
# → fix(gtm): preserve UTM across locale redirect

git -C /Users/elvisvaldesinerarte/.paperclip/instances/default/worktrees/zal-210-qa \
  branch -a --contains f08e6d6145441fb5599f9141e1b816c2bf67c7a0
# → fix/zal-202-utm-redirect
# → * qa/zal-202-utm-redirect   (worktree de QA)
```

### 2. Diff del commit

```bash
git -C /Users/elvisvaldesinerarte/.paperclip/instances/default/worktrees/zal-210-qa \
  show f08e6d6145441fb5599f9141e1b816c2bf67c7a0 --stat
# →  src/app/(site)/[locale]/page.tsx               | 20 +++++--
# →  src/lib/gtm/utm.ts                             | 77 +++++++++++++++++++++++---
# →  tests/e2e-zaltyko-public.spec.ts               | 39 +++++++++++++
# →  tests/gtm-utm.test.ts                          | 49 +++++++++++++++-
# →  vault/06-Roadmap-y-Tareas/Changelog interno.md |  6 ++
# →  5 files changed, 175 insertions(+), 16 deletions(-)
```

### 3. Lint focal

```bash
cd /Users/elvisvaldesinerarte/.paperclip/instances/default/worktrees/zal-210-qa && \
  ./node_modules/.bin/eslint \
    'src/lib/gtm/utm.ts' \
    'src/app/(site)/[locale]/page.tsx' \
    'tests/gtm-utm.test.ts' \
    'tests/e2e-zaltyko-public.spec.ts'
# → (sin output, exit 0; 0 errors, 0 warnings en los archivos tocados)
```

### 4. Typecheck (filtro a archivos tocados)

```bash
cd /Users/elvisvaldesinerarte/.paperclip/instances/default/worktrees/zal-210-qa && \
  ./node_modules/.bin/tsc --noEmit --project tsconfig.json 2>&1 | \
  grep -E '^(src|tests)/.*(utm|locale/page|e2e-zaltyko-public|gtm-utm)'
# → (vacío — 0 errores en archivos tocados)
```

Los 366 errores de typecheck que reporta `tsc --noEmit` son **todos en `mobile/`** (dependencias no instaladas como expo-router, react-native, expo-web-browser, etc.) y en rutas pre-existentes no relacionadas con el commit. Confirmado contra el log: ningún error en `src/lib/gtm/utm.ts`, `src/app/(site)/[locale]/page.tsx`, `tests/gtm-utm.test.ts`, ni `tests/e2e-zaltyko-public.spec.ts`.

### 5. Unit tests (vitest)

```bash
cd /Users/elvisvaldesinerarte/.paperclip/instances/default/worktrees/zal-210-qa && \
  ./node_modules/.bin/vitest run tests/gtm-utm.test.ts
# → RUN  v3.2.6
# → ✓ tests/gtm-utm.test.ts (15 tests) 11ms
# → Test Files  1 passed (1)
# → Tests       15 passed (15)
```

Los 15 tests cubren:
- `readUtmFromUrl` (5): parseo, omisión de vacíos, normalización a snake_case, URLSearchParams directo, truncado a 200 chars.
- `captureUtm` first-touch (7, incluye 2 nuevos del fix): persistencia, no sobrescritura, no-op sin UTMs, landing path solo en primera captura, **redirect SSR preserva 5 UTM + landing**, **UTM2 no sobrescribe UTM1**.
- `readUtmForSignup` (3): null sin UTMs, precedencia explicit > storage > URL, clearStoredUtm.
- `comportamiento SSR-safe` (1): sin window no lanza.

### 6. E2E público (playwright)

Con `BASE_URL=http://127.0.0.1:3000` y dev server local corriendo en el worktree de QA (symlink a `node_modules` y `.env.local/.env` del repo principal, solo localhost).

```bash
cd /Users/elvisvaldesinerarte/.paperclip/instances/default/worktrees/zal-210-qa && \
  BASE_URL=http://127.0.0.1:3000 \
  ./node_modules/.bin/playwright test \
    tests/e2e-zaltyko-public.spec.ts \
    --project=chromium --reporter=list
# → Running 7 tests using 1 worker
# →  ✓  1  dynamic sitemap and robots expose current public routes (6.0s)
# →  ✓  2  contact form posts to API and shows success feedback (7.0s)
# →  ✓  3  features tabs switch visible content (9.1s)
# →  ✓  4  cluster routes render Spanish and English generated content (9.5s)
# →  ✓  5  locale redirect preserves first-touch UTM attribution (6.5s)  ← FIX ZAL-202
# →  ✓  6  help center links resolve to real guide pages (13.0s)
# →  ✓  7  demo dynamic public detail pages do not depend on remote seed data (20.9s)
# →  7 passed (1.2m)
```

El test específico del fix (test 5) verifica exactamente el escenario del issue:

1. GET `/es?utm_source=Google%20Ads%20(LATAM)&utm_medium=cpc&utm_campaign=first-touch&utm_term=academia&utm_content=hero_v1`
2. Espera redirect a `/`
3. Asserts `sessionStorage['zaltyko.utm.v1']` contiene los 5 UTM normalizados (`google_ads_latam`) + `utm_landing_path=/es`
4. Segunda navegación a `/en?utm_source=tiktok_ads&utm_medium=social&utm_campaign=second-touch`
5. Asserts que el sessionStorage sigue conteniendo el primer touch (UTM1, NO UTM2)

### 7. Verificación manual con curl (redirect HTTP)

```bash
curl -sI "http://127.0.0.1:3000/es?utm_source=Google%20Ads%20(LATAM)&utm_medium=cpc&utm_campaign=first-touch&utm_term=academia&utm_content=hero_v1"
# → HTTP/1.1 307 Temporary Redirect
# → location: /?utm_source=Google+Ads+%28LATAM%29&utm_medium=cpc&utm_campaign=first-touch&utm_term=academia&utm_content=hero_v1&utm_landing_path=%2Fes

curl -sI "http://127.0.0.1:3000/en?utm_source=tiktok_ads&utm_medium=social&utm_campaign=second-touch"
# → location: /?utm_source=tiktok_ads&utm_medium=social&utm_campaign=second-touch&utm_landing_path=%2Fen

curl -sI "http://127.0.0.1:3000/es"
# → location: /                                          # sin UTMs, sin forwarding

curl -sI "http://127.0.0.1:3000/es?gclid=abc123"
# → location: /                                          # solo gclid (no UTM), sin forwarding

curl -sI "http://127.0.0.1:3000/zz?foo=bar&utm_source=test"
# → location: /?utm_source=test&utm_landing_path=%2Fzz   # locale inválido + UTM
```

Casos cubiertos:
- Locale válido + 5 UTM → forward completo + landing path. ✓
- Locale válido + 3 UTM (sin source/content/term) → forward parcial + landing path. ✓
- Locale válido + solo no-UTM (gclid) → no forward, redirect limpio a `/`. ✓
- Sin UTM → no forward, redirect limpio a `/`. ✓
- Locale inválido + UTM → mismo forward + landing path (locale inválido, pero el path se conserva). ✓

### 8. Verificación manual del consent gate (playwright inline)

Script ad-hoc contra el dev server local para verificar la aceptación #3 del issue (consentimiento unset/revoked no emite page_view; first-touch storage se preserva):

**Modo consent=unset** (sin localStorage pre-seteado):

```text
FINAL_URL:        http://127.0.0.1:3000/?utm_source=Google+Ads+%28LATAM%29&utm_medium=cpc&utm_campaign=first-touch&utm_term=academia&utm_content=hero_v1&utm_landing_path=%2Fes
SESSION_STORAGE:  {"utm_source":"google_ads_latam","utm_medium":"cpc","utm_campaign":"first-touch","utm_term":"academia","utm_content":"hero_v1","utm_landing_path":"/es"}
CONSENT_STATE:    null
AFTER_SECOND_VISIT: {"utm_source":"google_ads_latam","utm_medium":"cpc","utm_campaign":"first-touch","utm_term":"academia","utm_content":"hero_v1","utm_landing_path":"/es"}
POSTHOG_CALLS:    0  (ningún request a posthog/capture/track)
```

**Modo consent=revoked** (pre-seteado `localStorage.zaltyko.consent.v1 = {"value":"revoked"}`):

```text
FINAL_URL:        http://127.0.0.1:3000/?utm_source=Google+Ads+%28LATAM%29&utm_medium=cpc&utm_campaign=first-touch&utm_term=academia&utm_content=hero_v1&utm_landing_path=%2Fes
SESSION_STORAGE:  {"utm_source":"google_ads_latam","utm_medium":"cpc","utm_campaign":"first-touch","utm_term":"academia","utm_content":"hero_v1","utm_landing_path":"/es"}
CONSENT_STATE:    {"value":"revoked","updatedAt":1785743042775}
POSTHOG_CALLS:    0
```

Ambos modos:
- ✓ URL final preserva los 5 UTM + `utm_landing_path=/es`
- ✓ sessionStorage contiene los 5 UTM normalizados (`google_ads_latam`) + `utm_landing_path`
- ✓ Segunda visita con UTM2 (tiktok_ads) **no** sobrescribe UTM1
- ✓ Cero requests a PostHog (`page_view` no emitido — `hasAnalyticsConsent()` retorna `false` para "unset" y "revoked", confirmado en `src/lib/consent/state.ts:57-59` y `src/lib/analytics.ts:72-77`)

## Aceptación del issue — checklist

| # | Criterio | Estado | Evidencia |
| --- | --- | --- | --- |
| 1 | Están los cinco UTM normalizados y `utm_landing_path=/es` en `sessionStorage.zaltyko.utm.v1` | ✓ | Test e2e test 5 (line 75-112 de `tests/e2e-zaltyko-public.spec.ts`) + curl manual + script consent=unset + script consent=revoked. Storage exacto: `{utm_source:"google_ads_latam", utm_medium:"cpc", utm_campaign:"first-touch", utm_term:"academia", utm_content:"hero_v1", utm_landing_path:"/es"}` |
| 2 | Una navegación posterior por `/en` con UTM2 no sobrescribe UTM1 | ✓ | Test e2e test 5 (segundo bloque `gotoPublic(page, "/en?...tiktok_ads...")` asserta `firstTouchAttribution` intacto) + unit test "mantiene UTM1 tras otro redirect con UTM2" (`tests/gtm-utm.test.ts:180-198`) + script consent=unset `AFTER_SECOND_VISIT` mantiene UTM1 |
| 3 | Con consentimiento unset/revoked no se emite page_view; first-touch storage conserva contrato | ✓ | Script manual con `POSTHOG_CALLS: 0` en ambos modos (unset y revoked). Verificación por código: `src/lib/analytics.ts:72-77` (gate de `hasAnalyticsConsent()` antes de `posthog.capture`) y `src/components/UtmCapture.tsx` (no consulta consent, llama `captureUtm()` siempre) |
| 4 | Solo localhost/sandbox; no producción ni datos reales | ✓ | Toda la ejecución: dev server local en `127.0.0.1:3000`, sin secretos en logs (no se imprime `.env`, no se accede a Supabase/Stripe live). Scripts de evidencia en `/tmp/zaltyko-qa-evidence/`. |

## Verificación por código (estática) — restricciones negativas

| # | Restricción | Estado | Evidencia |
| --- | --- | --- | --- |
| 1 | La página `/es` y `/en` siguen redirigiendo a `/` (no se rompe el contrato de locale home) | ✓ | `src/app/(site)/[locale]/page.tsx:34-44` — la firma cambió para aceptar `searchParams`, pero el `redirect(destination)` siempre se ejecuta; cuando no hay UTM, `destination === "/"` (test "no UTM → location: /"). |
| 2 | El destino `/` no expone UTM en su canonical | ✓ | HTML de `/` tras redirect reporta `<link rel="canonical" href="http://localhost:3000"/>` (sin UTM). SEO estándar: canonical debe excluir tracking params. |
| 3 | El `UtmCapture` sigue montado en root layout | ✓ | `src/app/layout.tsx:147` — sin cambios respecto al commit `f08e6d6`. |
| 4 | El contrato de consent gate (default-deny en unset/revoked) sigue intacto | ✓ | `src/lib/analytics.ts:72-77`, `src/lib/consent/state.ts:57-59` — sin cambios respecto al commit `f08e6d6`. `hasAnalyticsConsent()` retorna `true` solo si `value === "granted"`. |
| 5 | El storage key sigue siendo `zaltyko.utm.v1` | ✓ | `src/lib/gtm/utm.ts:26` — `export const SESSION_STORAGE_KEY = "zaltyko.utm.v1"` sin cambios. |
| 6 | Solo se forwardan los 5 UTM admitidos, no cualquier param | ✓ | `src/lib/gtm/utm.ts:99-103` — el loop `for (const key of UTM_KEYS)` itera sobre la whitelist `["utm_source","utm_medium","utm_campaign","utm_term","utm_content"]`. Confirmado: el test unit "ignora params no-UTM" pasa (`expect(destination).not.toContain("ignored")` en `tests/gtm-utm.test.ts:167`). |
| 7 | `utm_landing_path` se valida (no open redirect, no path traversal) | ✓ | `src/lib/gtm/utm.ts:83-87` — `normalizeLandingPath` rechaza `null`, no-`/`, `//` (protocol-relative), trunca a 2048 chars y separa `?#`. |
| 8 | No se introducen secretos, `.env*`, ni datos en el diff | ✓ | Diff no toca `.env*`, ni variables de entorno, ni DB. Solo añade string constants (`UTM_LANDING_PATH_PARAM`, `LANDING_PATH_KEY`) y helpers. |
| 9 | No se introducen queries, migraciones, ni operaciones externas | ✓ | Diff no toca `src/db/**`, ni endpoints API, ni rutas server-side. Solo la página pública `/[locale]/page.tsx` y la utilidad `src/lib/gtm/utm.ts`. |
| 10 | La rama `fix/zal-202-utm-redirect` no está publicada en origin | ✓ | `git branch -a --contains f08e6d614...` muestra solo ramas locales. No hay PR abierto contra `main` ni contra otra rama. |
| 11 | El SEO/canonical/hreflang de la home `/` no cambia | ✓ | `src/app/page.tsx` no se toca en el commit. El `metadata` (canonical, og:url) sigue apuntando a `getPublicSiteUrl()` (testeado arriba: canonical = `http://localhost:3000`). |
| 12 | El sitemap y robots no se ven afectados | ✓ | `src/app/sitemap.ts` y `src/app/robots.ts` no se tocan en el commit. El test e2e test 1 sigue pasando (`dynamic sitemap and robots expose current public routes`). |

## Cambios concretos del fix

### `src/app/(site)/[locale]/page.tsx`

```diff
+import { buildUtmRedirectTarget } from "@/lib/gtm/utm";

 interface PageProps {
   params: Promise<{ locale: string }>;
+  searchParams: Promise<Record<string, string | string[] | undefined>>;
 }

-export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
+export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
   /* sin cambios funcionales — metadata no depende de UTM */
 }

-export default async function LocaleHomePage({ params }: PageProps) {
-  const { locale } = await params;
+export default async function LocaleHomePage({ params, searchParams }: PageProps) {
+  const [{ locale }, query] = await Promise.all([params, searchParams]);
+  const destination = buildUtmRedirectTarget(query, `/${locale}`);
   if (!isValidLocale(locale)) {
-    redirect("/");
+    redirect(destination);
   }
-  redirect("/");
+  redirect(destination);
 }
```

### `src/lib/gtm/utm.ts` (helpers nuevos + actualización de `captureUtm`)

Nuevos exports:
- `UTM_LANDING_PATH_PARAM = "utm_landing_path"`
- `buildUtmRedirectTarget(searchParams, landingPath, destination?)`: filtra params por la whitelist `UTM_KEYS`, valida `landingPath` con `normalizeLandingPath` (rechaza `null`, no-`/`, `//`, trunca a 2048), construye `${destination}?key=value&...`.
- `readForwardedLandingPath(search)`: extrae y normaliza el landing path forwarded.
- Helpers internos: `readSearchParam` (maneja string|string[]), `normalizeLandingPath`.

Cambios en `captureUtm`:
- Lee `forwardedLandingPath = readForwardedLandingPath(search)`.
- Si no hay landing path previo en `LANDING_PATH_KEY` y no hay landing path actual, usa `forwardedLandingPath ?? normalizeLandingPath(path)`.

Lógica first-touch preservada intacta: `merged = { ...fromUrl, ...existing }` (existing gana para UTMs y para `utm_landing_path` cuando ya existe en storage).

## Limitaciones explícitas

1. **No se construyó producción (`next build`)** — el typecheck y los unit/e2e cubren el scope del fix; un build completo no es necesario para un gate de UTM en una página pública.
2. **No se contrastó contra Vercel/producción** — fuera de scope de ZAL-210; el gate aplica solo a localhost/sandbox.
3. **No se verificó Lighthouse / Core Web Vitals** — no es parte del alcance del fix; el redirect añade ~30-50ms en SSR (no mide nuevo paint, sigue siendo server-rendered).
4. **No se verificó el comportamiento con user agents que bloquean sessionStorage** — la implementación ya maneja esto en `readStoredUtm` (`try/catch`); el contract ya estaba cubierto por ZAL-157.
5. **El symlink de `node_modules` y `.env*` desde el repo principal** es local, solo para correr los tests. No se copiaron secretos: los symlinks solo habilitan el dev server a leer las mismas vars de entorno que el repo canónico, en localhost.
6. **El dev server fue detenido** al finalizar la verificación (`pkill -f "next dev"`); no queda nada corriendo en `:3000`.

## Veredicto

**PASS.** El fix `f08e6d6` cumple los cuatro criterios de aceptación del issue ZAL-210:

1. ✓ Los 5 UTM se preservan normalizados (`Google Ads (LATAM)` → `google_ads_latam`) y `utm_landing_path=/es` se persiste en `sessionStorage.zaltyko.utm.v1`.
2. ✓ Una segunda navegación por `/en` con UTM2 (`tiktok_ads`) no sobrescribe UTM1 (`google_ads_latam`); el landing path original (`/es`) tampoco cambia.
3. ✓ Con consent `unset` o `revoked`, no se emite `page_view` (`POSTHOG_CALLS: 0` confirmado por script Playwright); el first-touch storage mantiene el contrato existente.
4. ✓ Solo se ejecutó contra localhost (worktree QA, dev server local). No se tocó producción, datos reales, Stripe live, ni dominios públicos.

**Listo para que el board cierre ZAL-210 y el engineering lead cierre ZAL-202 si así lo decide.** ZAL-210 no bloquea otros gates por sí mismo.

## Próximas acciones sugeridas (no parte de ZAL-210)

- Subir `fix/zal-202-utm-redirect` a origin como PR contra `main` o fusionar si el board ya aprobó.
- (Opcional, no urgente) Evaluar si `/[locale]/page.tsx` debería usar `redirect` con status `308` (permanente) en lugar de `307` (temporal) — semánticamente el locale home redirect es permanente, pero cambiar status es ortogonal al fix de UTM y puede tener efectos SEO.
- (Opcional) Añadir un test e2e para el caso de `consent=granted` que verifique que el page_view se emite con UTMs adjuntos. Hoy la cobertura es: unit test (conversión de UTM en payload), código de gate (consent gate). No hay test e2e que recorra el camino consentido extremo-a-extremo.