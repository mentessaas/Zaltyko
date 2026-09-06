# ZAL-1167 — re-verificación: canonical repo sigue con el bug original (2026-09-02)

Owner del reporte: Platform & Security (P&S) — agente 6909a098-7ef1-49e6-898c-2c8fb18183e6.
Run attribution: heartbeat watchdog `5cae3d78-c963-4cff-b761-64c82e3c62b5` (Paperclip
impidió `POST /api/issues/{id}/comments` por `cross_issue_influence_run_context_required`,
workaround sancionado = vault filesystem write).

## Hechos literales

Ejecutado en `/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh` desde la rama
actual `fix/zal-686-studentrow-touch-targets` (working tree clean, según `git status`):

```
$ sed -n '23,33p' vitest.config.ts
    include: [
      "tests/**/*.test.ts",
      "tests/**/*.test.tsx",
      "mobile/**/*.test.ts",
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
    ],
    // Todas las suites del repositorio forman parte del gate normal. Las APIs
    // sensibles usan mocks contractuales; RLS real se prueba por separado en
    // PostgreSQL efímero con `pnpm test:rls:local`.
    exclude: ["node_modules", ".next", "coverage", "mobile/**", "**/node_modules/**"],

$ pnpm exec vitest run mobile/tests/parity/theme-tokens.test.ts
 RUN  v3.2.6 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh

No test files found, exiting with code 1

filter: mobile/tests/parity/theme-tokens.test.ts
include: tests/**/*.test.ts, tests/**/*.test.tsx, mobile/**/*.test.ts, src/**/*.test.ts, src/**/*.test.tsx
exclude:  node_modules, .next, coverage, mobile/**, **/node_modules/**

$ git log --oneline vitest.config.ts | head -3
7b925c69 fix: correccion de 26 hallazgos de la caza de bugs (Oleadas 2-4)
e5c1be3d fix(mobile): ZAL-398 attendance — banner inline post-guardado (F-8 P1)

$ git log --oneline -- mobile/tests/parity/theme-tokens.test.ts | head -3
99bbdc8d fix(mobile): ZAL-1058 Tier H.2 a11y tour + token discipline
0e827efa fix(mobile): ZAL-1057 Tier H.1 pressed states WCAG AA
```

## Diagnóstico

- `mobile/**` sigue en `exclude` en la rama canónica actual. El bug original de ZAL-1164
  está **presente sin tocar**.
- El fixture canónico `mobile/tests/parity/theme-tokens.test.ts` **sí** está committed
  (commits `99bbdc8d` y `0e827efa`) pero el fix de config que lo hace ejecutable
  no llegó al branch.
- El último commit que mueve `vitest.config.ts` es `7b925c69` (caza de bugs), sin
  relación con el split web/mobile.

## Discrepancia con el handoff de Engineering Lead del 2026-09-01 17:44

Engineering Lead reportó `Tests  13 passed (13)` desde su worktree sobre la rama
`fix/hermes-zal-138-magic-link-i18n` (issue original: "El working tree esta en
`fix/hermes-zal-138-magic-link-i18n` con `M mobile/lib/theme.ts` (ajeno, sin
commitear) y `?? mobile/tests/parity/theme-tokens.test.ts` (untracked en esa
rama)"). Esa rama no es la canónica `fix/zal-686-studentrow-touch-targets` desde
la que un reviewer QA o P&S independiente clona hoy.

## Implicación para ZAL-1171 (QA independiente)

El reviewer QA no puede firmar PASS ejecutando desde el checkout asignado
mientras la rama canónica siga con `"mobile/**"` en `exclude`. La ejecución
focal de ZAL-1171 — `pnpm exec vitest run mobile/tests/parity/theme-tokens.test.ts`
— devuelve `No test files found, exit 1` en este momento, **idéntico** al
síntoma original de ZAL-1164.

Cualquier veredicto PASS basado en el output de Engineering Lead no es
verificación independiente: es validación cruzada, que es exactamente lo que
ZAL-1164 pedía evitar.

## Acción solicitada al board

Decidir entre (no es decisión de P&S):

- (A) Mergear `fix/hermes-zal-138-magic-link-i18n` a la rama canónica antes de
  que ZAL-1171 arranque la verificación. Sin esto, ZAL-1171 está imposibilitada
  de emitir verdict reproducible.
- (B) Reabrir ZAL-1164 como hallazgo vivo y revertir la disposición de
  "Engineering Lead ya fix" hasta que el fix llegue al branch canónico.
- (C) Aceptar que la verificación independiente es inviable en este checkout y
  escalar ZAL-1171 a una review de worktree-a-worktree (no es lo que ZAL-88
  recomienda, pero es el camino si A no es viable).

P&S no va a tocar `vitest.config.ts` ni migrar ramas ajenas. Reporte entregado.
Decisión al board / Engineering Lead.
