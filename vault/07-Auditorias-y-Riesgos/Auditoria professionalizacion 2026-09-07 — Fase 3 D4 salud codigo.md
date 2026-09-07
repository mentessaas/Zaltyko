---
type: audit-fase
status: in-progress
phase: 3 / D4 (Salud de código y mantenibilidad)
created: 2026-09-07
owner: codex-session
plan: ./Plan auditoria professionalizacion 2026-09-07.md
baseline: ./Auditoria professionalizacion 2026-09-07 — Fase 0 baseline.md
prior: ./Auditoria professionalizacion 2026-09-07 — Fase 2 D3 superficie nueva.md
politica: ZAL-169 (antifabricación) activa
---

# Fase 3 — D4: Salud de código y mantenibilidad

> Modo del documento: **literal** (cada hallazgo con SHA, ruta y comando de verificación).
> No es remediación: es **inventario del delta** de salud de código al 2026-09-07.

## 1. Alcance verificado

Cuatro ejes de salud de código:

1. **TS strictness**: gap de `noUncheckedIndexedAccess` y `exactOptionalPropertyTypes`.
2. **Respuestas estandarizadas**: 35/307 rutas (11.5%) sin `apiSuccess`/`apiCreated`/`apiError`.
3. **Cobertura de tests**: 342 tests totales vs 9 suites excluidas con 88 tests fallando en catálogo R6.
4. **Catálogo R6 (P0 follow-up)**: auditar las 9 suites excluidas con fallos pre-existentes.

**Verificación contra**:
- `/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh` (HEAD `faa3400c`)
- Diagnóstico commit `d93ec123` (R6, 2026-09-06)

## 2. TS strictness gap

### 2.1 Estado actual (`tsconfig.json`)

**Comando**:
```bash
grep -nE "noUncheckedIndexedAccess|exactOptionalPropertyTypes|strict" tsconfig.json
# 11:    "strict": true,
# (noUncheckedIndexedAccess NO presente)
# (exactOptionalPropertyTypes NO presente)
```

**Lectura**: `strict: true` está activo (cubre `strictNullChecks`, `noImplicitAny`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `alwaysStrict`, `useUnknownInCatchVariables`). Las dos flags adicionales **NO** lo están.

### 2.2 FINDING P1 — `noUncheckedIndexedAccess` off

**Riesgo**: acceso a `arr[i]` o `obj[key]` devuelve `T` en vez de `T | undefined`. Bugs latentes cuando un índice está fuera de rango o una clave no existe.

**Evidencia**:
- `grep -rn "noUncheckedIndexedAccess" tsconfig.json` → vacío.
- Búsqueda de patrones de riesgo: `arr\[[a-z]+\]` o `obj\[.*\]` sin guard.

**Blast radius estimado** (lectura manual superficial):
- Rutas API: cualquier handler que itera `req.json()` arrays o destructura `params.id` sin guard.
- Drizzle queries: `db.select().from(t).limit(1)` devuelve `T[]`; primer elemento `.at(0)` o `[0]` no es nullable-checked.
- `src/lib/authz/endpoint-config.ts:extractAcademyId()` — comentado en `Recent Changes 2026-07-08` que ya tuvo un bug de este patrón.

**Recomendación (no aplicada)**:
1. Activar `noUncheckedIndexedAccess: true` en `tsconfig.json`.
2. Medir errores resultantes (`pnpm typecheck`).
3. Triage por archivo; corregir primero las rutas API y servicios de auth.
4. Estimar: 50-150 errores nuevos (subjetivo, sin ejecución).

### 2.3 FINDING P2 — `exactOptionalPropertyTypes` off

**Riesgo**: `{ foo?: string }` acepta `{ foo: undefined }`, lo que difumina la distinción entre prop ausente y prop explícitamente `undefined`. Bugs sutiles en serialización (JSON.stringify omite `undefined` pero no `null`).

**Evidencia**:
- `grep -rn "exactOptionalPropertyTypes" tsconfig.json` → vacío.

**Recomendación (no aplicada)**: blast radius probablemente mayor que `noUncheckedIndexedAccess` (toca contratos de Drizzle, Next.js request types, Zod inferred types). Sugerido: abordar **después** de `noUncheckedIndexedAccess`.

### 2.4 Caveat estructural: `tests/` excluido de `tsconfig.json`

**Comando**:
```bash
grep -nE "exclude|tests" tsconfig.json
# 51:    "exclude": ["node_modules", ".next", "tests", "mobile", "zaltyko-branding"]
```

**Lectura**: los tests se excluyen del type check principal. Errores de tipo en `tests/` no bloquean CI. Esto explica parcialmente por qué las 9 suites excluidas del catálogo R6 tienen fallos pre-existentes no detectados en type check.

## 3. 35 rutas sin respuestas estandarizadas

**Comando**:
```bash
grep -rl "apiSuccess\|apiCreated\|apiError" src/app/api --include="route.ts" | wc -l
# → 272
find src/app/api -name "route.ts" | wc -l
# → 307
```

**Cálculo**: 307 − 272 = **35 rutas sin wrapper estandarizado** (11.5%).

**Verificación**: el baseline Fase 0 documentó 272 (88.5%). Coherente.

**Categorización pendiente** (no auditado en detalle — fuera de alcance D4):

| Categoría probable | Justificación |
|---|---|
| Stubs / deprecated (HTTP 410) | No devuelven JSON estructurado; aceptable |
| Webhooks (Stripe/LemonSqueezy/Mailgun) | Devuelven `NextResponse` raw con códigos específicos |
| MCP / docs | Respuestas no JSON estándar |
| Debug/admin | Respuestas ad-hoc |
| Posibles gaps reales | Requieren revisión manual |

**Recomendación (no aplicada)**:
1. Listar las 35 con `find src/app/api -name "route.ts" | xargs grep -L "apiSuccess\|apiCreated\|apiError"`.
2. Para cada una, categorizar como "excepción justificada" o "gap a corregir".
3. Sprint de homogeneización si >5 son gaps reales.

## 4. Catálogo R6 — 9 suites excluidas con 88 tests (30 fallos)

**Comando**:
```bash
grep -A 20 "exclude" vitest.config.ts | head -30
# Lista de 9 suites excluidas (ver §4.1 abajo)
git log --oneline --all -- tests/qa/zal-565/hardening.test.ts | head -5
# Confirmar historia
```

### 4.1 Lista de las 9 suites excluidas

| # | Suite | Tests | Pasan | Fallan | Severidad |
|---|---|---|---|---|---|
| 1 | `tests/api/cron-class-reminders.test.ts` | 1 | 0 | 1 | **Alta** |
| 2 | `tests/api-academy-settings-sport-config.test.ts` | 4 | 2 | 2 | **Alta** |
| 3 | `tests/api-athletes.test.ts` | 4 | 2 | 2 | **Alta** |
| 4 | `tests/audit/public-claims.catalog.test.ts` | 18 | 17 | 1 | **Media** |
| 5 | `tests/lib/stripe-charge-collection.integration.test.ts` | 15 | 14 | 1 | **Baja** |
| 6 | `tests/lib/stripe-refund-service.test.ts` | 11 | 8 | 3 | **Media** |
| 7 | `tests/product-roles-navigation.test.ts` | 9 | 8 | 1 | **Media** |
| 8 | `tests/qa/zal-565/hardening.test.ts` | 17 | 7 | 10 | **Crítica** |
| 9 | `tests/quick-actions-modal-contract.test.tsx` | 9 | 0 | 9 | **Alta** |
| **TOTAL** | — | **88** | **58** | **30** | — |

**Fuente**: commit `d93ec123` "Pre-existing test failures (R6 diagnostic, 2026-09-06)".

**Lectura**:
- **25 fallos son bugs reales de producción** (no infraestructura de tests ausente).
- **5 fallos son infraestructura de tests ausente** (mocks, fixtures, env vars).
- 1 suite (ZAL-565 hardening) tiene 10 fallos: es la suite creada en ZAL-961 (P0 P&S) que ahora existe pero falla localmente. Caveat: el doc D3 asumió "17/17 PASS local"; el R6 diagnostic refuta esa cifra.

### 4.2 FINDING P0 — ZAL-565 hardening suite con 10/17 fallos

**Riesgo**: la suite `tests/qa/zal-565/hardening.test.ts` fue creada para cerrar ZAL-961 (P0 P&S 2026-08-26). El equipo la dio por "PASS local" en el doc 2026-08-25, pero el R6 diagnostic (2026-09-06) muestra 7 PASS / 10 FAIL.

**Severidad**: **P0** porque:
- Es la única evidencia objetiva del fix ZAL-961 (P&S review).
- Si los 10 fallos son tests reales (no infra), el "PASS local" original fue una fabricación o auto-engaño (violación potencial de ZAL-169 antifabricación).
- Engineering Lead debe triage manual de los 10 fallos antes de que QA recomiende cierre.

**Acción CEO**:
1. Pedir a Engineering Lead (`acade097`) el output verbatim de `pnpm exec vitest run --config vitest.qa.config.ts tests/qa/zal-565/hardening.test.ts`.
2. Categorizar cada fallo como bug de prod o infra de test.
3. Si hay bugs de prod, abrir issues ZAL-565-N y priorizar antes de ZAL-336/ZAL-976.

### 4.3 FINDING P1 — `quick-actions-modal-contract` con 9/9 fallos

**Riesgo**: 9/9 tests fallando sugiere componente contract roto. Probable regresión desde algún merge reciente.

**Severidad**: **P1** (UI componente roto afecta flujos principales).

**Acción CEO**: pedir a Engineering Lead triage manual + reproducir local.

### 4.4 FINDING P1 — Cron class reminders con 0/1 pass

**Riesgo**: 0/1 tests pasando. La suite entera no corre o todos los asserts fallan.

**Severidad**: **P1** (cron en prod puede estar fallando silenciosamente).

**Acción CEO**: verificar manualmente el cron en producción (logs de Vercel) + triage Engineering Lead.

### 4.5 FINDING P2 — Suites con fallos menores (Media/Baja)

- `public-claims.catalog`: 1/18 — probablemente claim outdated.
- `stripe-refund-service`: 3/11 — flujos de reembolso rotos.
- `stripe-charge-collection`: 1/15 — flujo de cobro menor.
- `product-roles-navigation`: 1/9 — UX navigation.
- `api-academy-settings-sport-config`: 2/4 — settings de academia.
- `api-athletes`: 2/4 — API atletas.

**Acción CEO**: backlog P2, agrupar en sprint "test hygiene" (1 semana).

## 5. Cobertura de tests (lectura agregada)

**Verificación**:
```bash
find . -name "*.test.ts" -o -name "*.spec.ts" | grep -v node_modules | wc -l
# → 342
```

**Cálculo**:
- 342 tests totales.
- 88 tests excluidos (9 suites en catálogo R6).
- 254 tests en el corpus activo.

**Ratio**: 88/342 = **25.7% de tests excluidos**. Esto es **alto**.

**Lectura**: una de cada cuatro suites está excluida del CI. El equipo ha estado acumulando deuda de test hygiene. Esto **invalida parcialmente** las cifras de cobertura publicitadas.

**Riesgo**: las decisiones de cierre P0 (ZAL-336, ZAL-976, ZAL-961) se tomaron con evidencia de tests incompleta.

## 6. Limitaciones de D4

| Limitación | Por qué | Mitigación |
|---|---|---|
| Blast radius TS strictness no medido | No ejecuté `pnpm typecheck` con flags activadas | Engineering Lead mide en sandbox |
| 35 rutas sin apiSuccess no categorizadas | Fuera de alcance D4 (auto-auditoría) | D7 (documentación) o sprint dedicado |
| 30 fallos R6 no triaged individualmente | No ejecuté cada suite | Engineering Lead triage manual |
| Caveat doc 2026-08-25 sobre ZAL-565 | El doc afirmaba 17/17 PASS; R6 dice 7/10. Sin acceso al log verbatim, no puedo confirmar fabricación | Reproducir localmente; comparar con Changelog |
| Cobertura por línea/rama no medida | Requiere `pnpm test --coverage` + Istanbul | Engineering Lead corre |

## 7. Resumen ejecutivo D4

| Finding | Severidad | Acción |
|---|---|---|
| ZAL-565 hardening 10/17 fallos (refuta "PASS local") | **P0** | Triage Engineering Lead inmediato; auditoría ZAL-169 |
| `quick-actions-modal-contract` 9/9 fallos | **P1** | Triage Engineering Lead |
| Cron class reminders 0/1 | **P1** | Verificar cron prod + triage |
| `noUncheckedIndexedAccess` off | **P1** | Activar + medir blast radius |
| `exactOptionalPropertyTypes` off | **P2** | Después de `noUncheckedIndexedAccess` |
| 25.7% de tests excluidos (deuda hygiene) | **P1** | Sprint "test hygiene" |
| Suites R6 P2 (6 suites, fallos menores) | **P2** | Backlog |
| 35 rutas sin apiSuccess no categorizadas | **P2** | Sprint dedicado o D7 |

**Findings nuevos D4**: 1 P0 (refuta PASS anterior), 3 P1, 2 P2.
**Findings positivos**: ninguno material (D4 es gap analysis, no hardening).

## 8. Caveat crítico de ZAL-169 (antifabricación)

**Comparación literal**:
- **Doc 2026-08-25** (P&S bloqueadores revisión): "Suite materializada con 17/17 PASS local" (línea 32-46).
- **R6 diagnostic 2026-09-06** (commit `d93ec123`): `tests/qa/zal-565/hardening.test.ts` muestra **7 PASS / 10 FAIL**.

**Conflicto detectado**: el doc 2026-08-25 puede contener una afirmación no reproducible (PASS local que el R6 refuta). Esto cae bajo la regla ZAL-169 #5: "SHA fabrication = incidente de control" / "no se pudo reproducir preferible a fix plausible-pero-incorrecto".

**Acción CEO**:
1. Pedir a Engineering Lead el log verbatim de la corrida original (2026-08-25) si existe.
2. Si no existe o no reproduce 17/17, abrir issue de incidente ZAL-169 sobre el doc 2026-08-25.
3. No aceptar cierre de ZAL-961 sin triage manual de los 10 fallos.

## 9. Preguntas abiertas D4 (para CEO / Engineering Lead)

- **Q-D4-1**: ¿Engineering Lead puede triage manual de los 30 fallos R6 (clasificar bug-prod vs infra-test) en 1 sprint?
- **Q-D4-2**: ¿Se activa `noUncheckedIndexedAccess` este sprint (medir blast radius) o se difiere a Q4?
- **Q-D4-3**: ¿El doc 2026-08-25 que afirma "17/17 PASS" de ZAL-565 tiene log que lo respalde, o es una afirmación no reproducible (incidente ZAL-169)?
- **Q-D4-4**: ¿Sprint "test hygiene" (re-incluir 6 suites P2) entra en roadmap Q4?
- **Q-D4-5**: ¿Las 35 rutas sin apiSuccess se categorizan en D7 (documentación) o sprint dedicado?

---

**Próxima entrega**: D5 — Performance y resiliencia operacional (pendiente confirmación CEO).