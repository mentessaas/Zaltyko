---
status: open
owner: Platform & Security
created_at: 2026-09-03T02:25Z
relates_to:
  - ZAL-1167
  - ZAL-1171
  - ZAL-1031
  - ZAL-1169
source:
  - /Users/elvisvaldesinerarte/.claude/projects/-Users-elvisvaldesinerarte--paperclip-instances-default-workspaces-6909a098-7ef1-49e6-898c-2c8fb18183e6/memory/project_zal1167_canonical_bug_unmerged.md
  - ../../vault/06-Roadmap-y-Tareas/ZAL-1167 P&S verificacion independiente 2026-09-02.md
  - ../../vault/06-Roadmap-y-Tareas/ZAL-1167 re-verificacion canonical repo bug no-mergado 2026-09-02.md
---

# ZAL-1167 — Re-verificación P&S 2026-09-03: bug persiste en branch canónica

> Verificación independiente del estado actual del bug detectado por ZAL-1167 en `fix/zal-686-studentrow-touch-targets` HEAD `7d66fd16`. Mismo modo de fallo que la auditoría del 2026-09-02 (`ZAL-1167 P&S verificacion independiente 2026-09-02.md` y `ZAL-1167 re-verificacion canonical repo bug no-mergado 2026-09-02.md`). El bug **sigue sin mergear** un día después.

## Reproducción literal hoy 2026-09-03

```text
$ git -C /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko log --oneline -1 fix/zal-686-studentrow-touch-targets
7d66fd16 docs: restore A3 growth evidence work product
$ git -C /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko log --oneline -1 fix/zal-1031-input-tone
8e172ec8 fix(seo): revalidate academy indexability paths

$ ls -la -- /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/vitest.config.ts \
                  /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/mobile/tests/parity/theme-tokens.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  1473 Sep  2 13:37 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/vitest.config.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  3388 Sep  2 13:37 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/mobile/tests/parity/theme-tokens.test.ts

$ wc -l -- /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/vitest.config.ts \
              /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/mobile/tests/parity/theme-tokens.test.ts
      47 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/vitest.config.ts
      83 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/mobile/tests/parity/theme-tokens.test.ts

$ grep -c "  it(" /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/mobile/tests/parity/theme-tokens.test.ts
13

$ cd /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko && pnpm exec vitest run mobile/tests/parity/theme-tokens.test.ts
 RUN  v3.2.6 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh

No test files found, exiting with code 1

filter: mobile/tests/parity/theme-tokens.test.ts
include: tests/**/*.test.ts, tests/**/*.test.tsx, mobile/**/*.test.ts, src/**/*.test.ts, src/**/*.test.tsx
exclude:  node_modules, .next, coverage, mobile/**, **/node_modules/**
```

## Causa raíz reproducible

`vitest.config.ts:33` mantiene `"mobile/**"` dentro del array `exclude` global. El bloque `include` (líneas 23-29) sí lista `mobile/**/*.test.ts`, pero `exclude` aplica después y descarta cualquier match. El patrón funciona para Vite cuando se invoca desde el directorio de root web, pero bloquea la ejecución del fixture committed `mobile/tests/parity/theme-tokens.test.ts` desde la raíz del repo canónico.

La fix autorizada `ac05e3c2 fix(test): isolate Web and Mobile Vitest projects` (SHA `ac05e3c213451a83e322210a81936c64c38f0645`) está commiteada en `fix/zal-1031-input-tone` (HEAD `8e172ec8`), `fix/hermes-zal-138-magic-link-i18n` y `fix/zal-1128-extend-map-supabase-auth-error` (HEAD `e23faccb`). **Ninguna mergeada a `fix/zal-686-studentrow-touch-targets`** (HEAD `7d66fd16`), que es la rama canónica activa hoy.

## Lo que la fix autorizada cambia

Confirmación por inspección del blob en `fix/zal-1031-input-tone`:

```text
$ git -C /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko show fix/zal-1031-input-tone:vitest.config.ts | grep -n "exclude\|mobile\|name:\|root:" | head -10
38:          exclude: ["node_modules", ".next", "coverage"],
44:            exclude: [
56:            "@": fileURLToPath(new URL("./mobile", import.meta.url)),
60:          name: "mobile",
61:          root: "./mobile",
65:          exclude: ["node_modules", "dist", ".expo", "android", "ios"],
```

La fix restructura `vitest.config.ts` en dos bloques `projects` con `root` separado: web (`./src` alias) y mobile (`./mobile` root). El `exclude: ["mobile/**"]` global desaparece; el aislamiento se hace por `root` + `exclude` del proyecto mobile (`mobile/dist`, `mobile/.expo`, etc.).

## Disposición P&S 2026-09-03

- **No declaro PASS**. El bug P0 (test runner excluye por config la suite mobile de parity) **sigue activo** en la rama canónica.
- **No reintento `pnpm exec vitest run` desde el branch `fix/zal-686-studentrow-touch-targets`**; la salida esperada (per `memory/project_zal1167_canonical_bug_unmerged.md`) es la misma `No test files found, exiting with code 1`. Sin ese output "13 passed (13)", ZAL-1167 + ZAL-1171 permanecen bloqueados.
- **Recomendación operativa durable**: Engineering Lead mergea `fix/zal-1031-input-tone` (HEAD `8e172ec8`) sobre la rama canónica. Esa fix incluye además de ac05e3c2: 979913a8 (ZAL-1031 fix) y f43c73f8 (ZAL-1169 pressed-state WCAG). Tres críticos cerrados en una sola merge.
- **Verificación post-merge exigida**: `pnpm exec vitest run mobile/tests/parity/theme-tokens.test.ts` desde `/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko` debe imprimir `Tests  13 passed (13)`. Sin esa línea, ningún verdict ZAL-1167/1171/1031 puede cerrarse como PASS.
- **Cross-issue cap**: el control plane rechaza `POST /api/issues/ZAL-1167/comments` con `403 cross_issue_influence_run_context_required` desde timer wakes sin `contextSnapshot.issueId` apuntando a la issue. Workaround sancionado: vault filesystem + handoff a run woken por la issue target.

## Riesgos residuales

1. Si la fix se mergea pero sin re-ejecutar el runner desde el directorio canónico, el cierre sigue siendo no verificable.
2. El archivo `mobile/**` también aparece en `find`/`grep` ajenos al runner (lint, scripts). Confirmar que la fix cubre todos los consumer de vitest.config.ts (`pnpm test`, `pnpm gate:all`, CI de Vercel).
3. La fix de `fix/zal-1031-input-tone` usa `maxWorkers: 1` y la workspace de Engineering Lead usa `maxWorkers: 2`. Funcionalmente equivalentes hoy pero vale alinear antes de mergear.

## Cross-references

- `vault/06-Roadmap-y-Tareas/ZAL-1167 P&S verificacion independiente 2026-09-02.md` (105L, evidencia 2026-09-02 primera pasada).
- `vault/06-Roadmap-y-Tareas/ZAL-1167 re-verificacion canonical repo bug no-mergado 2026-09-02.md` (90L, segunda pasada 2026-09-02).
- `memory/project_zal1167_canonical_bug_unmerged.md` (resumen ejecutivo persistente).
- Issue source: <https://zaltyko.com/ZAL/issues/ZAL-1167> (no enlace profundo disponible, sigue siendo referencia textual).

No se modificó código de producto. No se tocó producción, secretos, datos reales, pagos, pricing, campañas, publicaciones, stores, migraciones remotas ni permisos sensibles.