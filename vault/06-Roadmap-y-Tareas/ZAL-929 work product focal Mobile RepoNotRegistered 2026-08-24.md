# ZAL-929 — restauración runtime y ejecución focal Mobile RepoNotRegistered

Fecha de ejecución: 2026-08-24
Issue: ZAL-929 (hija de ZAL-751, in_progress)
Runtime: `/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/paperclip-upstream-vivo` (server)

## Resultado

**Tests  2 passed (2)** — suite focal ejecutada y superada. No se invocó
producción, ni secretos, ni datos reales, ni Stripe live, ni bases remotas.
Todo el trabajo ocurrió en local contra un Postgres embebido temporal
levantado por `getEmbeddedPostgresTestSupport`.

## Aceptación cumplida (criterio ZAL-929)

| Criterio | Estado | Evidencia |
| --- | --- | --- |
| Suite focal ejecuta realmente (no `0 test`, no error de carga) | OK | `Test Files  1 passed (1) / Tests  2 passed (2)` |
| Caso positivo con Mobile registrado supera `RepoNotRegistered` | OK | `POSITIVE ... 1337ms` con aserción `expect(verdict?.code).not.toBe("RepoNotRegistered")` |
| Caso negativo con `repoPath` no registrado conserva el rechazo | OK | `NEGATIVE ... 364ms` con aserción `expect(verdict?.code).toBe("RepoNotRegistered")` |
| `ls -la`/`wc -l` para cada archivo citado | OK | ver bloque "Evidencia literal" abajo |
| `grep -c "  it("` para conteo de tests | OK | `2` (ver bloque abajo) |
| Última línea literal `Tests N passed (M)` | OK | `Tests  2 passed (2)` (ver bloque abajo) |

## Archivos relevantes (con `ls -la` y `wc -l`)

### Archivo nuevo (fixture focal)

```
$ ls -la /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/paperclip-upstream-vivo/server/src/__tests__/completion-proofs-mobile-zal751.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  7133 Aug 24 14:38 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/paperclip-upstream-vivo/server/src/__tests__/completion-proofs-mobile-zal751.test.ts

$ wc -l /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/paperclip-upstream-vivo/server/src/__tests__/completion-proofs-mobile-zal751.test.ts
     193 .../completion-proofs-mobile-zal751.test.ts

$ grep -c "  it(" /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/paperclip-upstream-vivo/server/src/__tests__/completion-proofs-mobile-zal751.test.ts
2

$ grep -n "  it(" /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/paperclip-upstream-vivo/server/src/__tests__/completion-proofs-mobile-zal751.test.ts
142:  it("ZAL-751 POSITIVE — Mobile path registered, commit proof from registered Mobile worktree is NOT rejected with RepoNotRegistered", async () => {
169:  it("ZAL-751 NEGATIVE — Mobile path registered but commit proof from an unregistered tmpdir → 409 RepoNotRegistered", async () => {
```

### Servicio ejercitado (gate)

```
$ ls -la /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/paperclip-upstream-vivo/server/src/services/completion-proofs.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  29845 Aug  9 23:04 .../services/completion-proofs.ts

$ wc -l /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/paperclip-upstream-vivo/server/src/services/completion-proofs.ts
     732 .../services/completion-proofs.ts
```

## Salida literal reproducible de vitest

```
$ cd /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/paperclip-upstream-vivo/server
$ pnpm exec vitest run --reporter=verbose src/__tests__/completion-proofs-mobile-zal751.test.ts
 RUN  v4.1.10 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/paperclip-upstream-vivo/server

 ✓ src/__tests__/completion-proofs-mobile-zal751.test.ts > completionProofService — ZAL-751 Mobile path RepoNotRegistered fixture > ZAL-751 POSITIVE — Mobile path registered, commit proof from registered Mobile worktree is NOT rejected with RepoNotRegistered 1337ms
 ✓ src/__tests__/completion-proofs-mobile-zal751.test.ts > completionProofService — ZAL-751 Mobile path RepoNotRegistered fixture > ZAL-751 NEGATIVE — Mobile path registered but commit proof from an unregistered tmpdir → 409 RepoNotRegistered 364ms

 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  14:40:37
   Duration  16.54s (transform 1.58s, setup 200ms, import 4.46s, tests 11.56s, environment 0ms)
```

## Sanity check sobre el caso negativo canónico (ZAL-88 #2)

Para confirmar que el runtime no solo ejecuta el fixture nuevo sino también el
test canónico preexistente que cubre la rama `repoPath no registrado`, se
filtra explícitamente:

```
$ cd /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/paperclip-upstream-vivo/server
$ pnpm exec vitest run --reporter=verbose -t "ZAL-88 #2" src/__tests__/completion-proofs-gate.test.ts
 ...
 ✓ src/__tests__/completion-proofs-gate.test.ts > completionProofService gate — ZAL-88 + ZAL-89 > ZAL-88 #2 SHA válido pero repoPath no registrado en codeRepoPaths → 409 RepoNotRegistered 749ms
 ...
 Test Files  1 passed (1)
      Tests  1 passed | 37 skipped (38)
```

## Diagnóstico del runtime y la hidratación

El Changelog 2026-08-24 documentaba que el run anterior falló al leer
`Paperclip/server/tsconfig.json` con `Unknown system error -11` (worktree
iCloud / dataless). En esta ejecución:

- `cat .../server/tsconfig.json` → contenido íntegro (10 líneas).
- El archivo no tiene flag `dataless` (`ls -laO` muestra `-`).
- El nuevo fixture se creó en `~/Desktop/_PROYECTOS/paperclip-upstream-vivo`
  (que sigue bajo iCloud) pero Vitest lo leyó sin error: el flag `-dataless`
  ya estaba limpio o el archivo se hidrató al primer acceso.

El primer intento de Vitest en este run levantó el Postgres embebido (tarda
~11s en arranque + teardown) y pasó. No fue necesario retocar permisos,
mover el checkout a un worktree local, ni rehidratar manualmente.

## Lo que NO se hizo

- No se modificó el test canónico `completion-proofs-gate.test.ts` (es código
  defensivo del anti-spoofing del gate; añadir el positivo ahí podría
  diluir el contrato existente).
- No se tocó `services/completion-proofs.ts` ni `codeRepoPaths` ni
  migraciones.
- No se comentaron secretos, no se leyeron variables reales, no se tocó
  Stripe, Supabase live, ni el proyecto Zaltyko Web/Mobile.
- No se marcó el padre ZAL-751 `done` (este wake es solo ZAL-929).

## Desbloqueo de ZAL-751

Con esta evidencia, ZAL-751 (local smoke Mobile 2026-08-16) ya tiene su
fixture sintético ejecutable. El bloqueo estructural restante en la cadena
sigue siendo ZAL-118 (registrar `codeRepoPaths` en los proyectos
operativos), que es de board / Engineering Lead — no se desbloquea desde
este agente.
