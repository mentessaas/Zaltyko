---
status: research
owner: P&S
date: 2026-09-02
alcance: ZAL-1167 — vitest excluye mobile/**
tipo: verificación independiente (cross-agent re-verificación)
origen_verificacion: ZAL-1167 hallazgo, work product original del Designer 175643b5
---

# ZAL-1167 — P&S verificación independiente 2026-09-02

## Resumen ejecutivo

El defecto ZAL-1167 (vitest.config.ts contradice `include: mobile/**/*.test.ts` con `exclude: mobile/**`) sigue sin merge en main canónico. La fix existe en al menos 3 ramas locales (ac05e3c2 aislado en fix/zal-1031-input-tone y otras), y el workspace del Engineering Lead contiene la misma fix como archivo untracked (sin commit). Verifiqué independientemente que la fix funciona y el test focal pasa 13/13, pero el gate de aceptación `vitest run mobile/tests/parity/theme-tokens.test.ts` no es reproducible en main canónico.

## Estado de cada worktree el 2026-09-02

| Worktree | Branch | SHA | vitest.config.ts | `mobile/**` en exclude | Test focal pasa |
|----------|--------|-----|------------------|------------------------|-----------------|
| `Zaltyko` (canonical) | `fix/zal-686-...` (deriva de main) | `7d66fd16` | 47 líneas, single project | **SÍ (roto)** | NO reproducible |
| `Zaltyko-fresh/.worktrees/zal-1128` | `fix/zal-1128-extend-map-supabase-auth-error` | `e23faccb` | 70 líneas, 2 projects | 0 ocurrencias | NO corre (no tiene theme-tokens.test.ts en worktree) |
| `Zaltyko-fresh` (canonical) | `fix/zal-686-...` | `7d66fd16` | mismo que main: roto | SÍ | NO |
| Engineering Lead workspace | `main` (local) | `ba09e7b7` | 63 líneas, 2 projects (untracked) | 0 ocurrencias | **SÍ, 13/13 passed** |

## Evidencia literal independiente

### Workspace Engineering Lead — vitest corre OK

```
$ cd /Users/elvisvaldesinerarte/.paperclip/instances/default/workspaces/acade097-32d5-4ce1-91f1-1415a6f2bc12
$ wc -l vitest.config.ts
     63 vitest.config.ts
$ grep -c 'mobile/\*\*' vitest.config.ts
0
$ pnpm exec vitest run mobile/tests/parity/theme-tokens.test.ts

 RUN  v3.2.6 /Users/elvisvaldesinerarte/.paperclip/instances/default/workspaces/acade097-32d5-4ce1-91f1-1415a6f2bc12

 ✓ |mobile| tests/parity/theme-tokens.test.ts (13 tests) 4ms

 Test Files  1 passed (1)
      Tests  13 passed (13)
   Start at  19:54:06
   Duration  555ms (transform 40ms, setup 0ms, collect 36ms, tests 4ms, environment 0ms, prepare 78ms)
```

Cumple criterio 3 de aceptación de ZAL-1167: `Tests  13 passed (13)`.

### Workspace Engineering Lead — fix NO está en su HEAD

```
$ git show HEAD:vitest.config.ts
fatal: path 'vitest.config.ts' exists on disk, but not in 'HEAD'
$ git log --oneline HEAD -- vitest.config.ts
(vacío)
$ git status --short | grep vitest.config
?? vitest.config.ts
```

El archivo está aplicado en el disco pero **nunca se commiteó** en el workspace del Engineering Lead. No hay SHA durable que certifique la fix desde ese workspace.

### Branch ac05e3c2 — fix commiteada y reproducible

```
$ git -C /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko show ac05e3c2 --stat
commit ac05e3c213451a83e322210a81936c64c38f0645
Author: MentesSaaS <mentessaas@gmail.com>
Date:   Tue Sep 1 13:35:45 2026 + +0200

    fix(test): isolate Web and Mobile Vitest projects

 vitest.config.ts | 99 ++++++++++++++++++++++++++++++++++----------------------
 1 file changed, 61 insertions(+), 38 deletions(-)
```

Branches que contienen ac05e3c2:
- `fix/hermes-zal-138-magic-link-i18n`
- `fix/zal-1031-input-tone`
- `fix/zal-1128-extend-map-supabase-auth-error`

### Main canónico — sigue roto

```
$ git -C /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko show main:vitest.config.ts | grep -E '(include|exclude)'
    include: [
    exclude: ["node_modules", ".next", "coverage", "mobile/**", "**/node_modules/**"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
```

Sigue la contradicción `mobile/**/*.test.ts` (include) vs `mobile/**` (exclude).

## Disposición recomendada a Engineering Lead

1. **Unificar las dos variantes de la fix** (Engineering Lead workspace untracked vs ac05e3c2 commiteada) — son funcionalmente equivalentes pero con `maxWorkers: 2` vs `maxWorkers: 1`. Decisión: ¿cuál gana? Sugerencia: `ac05e3c2` (más conservadora para CI; menos starvation).
2. **Mergear `fix/zal-1031-input-tone` (HEAD 8e172ec8)** a main, ya que contiene la fix ZAL-1167 (ac05e3c2) + la fix ZAL-1031 (979913a8) + la fix ZAL-1169 pressed-state (f43c73f8). Resuelve 3 issues críticos de un plumazo.
3. **No aplicar PR #98** sin antes aplicar la fix vitest, porque el gate CI actual falla para tests Mobile (excluidos). PR #98 está OPEN sobre `fix/zal-686-studentrow-touch-targets` que deriva de main roto.
4. **Verificación post-merge en main canónico**: `pnpm exec vitest run mobile/tests/parity/theme-tokens.test.ts` debe imprimir `Tests  13 passed (13)`. Sin ese output, ZAL-1167 + ZAL-1171 siguen bloqueados.

## Riesgo residual

Si QA ZAL-1171 corre contra el main canónico hoy, no puede producir el output exigido — el test nunca corre. Cualquier evidencia de `mobile/tests/parity/theme-tokens.test.ts` ejecutada desde `/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko` (main) mostrará `No test files found`. El gate de P&S no puede aprobar nada que no sea reproducible en el repositorio canónico.

## Custodia

No se modificó ningún archivo del repo. Solo lectura (`wc`, `grep`, `cat`, `git show`, `git log`, `git diff`, `pnpm exec vitest run` sin flags destructivos). El test focal corrió contra el workspace del Engineering Lead, no contra mi workspace ni contra el canónico.