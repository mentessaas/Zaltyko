---
type: issues-backlog
status: pending-paperclip-import
created: 2026-09-07
owner: codex-session (queue); CEO/Board importan en Paperclip
politica: ZAL-169 (antifabricación) activa
relacionado_con:
  - vault/07-Auditorias-y-Riesgos/Auditoria professionalizacion 2026-09-07 — Fase N.md (N=0..7)
  - vault/07-Auditorias-y-Riesgos/Decisiones codex 2026-09-07 — preguntas abiertas auditoria.md
  - vault/06-Roadmap-y-Tareas/Plan sprints Q4 2026 post-audit professionalizacion.md
---

# Backlog issues post-audit 2026-09-07

> **codex NO puede crear issues en Paperclip directamente** (sin MCP en este entorno). Este doc es la **cola de issues** lista para que CEO/Board importen.
>
> **Total**: **52 issues** = 30 R6 (fallos pre-existentes) + 3 P0 investigaciones + 19 acciones de remediación.

## 1. Convenciones

- **Naming**: `ZAL-XXXX` (correlativo; último conocido `ZAL-1249` — proponer `ZAL-1250` en adelante).
- **Status inicial**: `open`.
- **Type**: `bug`, `task`, `spike`, `investigation`, `compliance`.
- **Severity**: `P0`/`P1`/`P2`/`P3`.
- **Owner por defecto**: Engineering Lead (`acade097`); CEO/Board para gates.
- **Vinculación ZAL-169**: cada issue cita SHA verificable o commit del R6 catalog (`d93ec123`).

## 2. Bloque A — Issues R6 (Q4.1 triage)

Total: **22 issues** (9 suites con 30 fallos pre-existentes). ZAL-565 agrupa 10 fallos críticos (ZAL-169 conflict) como issues individuales; quick-actions-modal agrupa 9 fallos como 1 issue con sub-tasks.

| ZAL | Type | Sev | Suite | Estado R6 | Body resumido |
|---|---|---|---|---|---|
| `ZAL-1250` | bug | P1 | `tests/api/cron-class-reminders.test.ts` | 0/1 | "1 fallo. Verificar cron en Vercel logs (puede estar fallando silenciosamente)." |
| `ZAL-1251` | bug | P1 | `tests/api-academy-settings-sport-config.test.ts` | 2/4 | "1er fallo. Settings academia." |
| `ZAL-1252` | bug | P1 | `tests/api-academy-settings-sport-config.test.ts` | 2/4 | "2do fallo. Settings academia." |
| `ZAL-1253` | bug | P1 | `tests/api-athletes.test.ts` | 2/4 | "1er fallo. API atletas." |
| `ZAL-1254` | bug | P1 | `tests/api-athletes.test.ts` | 2/4 | "2do fallo. API atletas." |
| `ZAL-1255` | bug | P2 | `tests/audit/public-claims.catalog.test.ts` | 17/18 | "1 fallo. Claim probablemente outdated vs catálogo." |
| `ZAL-1256` | bug | P2 | `tests/lib/stripe-charge-collection.integration.test.ts` | 14/15 | "1 fallo. Flujo de cobro menor." |
| `ZAL-1257` | bug | P2 | `tests/lib/stripe-refund-service.test.ts` | 8/11 | "1er fallo. Reembolso." |
| `ZAL-1258` | bug | P2 | `tests/lib/stripe-refund-service.test.ts` | 8/11 | "2do fallo. Reembolso." |
| `ZAL-1259` | bug | P2 | `tests/lib/stripe-refund-service.test.ts` | 8/11 | "3er fallo. Reembolso." |
| `ZAL-1260` | bug | P2 | `tests/product-roles-navigation.test.ts` | 8/9 | "1 fallo. UX navigation." |
| `ZAL-1261` | bug | **P0** | `tests/qa/zal-565/hardening.test.ts` | 7/17 | "1er fallo. ⚠️ ZAL-169 conflict con doc 2026-08-25." |
| `ZAL-1262` | bug | **P0** | `tests/qa/zal-565/hardening.test.ts` | 7/17 | "2do fallo." |
| `ZAL-1263` | bug | **P0** | `tests/qa/zal-565/hardening.test.ts` | 7/17 | "3er fallo." |
| `ZAL-1264` | bug | **P0** | `tests/qa/zal-565/hardening.test.ts` | 7/17 | "4to fallo." |
| `ZAL-1265` | bug | **P0** | `tests/qa/zal-565/hardening.test.ts` | 7/17 | "5to fallo." |
| `ZAL-1266` | bug | **P0** | `tests/qa/zal-565/hardening.test.ts` | 7/17 | "6to fallo." |
| `ZAL-1267` | bug | **P0** | `tests/qa/zal-565/hardening.test.ts` | 7/17 | "7mo fallo." |
| `ZAL-1268` | bug | **P0** | `tests/qa/zal-565/hardening.test.ts` | 7/17 | "8vo fallo." |
| `ZAL-1269` | bug | **P0** | `tests/qa/zal-565/hardening.test.ts` | 7/17 | "9no fallo." |
| `ZAL-1270` | bug | **P0** | `tests/qa/zal-565/hardening.test.ts` | 7/17 | "10mo fallo." |
| `ZAL-1271` | bug | P1 | `tests/quick-actions-modal-contract.test.tsx` | 0/9 | "9/9 fallos — probable regresión UI reciente. Agrupar como 1 issue con 9 sub-tasks (uno por fallo discreto)." |

> **Triage ejecutable listo (2026-09-07)**: ver `vault/06-Roadmap-y-Tareas/R6 triage ejecutable 2026-09-07.md` — recetas por suite con root cause + fix approach + comandos de verificación.

**Notas sobre agrupación**:
- ZAL-565 (ZAL-1261 a ZAL-1270): 10 issues individuales por severidad P0 + ZAL-169 traceability.
- quick-actions-modal (ZAL-1271): 1 issue + sub-tasks opcionales `ZAL-1271-A` a `ZAL-1271-I` si CEO prefiere granularidad.

## 3. Bloque B — P0 investigaciones

| ZAL | Type | Sev | Title | Sprint | Owner |
|---|---|---|---|---|---|
| `ZAL-1272` | investigation | **P0** | **ZAL-169 — Doc 2026-08-25 afirmación "17/17 PASS" no reproducible** | Q4.1 inmediato | Board + Engineering Lead (witness) |

> **Investigación lista (2026-09-07)**: ver `vault/06-Roadmap-y-Tareas/ZAL-1272 investigacion ZAL-169 conflicto 2026-09-07.md`. Conclusión: NO es fabricación categórica (escenario A — pre-HMAC refactor — es plausible), pero el doc P&S viola ZAL-169 §3 (no incluye SHA ni timestamp del run). Board NO debe aceptar cierre P0 de ZAL-961 sin log verbatim. Engineering Lead ejecuta triage §8 del R6 triage ejecutable.
| `ZAL-1273` | compliance | **P0** | **GDPR Art. 8 — Consentimiento parental para menores** | Q4.3 | Engineering Lead + CEO (DPO validation) |
| `ZAL-1274` | compliance | **P0** | **GDPR Art. 17 — Job de anonimización (right to erasure)** | Q4.3 | Engineering Lead |

**Body sugerido ZAL-1272 (ZAL-169)**:

```
Auditoría professionalización 2026-09-07 detectó conflicto literal:

- Doc 2026-08-25 (vault/06-Roadmap-y-Tareas/ZAL-P&S-bloqueadores-revision-2026-08-25.md líneas 32-46) afirma "Suite materializada con 17/17 PASS local" para ZAL-565 hardening.
- R6 diagnostic (commit d93ec123) muestra 7 PASS / 10 FAIL.

Pasos Q4.1:
1. Engineering Lead busca log verbatim de la corrida 2026-08-25.
2. Si log existe y reproduce 17/17 → PASS legítimo, doc OK.
3. Si log NO existe o no reproduce → ESCALAR a Board como incidente ZAL-169 (fabricación).
4. NO aceptar cierre P0 de ZAL-961 (P&S 2026-08-26) sin triage completo.

Ref: vault/07-Auditorias-y-Riesgos/Auditoria professionalizacion 2026-09-07 — Fase 3 D4 salud codigo.md §4.2 y §8.
Política: ZAL-169 antifabricación (6 reglas activas desde 2026-08-01).
```

## 4. Bloque C — Acciones de remediación Plan Fase 4 + D7

19 issues mapeados al Plan Q4:

| ZAL | Type | Sev | Acción | Owner | Sprint |
|---|---|---|---|---|---|
| `ZAL-1275` | task | **P0** (latente) | LemonSqueezy HMAC verification (`src/utils/lemon.ts` + `LEMON_SQUEEZY_WEBHOOK_SECRET`) | Engineering Lead | Q4.2 |
| `ZAL-1276` | task | **P0/P1** | Zod schemas 39 rutas (5 P0 AI/billing + 3 P1 billing + 4 P1 reports + 27 P2 CRUD) | Engineering Lead | Q4.2 |
| `ZAL-1277` | task | P1 | OpenAPI generation sprint (`next-swagger-doc` + `swagger-ui-react` + CI diff) | Engineering Lead | Q4.2 |
| `ZAL-1278` | task | **P0** | DPAs firmados Supabase + Stripe + Brevo (Art. 28 GDPR) | CEO | Q4.3 |
| `ZAL-1279` | task | P1 | Tabla `data_retention_policy` + job purga sesiones >90 días | Engineering Lead | Q4.3 |
| `ZAL-1280` | task | P1 | `src/lib/retry.ts` con backoff exponencial + aplicación a Supabase/Stripe/Brevo | Engineering Lead | Q4.4 |
| `ZAL-1281` | task | P1 | Migración 66 console statements → `logger.error/warn/debug` + ESLint `no-console: error` | Engineering Lead | Q4.4 |
| `ZAL-1282` | task | P1 | Bundle reduction + Vercel OOM resuelto (lazy load + tree-shaking) | Engineering Lead | Q4.4 |
| `ZAL-1283` | task | P1 | `error.tsx` coverage en 4 rutas críticas (`/billing`, `/athletes`, `/classes`, `(site)/**`) | Engineering Lead | Q4.4 |
| `ZAL-1284` | task | P2 | `withApiTimeout(handler, ms)` wrapper con AbortController | Engineering Lead | Q4.4 |
| `ZAL-1285` | task | P2 | Suspense/dynamic imports lazy load para componentes >50KB | Engineering Lead | Q4.4 |
| `ZAL-1286` | task | P2 | Re-incluir 6 suites P2 (test hygiene Q4.5) + resolver 10 fallos | Engineering Lead | Q4.5 |
| `ZAL-1287` | task | P2 | SSoT docs (cross-link vault ↔ docs para pricing + runbooks + onboarding) | Engineering Lead | Q4.5 |
| `ZAL-1288` | task | P1 | Activar `noUncheckedIndexedAccess: true` + triage 50-150 errores | Engineering Lead | Q4.6 |
| `ZAL-1289` | task | P2 | Annual billing Stripe (`stripePriceId` anual) + UI toggle `/pricing` | Engineering Lead | Q4.7 |
| `ZAL-1290` | task | P2 | Onboarding telemetry (4 steps: signup → claim → first-athlete → first-class) | Engineering Lead | Q4.7 |
| `ZAL-1291` | task | P2 | Family portal scope clarificado (CEO decide mobile vs web) | CEO + Engineering Lead | Q4.7 |
| `ZAL-1292` | task | P3 | CONTRIBUTING.md expandido a ≥200 líneas (DX) | Engineering Lead | Q4.8 |
| `ZAL-1293` | task | P3 | OpenAPI spec público en `https://api.zaltyko.com/v1/docs` | Engineering Lead | Q4.8 |

## 5. Pendiente CEO/Board

1. **Importar 52 issues** (`ZAL-1250` → `ZAL-1293`) en Paperclip.
2. Validar correlativos contra backlog reciente (último conocido `ZAL-1249`).
3. Asignar owners + sprints según las tablas de §2-§4.
4. **`ZAL-1272`** (ZAL-169) — si Q4.1 confirma fabricación, escalar a Board antes de aceptar cierre P0 de ZAL-961.
5. **`ZAL-1278`** (DPAs) — CEO autoriza budget €1500-€3500 para DPO + tiempo legal para firmas.

## 6. Schema de import en Paperclip (template)

Para cada issue, el body al importar debe incluir:

```markdown
## Contexto

[1-2 frases del hallazgo del audit]

## Acceptance criteria

- [ ] [criterio verificable 1]
- [ ] [criterio verificable 2]

## Verificación

```bash
[comando exacto que demuestra cierre]
```

## Referencias

- [link a fase del audit]
- [link a decisión codex]
- SHA: `<commit_sha>` (verificado con `git rev-parse --verify`)

## Política

ZAL-169 antifabricación activa: ningún cierre sin log reproducible + peer-verification cuando aplique.
```

**Patrón replicable** para los 30 issues R6 (body adaptado por suite).

## 7. Estado de cola

- **Creados en Paperclip**: 0/52
- **Pendiente import**: 52
- **Owner import**: CEO/Board (no delegable a codex por falta de MCP)
- **Timeline sugerido**: Sprint Q4.1 (primera semana) — Engineering Lead triage R6 + Board escala ZAL-1272 si aplica.

---

codex NO ejecuta. Este doc + el Plan sprints Q4 + el E2E acceptance Q4 = paquete completo para que Engineering Lead arranque Q4.1 sin esperar más decisiones codex.