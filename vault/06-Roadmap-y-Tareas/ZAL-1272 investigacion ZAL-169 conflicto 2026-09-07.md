---
title: ZAL-1272 — Investigación ZAL-169 conflicto literal entre 2026-08-25 y R6
type: investigation
status: pending-board-escalation
created: 2026-09-07
owner: codex-session (análisis); Engineering Lead ejecuta triage; Board decide
politica: ZAL-169 antifabricación activa desde 2026-08-01
severidad: P0 (regresión de seguridad si no se investiga)
relacionado_con:
  - vault/06-Roadmap-y-Tareas/ZAL-P&S-bloqueadores-revision-2026-08-25.md (fuente 1)
  - vault/06-Roadmap-y-Tareas/Pre-existing test failures 2026-09-06.md (fuente 2)
  - vault/07-Auditorias-y-Riesgos/Decisiones codex 2026-09-07 — preguntas abiertas auditoria.md
---

# ZAL-1272 — ZAL-169 conflicto literal entre doc 2026-08-25 y R6 catalog

## TL;DR

El doc P&S 2026-08-25 (líneas 48-51) afirma que `pnpm exec vitest run --config vitest.qa.config.ts` dio `Tests 17 passed (17)`. El R6 catalog 2026-09-06 (commit `d93ec123`, verificable) muestra **7 PASS / 10 FAIL** en la misma suite `tests/qa/zal-565/hardening.test.ts`.

**No es fabricación directa** — el análisis de cronología + diff muestra que el cambio `ef81a2ff` (HMAC dev-session) del 2026-08-25 21:25 refactorizó `isDevSessionEnabled` de **función** a **booleano**, y el test (línea 235-238) sigue importándolo como función.

**PERO** la forma en que el doc 2026-08-25 está escrito (afirmación categórica "17/17 PASS local" sin timestamp + sin SHA del log) **viola ZAL-169 §3** ("ningún claim de cierre P0 sin log reproducible"). Engineering Lead debe recuperar el log verbatim de esa corrida antes de aceptar cierre P0 de ZAL-961 (P&S 2026-08-26).

---

## 1. Evidencia verbatim

### 1.1 Doc 2026-08-25 (fuente de la afirmación "17/17")
Archivo: `vault/06-Roadmap-y-Tareas/ZAL-P&S-bloqueadores-revision-2026-08-25.md`

```
$ pnpm exec vitest run --config vitest.qa.config.ts
 Test Files  1 passed (1)
      Tests  17 passed (17)
```

**Líneas**: 48-51. **SHA archivo**: commit en `zal770-recovered` (sin SHA verificable en el doc — **violación ZAL-169 §3**).

**Contexto declarado** (línea 91-93):
> "ZAL-770 / ZAL-955 / ZAL-957 — hardening P0 — `APROBADO LOCALMENTE, BLOQUEADO para producción`. Suite `vitest.qa.config.ts` 17/17 PASS local tras fix `dev-session-provider`."

### 1.2 R6 catalog (fuente de la afirmación "7/10")
Archivo: `vault/06-Roadmap-y-Tareas/Pre-existing test failures 2026-09-06.md`

> "8 | `tests/qa/zal-565/hardening.test.ts` | 17 | 7 | 10 | 🐛 Runtime bug + missing fn | Crítica"

**SHA verificable**: `d93ec123dfbf980a39da2c8e85432134fa1448d6` (commit `docs(test): R6 catalog 9 excluded test suites with failure modes`, autor `Hermes (preservation)`, fecha `Sun Sep 6 19:38:59 2026 +0200`).

### 1.3 Estado actual del código (2026-09-07)
- `tests/qa/zal-565/hardening.test.ts` — **296 líneas** (sin cambios desde merge `a2e9c409` del 2026-08-26).
- `vitest.qa.config.ts` — **20 líneas** (idéntico al de 2026-08-25).
- `src/lib/dev.ts` — **exporta `isDevSessionEnabled` como BOOLEAN** (línea 11-16).

### 1.4 Estado actual del test (relevante al fallo)
```typescript
// tests/qa/zal-565/hardening.test.ts:232-242
it("evalúa dev-session en cada request/runtime", async () => {
  process.env.NODE_ENV = "development";
  process.env.NEXT_PUBLIC_ENABLE_DEV_SESSION = "true";
  const { isDevSessionEnabled } = await import("@/lib/dev");
  expect(isDevSessionEnabled()).toBe(true);  // ← llamado como FUNCIÓN
  ...
});
```

**Incompatibilidad**: el test llama `isDevSessionEnabled()` (con paréntesis) pero la implementación es un booleano (sin paréntesis). Esto produce `TypeError: true is not a function` (o `false is not a function`).

---

## 2. Análisis cronológico

### 2.1 Commits relevantes (todos verificables con `git show -s --format="%ai %s" <sha>`)

| SHA | Fecha (UTC+2) | Mensaje |
|---|---|---|
| `a2e9c409` | 2026-08-26 10:40 | `merge: integrar origin/main para ancestro comun del PR` |
| `56844285` | 2026-08-30 15:55 | `fix: resolve contaminated merge markers` |
| `294edfa2` | 2026-08-29 08:16 | `fix(onboarding): harden d0 d2 d7 sandbox handoff` |
| **`ef81a2ff`** | **2026-08-25 21:25** | **`feat(security): HMAC para dev-session + helper marketing consent`** |

### 2.2 Diff conceptual del HMAC refactor (`ef81a2ff`)

**Antes** (inferido por el test que aún llama `isDevSessionEnabled()`):
```typescript
// src/lib/dev.ts (versión pre-HMAC)
export function isDevSessionEnabled(): boolean {
  return process.env.NODE_ENV === "development" && (...);
}
```

**Después** (estado actual verificado 2026-09-07):
```typescript
// src/lib/dev.ts (post-HMAC, líneas 11-16)
export const isDevSessionEnabled =
  process.env.NODE_ENV === "development" &&
  (
    process.env.NEXT_PUBLIC_ENABLE_DEV_SESSION === "true" ||
    process.env.NEXT_PUBLIC_USE_MOCK_AUTH === "true"
  );
```

**Cambio**: de **función** (lazy evaluation por request) a **const booleano** (eager evaluation al module load).

### 2.3 Línea temporal del día 2026-08-25

| Hora | Evento |
|---|---|
| 09:46 | Modificación de `src/components/dev-session-provider.tsx` (per `ls -la` output del doc línea 44) |
| **Sometime during the day** | P&S ejecuta `pnpm exec vitest run --config vitest.qa.config.ts` — afirma 17/17 PASS |
| **21:25** | Commit `ef81a2ff` introduce HMAC refactor (booleano en vez de función) |
| (Doc published later that day) | `vault/06-Roadmap-y-Tareas/ZAL-P&S-bloqueadores-revision-2026-08-25.md` |

### 2.4 Escenarios posibles

| Escenario | ¿P&S corrió test antes o después del HMAC commit? | Resultado esperado |
|---|---|---|
| A | **Antes de 21:25** (versión función aún en disco) | 17/17 PASS legítimo |
| B | **Después de 21:25** (versión booleano en disco) | TypeError en test 232 → 16/17 PASS (o peor) |

**Si P&S corrió antes de 21:25**: el doc es **legítimo**, pero hay un **bug latente** que el HMAC commit introdujo y que nadie detectó hasta R6 (12 días después).

**Si P&S corrió después de 21:25**: el doc contiene una **afirmación falsa** (no fabrication total — el test pasó para 16 tests, no 17). Esto es **violación ZAL-169 §3**.

**El doc NO incluye timestamp del run** → no podemos determinar cuál escenario aplica sin log externo.

---

## 3. ¿Es fabricación?

### 3.1 Lo que SÍ es fabricación
- Afirmar "17/17 PASS" sin log verbatim con SHA verificable.
- Cerrar P0 de ZAL-961 sin el log.
- Claim de "evidencia" sin archivo físico reproducible.

### 3.2 Lo que NO es fabricación
- Que el test pasara localmente en algún momento del 2026-08-25 (escenario A es posible).
- Que la implementación `isDevSessionEnabled` como función existiera antes de `ef81a2ff` (consistente con test que llama como función).
- Que el R6 diagnostic en `origin/main` (HEAD `62e3baf8`) vea 7/10 (consistente con el estado actual de `dev.ts`).

### 3.3 Conclusión
**No hay evidencia suficiente para afirmar fabricación categórica** (escenario A es plausible). Pero **el doc P&S 2026-08-25 viola ZAL-169 §3** porque:
- No incluye SHA del log.
- No incluye timestamp del run.
- No incluye la rama exacta (`zal770-recovered` se menciona pero sin SHA del branch).

Esto es **suficiente para escalar a Board** antes de aceptar cierre P0 de ZAL-961.

---

## 4. Acciones para Engineering Lead (orden de ejecución)

### 4.1 Día 1 — Recuperar log verbatim
```bash
# 1. Buscar logs en CI, local history, o backups:
find /tmp -name "*vitest*" -mtime -90 2>/dev/null | head -20
find ~/.cache -name "*vitest*" -mtime -90 2>/dev/null | head -20

# 2. Buscar si hay CI run archivado:
gh run list --limit 50 --workflow "ci" --json databaseId,conclusion,createdAt,name 2>/dev/null | head -30

# 3. Si NO hay log externo, documentar "log no encontrado" y proceder con §4.2.
```

### 4.2 Día 1 — Diagnosticar ZAL-565 (independiente del log)
1. Aplicar triage de §8 del doc `R6 triage ejecutable 2026-09-07.md`.
2. **NO** marcar como cerrado hasta tener log CI verde del fix (post-fix, no pre-fallo).
3. Si log CI post-fix muestra 17/17 → cierre legítimo.
4. Si log CI post-fix muestra <17/17 → bugfix incompleto, NO cerrar.

### 4.3 Día 2 — Fix del `isDevSessionEnabled` API contract

**Decisión arquitectónica necesaria**:
- **Opción A**: Refactorizar `src/lib/dev.ts` para exportar `isDevSessionEnabled` como función:
  ```typescript
  export function isDevSessionEnabled(): boolean {
    return process.env.NODE_ENV === "development" && (
      process.env.NEXT_PUBLIC_ENABLE_DEV_SESSION === "true" ||
      process.env.NEXT_PUBLIC_USE_MOCK_AUTH === "true"
    );
  }
  ```
  - Pros: mantiene contrato del test, lazy evaluation (más seguro para runtime variable).
  - Contras: requiere cambiar 3 call sites (`src/lib/dev-session.ts:50,80` — líneas ya importan la versión actual; verificar si rompen).

- **Opción B**: Cambiar el test (línea 236-238) para usar booleano:
  ```typescript
  expect(isDevSessionEnabled).toBe(true);
  ```
  - Pros: mantiene eager evaluation (más performante).
  - Contras: pierde capacidad de testear transiciones de env var entre calls (línea 237-241 del test verifica que cambiar `process.env.VERCEL_ENV` cambia el resultado — solo posible con función).

**Recomendación**: **Opción A** (función) — el test fue escrito con intención de validar transiciones de env, y `ef81a2ff` perdió esa capacidad al refactorizar a booleano.

### 4.4 Verificación post-fix
```bash
pnpm vitest run --config vitest.diag.config.ts tests/qa/zal-565/hardening.test.ts --no-coverage --reporter=verbose
# Expected: 17 passed (17) — o N/17 donde N es el subset que pasa sin los otros 9 fixes de §8.4
```

### 4.5 Cierre ZAL-961 / ZAL-565 / ZAL-957 / ZAL-770

**Plantilla de cierre (para PR o comentario)**:
```
Cierre ZAL-565/ZAL-957/ZAL-770 — hardening P0

SHA pre-fix: <commit_antes>
SHA post-fix: <commit_despues>
Log CI verbatim: 
  Test Files  1 passed (1)
       Tests  17 passed (17)
URL log: <link a CI run>
Peer verification: <agente> @ <timestamp>
Fix incluye: 
  - isDevSessionEnabled como función (refactor de ef81a2ff)
  - capability gate en reset de métricas
  - tenant filter en GET de evento interno
  - capability gate events:update antes de PATCH
  - tenant filter en fanout geográfico

Política ZAL-169: log reproducible + peer verification ✓
```

---

## 5. Recomendación al Board

**Recomendación primaria**: Board **NO debe aceptar cierre P0 de ZAL-961** (P&S 2026-08-26) sin:
1. Log verbatim de la corrida 2026-08-25 (o admitir que el log no existe).
2. SHA del branch `zal770-recovered` al momento del run.
3. Comparación del estado de `src/lib/dev.ts` antes y después de `ef81a2ff`.

**Si el log no existe** (escenario probable dado el doc P&S no incluye timestamps): el cierre P0 de ZAL-961 es **inválido retroactivamente**. Engineering Lead debe reabrir ZAL-565/ZAL-957/ZAL-770 como **bloqueado** (no aprobado localmente).

**ZAL-169 §6** ("ningún cierre P0 sin peer verification + log"): el doc 2026-08-25 NO es suficiente evidencia de cierre. Board debe escalar incidente de proceso si se confirma que se aceptó cierre sin log.

---

## 6. Lo que NO se hace en esta investigación

- **NO** se modifica código de producción.
- **NO** se reabre ZAL-961 directamente (eso es potestad del Board).
- **NO** se afirma fabrication categórica (no hay evidencia suficiente).
- **NO** se publica este doc fuera del vault (privado, solo Board + Engineering Lead).

---

## 7. Estado de cola

| Acción | Owner | Estado |
|---|---|---|
| Recuperar log verbatim 2026-08-25 | Engineering Lead | Pendiente (D4.1) |
| Diagnosticar ZAL-565 (triage §8) | Engineering Lead | Triage listo, ejecución pendiente |
| Fix `isDevSessionEnabled` (Opción A recomendada) | Engineering Lead | Pendiente |
| Escalar a Board con este doc | codex (vía este vault doc) | ✅ entregado |
| Board decide sobre ZAL-961 | Board | Pendiente |
| Reabrir ZAL-565/ZAL-957/ZAL-770 si aplica | Board | Pendiente |

---

**Codex NO ejecuta. Board decide sobre ZAL-961. Engineering Lead ejecuta triage + fix con verificación §4.4. Política ZAL-169 activa.**