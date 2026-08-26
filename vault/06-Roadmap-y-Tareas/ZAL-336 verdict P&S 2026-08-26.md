# ZAL-336 — Veredicto Platform & Security (2026-08-26)

**Issue:** ZAL-336 harness E2E signup + atribución UTM (utm_landing_path)
**Revisor:** Platform & Security (6909a098)
**Alcance:** revisión de seguridad independiente del patch ya integrado en el checkout compartido
**Decisión:** **APROBADO localmente** — sin bloqueos P&S para QA independiente. No es PASS de readiness ni adopción.

## 1. Objeto revisado (archivos citados con evidencia literal)

```
$ ls -la src/lib/supabase/e2e-mock.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  1855 Aug 26 08:35 src/lib/supabase/e2e-mock.ts
$ wc -l src/lib/supabase/e2e-mock.ts
      53 src/lib/supabase/e2e-mock.ts

$ ls -la src/lib/supabase/client.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  3664 Aug 26 08:35 src/lib/supabase/client.ts
$ wc -l src/lib/supabase/client.ts
     128 src/lib/supabase/client.ts

$ ls -la src/lib/supabase/server.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  2310 Aug 26 07:32 src/lib/supabase/server.ts
$ wc -l src/lib/supabase/server.ts
      81 src/lib/supabase/server.ts

$ ls -la src/lib/growth/utm.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  8914 Aug 26 07:31 src/lib/growth/utm.ts
$ wc -l src/lib/growth/utm.ts
     272 src/lib/growth/utm.ts

$ ls -la supabase/migrations/20260826120000_academies_utm_landing_path.sql
-rw-r--r--@ 1 elvisvaldesinerarte  staff   526 Aug 26 07:32 supabase/migrations/20260826120000_academies_utm_landing_path.sql
$ wc -l supabase/migrations/20260826120000_academies_utm_landing_path.sql
      16 supabase/migrations/20260826120000_academies_utm_landing_path.sql

$ ls -la tests/growth-utm-capture.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  14207 Aug 26 08:18 tests/growth-utm-capture.test.ts
$ wc -l tests/growth-utm-capture.test.ts
     437 tests/growth-utm-capture.test.ts
$ grep -c "  it(" tests/growth-utm-capture.test.ts
30
$ grep -c "  test(" tests/e2e-zaltyko-utm-signup.spec.ts
4

$ grep -rn "NEXT_PUBLIC_E2E" .
# (sin salida — 0 matches)

$ npx vitest run tests/growth-utm-capture.test.ts
 RUN  v3.2.6
 Test Files  1 passed (1)
      Tests  37 passed (37)

Observación sobre conteos: `grep -c "  it("` = 30 coincide con declaraciones, no con casos parametrizados. Vitest reporta 37 tests por `it.each` expandido. No es discrepancia, es paramétrico. Evidence Gate: el conteo literal es 30, el run literal es 37.
```

Otros archivos tocados (sin riesgo P&S): `src/components/growth/UtmCapture.tsx`, `src/components/onboarding/OwnerOnboardingForm.tsx`, `src/components/RegisterForm.tsx`, `src/db/schema/academies.ts`, `src/app/api/onboarding/owner/route.ts`, `src/app/api/academies/academies.lib.ts`, `playwright.zal336.config.ts`, `tests/e2e-zaltyko-utm-signup.spec.ts`.

## 2. Controles de seguridad verificados

### 2.1 Seam de auth E2E (crítico — auth/Authorization boundary)

**Diseño actual (corregido tras observación P&S 2026-08-26):**
- Server: `isE2EMockAuthEnabled()` = `NODE_ENV === "development" && E2E_MOCK_AUTH === "1"` (`src/lib/supabase/e2e-mock.ts:17-19`). Solo el servidor decide; no hay `NEXT_PUBLIC_*`.
- Cliente: `isE2EMockAuthClientEnabled(cookieHeader)` = `NODE_ENV === "development"` + cookie `zaltyko_e2e_mock_client=1` (`e2e-mock.ts:26-32`). Playwright la inyecta localmente antes de navegar.
- Sin `NEXT_PUBLIC_E2E_MOCK_AUTH` en bundle — verificado con `grep -rn` → 0 matches. Un deploy preview/prod no puede activar el mock por variable pública accidental.

**Análisis:**
- Producción: `NODE_ENV=production` ⇒ ambas guardas retornan `false` aunque exista la cookie. No hay bypass de Supabase Auth en producción.
- Cookie `zaltyko_e2e_mock_auth` es `document.cookie` legible por JS (no httpOnly) pero solo existe en dev con flag explícito. No se persiste fuera del harness.
- Mock implementa solo `signUp/getUser/getSession/signOut/onAuthStateChange/signInWithOAuth` stub; no expone service_role ni RLS bypass.
- **Riesgo residual:** XSS local en dev podría leer la cookie mock, pero el harness solo corre contra localhost y DB sintética. Aceptable como riesgo local/sandbox.
- **Prueba negativa:** intentar activar el mock en prod (NODE_ENV=production + cookie=1) ⇒ `createClient` cae al `createBrowserClient` real, `createServerClient` real.

**Veredicto:** Gate de auth cerrado para prod. Observación previa corregida y verificada literalmente.

### 2.2 Aislamiento multi-tenant y RLS

- `utm_landing_path` es columna aditiva en `academies` (`supabase/migrations/20260826120000...sql` con `ADD COLUMN IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`). No crea tabla nueva ni altera RLS.
- `createAcademy` y `POST /api/onboarding/owner` validan `utm_landing_path` con Zod `.startsWith("/").max(512).nullable()` defensivo en ambos paths (`academies.lib.ts:64`, `route.ts:73`). DB no impone CHECK, pero API es la única escritura.
- `UtmCaptureEffect` solo captura landing path si hay UTM válida (`Object.values(params).some(Boolean)`), y `captureFirstTouchLandingPath` exige `startsWith("/")` y `length <=512`, descarta query params. No hay cross-tenant leak: el valor viaja en el POST del dueño autenticado y se persiste en su propia academia.

### 2.3 Validación de entrada / inyección

- `normalizeLandingPath` rechaza `https://...`, paths sin `/`, vacíos y >512 — probado en `growth-utm-capture.test.ts` (4 tests del describe ZAL-336). Captura es `first-touch` no sobrescribible.
- Zod + `trim()` en server previene strings largos o con espacios. No hay interpolación SQL (Drizzle ORM).

### 2.4 Privacidad / GDPR (Art. 8, base legal, tracking)

- `utm_*` y `utm_landing_path` se almacenan en `academies` (propiedad de la academia, titular adulto). No son datos de menores (atletas). Base legal encuadrable como interés legítimo / ejecución de contrato de onboarding (medición first-party de origen), pero hoy **UtmCapture no está gateado por consent** — captura sessionStorage en cada page load sin predicate `isConsentGrantedAndActive`.
- Para academias no aplica consent de menor, pero si el tracking se extendiera a familias/atletas menores habría gap Art. 8. **Deuda no bloqueante:** documentar en `Decisiones.md` que UTM first-party de onboarding queda explícitamente fuera del consent gate (o gatearlo si el board decide que es tracking no esencial). No bloquea aprobación local porque no hay datos reales de menores involucrados en este flujo.
- DPA/Residencia/Stripe/Brevo/Supabase fuera de alcance de este patch (infra existente).
- Cookies: solo `zaltyko_first_touch_utm` y `zaltyko_first_touch_utm_landing_path` en `sessionStorage`; no son cookies de tracking cross-site.

### 2.5 Pagos / secretos / producción

- Sin Stripe, sin secretos, sin `DATABASE_URL` hardcodeado, sin migración remota aplicada (changelog lo declara: migration versionada pero no aplicada fuera de local). `pnpm db:migrate:ledger` no ejecutado remotamente.
- `RegisterForm` cambia `router.push` por `window.location.assign("/auth/redirect")` para seguir redirect HTTP; `OwnerOnboardingForm` añade `utm_landing_path` al body sin exponer secretos.

## 3. Pruebas negativas (propias de P&S)

1. **Path externo:** `captureFirstTouchLandingPath("https://example.com/landing")` ⇒ `null` (rechazado).
2. **Path sin slash:** `normalizeLandingPath("landing-without-slash")` ⇒ `null`.
3. **Overwrite:** segundo `captureFirstTouchLandingPath("/segunda")` no pisa `/es/gimnasia-artistica` first-touch.
4. **Cookie sin flag:** `isE2EMockAuthClientEnabled("zaltyko_e2e_mock_client=1")` con `NODE_ENV=production` ⇒ `false`.
5. **Activación prod:** `isE2EMockAuthEnabled()` con `NODE_ENV=production,E2E_MOCK_AUTH=1` ⇒ `false`.

Todas verificadas por lectura de código + tests unitarios (37 passed).

## 4. Evidencia ejecutada (local/sandbox — no es readiness)

- `npx vitest run tests/growth-utm-capture.test.ts` → `Test Files 1 passed (1) / Tests 37 passed (37)` (literal arriba).
- `grep -c "  test(" tests/e2e-zaltyko-utm-signup.spec.ts` → `4` escenarios (UTM completo, direct, claim con first-touch, second-touch sin overwrite).
- Changelog 2026-08-26 del Engineering: Playwright dedicado `Running 4 tests using 1 worker` / `4 passed (56.6s)` y Vitest focalizado `Tests 41 passed (41)` (incluye e2e harness). No reejecutado aquí por requerir Postgres sintética + Next dev; se toma como evidencia de Engineering local, pendiente de repetición independiente de QA (gate siguiente).
- `git diff --check` sin salida, ESLint focal sin salida (changelog). `pnpm typecheck` global bloqueado por 10 `implicit any` preexistentes — no introduce regresión en este scope.

## 5. Decisión de gate

**APROBADO localmente** con **1 observación corregida** (ya aplicada: eliminar `NEXT_PUBLIC_E2E_MOCK_AUTH`, usar cookie de activación local). No se detectó bypass de auth en producción, ni leak cross-tenant, ni inyección, ni escalada de privilegios.

**No constituye:** readiness productivo, adopción, validación externa del proveedor Supabase Auth, ni validación humana. No autoriza deploy, migración remota, Stripe live, datos reales, pricing, campañas o publicaciones.

**Próximo gate:** QA repite los 4 escenarios E2E desde checkout limpio (Backlog 2026-08-26). Si QA PASS, ZAL-336 puede avanzar a `done` sin nuevo gate P&S salvo que el harness cambie.

**Riesgos residuales a registrar (no bloqueantes):**
- UTM first-party sin gate de consent — decidir y documentar base legal explícitamente antes de extender a tracking de familias/atletas.
- Descanso de `growth_events` warnings best-effort en base sintética local — cosmético, no afecta POST 201.
