# ZAL-518 — QA re-verificación sandbox de idempotencia (ZAL-510 post-fix)

- **Issue**: ZAL-518 (re-verificación QA de ZAL-510)
- **Dependencia**: ZAL-517 `done` (peer review Web Developer — APPROVED con 3 hallazgos P3)
- **Agente**: QA (c07d53ca), run 07011229
- **Fecha**: 2026-08-10
- **Entorno**: Supabase sandbox `aeeootdmuiqkfeernskw` (Zaltyko E2E Sandbox, eu-north-1)
- **Veredicto**: **PASS**

---

## 1. Alcance

- **Migration nueva (bajo prueba)**: `supabase/migrations/20260810120000_academies_status_backfill_idempotency.sql`
- **Migration histórica (no modificada, verificado)**: `supabase/migrations/20260805120000_academies_status_semantics.sql`
- **Playbook**: el de ZAL-489, cuatro familias — schema, RLS anon, helper gate, idempotencia.

Confirmado por inspección que la migration histórica **no fue modificada**: conserva sus 278 líneas y su backfill original (líneas 138-159), incluido el bug. El fix vive exclusivamente en el archivo nuevo.

---

## 2. Entorno y baseline

Conexión vía Supabase CLI v2.84.2 `--linked` al sandbox. Identidad confirmada:
`db=postgres`, `user=postgres`, PostgreSQL 17.6. Link global revertido a producción
(`jegxfahsvugilbthbked`) al cierre.

Baseline: 5 filas en `academies`, con cobertura natural de los cuatro estados relevantes.

| id | name | status | is_suspended | is_trial_active | is_public |
|---|---|---|---|---|---|
| `11111111-…` | TEST active | active | false | false | true |
| `22222222-…` | TEST suspended | suspended | true | false | true |
| `33333333-…` | TEST churned | churned | false | false | true |
| `44444444-…` | TEST fraud_hold | fraud_hold | false | false | true |
| `7ea0690c-…` | Zaltyko E2E Sandbox Academy | active | false | false | false |

> **Observación (no bloqueante)**: las 4 filas `TEST …` provienen de ZAL-489, cuyo comentario
> las describe como insertadas en `ROLLBACK`. Están **persistidas** en el sandbox. No es un
> problema de seguridad (sandbox, sin datos reales), pero contradice el registro de ZAL-489.
> Las dejé en su sitio: son fixtures útiles y borrarlas alteraría el punto de partida del owner
> de ZAL-510. Ver §7.

---

## 3. Familia 4 — Idempotencia (el objeto del fix)

### 3.1 Control negativo: el bug se reproduce en este dataset

Replay del backfill **histórico** (3 UPDATEs de las líneas 138-159 de `20260805120000`)
dentro de `BEGIN … ROLLBACK`. Nada se persistió.

| name | status previo | status tras replay histórico |
|---|---|---|
| TEST churned | churned | **active** ← regresión |
| TEST fraud_hold | fraud_hold | **active** ← regresión |
| TEST suspended | suspended | suspended |
| TEST active | active | active |

Confirma que el test tiene poder discriminante: sobre estos datos el backfill viejo
sí destruye los estados terminales.

Mecánica del bug (UPDATE 3): `WHERE is_suspended=false AND is_trial_active=false AND (status IS NULL OR status <> 'active')`
matchea `churned` y `fraud_hold` porque ambos cumplen las tres condiciones.

### 3.2 Test positivo: el backfill corregido no muta nada

Replay del backfill **nuevo** sobre el mismo baseline, en `BEGIN … ROLLBACK`, comparando
snapshot pre/post fila a fila:

| name | status_before | status_after | status_changed | status_updated_at_changed |
|---|---|---|---|---|
| TEST active | active | active | false | false |
| TEST churned | churned | churned | false | false |
| TEST fraud_hold | fraud_hold | fraud_hold | false | false |
| TEST suspended | suspended | suspended | false | false |
| Zaltyko E2E Sandbox Academy | active | active | false | false |

**0 filas mutadas**, ni siquiera en `status_updated_at`.

### 3.3 Matriz exhaustiva de escenarios (20 combinaciones)

El baseline no cubre combinaciones como `churned` + `is_suspended=true` — precisamente
la que ataca la guarda nueva de UPDATE 1. Construí una matriz sintética completa:
5 estados × `is_suspended` ∈ {F,T} × `is_trial_active` ∈ {F,T} = 20 filas, insertadas y
evaluadas dentro de `BEGIN … ROLLBACK` contra el resultado esperado por contrato.

**Backfill corregido: 20/20 PASS.**

**Backfill histórico sobre la misma matriz: 16/20 — 4 regresiones**, exactamente las que
el fix repara:

| escenario | contrato | histórico produce |
|---|---|---|
| churned, is_suspended=0, is_trial=0 | churned | **active** |
| churned, is_suspended=1, is_trial=0 | churned | **suspended** |
| churned, is_suspended=1, is_trial=1 | churned | **suspended** |
| fraud_hold, is_suspended=0, is_trial=0 | fraud_hold | **active** |

Nótese que dos de las cuatro regresiones son de UPDATE 1 (`churned` + `is_suspended=true`),
que el histórico excluía sólo para `suspended` y `fraud_hold`. El fix añade `'churned'`
a esa lista. Sin la matriz sintética estas dos no se habrían detectado, porque el baseline
no contiene ninguna fila `churned` con `is_suspended=true`.

### 3.4 Aplicación controlada real + doble replay

Aplicada la migration **verbatim** (archivo completo con su `BEGIN;`/`COMMIT;`) contra el
sandbox, dos veces consecutivas. Fingerprint = `md5` del agregado ordenado de
`id:status:status_updated_at` por grupo de status.

| momento | active | churned | fraud_hold | suspended |
|---|---|---|---|---|
| antes | 2 (`8e1a7fc1…`) | 1 (`f725b598…`) | 1 (`741ae318…`) | 1 (`37625a7f…`) |
| tras apply #1 | 2 (`8e1a7fc1…`) | 1 (`f725b598…`) | 1 (`741ae318…`) | 1 (`37625a7f…`) |
| tras apply #2 | 2 (`8e1a7fc1…`) | 1 (`f725b598…`) | 1 (`741ae318…`) | 1 (`37625a7f…`) |

Sin error en ninguna de las dos ejecuciones. **Fingerprints idénticos** en los tres
momentos: no sólo los conteos son estables, tampoco se movió ningún `status_updated_at`.

---

## 4. Familia 1 — Schema (post-apply)

**20/20 artefactos presentes, ninguno faltante**: 11 columnas (`status`, `status_updated_at`,
`churned_at`, `churned_reason`, `churned_reason_notes`, `fraud_hold_at`, `fraud_hold_reason`,
`fraud_hold_reason_notes`, `fraud_hold_actor_id`, `fraud_hold_cleared_at`,
`fraud_hold_cleared_actor_id`), 4 check constraints, 2 índices, 1 policy, 1 función, 1 trigger.

La migration nueva no contiene DDL, y se confirma que no produjo daño colateral en el schema.

## 5. Familia 2 — RLS anon (post-apply)

`BEGIN; SET LOCAL ROLE anon;` — visibilidad real del directorio público, sin insertar filas
(el sandbox ya contiene las cuatro variantes con `is_public=true`):

| status | anon visible | esperado | |
|---|---|---|---|
| active | sí | sí | PASS |
| suspended | sí | sí | PASS (intencional, §3.3 #4 sólo excluye terminales) |
| churned | no | no | PASS |
| fraud_hold | no | no | PASS |

`anon` ve 2 de 5 filas. La policy `academies_public_directory` sigue filtrando los terminales.

## 6. Familia 3 — Helper gate (post-apply)

`public.is_academy_blocked_from_sending(id)` sobre las 5 filas reales, read-only (sin las
mutaciones+rollback que usó ZAL-489):

| name | status | is_suspended | blocked | esperado |
|---|---|---|---|---|
| TEST active | active | false | false | false ✓ |
| TEST suspended | suspended | true | true | true ✓ |
| TEST churned | churned | false | true | true ✓ |
| TEST fraud_hold | fraud_hold | false | true | true ✓ |
| Zaltyko E2E Sandbox Academy | active | false | false | false ✓ |

5/5 correcto.

---

## 7. Limitaciones y lo que NO se hizo

- **No se tocó producción.** El CLI se linkeó a sandbox sólo para esta verificación y se
  revirtió a `jegxfahsvugilbthbked` al cierre.
- **No se imprimieron secretos** en comentarios, logs ni este documento.
- **No se corrigió `fraud_hold_actor_id`** (sigue `NULL` en la fila `44444444-…`) — fuera de
  alcance, pertenece a ZAL-331.
- **No se registró la migration en el ledger** (`zaltyko_schema_migrations`). La apliqué con
  `supabase db query`, no con `pnpm db:migrate:ledger`. El registro en el ledger y la
  promoción a producción siguen siendo decisión del owner de ZAL-510 / board.
- **La migration histórica no se modificó** — verificado, no sólo asumido.
- **Cobertura**: la matriz de §3.3 es exhaustiva sobre `status × is_suspended × is_trial_active`,
  pero asume que esas tres columnas son las únicas entradas del backfill. Lo son, por
  inspección de las tres cláusulas `WHERE`.
- **Las 4 filas fixture de ZAL-489 quedaron en el sandbox** (ver §2). No las borré.
- El escenario `suspended` + `is_trial_active=true` + `is_suspended=false` conserva
  `suspended` (no pasa a `trial`) tanto en el backfill viejo como en el nuevo. Es una
  particularidad heredada, **no una regresión del fix**, y por eso no la conté como fallo.

---

## 8. Veredicto

**PASS.** Los cuatro criterios de aceptación de ZAL-518 se cumplen:

1. ✅ La migration nueva aplica sin error en sandbox en transacción controlada (§3.4, dos veces).
2. ✅ El replay del SQL de corrección no muta filas `churned`/`fraud_hold` (§3.2, §3.3: 20/20).
3. ✅ Los conteos `churned` y `fraud_hold` permanecen estables post-replay — y también los
   fingerprints fila a fila (§3.4).
4. ✅ Evidencia sandbox/test y limitaciones registradas por separado (§3-§6 vs §7); sin
   producción, sin secretos, sin tocar `fraud_hold_actor_id`.

Los fixes y la promoción quedan a cargo del owner de ZAL-510.

— QA (c07d53ca), 2026-08-10
