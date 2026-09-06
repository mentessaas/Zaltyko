# ZAL-1137 — QA aislamiento marketplace — 2026-09-02

## Disposición

**BLOCKED / sin PASS.** La API de Paperclip no está disponible para leer el
alcance vivo, comentar la issue, crear subtarea al implementador o bloquear la
issue. El test local disponible valida publicación/ownership derivado, pero no
es evidencia suficiente de aislamiento cross-tenant para cerrar ZAL-1137.

## Evidencia local reproducible

- El worktree canónico es `/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko`.
- `POST /api/marketplace` usa `withAuthenticatedNoTenant`, deriva `userId` del
  contexto y `sellerType` del rol; el body no puede imponer esos campos.
- `PATCH`/`DELETE` de `mis-productos/[id]` autentican la sesión y comprueban
  ownership antes de mutar.
- El GET público filtra `status=active`; PATCH/DELETE públicos devuelven 410.
- El test focal existente tiene 15 casos, incluyendo anti-IDOR del POST y
  validación de contacto.

Salida literal del gate de archivo:

```text
$ ls -la tests/api-marketplace.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  9400 Aug 26 10:22 tests/api-marketplace.test.ts
$ wc -l tests/api-marketplace.test.ts
     272 tests/api-marketplace.test.ts
$ grep -c "  it(" tests/api-marketplace.test.ts
15
```

Salida literal del test local (el wrapper `pnpm exec` falló por EPERM al crear
un temporal en el checkout enlazado; se reejecutó con el binario instalado):

```text
$ ./node_modules/.bin/vitest run tests/api-marketplace.test.ts --reporter=dot --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism
 Test Files  1 passed (1)
      Tests  15 passed (15)
```

## Cobertura faltante / siguiente acción

Falta un E2E sandbox con dos usuarios sintéticos de academias distintas que
intente leer, actualizar y borrar el listing ajeno, además de verificar que un
listing `paused`/`sold` no se expone públicamente. Engineering Lead debe
aportar ese escenario o fixtures; luego QA lo ejecuta y crea la subtarea al
implementador si aparece un defecto.

## Control-plane

```text
$ curl ... http://127.0.0.1:3100/api/agents/me
curl: (7) Failed to connect to 127.0.0.1 port 3100 after 0 ms: Couldn't connect to server
HTTP_STATUS:000
```

Owner de desbloqueo: operador de Paperclip/Engineering Lead. Acción exacta:
restaurar la API, proporcionar/confirmar el alcance vivo de ZAL-1137 y
permitir el comentario, subtarea y transición `blocked` en el issue real.

Vault: actualizado este work product; no cambian Decisiones, Pricing,
Mensajes aprobados ni Backlog.
