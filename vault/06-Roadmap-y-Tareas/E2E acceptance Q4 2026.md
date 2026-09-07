---
type: qa-spec
status: proposed
created: 2026-09-07
owner: Engineering Lead (acade097) + QA
relacionado_con:
  - vault/06-Roadmap-y-Tareas/Plan sprints Q4 2026 post-audit professionalizacion.md
  - vault/06-Roadmap-y-Tareas/Issues backlog post-audit 2026-09-07.md
politica: ZAL-169 (antifabricación) activa — ningún escenario se cierra sin verificación reproducible
---

# E2E acceptance tests Q4 2026 — post-audit

> Por cada sprint del Plan Q4, este doc define los **E2E scenarios de aceptación** en formato Gherkin.
>
> Cada scenario tiene criterios de aceptación verificables + comandos de verificación ejecutables.
>
> **codex NO ejecuta**. Engineering Lead + QA corren, archivan evidencia, cierran issues ZAL.

---

## Sprint Q4.1 — Triage R6 + ZAL-169 + DPO

### Scenario 1.1: Triage completo de 30 fallos R6

**Given**: 9 suites excluidas del CI con 30 fallos pre-existentes (commit `d93ec123`).
**When**: Engineering Lead ejecuta `pnpm exec vitest run --config vitest.config.ts` para cada suite.
**Then**: 30 fallos categorizados individualmente como `bug-prod` o `infra-test-missing`.

**Acceptance criteria**:
- [ ] Tabla `vault/06-Roadmap-y-Tareas/Triage R6 2026-09-07.md` con 30 filas (1 por fallo).
- [ ] Cada fila incluye: suite, test path, error verbatim (copy-paste), categoría, blast radius, issue ZAL asignado (ZAL-1250 a ZAL-1279).
- [ ] Issues ZAL-1250 a ZAL-1279 creados en Paperclip con categorización + body verbatim.

**Verification**:

```bash
ls vault/06-Roadmap-y-Tareas/Triage\ R6\ 2026-09-07.md
wc -l vault/06-Roadmap-y-Tareas/Triage\ R6\ 2026-09-07.md  # ≥ 30

# Cross-check contra R6 catalog
git rev-parse --verify d93ec123  # SHA literal

# Issues en Paperclip
gh issue list --label "audit-2026-09-07" --state open --search "R6 in:title" | wc -l  # → 30
```

---

### Scenario 1.2: ZAL-169 investigación cerrada

**Given**: Doc 2026-08-25 (`vault/06-Roadmap-y-Tareas/ZAL-P&S-bloqueadores-revision-2026-08-25.md` líneas 32-46) afirma "17/17 PASS local" para ZAL-565 hardening; R6 diagnostic refuta con 7/10.
**When**: Engineering Lead busca log verbatim de la corrida original 2026-08-25.
**Then**: O se reproduce (PASS legítimo archivado) O se documenta fabricación.

**Acceptance criteria**:
- [ ] Log verbatim archivado en `vault/07-Auditorias-y-Riesgos/Investigacion ZAL-169/log-2026-08-25.txt` (reproducido, exit 0, output completo).
- [ ] O escalación formal a Board con `ZAL-1272` actualizado a `status: confirmed-fabrication` + label `antifabricacion-zal-169`.
- [ ] Si fabricación confirmada: reapertura formal de ZAL-961 + ZAL-336 contra `d93ec123` (refutación literal).

**Verification**:

```bash
ls vault/07-Auditorias-y-Riesgos/Investigacion\ ZAL-169/
# → log-2026-08-25.txt (reproducido) O escalacion-board.md

# Status ZAL-1272
gh issue view ZAL-1272 --json state,labels | jq '.labels[].name'
# → ["reproduced-legitimately"] OR ["antifabricacion-zal-169", "fabrication-confirmed"]
```

---

### Scenario 1.3: DPO contratado + brief entregado

**Given**: CEO necesita validación GDPR (Q-D2-1).
**When**: CEO firma contrato con DPO externo (€1500-€3500).
**Then**: DPO entrega informe firmado en 2-5 días con validación específica.

**Acceptance criteria**:
- [ ] Contrato DPO archivado en `vault/08-Referencias/DPAs/dpo-contract-2026-09.pdf`.
- [ ] Informe DPO con checklist de remediación GDPR:
  - [ ] Validación modelo `guardian_consent` (threshold edad, evidencia, retirada).
  - [ ] Validación job anonimización (PII replacement, FK integrity, audit log).
  - [ ] Confirmación política de retención (Q-D2-4 tabla).
  - [ ] Revisión DPAs con sub-processors.
- [ ] Timeline: 5 días máx desde firma contrato.

**Verification**:

```bash
ls vault/08-Referencias/DPAs/
# → dpo-contract-2026-09.pdf + dpo-report-2026-09.pdf

# Checklist en informe
pdftotext dpo-report-2026-09.pdf - | grep -i "guardian_consent\|anonymization\|retention\|DPA"
# → 4+ matches
```

---

## Sprint Q4.2 — Zod 39 + LemonSqueezy HMAC + OpenAPI

### Scenario 2.1: Zod validación en 5 rutas AI/billing P0

**Given**: 5 rutas AI/billing aceptan body parse manual (riesgo prompt injection + datos financieros malformados).
**When**: Engineering Lead añade `schema.parse(await request.json())`.
**Then**: Las 5 rutas rechazan body malformado con `400` + error estructurado (`apiError()`).

**Acceptance criteria**:
- [ ] Schemas Zod en `src/lib/schemas/ai.ts`, `src/lib/schemas/billing.ts`.
- [ ] Tests con payload válido (200) + payload malformado (400 con código específico).
- [ ] `.nullable()` donde forms cliente envían `null` (recordatorio ZAL-258 / ZAL-180).
- [ ] Rutas cubiertas: `/api/ai/communication/chat`, `/api/ai/billing/predict-delinquency`, `/api/ai/communication/generate-progress-update`, `/api/ai/billing/generate-reminder`, `/api/ai/attendance/analyze-risk`.

**Verification**:

```bash
grep -rn "schema.parse\|Schema.parse" src/app/api/ai --include="route.ts" | wc -l  # ≥ 5
grep -rn "schema.parse\|Schema.parse" src/app/api/billing --include="route.ts" | wc -l  # ≥ 3

pnpm exec vitest run tests/api/ai tests/api/billing
# → 0 failures

# Test E2E payload malformado
curl -X POST /api/ai/communication/chat -H "Cookie: $TEST_COOKIE" \
  -d '{"invalid":"data"}' | jq '.error.code'
# → "VALIDATION_ERROR" con detalles de campos faltantes
```

---

### Scenario 2.2: LemonSqueezy rechaza payload sin firma

**Given**: Handler `src/utils/lemon.ts` solo loguea el payload (sin verificación).
**When**: Llega webhook con `X-Signature` inválida.
**Then**: Handler responde `401` sin mutar DB.

**Acceptance criteria**:
- [ ] HMAC verification con `LEMON_SQUEEZY_WEBHOOK_SECRET` antes de cualquier mutación.
- [ ] Patrón replicado de `src/app/api/stripe/webhook/route.ts` (que usa `constructEvent`).
- [ ] Test con payload firmado válido (200) + payload alterado (401) + payload sin firma (401).
- [ ] Logs explícitos de rechazo con timestamp + IP (para audit trail).

**Verification**:

```bash
pnpm exec vitest run tests/lib/lemon-webhook
# → exit 0 (3 tests: válido, alterado, sin firma)

# Test E2E manual con curl
curl -i -X POST https://zaltyko.vercel.app/api/lemon/webhook \
  -H "X-Signature: invalid" \
  -H "Content-Type: application/json" \
  -d '{"event":"test"}'
# → HTTP/1.1 401

# Con firma válida
SIG=$(echo -n '{"event":"test"}' | openssl dgst -sha256 -hmac "$LEMON_SQUEEZY_WEBHOOK_SECRET" | awk '{print $2}')
curl -i -X POST https://zaltyko.vercel.app/api/lemon/webhook \
  -H "X-Signature: $SIG" \
  -H "Content-Type: application/json" \
  -d '{"event":"test"}'
# → HTTP/1.1 200
```

---

### Scenario 2.3: OpenAPI spec navegable

**Given**: 307 rutas API sin spec generado (next-swagger-doc + swagger-jsdoc instalados pero sin usar).
**When**: Engineering Lead corre `pnpm exec tsx scripts/generate-openapi.ts`.
**Then**: spec servida en `/api/openapi.json` + UI en `/api/docs` con las 307 rutas.

**Acceptance criteria**:
- [ ] `public/openapi.json` existe, ≥ 50KB, schema OpenAPI 3.0+.
- [ ] `GET /api/openapi.json` responde 200 con cache `revalidate: 3600`.
- [ ] `GET /api/docs` renderiza `swagger-ui-react` navegable.
- [ ] CI hace diff de spec por PR (falla si breaking change sin flag deprecation).
- [ ] Baseline OpenAPI congelado al inicio del sprint (tag git).

**Verification**:

```bash
pnpm exec tsx scripts/generate-openapi.ts && ls -la public/openapi.json  # ≥ 50KB

curl -s https://zaltyko.vercel.app/api/openapi.json | jq '.info.title, (.paths | keys | length)'
# → "Zaltyko API" / 307

curl -s https://zaltyko.vercel.app/api/docs | grep -i "swagger-ui"
# → UI presente

# CI diff (simulado)
git diff main -- public/openapi.json | wc -l  # > 0 si PR rompe contrato
```

---

## Sprint Q4.3 — GDPR compliance

### Scenario 3.1: Atleta <14 años no se registra sin consentimiento del tutor

**Given**: academy.country = "ES" (threshold 14), academy.thresholdAge = 14 (configurable).
**When**: Padre intenta registrar atleta de 12 años sin `guardian_consent` firmado.
**Then**: API devuelve `403` con código `GUARDIAN_CONSENT_REQUIRED` + email al tutor con link firmado.

**Acceptance criteria**:
- [ ] Tabla `guardian_consent` con columnas: `athleteId`, `guardianId`, `consentVersion`, `consentAt`, `consentIp`, `withdrawalAt`, `signatureToken` (one-time use).
- [ ] Threshold derivado de `academies.country` (default 14 ES, 16 otros UE, configurable).
- [ ] Email al tutor (Brevo) con link firmado + token de aceptación.
- [ ] Versión de términos persistida en cada consentimiento (Art. 7 GDPR).
- [ ] Test E2E: POST `/api/athletes` con `age=12` → 403.

**Verification**:

```bash
grep -rn "guardian_consent" src/db/schema/ | head -5

# Seed sintético
pnpm exec tsx scripts/seed-test-academy.ts --country ES
TEST_COOKIE=$(pnpm exec tsx scripts/get-test-cookie.ts --email owner@test.com)

# Sin consentimiento → 403
curl -X POST /api/athletes -H "Cookie: $TEST_COOKIE" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","age":12,"email":"test@example.com"}' | jq '.error.code'
# → "GUARDIAN_CONSENT_REQUIRED"

# Con consentimiento firmado
pnpm exec tsx scripts/sign-consent.ts --athleteEmail "test@example.com" --guardianEmail "tutor@example.com"
sleep 2  # Brevo entrega email
TOKEN=$(pnpm exec tsx scripts/extract-consent-token.ts --guardianEmail "tutor@example.com")
curl -X POST /api/guardians/consent -H "Cookie: $TEST_COOKIE" \
  -d "{\"token\":\"$TOKEN\",\"signature\":\"signed\"}"
# → 200

# Ahora registro OK
curl -X POST /api/athletes -H "Cookie: $TEST_COOKIE" \
  -d '{"name":"Test","age":12,"email":"test@example.com"}'
# → 200 con athlete.id
```

---

### Scenario 3.2: Job anonimización reemplaza PII de atletas dados de baja >2 años

**Given**: Atleta con `deletedAt` > 2 años + sin cargos pendientes en `billing_charges`.
**When**: Corre cron mensual `src/jobs/anonymize-athletes.ts` (Vercel Cron, 1er día del mes).
**Then**: PII (name, email, phone) reemplazada por `sha256(id)` + `null`; FKs intactas.

**Acceptance criteria**:
- [ ] Job testeado con datos sintéticos.
- [ ] FK integridad mantenida (athlete.id sigue apuntando a clases, pagos).
- [ ] Audit log: cada anonimización guarda `originalHash` (para des-anonimizar si requerimiento legal).
- [ ] Cron monthly + verificación manual trimestral CEO.
- [ ] Job NO anonimiza atletas con cargos pendientes (bloquea hasta resolución).

**Verification**:

```bash
# Seed atletas viejos sin cargos
pnpm exec tsx scripts/seed-old-athletes.ts --deletedDays 800 --noCharges

# Seed atletas viejos CON cargos (no deben anonimizarse)
pnpm exec tsx scripts/seed-old-athletes.ts --deletedDays 800 --withPendingCharges

# Correr job
pnpm exec tsx src/jobs/anonymize-athletes.ts --dry-run  # primero dry-run
# → lista de atletas que serían anonimizados
pnpm exec tsx src/jobs/anonymize-athletes.ts  # ejecución real

# Verificar
sqlite3 test.db "SELECT id, name, email FROM athletes WHERE deleted_at < NOW() - INTERVAL '2 years'"
# → name='sha256(id)', email=NULL para los sin cargos
# → name original para los con cargos pendientes

# FK integrity
sqlite3 test.db "SELECT COUNT(*) FROM classes WHERE athlete_id IN (SELECT id FROM athletes WHERE name LIKE 'sha256%')"
# → > 0 (FKs intactas)
```

---

### Scenario 3.3: 3 DPAs firmados y archivados

**Given**: Necesidad regulatoria Art. 28 GDPR (sub-processors).
**When**: CEO firma DPA con Supabase, Stripe, Brevo.
**Then**: 3 PDFs archivados + EU North residency verificada para Supabase.

**Acceptance criteria**:
- [ ] DPA Supabase con EU North residency verificada (Ireland region).
- [ ] DPA Stripe categoría Business con EU data residency.
- [ ] DPA Brevo Business con cláusula de sub-procesadores.
- [ ] Cada DPA tiene vigencia ≥ 1 año + renovación automática.

**Verification**:

```bash
ls vault/08-Referencias/DPAs/
# → supabase-dpa-2026-09.pdf stripe-dpa-2026-09.pdf brevo-dpa-2026-09.pdf

# Verificar contenido
for dpa in supabase stripe brevo; do
  pdftotext vault/08-Referencias/DPAs/${dpa}-dpa-2026-09.pdf - | grep -i "data residency\|EU North\|GDPR" | head -3
done
# → 3 DPA con cláusulas GDPR mencionadas
```

---

## Sprint Q4.4 — Performance y resiliencia

### Scenario 4.1: Retry exponencial en Supabase queries críticas

**Given**: Fallos transitorios de Supabase (timeout, 5xx) propagan 500 al usuario.
**When**: Engineering Lead aplica `withRetry()` a queries críticas.
**Then**: 3 retries con backoff exponencial + jitter; transparente al usuario.

**Acceptance criteria**:
- [ ] `src/lib/retry.ts` con `withRetry(fn, { maxRetries: 3, backoff: "exponential", jitter: true })`.
- [ ] Tests unitarios cubren: retry exitoso, max retries exceeded, jitter aplicado, no retry en 4xx.
- [ ] Aplicado a: `db.query.atletas`, `db.query.clases`, growth events job.
- [ ] Métrica `retry_attempts_total` exportada a Sentry/Vercel Analytics.

**Verification**:

```bash
pnpm exec vitest run src/lib/retry.test.ts
# → exit 0 (5+ tests: success, transient-then-success, max-retries-exceeded, jitter, no-retry-4xx)

grep -rn "withRetry" src/lib/db --include="*.ts" | wc -l  # ≥ 5

# Test E2E con mock Supabase que falla 2 veces
pnpm exec tsx scripts/test-retry-mock.ts
# → 3er intento succeed, usuario ve 200, retry_attempts_total = 2
```

---

### Scenario 4.2: 0 console statements

**Given**: 66 console statements en `src/` redundantes con Sentry.
**When**: Engineering Lead migra a `logger.error/warn/debug`.
**Then**: ESLint `no-console: error` rechaza cualquier console nuevo en CI.

**Acceptance criteria**:
- [ ] 0 console statements en `src/` (`*.ts`, `*.tsx`).
- [ ] ESLint rule `no-console: error` en `.eslintrc.json`.
- [ ] CI falla si se introduce console statement en PR.

**Verification**:

```bash
grep -rE "console\.(log|error|warn)" src/ --include="*.ts" --include="*.tsx" | wc -l  # → 0

grep "no-console" .eslintrc.json
# → "no-console": "error"

pnpm lint  # exit 0

# Test E2E: introducir console debe fallar CI
echo 'console.log("test");' >> src/test-temp.ts
pnpm lint
# → exit 1 (console detectado)
rm src/test-temp.ts
```

---

### Scenario 4.3: `pnpm build` sin OOM

**Given**: Vercel preview 8GB OOM con cualquier commit source-touching (commit history confirma 2/2 intentos en PR #110).
**When**: Engineering Lead aplica bundle reduction (lazy load + tree-shaking) o upgrade a `large` build machine.
**Then**: `pnpm build` exit 0 sin trivial-commit retry.

**Acceptance criteria**:
- [ ] Build local exit 0 en < 4 min.
- [ ] Vercel preview exit 0 sin retry.
- [ ] Lighthouse score > 80 en 3 rutas críticas (`/dashboard`, `/app/[academyId]/dashboard`, `/pricing`).
- [ ] Bundle del cliente por ruta < 250KB (medido en `.next/build-manifest.json`).

**Verification**:

```bash
pnpm build && echo "Exit: $?"
# → "Exit: 0" (sin OOM)

# Bundle size por ruta
cat .next/build-manifest.json | jq '[.pages[] | select(.bundlePath)] | map(.size) | add'
# → < 250KB por ruta promedio

# Vercel check (asumiendo PR de prueba)
gh pr checks --json name,conclusion | jq '.[] | select(.name | contains("Vercel")) | .conclusion'
# → "success"

# Lighthouse manual en preview
PREVIEW_URL=$(gh pr view --json url --jq '.url' | sed 's|github.com/.*|vercel.app|')
lighthouse $PREVIEW_URL/dashboard --output json --quiet | jq '.categories.performance.score'
# → ≥ 0.8
```

---

### Scenario 4.4: Error boundaries en 4 rutas críticas

**Given**: 5 archivos `error.tsx` actuales (cobertura baja en rutas críticas).
**When**: Engineering Lead añade `error.tsx` en `/billing`, `/athletes`, `/classes`, `(site)/**`.
**Then**: Cada ruta crítica tiene error boundary contextual con retry específico.

**Acceptance criteria**:
- [ ] `error.tsx` en `src/app/app/[academyId]/billing/error.tsx`.
- [ ] `error.tsx` en `src/app/app/[academyId]/athletes/error.tsx`.
- [ ] `error.tsx` en `src/app/app/[academyId]/classes/error.tsx`.
- [ ] `error.tsx` en `src/app/(site)/error.tsx` (cubre todas las rutas públicas).
- [ ] Cada error.tsx tiene retry contextual + Sentry capture.

**Verification**:

```bash
find src/app -name "error.tsx" | wc -l  # ≥ 9 (5 actuales + 4 nuevas)

# Test E2E: forzar error en /billing
curl -s "https://zaltyko.vercel.app/app/test-academy/billing?simulate_error=true" | grep -i "reintentar\|retry"
# → UI de error contextual con botón retry

# Sentry captura
# (verificar manualmente en Sentry dashboard tras trigger del error)
```

---

## Sprint Q4.5 — Test hygiene + SSoT docs

### Scenario 5.1: 0 suites excluidas del CI (excepto zal-565)

**Given**: 9 suites excluidas con 30 fallos pre-existentes.
**When**: Engineering Lead re-incluye las 6 suites P2 + resuelve 10 fallos.
**Then**: `vitest.config.ts` solo excluye `tests/qa/zal-565/` hasta ZAL-961 cierre formal.

**Acceptance criteria**:
- [ ] 0 suites en `exclude` array (excepto zal-565).
- [ ] 10 fallos P2 resueltos (ver Triage R6 §4.5).
- [ ] CI corre todas las suites en cada PR.
- [ ] `vitest.qa.config.ts` confirmado en `.github/workflows/` (Q-D3-5).

**Verification**:

```bash
grep -A 20 "exclude" vitest.config.ts | grep "tests/"
# → solo "tests/qa/zal-565/**"

pnpm exec vitest run --config vitest.config.ts
# → 0 failures, todas las suites ejecutadas

# CI workflow
grep -E "vitest\.qa|vitest\.config" .github/workflows/*.yml | wc -l
# → ≥ 1 (vitest.qa en CI)
```

---

### Scenario 5.2: Single-source-of-truth marcado en docs duplicados

**Given**: Pricing + runbooks + onboarding duplicados entre vault y docs.
**When**: Engineering Lead añade cross-link "fuente canónica" en cada par.
**Then**: Cada doc duplicado apunta al otro con nota explícita.

**Acceptance criteria**:
- [ ] `vault/03-Negocio/Pricing.md` menciona `docs/marketing/zaltyko-pricing.md` como "copy publicado".
- [ ] `docs/marketing/zaltyko-pricing.md` menciona `vault/03-Negocio/Pricing.md` como "decisión canónica".
- [ ] Runbooks: cross-link entre `vault/02-Tecnologia/Runbook*.md` y `docs/MIGRATIONS_RLS_RUNBOOK.md`.
- [ ] Onboarding: consolidado en `docs/ANALISIS_ONBOARDING_PLANES.md` (referenciado desde vault).

**Verification**:

```bash
grep -l "single source\|fuente canónica\|source of truth" vault/03-Negocio/Pricing.md docs/marketing/zaltyko-pricing.md
# → ambos archivos

grep -E "→.*\.md|cross-link" vault/02-Tecnologia/Runbook*.md
# → cross-links presentes
```

---

## Sprint Q4.6 — TS strictness

### Scenario 6.1: `noUncheckedIndexedAccess` activo sin errores

**Given**: `strict: true` activo pero faltan `noUncheckedIndexedAccess` y `exactOptionalPropertyTypes`.
**When**: Engineering Lead activa `noUncheckedIndexedAccess: true` + corrige errores resultantes.
**Then**: `pnpm typecheck` exit 0 con flag activo.

**Acceptance criteria**:
- [ ] `tsconfig.json` tiene `"noUncheckedIndexedAccess": true`.
- [ ] 0 errores TS en `pnpm typecheck`.
- [ ] `exactOptionalPropertyTypes` evaluado (decidir Q1 2027).

**Verification**:

```bash
grep -E "noUncheckedIndexedAccess" tsconfig.json
# → "noUncheckedIndexedAccess": true

pnpm typecheck
# → exit 0

# Test E2E: introducir acceso inseguro debe fallar
echo 'const arr: number[] = []; const x = arr[0];' >> src/test-temp.ts
pnpm typecheck
# → exit 1 (error TS: Type 'number | undefined' is not assignable)
rm src/test-temp.ts
```

---

## Sprint Q4.7 — Onboarding + annual billing + family portal

### Scenario 7.1: Telemetría de funnel onboarding (4+ steps)

**Given**: Sin visibilidad del drop-off en cada step del onboarding.
**When**: Engineering Lead emite eventos `onboarding_step` con `step` + `academy_id`.
**Then**: Dashboard Vercel Analytics muestra funnel conversion.

**Acceptance criteria**:
- [ ] 4+ steps emiten evento: signup → claim-or-create → first-athlete → first-class.
- [ ] Dashboard Vercel Analytics muestra funnel con % conversion per step.
- [ ] Correlación drop-off ↔ billing conversion medible.

**Verification**:

```bash
grep -rn "onboarding_step" src/ | wc -l  # ≥ 4

# E2E: ejecutar flujo completo y verificar eventos
pnpm exec tsx scripts/test-onboarding-flow.ts --academyId "test-acad-123"
# → emite 4+ eventos con timestamps

# Vercel Analytics dashboard (manual)
open https://vercel.com/zaltyko/analytics/funnel
# → funnel visible con conversion rates
```

---

### Scenario 7.2: Annual billing checkout con descuento real

**Given**: UI muestra "próximamente" para anual (sin precio real).
**When**: Engineering Lead implementa `stripePriceId` anual en `src/lib/stripe/sync-plans.ts`.
**Then**: Cliente puede elegir mensual/anual; checkout usa price anual real.

**Acceptance criteria**:
- [ ] `src/lib/stripe/sync-plans.ts` sincroniza precios anuales desde Stripe.
- [ ] `/pricing` muestra toggle mensual/anual con descuento real (calculado).
- [ ] Marketing NO anuncia descuento antes de este sprint cerrado.
- [ ] `checkout.session.line_items[0].price` es `price_XXXX_yearly` (no `price_XXXX_monthly`).

**Verification**:

```bash
grep -rn "stripePriceId.*year\|interval.*year\|annual" src/lib/stripe/ | head -5

# E2E: crear checkout session anual
curl -X POST /api/billing/checkout -H "Cookie: $TEST_COOKIE" \
  -d '{"plan":"starter","interval":"year"}' | jq '.sessionId, .annualDiscount'
# → sessionId presente + annualDiscount > 0

# Verificar en Stripe Dashboard que session.line_items usa price anual
# (manual)
```

---

### Scenario 7.3: Family portal scope clarificado + implementado

**Given**: Ambigüedad sobre si family portal es mobile-only o web.
**When**: CEO decide scope + Engineering Lead implementa según decisión.
**Then**: Doc vault registra decisión + (si web) `/portal/[athleteCode]` operativo.

**Acceptance criteria**:
- [ ] Doc `vault/03-Negocio/Family portal scope 2026-09.md` con decisión CEO firmada.
- [ ] Si web: ruta `/portal/[athleteCode]` con vista limitada (asistencia, pagos, comunicación).
- [ ] Si mobile-only: doc explica scope mobile + razón.
- [ ] Sin decisión CEO: sprint bloqueado (no avanzar).

**Verification**:

```bash
ls vault/03-Negocio/Family\ portal\ scope\ 2026-09.md

# Si CEO eligió web:
curl -s "https://zaltyko.vercel.app/portal/test-code" | grep -i "asistencia\|pagos\|comunicación"
# → contenido presente

# Si CEO eligió mobile-only:
grep -i "mobile-only\|solo mobile" vault/03-Negocio/Family\ portal\ scope\ 2026-09.md
```

---

## Sprint Q4.8 — DX

### Scenario 8.1: CONTRIBUTING.md ≥ 200 líneas

**Given**: CONTRIBUTING.md actual 47 líneas (insuficiente para onboarding).
**When**: Engineering Lead expande con secciones canónicas.
**Then**: Archivo ≥ 200 líneas con todas las secciones mínimas.

**Acceptance criteria**:
- [ ] `CONTRIBUTING.md` ≥ 200 líneas.
- [ ] Setup paso-a-paso desde cero.
- [ ] Comandos tests + lint + typecheck.
- [ ] Branching strategy (main vs fix/* vs feat/* vs audit/*).
- [ ] Conventional commits o guía de mensajes.
- [ ] Code review process (referencia a AGENTS.md / Guia para agentes).
- [ ] Cómo etiquetar issues ZAL.

**Verification**:

```bash
wc -l CONTRIBUTING.md  # ≥ 200
grep -E "^## " CONTRIBUTING.md  # ≥ 6 secciones
```

---

### Scenario 8.2: OpenAPI spec público accesible

**Given**: OpenAPI generado en Q4.2 pero no público.
**When**: Engineering Lead publica en URL pública (e.g., `https://api.zaltyko.com/v1/docs`).
**Then**: URL accesible sin auth + cross-link desde README + AGENTS.md.

**Acceptance criteria**:
- [ ] URL pública accesible (`https://api.zaltyko.com/v1/docs` o subdominio).
- [ ] UI swagger-ui o redoc renderiza.
- [ ] Cross-link en `README.md` y `AGENTS.md`.

**Verification**:

```bash
curl -s https://api.zaltyko.com/v1/docs | grep -i "swagger\|redoc"
# → UI presente

grep -i "api.zaltyko.com\|openapi" README.md AGENTS.md
# → ambos archivos
```

---

## Caveats transversales

1. **codex NO ejecuta**. Engineering Lead + QA corren los scenarios, archivan evidencia (logs, screenshots, outputs), cierran issues ZAL con link a evidencia.
2. **Vercel OOM** (Q4.4): si no resuelto, scenarios con `pnpm build` o Vercel preview fallan. Orden de sprints mitiga: Q4.4 antes de Q4.6 + Q4.7.
3. **DPO scope change**: GDPR scenarios (Q4.3) pueden requerir cambios al modelo si DPO identifica gaps no anticipados.
4. **CEO bandwidth**: Q4.7 family portal scope requiere decisión CEO; sin respuesta, sprint bloqueado.
5. **ZAL-169 escalación**: si Q4.1 confirma fabricación, Board puede pedir remediación adicional fuera del scope Q4.

---

## Resumen de scenarios por sprint

| Sprint | # Scenarios | Owner principal |
|---|---|---|
| Q4.1 | 3 | Engineering Lead + CEO + Board |
| Q4.2 | 3 | Engineering Lead |
| Q4.3 | 3 | Engineering Lead + CEO |
| Q4.4 | 4 | Engineering Lead |
| Q4.5 | 2 | Engineering Lead |
| Q4.6 | 1 | Engineering Lead |
| Q4.7 | 3 | Engineering Lead + CEO |
| Q4.8 | 2 | Engineering Lead |
| **Total** | **21 scenarios** | — |

Cada scenario tiene criterios verificables. codex emite spec; Engineering Lead ejecuta + archiva evidencia + cierra ZAL.