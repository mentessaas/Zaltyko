---
type: roadmap-quarterly
status: proposed
created: 2026-09-07
owner: Engineering Lead (acade097)
relacionado_con:
  - vault/07-Auditorias-y-Riesgos/Auditoria professionalizacion 2026-09-07 — Fase N.md (N=0..7)
  - vault/07-Auditorias-y-Riesgos/Decisiones codex 2026-09-07 — preguntas abiertas auditoria.md
  - vault/07-Auditorias-y-Riesgos/Plan auditoria professionalizacion 2026-09-07.md
politica: ZAL-169 (antifabricación) activa
---

# Plan de sprints Q4 2026 — post-audit profesionalización

> 8 sprints propuestos para cerrar los 19 acciones del Plan de remediación Fase 4 + D7 (de `Decisiones codex 2026-09-07`).
>
> Modo del documento: ejecutivo por sprint. Cada sprint tiene goal, owner, criterios de aceptación, riesgos y comandos de verificación.
>
> **codex NO ejecuta código.** Engineering Lead arranca Sprint Q4.1 inmediatamente tras validar scope con CEO.

## 0. Resumen ejecutivo

| Sprint | Scope | Sev | Owner | Esfuerzo | Bloqueante |
|---|---|---|---|---|---|
| **Q4.1** | Triage 30 fallos R6 + ZAL-169 + DPO | P0 | Engineering Lead + CEO + Board | 1-2 sem | **sí** |
| Q4.2 | Zod 39 rutas + LemonSqueezy HMAC + OpenAPI | P0/P1 | Engineering Lead | 1 sem | post-Q4.1 |
| Q4.3 | GDPR: guardian_consent + anonymization + DPAs | P0 | Engineering Lead + CEO | 2-3 sem | post-Q4.1 |
| Q4.4 | Performance: retry lib + logger + bundle | P1 | Engineering Lead | 1-2 sem | paralelo |
| Q4.5 | Test hygiene + SSoT docs | P2 | Engineering Lead | 1 sem | paralelo |
| Q4.6 | TS strictness: noUncheckedIndexedAccess | P1 | Engineering Lead | 1 sem | post-Q4.2 |
| Q4.7 | Onboarding telemetry + annual billing + family portal scope | P2 | Engineering Lead + CEO | 2 sem | paralelo |
| Q4.8 | DX: CONTRIBUTING.md + OpenAPI rollout final | P3 | Engineering Lead | 0.5 sem | post-Q4.6 |

**Total**: ~10-13 semanas calendario (3 meses Q4) — depende de capacidad real del equipo.

## 1. Sprint Q4.1 — Triage R6 + ZAL-169 + DPO (P0 BLOQUEANTE)

**Goal**: distinguir bugs reales vs infra-test ausente en las 9 suites excluidas; resolver ZAL-169 (afirmación "17/17 PASS" no reproducible); contratar DPO externo.

**Owner**: Engineering Lead (técnico) + CEO (DPO + ZAL-169 escalación) + Board (validación final).

**Acciones**:

1. **Triage 30 fallos R6** (per Q-D4-1):
   - Correr `pnpm exec vitest run` para cada una de las 9 suites excluidas del catálogo R6 (commit `d93ec123`).
   - Categorizar cada fallo como `bug-prod` o `infra-test-missing`.
   - Emitir issues `ZAL-565-N` para cada `bug-prod`.
   - Cuantificar blast radius: ¿bugs afectan usuarios reales en prod?
2. **Investigación ZAL-169** (per Q-D4-3):
   - Solicitar a Engineering Lead el log verbatim de la corrida 2026-08-25 (ZAL-565 hardening).
   - Si log no existe o no reproduce 17/17 → escalar ZAL-169 a Board como incidente de antifabricación.
   - Documentar findings en `vault/07-Auditorias-y-Riesgos/Investigacion ZAL-169 — doc 2026-08-25.md`.
3. **DPO consulting contratado** (per Q-D2-1):
   - CEO contrata DPO externo (€1500-€3500, 2-5 días).
   - Scope: validar modelo consentimiento parental + job anonimización + DPAs + retención.
   - Entregable: informe firmado + checklist de remediación.

**Criterio de aceptación**:
- [ ] 30 fallos categorizados individualmente (bug-prod vs infra-test).
- [ ] ZAL-169 investigación cerrada (con log verbatim o escalación formal a Board).
- [ ] DPO consulting contratado y brief firmado.
- [ ] Backlog P0 actualizado con bugs reales identificados.
- [ ] NO se aceptan cierres P0 (ZAL-336, ZAL-976, ZAL-961) sin triage completo previo.

**Verificación**:

```bash
pnpm exec vitest run --config vitest.config.ts
# → 9 suites ejecutadas; las 30 fallas categorizadas en vault/06-Roadmap-y-Tareas/Triage R6 2026-09-07.md

git log --diff-filter=AM --since=2026-08-20 --until=2026-08-26 -- tests/qa/zal-565/hardening.test.ts
# → SHA literal de la corrida original; comparar log verbatim
```

**Riesgo**: el doc 2026-08-25 que afirma "17/17 PASS" puede ser fabricado. ZAL-169 antifabricación requiere investigación formal antes de aceptar cierres P0.

---

## 2. Sprint Q4.2 — Zod 39 + LemonSqueezy HMAC + OpenAPI (P0/P1)

**Goal**: cerrar brechas de validación de input + verificación de webhooks + generar spec OpenAPI navegable.

**Owner**: Engineering Lead.

**Acciones**:

1. **Zod schemas para 39 rutas conTenant + no-GET** (per Q-D1-2):
   - **P0 (5 rutas AI/billing reales)**: `/api/ai/communication/chat`, `/api/ai/billing/predict-delinquency`, `/api/ai/communication/generate-progress-update`, `/api/ai/billing/generate-reminder`, `/api/ai/attendance/analyze-risk`.
   - **P1 (3 rutas billing)**: `/api/billing/create-payment-intent`, `/api/billing/downgrade`, `/api/billing/payment-method`.
   - **P1 (4 rutas reports/scheduled)**: CRUD con FK.
   - **P2 (27 rutas)**: CRUD académicos, comunicación, notificaciones.
   - Caveat: schemas deben aceptar `null` explícitamente (`.nullable()`) si algún form cliente envía `null`.
2. **LemonSqueezy HMAC verification** (per Q-D1-1):
   - Usar `LEMON_SQUEEZY_WEBHOOK_SECRET` antes de cualquier mutación en `src/utils/lemon.ts`.
   - Patrón replicable: `src/app/api/stripe/webhook/route.ts` ya usa `constructEvent`.
   - Test unitario con payload firmado + alterado (debe rechazar el alterado).
3. **OpenAPI generation** (per Q-D7-1):
   - Crear `scripts/generate-openapi.ts` con `next-swagger-doc`.
   - Output: `public/openapi.json` en build.
   - Endpoint runtime: `GET /api/openapi.json` con cache `revalidate: 3600`.
   - UI: `GET /api/docs` con `swagger-ui-react` (HTML estático).
   - CI: diff de spec por PR (rechaza PR que rompe contrato sin flag).

**Criterio de aceptación**:
- [ ] 0 rutas conTenant + no-GET + body parse manual.
- [ ] LemonSqueezy handler rechaza payload sin firma con 401.
- [ ] `GET /api/openapi.json` devuelve spec con 307 rutas documentadas.
- [ ] `GET /api/docs` renderiza UI navegable.

**Verificación**:

```bash
grep -rn "await request.json()" src/app/api --include="route.ts" | grep -v "schema.parse\|Schema.parse" | wc -l
# → 0

pnpm exec tsx scripts/generate-openapi.ts && ls -la public/openapi.json
# → openapi.json existe, >50KB

curl -s https://zaltyko.vercel.app/api/openapi.json | jq '.info.title, (.paths | keys | length)'
# → "Zaltyko API" / 307

# Test HMAC alterado
curl -X POST /api/lemon/webhook -H "X-Signature: invalid" -d '{"event":"test"}'
# → 401
```

**Riesgo**: spec drift entre CI y runtime si cache no se invalida correctamente.

---

## 3. Sprint Q4.3 — GDPR compliance (P0)

**Goal**: implementar consentimiento parental verificable + job de anonimización + DPAs firmados.

**Owner**: Engineering Lead (implementación) + CEO (DPAs + decisión final).

**Acciones**:

1. **Tabla `guardian_consent`** (post-DPO):
   - Schema: `athleteId`, `guardianId`, `consentVersion`, `consentAt`, `consentIp`, `withdrawalAt`.
   - Threshold de edad derivado de `academies.country` (default 14 = España; configurable por academia; otros UE = 16).
2. **Flujo de consentimiento parental**:
   - Si atleta < threshold → bloquea registro hasta `guardian_consent` firmado.
   - Email al tutor con link firmado + token de aceptación (one-time use).
   - Versión de términos persistida en cada consentimiento (evidencia Art. 7 GDPR).
3. **Job de anonimización** (Art. 17):
   - Trigger: `athlete.deletedAt` > 2 años sin cargos pendientes → `UPDATE athletes SET name='sha256(id)', email=NULL, phone=NULL WHERE id = ?`.
   - Mantener FK integridad (cambiar a `deleted_athletes` table si es necesario).
   - Cron job mensual + verificación manual trimestral CEO.
4. **DPAs firmados**:
   - Supabase (EU North residency verificada).
   - Stripe (categoría Business con EU data residency).
   - Brevo (Business account con DPA).
5. **Política de retención** (per Q-D2-4):
   - Tabla `data_retention_policy` con períodos configurables.
   - Job de purga para sesiones/auth >90 días.

**Criterio de aceptación**:
- [ ] `guardian_consent` tabla creada + migración aplicada.
- [ ] Test E2E: atleta 12 años no puede registrarse sin consentimiento del tutor (403 `GUARDIAN_CONSENT_REQUIRED`).
- [ ] Job anonimización testeado con datos sintéticos + verificación de FK intactas.
- [ ] 3 DPAs firmados y archivados en `vault/08-Referencias/DPAs/`.
- [ ] Política de retención documentada y operativa.

**Verificación**:

```bash
grep -rn "guardian_consent" src/db/schema/ | head -5
pnpm exec tsx scripts/seed-athletes.ts && curl -X POST /api/athletes -d '{"age":12}' | jq '.error'
# → "GUARDIAN_CONSENT_REQUIRED"

ls vault/08-Referencias/DPAs/
# → supabase-dpa.pdf stripe-dpa.pdf brevo-dpa.pdf
```

**Riesgo**: DPO puede requerir cambios al modelo; sprint iterativo. Retraso en DPAs bloquea go-to-market UE formal.

---

## 4. Sprint Q4.4 — Performance y resiliencia (P1)

**Goal**: retry lib + console→logger migration + bundle reduction + Vercel OOM resuelto.

**Owner**: Engineering Lead.

**Acciones**:

1. **`src/lib/retry.ts`** con `withRetry(fn, { maxRetries: 3, backoff: "exponential" })` (per Q-D5-3).
2. **Aplicar** a Supabase queries críticas, Stripe API, Brevo API, growth events job.
3. **Wrapper `withApiTimeout(handler, ms)`** con `AbortController` — 30s default para rutas pesadas.
4. **Migrar 66 console statements** a `logger.error/warn/debug` (per Q-D5-2).
5. **ESLint rule `no-console: error`** en CI.
6. **Bundle reduction** (per Q-D5-1):
   - Audit `outputFileTracingIncludes` en `next.config.mjs`.
   - Lazy load calendar, charts, file-upload con `dynamic()`.
   - Tree-shaking más agresivo.
7. **Evaluar upgrade a Vercel `large` build machine** vs seguir con default + bundle reduction.
8. **error.tsx coverage** (per D5 §3.2): añadir error boundaries en `/billing`, `/athletes`, `/classes`, `(site)/**`.

**Criterio de aceptación**:
- [ ] `src/lib/retry.ts` con tests unitarios (cubre retry exponencial, jitter, max retries).
- [ ] 0 console statements en `src/`.
- [ ] `pnpm build` sin OOM (trivial commit retry NO usado).
- [ ] Lighthouse score > 80 en rutas críticas (medido en Vercel preview).
- [ ] Error boundaries en 4 rutas críticas.

**Verificación**:

```bash
grep -rE "console\.(log|error|warn)" src/ --include="*.ts" --include="*.tsx" | wc -l
# → 0

pnpm exec vitest run src/lib/retry.test.ts
pnpm build && echo "Exit: $?"
# → "Exit: 0" sin OOM

find src/app -name "error.tsx" | wc -l
# → ≥ 9 (actual 5 + 4 nuevas)
```

**Riesgo**: Vercel OOM no resuelto retrasa Q4.4 + Q4.6.

---

## 5. Sprint Q4.5 — Test hygiene + SSoT docs (P2)

**Goal**: re-incluir 6 suites P2 + single-source-of-truth para docs duplicadas.

**Owner**: Engineering Lead.

**Acciones**:

1. **Re-incluir las 6 suites P2** (10 fallos pre-existentes) (per Q-D4-4):
   - `tests/audit/public-claims.catalog.test.ts` (1 fallo)
   - `tests/lib/stripe-refund-service.test.ts` (3 fallos)
   - `tests/lib/stripe-charge-collection.integration.test.ts` (1 fallo)
   - `tests/product-roles-navigation.test.ts` (1 fallo)
   - `tests/api-academy-settings-sport-config.test.ts` (2 fallos)
   - `tests/api-athletes.test.ts` (2 fallos)
2. **Resolver fallos** (10 totales).
3. **Verificar `vitest.qa.config.ts` en CI** (per Q-D3-5): degradar a P1 si no corre.
4. **Single-source-of-truth** (per Q-D7-2):
   - Marcar dependencia cruzada en `vault/03-Negocio/Pricing.md` ↔ `docs/marketing/zaltyko-pricing.md`.
   - Consolidar onboarding en `docs/ANALISIS_ONBOARDING_PLANES.md`.
   - Cross-link runbooks vault ↔ docs si difieren.

**Criterio de aceptación**:
- [ ] 0 suites excluidas del CI (excepto `tests/qa/zal-565/` hasta ZAL-961 cierre formal).
- [ ] Cross-links "single source of truth" añadidos en docs duplicados.
- [ ] 0 fallos pre-existentes en suites re-incluidas.

**Verificación**:

```bash
grep -A 20 "exclude" vitest.config.ts | wc -l
# → solo zal-565

grep -rn "single source of truth\|fuente canónica" docs/ vault/ | head -5
# → cross-links presentes

pnpm exec vitest run --config vitest.config.ts
# → exit 0
```

---

## 6. Sprint Q4.6 — TS strictness upgrade (P1)

**Goal**: activar `noUncheckedIndexedAccess` + medir blast radius + corregir errores resultantes.

**Owner**: Engineering Lead.

**Acciones**:

1. Activar `noUncheckedIndexedAccess: true` en `tsconfig.json` (per Q-D4-2 — difiere de Q4.1; sprint dedicado).
2. Medir errores resultantes (`pnpm typecheck`).
3. Triage por archivo; corregir primero rutas API y servicios de auth.
4. Sprint dedicado (50-150 errores estimados). NO mezclar con Q4.2 Zod sprint.

**Criterio de aceptación**:
- [ ] `noUncheckedIndexedAccess: true` en tsconfig.
- [ ] `exactOptionalPropertyTypes` evaluado para sprint posterior Q1 2027.
- [ ] 0 errores TS en `pnpm typecheck`.

**Verificación**:

```bash
grep -E "noUncheckedIndexedAccess" tsconfig.json
pnpm typecheck
# → exit 0
```

**Riesgo**: blast radius alto; sprint puede requerir 2 semanas en vez de 1.

---

## 7. Sprint Q4.7 — Onboarding telemetry + annual billing + family portal scope (P2)

**Goal**: telemetría de funnel + annual billing real + clarificación scope family portal.

**Owner**: Engineering Lead (implementación) + CEO (decisiones de scope + mercado).

**Acciones**:

1. **CEO clarifica family portal scope** (per Q-D6-1):
   - ¿mobile-only, mobile + web, o solo web?
   - Si web: priorizar `/portal/[athleteCode]` con vista limitada (asistencia, pagos, comunicación).
   - Documentar decisión en `vault/03-Negocio/Family portal scope 2026-09.md`.
2. **Telemetría onboarding** (per Q-D6-4):
   - Emitir evento `onboarding_step` con `step` y `academy_id` en cada transición.
   - Dashboard Sentry/analytics de funnel conversion.
   - Correlacionar drop-off con billing conversion.
3. **Annual billing** (per Q-D6-3):
   - Implementar `stripePriceId` anual en `src/lib/stripe/sync-plans.ts`.
   - Habilitar UI toggle mensual/anual en `/pricing` SOLO post-implementación.
   - Copy defensivo "disponible pronto" mientras no esté listo.

**Criterio de aceptación**:
- [ ] Family portal scope clarificado en vault.
- [ ] Eventos `onboarding_step` emitidos en cada transición (4+ steps).
- [ ] Annual billing checkout funciona con descuento real (no mock).
- [ ] Marketing NO anuncia descuento anual antes de este sprint.

**Verificación**:

```bash
grep -rn "onboarding_step" src/ | wc -l
# → ≥ 4 (signup → claim-or-create → first-athlete → first-class)

curl -X POST /api/billing/checkout -d '{"plan":"starter","interval":"year"}'
# → 200 con stripePriceId anual real

# Check vault
ls vault/03-Negocio/ | grep -i "family"
# → family portal scope doc presente
```

---

## 8. Sprint Q4.8 — DX: CONTRIBUTING.md + OpenAPI rollout público (P3)

**Goal**: expandir CONTRIBUTING.md + publicar OpenAPI spec públicamente.

**Owner**: Engineering Lead.

**Acciones**:

1. **Expandir `CONTRIBUTING.md`** a ~200 líneas (per Q-D7-3):
   - Setup paso-a-paso desde cero.
   - Cómo correr tests + lint + typecheck.
   - Branching strategy (main vs fix/* vs feat/* vs audit/*).
   - Conventional commits.
   - Code review process (referencia a Guia para agentes).
   - Cómo etiquetar issues ZAL-XXX.
2. **Publicar OpenAPI spec** (post-Q4.2):
   - URL pública: `https://api.zaltyko.com/v1/docs` o subdominio dedicado.
   - Cross-link desde README raíz y AGENTS.md.
   - Marketing menciona spec público en landing.

**Criterio de aceptación**:
- [ ] `CONTRIBUTING.md` ≥ 200 líneas.
- [ ] OpenAPI URL pública accesible (no requiere auth).
- [ ] Cross-links en README + AGENTS.md.

**Verificación**:

```bash
wc -l CONTRIBUTING.md
# → ≥ 200

curl -s https://api.zaltyko.com/v1/docs | grep -i "swagger\|redoc"
# → UI presente
```

---

## 9. Dependencias entre sprints

```
                    ┌──> Q4.2 (Zod + HMAC + OpenAPI) ──> Q4.6 (TS strictness)
                    │
Q4.1 (Triage R6) ───┼──> Q4.3 (GDPR) ── independiente
                    │
                    └──> Q4.5 (Test hygiene) ─ paralelo

Q4.4 (Performance) ─ paralelo (puede arrancar post-Q4.2)
Q4.7 (Onboarding) ─ paralelo (post-Q4.3; bloqueado por CEO scope decision)
Q4.8 (DX) ─ último (post-Q4.6)
```

## 10. Riesgos transversales

1. **Vercel OOM** (Q-D5-2): si Q4.4 no resuelve con bundle reduction, sprints Q4.6 + Q4.7 pueden OOM.
2. **DPO scope change**: GDPR sprint Q4.3 puede requerir cambios al modelo si DPO identifica gaps no anticipados (re-trabajo).
3. **CEO bandwidth**: Q4.7 (family portal scope) requiere decisión CEO; sin respuesta, sprint se bloquea 2+ semanas.
4. **ZAL-169 escalación**: si Q4.1 confirma fabricación en doc 2026-08-25, Board puede pedir remediación adicional fuera del scope Q4.
5. **Vercel `large` build machine costo**: si Q4.4 elige upgrade a `large` (~$500/mo), CEO debe aprobar gasto operacional.

---

## 11. Comandos de verificación agregados

```bash
# Estado de los 19 acciones
grep -c "TODO\|FIXME\|XXX" src/ --include="*.ts" --include="*.tsx" -r | head -10

# P0 cerrados
gh issue list --label "P0,audit-2026-09-07" --state closed --search "audit-2026-09-07 in:title"

# Métricas de salud agregadas (final Q4)
pnpm typecheck     # exit 0
pnpm lint          # 0 errors, 0 console warnings
pnpm test          # 0 failures, 0 suites excluidas (excepto zal-565)
pnpm build         # exit 0 sin OOM

# GDPR compliance
grep -rn "guardian_consent" src/db/schema/
ls vault/08-Referencias/DPAs/

# Documentación
wc -l CONTRIBUTING.md  # ≥ 200
curl -s https://api.zaltyko.com/v1/openapi.json | jq '.paths | keys | length'  # ≥ 307
```

---

## 12. Cierre

Plan Q4 propuesto por codex post-audit professionalización 2026-09-07. Engineering Lead confirma scope de Q4.1 antes de 2026-09-14. CEO valida Q4.3 (DPAs + GDPR) + Q4.7 (family portal scope + annual billing). codex NO ejecuta código; emite planes y monitorea estado del audit trail.

Cada sprint tiene criterios de aceptación verificables. ZAL-169 antifabricación se aplica transversalmente: ningún "PASS" se acepta sin log reproducible.