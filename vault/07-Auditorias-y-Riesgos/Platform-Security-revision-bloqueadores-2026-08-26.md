---
status: active
owner: platform-security
date: 2026-08-26
type: revision-bloqueadores
auditor: Platform & Security (6909a098)
scope: P&S blocked issues + E2E mock seam ZAL-336
---

# Platform & Security — Revisión periódica de bloqueadores 2026-08-26

## Resumen ejecutivo

**Gate semanal:** 4 issues P&S en `blocked` (ZAL-928, ZAL-946, ZAL-976, ZAL-961) + 1 issue Paperclip crítico (ZAL-913) que bloquea el control-plane. Ninguna requiere implementación de producto ordinaria; todas requieren autorización/evidencia externa o acción del board/Engineering Lead. Se revisa además el seam E2E `isE2EMockAuthEnabled` introducido en ZAL-336 (rama `fix/zal-336-utm-signup-e2e`, 13 archivos modificados, HEAD local `M`).

**Decisión de gate global:** BLOQUEADO — ninguna transición a `done` sin board/Engineering Lead. Detalle por issue abajo.

---

## 1. ZAL-913 — PATCH /api/issues/:id sin auth (critical, Web Developer 5bcea506)

- **Estado:** `blocked` desde 2026-08-25T12:01Z. ZAL-920 (restaurar adapter) ya en `done`.
- **Riesgo:** Bypass de hold 02-ago: `PATCH` sin auth mutó ZAL-363 backlog→in_progress (HTTP 200) y revert inmediato también 200. Pre-flight de ZAL-363 abortó el `PATCH done` irreversible — sin ese guard, habría sido mutación irreversible sin auth.
- **Controles esperados:** Auth gate en `server/src/routes/issues` o middleware, pruebas negativas (PATCH sin token → 401, token inválido → 401, user sin membership → 403).
- **Bloqueador real:** Adapter `claude_local` sin crédito; retry falló antes de ejecutar producto (`acpx_turn_failed: Credit balance is too low`). Board debe restaurar crédito o conceder `agents:configure` temporal, resetear runtime y reintentar ZAL-913.
- **Gate P&S:** BLOQUEADO — requiere board/runtime operator. No tocar código hasta retry. Escala a CEO si se detecta exploit activo en producción (GBDPR brecha → 72h). Evidencia: ZAL-913 `blockedTransitionAt 2026-08-25T12:01:58Z`.

## 2. ZAL-928 — Platform & Security review ZAL-295 recovery safety (critical, P&S 6909a098)

- **Estado:** `blocked` con veredicto **PASS** publicado (comentarios `1ea7f4ae` + actual). Transición a `done` rechazada por SHA gate: `recovery.pause.codeGates is on` (ZAL-88/ZAL-924).
- **Alcance auditado:** `fix/zal-231-no-code-sha-gate` commit `e924531d` (`fix(recovery): add auth stop and adapter circuit breaker`). Validado: `claude_auth_required` en `NON_RETRYABLE_CONTINUATION_ERROR_CODES` (`service.ts:380`), `classifyContinuationFailure:517` → `kind non_retryable`, circuito solo in-process aislado por `adapterType`, cuenta solo `provider_quota/codex_harness_crash/adapter_failed` con mensaje quota, sin tocar `runtime-flags.ts`, sin `acpx_local`, sin secretos.
- **Gate P&S:** APROBADO localmente, BLOQUEADO por toggle global. **Board debe ejecutar** `PATCH /api/issues/ZAL-928 status=done` tras levantar `recovery.pause.codeGates` (ZAL-934 todo, ZAL-924 todo). No re-verificar código; el veredicto ya es durable. Distinguir: evidencia local PASS ≠ readiness productivo hasta que el board levante el gate.

## 3. ZAL-946 — Entregar secret_ref academia E2E sandbox + storage state (critical, P&S 6909a098)

- **Estado:** `blocked` (grandchild de ZAL-749). `blockedTransitionAt 2026-08-24T16:42:34Z`.
- **Riesgo GDPR/multi-tenant:** Secret_ref toca namespace Supabase compartido con prod; cualquier fuga escala a CEO inmediato (runbook Customer Support). Proyecto sandbox `aeeootdmuiqkfeernskw` NXDOMAIN — no provisionado.
- **Acción requerida (ordenada):**
  1. **Elvis + board** crean proyecto Supabase sandbox nuevo **región EU North** (GDPR residencia datos — TODO actual: confirmar región sandbox, nunca asumido). Esto es acción irreversible multi-tenant → requiere board/CE0.
  2. P&S provisiona academia E2E sandbox dedicada + `storageState` fresco.
  3. Entrega `secret_ref` a Web Developer (5bcea506, ZAL-923) **por canal seguro** (NO comentario/repo/log/chat).
  4. Confirmar plan sandbox sin cobros reales + bindings `env.E2E_ACADEMY_ID`, `env.E2E_STORAGE_STATE`, `env.BASE_URL`.
- **Gate P&S:** BLOQUEADO — sin secret_ref no hay paso 3 (axe + Playwright 18 checks → 18 skipped) ni paso 4 (reporte literal). Re-block aplicado tras harness rewake (run `9bd069e1` → `claude_auth_required` puerto 3102 vs real 3100). Sin nueva señal externa (cero comentarios Elvis/board/CS desde `ad6f73b1`), permanece blocked. Próximas señales: nuevo secret_ref, resolución A/B/C en ZAL-749, o comentario board/CS que cambie scope.
- **No hacer:** No pegar credenciales, no tocar producción/dominios públicos/datos reales/Stripe live/migraciones remotas.

## 4. ZAL-976 — Platform & Security de writer y migración A3 (high, P&S 6909a098)

- **Estado:** `blocked` con veredicto **BLOCKED** publicado (`abbfe95e` 2026-08-25). Checkout auditado `zal770-recovered` HEAD `15863c5b` estado `M` + `??`.
- **Hallazgo:** Engineering Lead ZAL-656 (acade097) debe restaurar `canonical-adapter.ts` (`server-only`), `canonical.ts` y migración `20260825090000_growth_events_canonical_a3.sql` antes de re-revisión. Criterios P&S: no exponer credenciales, no importar `server-only` desde cliente, writer con tenant/academy scope + retries + conflicto único, SQL aditivo sin aplicar remoto, negativos de prod/consentimiento/propiedades prohibidas.
- **Gate P&S:** BLOQUEADO — reabrir ZAL-976 solo tras restauración por Engineering Lead. No implementar producto ordinario desde P&S.

## 5. ZAL-961 — Revalidar ZAL-957 tras correcciones tenant y QA (high, P&S 6909a098)

- **Estado:** `blocked` con veredicto **FAIL bloqueante** (5ª iteración, `58d3103e` 2026-08-25). HEAD `c4bf453b` `fix(billing): require payment method for SCA recovery`, cero commits nuevos desde 2026-08-23.
- **Gaps P0 persistentes (evidencia literal rehecha):** `vitest.qa.config.ts` INEXISTENTE, `tests/qa/` INEXISTENTE, `tests/qa/zal-565/hardening.test.ts` INEXISTENTE. Suite `pnpm exec vitest run --config vitest.qa.config.ts` falla `Could not resolve`.
- **Gate P&S:** BLOQUEADO — Engineering Lead (acade097) debe `git add -A` + materializar los 6 controles P0. Work product durable: `vault/06-Roadmap-y-Tareas/ZAL-961 verdict P&S revalidacion ZAL-957 2026-08-25.md` (18492 B / 271 L), suite 17/17 verde sobre `Zaltyko-fresh HEAD 70232957` solo en harness aislado, no en árbol local.

## 6. ZAL-336 — E2E Playwright signup UTM (high, Engineering Lead acade097, in_progress → in_review)

**No es issue P&S**, pero el diff toca superficie de seguridad y se revisa por cortesía (revisiones P&S se activan en auth/aislamiento/RLS/pagos/migraciones/uploads/secretos/infra/prod).

### Cambios relevantes (git diff HEAD, 13 archivos, 273 inserciones)

- `src/lib/supabase/e2e-mock.ts` (nuevo), `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts` — seam mock cookie `zaltyko_e2e_mock_auth`.
- `src/lib/growth/utm.ts`, `src/components/growth/UtmCapture.tsx` — first-touch UTM + landing path.
- `src/app/api/onboarding/owner/route.ts`, `src/app/api/academies/academies.lib.ts`, `src/db/schema/academies.ts` — persistencia `utm_*` + `utmLandingPath`.
- `supabase/migrations/20260826120000_academies_utm_landing_path.sql` — columna aditiva idempotente, no aplicada remoto.
- `src/components/RegisterForm.tsx`, `src/components/onboarding/OwnerOnboardingForm.tsx` — lectura `sessionStorage` > URL params.

### Análisis de riesgo P&S

| Vector | Evaluación | Controles |
|---|---|---|
| **Bypass auth vía mock** | **Medio si se despliega mal, Bajo local** | `isE2EMockAuthEnabled()` gatea por `NODE_ENV=development && (E2E_MOCK_AUTH=1 || NEXT_PUBLIC_E2E_MOCK_AUTH=1)` en client y server. Bien: mock no corre en `production` aunque `E2E_MOCK_AUTH=1` esté seteado, porque `NODE_ENV` sería `production`. Riesgo residual: `NEXT_PUBLIC_E2E_MOCK_AUTH` es variable **pública** (prefijo `NEXT_PUBLIC_`) que Vercel inyecta al bundle cliente en build. Si alguien la deja en `1` en preview/production, el bundle cliente incluiría el path mock aunque server no lo active (server revisa `NODE_ENV`). **Recomendación P&S:** eliminar `NEXT_PUBLIC_E2E_MOCK_AUTH` del OR y dejar solo `E2E_MOCK_AUTH` (server-only) o gatear además por `process.env.VERCEL_ENV !== "production"`. No es bloqueante local, sí es hardening antes de merge. |
| **Inyección UTM** | Bajo | Validación `normalizeUtmValue` (`^[a-z0-9_-]+$`, max 128) + `normalizeLandingPath` (`startsWith("/")`, max 512) aplicada en `utm.ts` y re-validada server-side con Zod (`z.string().trim().min(1).max(128)` y `.startsWith("/")`). Defensa en profundidad OK. Sin XSS: valores no se interpolan en HTML sin escape. |
| **Fuga PII / GDPR** | Bajo | UTMs son atribución first-party, sin PII. `utmCapturedAt` + `utm_*` en `academies` es dato de academia, no de menor. No toca datos de atletas. Base legal: necesario para contrato (gestión academia) + analítica first-party con consent implícito (no es tracking cross-site). Gate de consent para analytics (page_view consentido) sigue separado — UTM capture no bakes cookies de terceros. |
| **RLS / aislamiento tenant** | OK | `academies` ya tiene RLS 65/65. UTMs se escriben solo vía `createAcademy` dentro de `withTransaction` + `pg_advisory_xact_lock(hashtext(user.id))` — race de doble-click ya mitigado. Tenant se deriva de `profile.tenantId`, no de input cliente. |
| **Migración** | OK | `20260826120000_academies_utm_landing_path.sql` es `ADD COLUMN IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`, comentario, sin `drizzle-kit push`, sin aplicar remoto. Orden idempotente. |

### Pruebas negativas sugeridas (para QA/Engineering Lead, no bloqueantes P&S)

- `E2E_MOCK_AUTH=1` en `NODE_ENV=production` → `isE2EMockAuthEnabled() === false` (mock no activo).
- `NEXT_PUBLIC_E2E_MOCK_AUTH=1` sin `E2E_MOCK_AUTH` en dev → discutir si debe activar mock (propuesta P&S: no).
- Cookie `zaltyko_e2e_mock_auth` con JSON malformado / `id` no-string → `parseE2EMockUser === null`, server devuelve `user null` (no crash).
- UTM `utm_source=../../etc/passwd` o con espacios/mayúsculas → `normalizeUtmValue === null`, fallback `direct/none`.
- `utm_landing_path` sin `/` inicial o >512 chars → `null`, no se persiste.

### Decisión P&S sobre ZAL-336

**APROBADO localmente con observación menor** (eliminar `NEXT_PUBLIC_E2E_MOCK_AUTH` del seam antes de merge). No bloquea `in_review` → `done`; la decisión final es de QA/Engineering Lead. Distinción: aprobado local ≠ readiness productivo — producción requiere Vercel preview con `E2E_MOCK_AUTH` unset y verificación de que el bundle no contiene el mock path.

---

## GDPR — recordatorio vigente (board 2026-08-04)

Esta revisión no introduce datos de menores ni tratamiento nuevo. Se recuerda que ZAL-336/UTM no toca datos de atletas (Art. 8 GDPR). Si en el futuro se capturan UTMs ligados a perfil de menor, el consent gate GTM-DEP debe cubrir consentimiento parental verificable, no solo marketing/analytics. DPA con Supabase/Stripe/Brevo y residencia EU North siguen pendientes de evidencia en ZAL-946/ZAL-749 — flagueados arriba.

---

## Acciones y owners

| Issue | Acción exacta de desbloqueo | Owner |
|---|---|---|
| ZAL-913 | Restaurar crédito `claude_local` o conceder `agents:configure` temporal → reset runtime → retry único ZAL-913 | Board / operador |
| ZAL-928 | Levantar `recovery.pause.codeGates` (board) → `PATCH ZAL-928 done` | Board |
| ZAL-946 | Elvis crea proyecto Supabase sandbox EU North → P&S provisiona academia + storageState → entrega `secret_ref` por canal seguro a 5bcea506 | Elvis + board + P&S |
| ZAL-976 | Engineering Lead restaura `canonical-adapter.ts` + `canonical.ts` + migración `20260825090000` → reabrir ZAL-976 | acade097 |
| ZAL-961 | Engineering Lead materializa 6 controles P0 + `vitest.qa.config.ts` + `tests/qa/` → reabrir ZAL-961 | acade097 |
| ZAL-336 | Engineering Lead elimina `NEXT_PUBLIC_E2E_MOCK_AUTH` del gate E2E antes de merge (hardening) | acade097 |

Vault: actualizadas `vault/07-Auditorias-y-Riesgos/Platform-Security-revision-bloqueadores-2026-08-26.md`
