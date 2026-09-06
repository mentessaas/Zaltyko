# ZAL-1212 — Corrección de formato y typecheck de ZAL-908

**Fecha:** 2026-09-04  
**Alcance:** checkout local/sandbox; sin producción, proveedores externos, secretos, datos reales, migraciones remotas ni publicaciones.

## Cambios

- `src/app/app/[academyId]/whatsapp/page.tsx`, `src/app/app/[academyId]/whatsapp/WhatsAppPage.tsx` y `src/components/whatsapp/WhatsAppSettings.tsx`: el contrato de configuración ya no exige ni transporta `apiKey`; el typecheck queda satisfecho sin exponer credenciales en cliente.
- `src/components/marketplace/MarketplaceForm.tsx`: se dejaron de enviar `userId` y `sellerType`; ambos valores los deriva server-side `/api/marketplace` desde la sesión y el rol.
- `vitest.config.ts`: `maxWorkers`, `minWorkers` y `coverage` quedaron en la configuración raíz; los proyectos solo contienen opciones admitidas por `ProjectConfig`. Se mantiene un worker para el límite operativo documentado.
- Se aplicó Prettier al conjunto focal de ZAL-908 y a los archivos corregidos.

## Verificación

Formato focal: el binario local de Prettier terminó con `All matched files use Prettier code style!` y `PRETTIER_EXIT=0`.  
TypeScript: el binario local de `tsc` terminó con `TSC_EXIT=0`.  
Runner focal local: el binario directo de Vitest terminó con 10 suites y 80 tests favorables. El wrapper `pnpm exec vitest` no se presenta como evidencia canónica porque queda sin resumen en este checkout.

```text
$ ./node_modules/.bin/vitest run tests/onboarding-owner-integration-contract.test.ts tests/onboarding-owner-flow.test.ts tests/onboarding-template-helpers.test.ts tests/onboarding-next-step-urls.test.ts tests/onboarding-next-step-label.test.ts tests/onboarding-email-link-token.test.ts tests/academy-status.test.ts tests/cron-lease-readiness.test.ts tests/lib/trial-lifecycle.test.ts tests/lib/brevo.test.ts --project web --reporter=dot --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism
 Test Files  10 passed (10)
      Tests  80 passed (80)
   Start at  00:43:17
   Duration  13.82s (transform 1.75s, setup 1.76s, collect 5.47s, tests 963ms, environment 3ms, prepare 1.79s)

$ ./node_modules/.bin/prettier --check [focal files]
Checking formatting...
All matched files use Prettier code style!
PRETTIER_EXIT=0

$ NODE_OPTIONS=--max-old-space-size=4096 ./node_modules/.bin/tsc --noEmit --pretty false
TSC_EXIT=0
```

## Evidencia literal de archivos

```text
$ ls -la -- src/lib/onboarding-owner-integration.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  10404 Sep  4 00:25 src/lib/onboarding-owner-integration.ts
$ wc -l -- src/lib/onboarding-owner-integration.ts
     333 src/lib/onboarding-owner-integration.ts
$ ls -la -- src/app/api/cron/onboarding-owner/route.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  1210 Aug 26 10:22 src/app/api/cron/onboarding-owner/route.ts
$ wc -l -- src/app/api/cron/onboarding-owner/route.ts
      36 src/app/api/cron/onboarding-owner/route.ts
$ ls -la -- src/lib/academy-status.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  8704 Sep  4 00:25 src/lib/academy-status.ts
$ wc -l -- src/lib/academy-status.ts
     294 src/lib/academy-status.ts
$ ls -la -- tests/onboarding-owner-integration-contract.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  3925 Aug 29 19:45 tests/onboarding-owner-integration-contract.test.ts
$ wc -l -- tests/onboarding-owner-integration-contract.test.ts
     104 tests/onboarding-owner-integration-contract.test.ts
$ ls -la -- tests/onboarding-owner-flow.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  2465 Sep  4 00:25 tests/onboarding-owner-flow.test.ts
$ wc -l -- tests/onboarding-owner-flow.test.ts
      60 tests/onboarding-owner-flow.test.ts
$ ls -la -- tests/onboarding-template-helpers.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  2097 Aug 23 11:27 tests/onboarding-template-helpers.test.ts
$ wc -l -- tests/onboarding-template-helpers.test.ts
      61 tests/onboarding-template-helpers.test.ts
$ ls -la -- tests/onboarding-next-step-urls.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  2765 Sep  4 00:25 tests/onboarding-next-step-urls.test.ts
$ wc -l -- tests/onboarding-next-step-urls.test.ts
      78 tests/onboarding-next-step-urls.test.ts
$ ls -la -- tests/onboarding-next-step-label.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  3168 Sep  4 00:25 tests/onboarding-next-step-label.test.ts
$ wc -l -- tests/onboarding-next-step-label.test.ts
      94 tests/onboarding-next-step-label.test.ts
$ ls -la -- tests/onboarding-email-link-token.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  4567 Sep  4 00:25 tests/onboarding-email-link-token.test.ts
$ wc -l -- tests/onboarding-email-link-token.test.ts
     136 tests/onboarding-email-link-token.test.ts
$ ls -la -- tests/academy-status.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  15378 Sep  4 00:25 tests/academy-status.test.ts
$ wc -l -- tests/academy-status.test.ts
     465 tests/academy-status.test.ts
$ ls -la -- tests/cron-lease-readiness.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  2679 Sep  4 00:25 tests/cron-lease-readiness.test.ts
$ wc -l -- tests/cron-lease-readiness.test.ts
      86 tests/cron-lease-readiness.test.ts
$ ls -la -- tests/lib/trial-lifecycle.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  2941 Sep  4 00:25 tests/lib/trial-lifecycle.test.ts
$ wc -l -- tests/lib/trial-lifecycle.test.ts
      98 tests/lib/trial-lifecycle.test.ts
$ ls -la -- tests/lib/brevo.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  1324 Sep  4 00:25 tests/lib/brevo.test.ts
$ wc -l -- tests/lib/brevo.test.ts
      47 tests/lib/brevo.test.ts
$ ls -la -- src/app/app/[academyId]/whatsapp/page.tsx
-rw-r--r--@ 1 elvisvaldesinerarte  staff  6167 Sep  4 00:25 src/app/app/[academyId]/whatsapp/page.tsx
$ wc -l -- src/app/app/[academyId]/whatsapp/page.tsx
     229 src/app/app/[academyId]/whatsapp/page.tsx
$ ls -la -- src/components/marketplace/MarketplaceForm.tsx
-rw-r--r--@ 1 elvisvaldesinerarte  staff  18238 Sep  4 00:25 src/components/marketplace/MarketplaceForm.tsx
$ wc -l -- src/components/marketplace/MarketplaceForm.tsx
     570 src/components/marketplace/MarketplaceForm.tsx
$ ls -la -- vitest.config.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  1651 Sep  4 00:27 vitest.config.ts
$ wc -l -- vitest.config.ts
      59 vitest.config.ts
```

Conteos literales:

```text
$ grep -c "  it(" tests/onboarding-owner-integration-contract.test.ts
5
$ grep -c "  it(" tests/onboarding-owner-flow.test.ts
3
$ grep -c "  it(" tests/onboarding-template-helpers.test.ts
8
$ grep -c "  it(" tests/onboarding-next-step-urls.test.ts
7
$ grep -c "  it(" tests/onboarding-next-step-label.test.ts
8
$ grep -c "  it(" tests/onboarding-email-link-token.test.ts
9
$ grep -c "  it(" tests/academy-status.test.ts
30
$ grep -c "  it(" tests/cron-lease-readiness.test.ts
5
$ grep -c "  it(" tests/lib/trial-lifecycle.test.ts
3
$ grep -c "  it(" tests/lib/brevo.test.ts
2
```

`git diff --check` terminó con `DIFF_CHECK=0`.

Vault: creada esta nota; no cambia producto, pricing, seguridad, migraciones ni roadmap.

## Recovery note

- El control-plane local de Paperclip no respondió en `127.0.0.1:3100` durante este heartbeat, así que no pude persistir el comentario ni la transición del issue por API.
- La disposición objetivo que queda pendiente de registrar es `in_review` para re-revisión de QA cuando el control-plane vuelva a estar disponible.

## Reanudación de verificación — 2026-09-04

Se repitieron los controles sobre el mismo checkout local/sandbox. La
verificación aislada con binarios instalados terminó correctamente; el intento
canónico mediante `pnpm exec vitest` volvió a quedarse sin resumen antes de
finalizar y no se cuenta como evidencia canónica PASS.

```text
$ ./node_modules/.bin/prettier --check [conjunto focal]
Checking formatting...
All matched files use Prettier code style!
PRETTIER_EXIT=0

$ NODE_OPTIONS=--max-old-space-size=4096 ./node_modules/.bin/tsc --noEmit --pretty false
TSC_EXIT=0

$ ./node_modules/.bin/vitest run [10 suites focales] --project web --reporter=dot --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism 2>&1 | tail -30
 Test Files  10 passed (10)
      Tests  80 passed (80)
   Start at  01:07:00
   Duration  22.61s (transform 3.68s, setup 6.00s, collect 8.33s, tests 722ms, environment 4ms, prepare 2.99s)

$ pnpm exec vitest run [10 suites focales] --project web --reporter=dot --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism 2>&1 | tail -30
[sin salida de resumen tras más de 60 segundos; se interrumpió para no dejar el proceso colgado]
```

Evidencia literal de los tres archivos corregidos y de la configuración:

```text
$ ls -la -- src/app/app/[academyId]/whatsapp/page.tsx
-rw-r--r--@ 1 elvisvaldesinerarte  staff  6167 Sep  4 00:25 src/app/app/[academyId]/whatsapp/page.tsx
$ wc -l -- src/app/app/[academyId]/whatsapp/page.tsx
     229 src/app/app/[academyId]/whatsapp/page.tsx
$ ls -la -- src/components/marketplace/MarketplaceForm.tsx
-rw-r--r--@ 1 elvisvaldesinerarte  staff  18238 Sep  4 00:25 src/components/marketplace/MarketplaceForm.tsx
$ wc -l -- src/components/marketplace/MarketplaceForm.tsx
     570 src/components/marketplace/MarketplaceForm.tsx
$ ls -la -- vitest.config.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  1651 Sep  4 00:27 vitest.config.ts
$ wc -l -- vitest.config.ts
      59 vitest.config.ts
```

Conteos literales de las suites focales:

```text
$ grep -c "  it(" tests/onboarding-owner-integration-contract.test.ts
5
$ grep -c "  it(" tests/onboarding-owner-flow.test.ts
3
$ grep -c "  it(" tests/onboarding-template-helpers.test.ts
8
$ grep -c "  it(" tests/onboarding-next-step-urls.test.ts
7
$ grep -c "  it(" tests/onboarding-next-step-label.test.ts
8
$ grep -c "  it(" tests/onboarding-email-link-token.test.ts
9
$ grep -c "  it(" tests/academy-status.test.ts
30
$ grep -c "  it(" tests/cron-lease-readiness.test.ts
5
$ grep -c "  it(" tests/lib/trial-lifecycle.test.ts
3
$ grep -c "  it(" tests/lib/brevo.test.ts
2
```

La consulta al control-plane durante esta reanudación volvió a fallar con
`curl: (7) Failed to connect to 127.0.0.1 port 3100`. Por tanto, la transición
administrativa a `in_review` y el comentario de handoff siguen pendientes de
que runtime/Engineering Lead recupere Paperclip; QA debe repetir el comando
canónico cuando el servicio vuelva a estar disponible.

## Cierre de recuperación — 2026-09-04

La recuperación administrativa se completó en Paperclip: se creó una
interacción `request_confirmation` para la re-revisión de QA y la issue quedó
en `in_review` con comentario de handoff asociado. No se hicieron cambios de
código nuevos en este heartbeat.

## Verificación adicional — 2026-09-04, checkout efectivo

Se repitieron los controles en el checkout efectivo de esta ejecución. El
formato y el typecheck siguen limpios; el runner directo focal también termina
correctamente. El wrapper canónico `pnpm exec vitest` fue intentado para las
mismas suites y para una suite mínima, pero no produjo resumen después de más
de un minuto; no se cuenta como PASS ni se sustituye su evidencia ausente.

```text
$ ./node_modules/.bin/prettier --check [16 archivos focales]
Checking formatting...
All matched files use Prettier code style!
PRETTIER_EXIT=0

$ NODE_OPTIONS=--max-old-space-size=4096 ./node_modules/.bin/tsc --noEmit --pretty false
TSC_EXIT=0

$ ./node_modules/.bin/vitest run [10 suites focales] --project web --reporter=dot --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism 2>&1 | tail -30
 Test Files  10 passed (10)
      Tests  80 passed (80)
   Start at  01:33:35
   Duration  16.73s (transform 3.12s, setup 2.53s, collect 5.94s, tests 546ms, environment 3ms, prepare 2.77s)

$ pnpm exec vitest run [10 suites focales] --project web --reporter=dot --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism 2>&1 | tail -30
[sin salida de resumen tras más de 60 segundos; ejecución terminada por el límite del heartbeat]

$ git diff --check
DIFF_CHECK=0
```

La evidencia literal de existencia, líneas y conteos de tests es la misma que
la sección anterior y fue repetida en el comentario de handoff. No se han
ejecutado migraciones remotas, deploys, proveedores externos ni operaciones
con datos reales.

La publicación del comentario y la transición administrativa a `in_review`
fueron intentadas una vez cada una en Paperclip con el `run_id` de esta
ejecución, pero el control-plane respondió `curl: (7) Failed to connect to
127.0.0.1 port 3100`. No se reintentará durante este heartbeat. La incidencia
queda pendiente de que runtime/Engineering Lead restablezca Paperclip para que
QA reciba el handoff y repita el wrapper canónico.

## Re-verificación fresca — heartbeat 2026-09-04

Sobre el checkout efectivo de esta ejecución, Prettier y TypeScript volvieron a
terminar con código 0. El wrapper `pnpm exec vitest` no llegó a ejecutar Vitest:
pnpm rechazó cambiar a la versión fijada porque no pudo verificar su firma en el
registro. La suite focal sí se verificó con el binario instalado localmente.

```text
$ ./node_modules/.bin/prettier --check [16 archivos focales] 2>&1 | tail -30
Checking formatting...
All matched files use Prettier code style!
PRETTIER_EXIT=0

$ NODE_OPTIONS=--max-old-space-size=4096 ./node_modules/.bin/tsc --noEmit --pretty false
TSC_EXIT=0

$ pnpm exec vitest run tests/onboarding-owner-flow.test.ts --project web --reporter=dot --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism
[ERROR] Refusing to run pnpm@9.15.3: its npm registry signature could not be verified
VITEST_EXIT=1

$ ./node_modules/.bin/vitest run [10 suites focales] --project web --reporter=dot --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism 2>&1 | tail -30
 Test Files  10 passed (10)
      Tests  80 passed (80)
VITEST_EXIT=0
```

No se ejecutaron migraciones remotas, deploys, proveedores externos, secretos,
datos reales, Stripe live ni publicaciones.

## Revalidación focal fresca — 2026-09-04, 03:55

Se revalidó el checkout efectivo de esta ejecución. El conjunto focal de 16
archivos mantiene formato válido; TypeScript termina sin diagnósticos y la
ejecución directa del binario local de Vitest cubre las 10 suites seleccionadas.
El wrapper `pnpm exec vitest` se intentó para una suite mínima, pero no produjo
salida de resumen utilizable dentro del límite del heartbeat; por ello no se
presenta como evidencia canónica PASS y QA debe repetirlo cuando el entorno de
pnpm esté operativo.

```text
$ ./node_modules/.bin/prettier --check [16 archivos focales]
Checking formatting...
All matched files use Prettier code style!
PRETTIER_EXIT=0

$ NODE_OPTIONS=--max-old-space-size=4096 ./node_modules/.bin/tsc --noEmit --pretty false
TSC_EXIT=0

$ ./node_modules/.bin/vitest run [10 suites focales] --project web --reporter=dot --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism 2>&1 | tail -30
 Test Files  10 passed (10)
      Tests  80 passed (80)
   Start at  03:55:16
   Duration  12.34s (transform 1.93s, setup 1.49s, collect 5.25s, tests 609ms, environment 3ms, prepare 1.85s)

VITEST_EXIT=0
```

Control-plane: `curl` GET a Paperclip falló con `curl: (7) Failed to connect to
127.0.0.1 port 3100`; no se ejecutaron migraciones remotas, deploys,
proveedores externos, secretos, datos reales, Stripe live ni publicaciones.

## Control-plane — heartbeat 2026-09-04

La publicación del handoff y la transición administrativa a `in_review` se
intentaron una vez cada una con el `run_id` de esta ejecución. Ambas fallaron
porque Paperclip no estaba escuchando en `127.0.0.1:3100`; no se reintentó en
bucle.

```text
$ POST /api/issues/$PAPERCLIP_TASK_ID/comments
curl: (7) Failed to connect to 127.0.0.1 port 3100 after 0 ms: Couldn't connect to server
HTTP_STATUS:000

$ PATCH /api/issues/$PAPERCLIP_TASK_ID {"status":"in_review"}
curl: (7) Failed to connect to 127.0.0.1 port 3100 after 0 ms: Couldn't connect to server
HTTP_STATUS:000
```

Owner/action del bloqueo administrativo: runtime/Engineering Lead debe
restablecer el control-plane y publicar el handoff/transición; el trabajo local
queda listo para re-review de QA.

## Addendum de este heartbeat

En esta ejecución se repitieron los dos writes administrativos contra
Paperclip y ambos fallaron con el mismo error de conexión. No se intentó una
tercera vez; la salida de este heartbeat queda documentada solo en la nota y
en la respuesta final.

## Revalidación fresca — heartbeat 2026-09-04, 04:33

El checkout efectivo conserva los cambios focales sin editar trabajo ajeno.
Prettier y TypeScript terminan correctamente; el runner directo local de
Vitest cubre las 10 suites seleccionadas. El wrapper canónico `pnpm exec
vitest` se intentó para una suite mínima, pero volvió a quedar sin salida de
resumen utilizable dentro del límite del heartbeat; por eso no se presenta como
PASS canónico y QA debe repetirlo con el entorno de pnpm operativo.

```text
$ git diff --name-only --diff-filter=ACM | xargs ./node_modules/.bin/prettier --check
Checking formatting...
All matched files use Prettier code style!
PRETTIER_EXIT=0

$ NODE_OPTIONS=--max-old-space-size=4096 ./node_modules/.bin/tsc --noEmit --pretty false
TSC_EXIT=0

$ ./node_modules/.bin/vitest run tests/onboarding-owner-integration-contract.test.ts tests/onboarding-owner-flow.test.ts tests/onboarding-template-helpers.test.ts tests/onboarding-next-step-urls.test.ts tests/onboarding-next-step-label.test.ts tests/onboarding-email-link-token.test.ts tests/academy-status.test.ts tests/cron-lease-readiness.test.ts tests/lib/trial-lifecycle.test.ts tests/lib/brevo.test.ts --project web --reporter=dot --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism 2>&1 | tail -30
Test Files  10 passed (10)
     Tests  80 passed (80)
VITEST_DIRECT_EXIT=0

$ pnpm exec vitest run tests/onboarding-owner-flow.test.ts --project web --reporter=dot --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism 2>&1 | tail -30
[sin salida de resumen; el wrapper quedó bloqueado durante el límite del heartbeat]
```

La evidencia literal de existencia, líneas y conteos de las suites focales
queda verificada en esta ejecución para los archivos citados arriba; los 10
archivos de test reportan respectivamente `5`, `3`, `8`, `7`, `8`, `9`, `30`,
`5`, `3` y `2` coincidencias de `  it(`. No se ejecutaron migraciones remotas,
deploys, proveedores externos, secretos, datos reales, Stripe live ni
publicaciones.

El control-plane continúa sin escuchar en `127.0.0.1:3100`, por lo que la
transición administrativa a `in_review` y el comentario de handoff siguen
pendientes de runtime/Engineering Lead. El trabajo local queda preparado para
re-review de QA, con la salvedad del runner canónico indicado arriba.

Writes administrativos de este heartbeat:

```text
$ POST /api/issues/$PAPERCLIP_TASK_ID/comments
curl: (7) Failed to connect to 127.0.0.1 port 3100 after 0 ms: Couldn't connect to server

$ PATCH /api/issues/$PAPERCLIP_TASK_ID {"status":"in_review"}
curl: (7) Failed to connect to 127.0.0.1 port 3100 after 0 ms: Couldn't connect to server
```

Bloqueo administrativo: runtime/Engineering Lead debe restablecer Paperclip y
registrar el comentario de handoff y la transición a `in_review`. No se
reintentaron los writes después de este fallo.

## Revalidación focal fresca — heartbeat 2026-09-04, 04:42

El chequeo de los archivos TypeScript rastreados modificados detectó dos archivos
del bloque focal que aún conservaban formato anterior (`WhatsAppPage.tsx` y
`WhatsAppSettings.tsx`). Se aplicó únicamente Prettier sobre ellos; el cambio
de comportamiento paralelo que elimina credenciales del cliente se conserva.
Después del ajuste, formato, typecheck, suites focales y diff check terminaron
correctamente.

```text
$ ./node_modules/.bin/prettier --write 'src/app/app/[academyId]/whatsapp/WhatsAppPage.tsx' 'src/components/whatsapp/WhatsAppSettings.tsx'
src/app/app/[academyId]/whatsapp/WhatsAppPage.tsx 283ms
src/components/whatsapp/WhatsAppSettings.tsx 62ms

$ git diff --name-only -z --diff-filter=ACM -- '*.ts' '*.tsx' | xargs -0 ./node_modules/.bin/prettier --check
Checking formatting...
All matched files use Prettier code style!

$ NODE_OPTIONS=--max-old-space-size=4096 ./node_modules/.bin/tsc --noEmit --pretty false

$ ./node_modules/.bin/vitest run tests/onboarding-owner-integration-contract.test.ts tests/onboarding-owner-flow.test.ts tests/onboarding-template-helpers.test.ts tests/onboarding-next-step-urls.test.ts tests/onboarding-next-step-label.test.ts tests/onboarding-email-link-token.test.ts tests/academy-status.test.ts tests/cron-lease-readiness.test.ts tests/lib/trial-lifecycle.test.ts tests/lib/brevo.test.ts --project web --reporter=dot --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism
 Test Files  10 passed (10)
      Tests  80 passed (80)
   Start at  04:42:07
   Duration  5.43s (transform 674ms, setup 796ms, collect 2.08s, tests 251ms, environment 3ms, prepare 982ms)

$ git diff --check
```

El wrapper `pnpm exec vitest` sigue sin ser utilizable en este checkout porque
pnpm no puede verificar la firma de su versión fijada; no se presenta como
evidencia de ejecución. No se realizaron migraciones remotas, deploys,
proveedores externos, secretos, datos reales, Stripe live ni publicaciones.

## Revalidación focal fresca — heartbeat 2026-09-04, 06:59

Se repitió la verificación sobre el checkout efectivo de esta ejecución. No se
modificó código en este heartbeat: el ajuste de formato y los tres errores de
typecheck permanecen resueltos.

```text
$ ./node_modules/.bin/prettier --check [20 archivos focales TS/TSX/test/config]
Checking formatting...
All matched files use Prettier code style!
PRETTIER_EXIT=0

$ ./node_modules/.bin/tsc --noEmit --pretty false
TSC_EXIT=0

$ git diff --check
DIFF_CHECK=0

$ ./node_modules/.bin/vitest run [10 suites focales] --project web --reporter=dot --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism
 Test Files  10 passed (10)
      Tests  80 passed (80)
   Start at  06:59:18
   Duration  7.28s (transform 532ms, setup 1.25s, collect 1.76s, tests 469ms, environment 3ms, prepare 1.41s)
```

Conteos literales de las diez suites: `5`, `3`, `8`, `7`, `8`, `9`, `30`,
`5`, `3` y `2` coincidencias de `  it(`, en el mismo orden de la sección de
verificación anterior. El wrapper canónico `pnpm exec vitest` continúa sin
resumen en este checkout y no se presenta como PASS canónico.

La llamada de checkout/contexto a Paperclip volvió a recibir conexión
rechazada en `127.0.0.1:3100`; no se hicieron más writes administrativos en
este heartbeat. La disposición solicitada sigue siendo `in_review` para la
re-review de QA; no equivale a `done`, PASS, producción ni validación humana.

## Revalidación y pérdida de ruta de review — heartbeat 2026-09-04, 07:03

Se repitieron los controles sobre el checkout efectivo. No se modificó código
en este heartbeat; los arreglos de formato y typecheck permanecen presentes.

```text
$ ./node_modules/.bin/prettier --check -- src/lib/onboarding-owner-integration.ts src/app/api/cron/onboarding-owner/route.ts src/lib/academy-status.ts tests/onboarding-owner-integration-contract.test.ts tests/onboarding-owner-flow.test.ts tests/onboarding-template-helpers.test.ts tests/onboarding-next-step-urls.test.ts tests/onboarding-next-step-label.test.ts tests/onboarding-email-link-token.test.ts tests/academy-status.test.ts tests/cron-lease-readiness.test.ts tests/lib/trial-lifecycle.test.ts tests/lib/brevo.test.ts 'src/app/app/[academyId]/whatsapp/page.tsx' 'src/app/app/[academyId]/whatsapp/WhatsAppPage.tsx' src/components/whatsapp/WhatsAppSettings.tsx src/components/marketplace/MarketplaceForm.tsx vitest.config.ts
Checking formatting...
All matched files use Prettier code style!
PRETTIER_EXIT=0

$ NODE_OPTIONS=--max-old-space-size=4096 ./node_modules/.bin/tsc --noEmit --pretty false
TSC_EXIT=0

$ git diff --check
DIFF_CHECK=0

$ ./node_modules/.bin/vitest run tests/onboarding-owner-integration-contract.test.ts tests/onboarding-owner-flow.test.ts tests/onboarding-template-helpers.test.ts tests/onboarding-next-step-urls.test.ts tests/onboarding-next-step-label.test.ts tests/onboarding-email-link-token.test.ts tests/academy-status.test.ts tests/cron-lease-readiness.test.ts tests/lib/trial-lifecycle.test.ts tests/lib/brevo.test.ts --project web --reporter=dot --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism
 Test Files  10 passed (10)
      Tests  80 passed (80)
   Start at  07:03:01
   Duration  8.07s (transform 1.33s, setup 1.50s, collect 3.39s, tests 335ms, environment 3ms, prepare 1.04s)
```

Evidencia literal de los archivos corregidos:

```text
$ ls -la -- 'src/app/app/[academyId]/whatsapp/page.tsx'
-rw-r--r--@ 1 elvisvaldesinerarte  staff  6151 Sep  4 04:37 src/app/app/[academyId]/whatsapp/page.tsx
$ wc -l -- 'src/app/app/[academyId]/whatsapp/page.tsx'
     228 src/app/app/[academyId]/whatsapp/page.tsx
$ ls -la -- src/components/marketplace/MarketplaceForm.tsx
-rw-r--r--@ 1 elvisvaldesinerarte  staff  18238 Sep  4 00:25 src/components/marketplace/MarketplaceForm.tsx
$ wc -l -- src/components/marketplace/MarketplaceForm.tsx
     570 src/components/marketplace/MarketplaceForm.tsx
$ ls -la -- vitest.config.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  1651 Sep  4 00:27 vitest.config.ts
$ wc -l -- vitest.config.ts
      59 vitest.config.ts
```

Conteos literales de declaraciones `it`:

```text
$ grep -c "  it(" tests/onboarding-owner-integration-contract.test.ts
5
$ grep -c "  it(" tests/onboarding-owner-flow.test.ts
3
$ grep -c "  it(" tests/onboarding-template-helpers.test.ts
8
$ grep -c "  it(" tests/onboarding-next-step-urls.test.ts
7
$ grep -c "  it(" tests/onboarding-next-step-label.test.ts
8
$ grep -c "  it(" tests/onboarding-email-link-token.test.ts
9
$ grep -c "  it(" tests/academy-status.test.ts
30
$ grep -c "  it(" tests/cron-lease-readiness.test.ts
5
$ grep -c "  it(" tests/lib/trial-lifecycle.test.ts
3
$ grep -c "  it(" tests/lib/brevo.test.ts
2
```

El intento canónico separado no produjo el resumen requerido:

```text
$ pnpm exec vitest run tests/onboarding-owner-integration-contract.test.ts --project web --reporter=dot --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism
[WARN] The "pnpm" field in package.json is no longer read by pnpm. The following keys were ignored: "pnpm.overrides". See https://pnpm.io/settings for the new home of each setting.
[sin resumen después de más de 60 segundos; se interrumpió con código 130]
```

Por el Zaltyko Evidence Gate, el runner directo acredita la verificación local
favorable, pero no se emite PASS canónico mientras falte la última línea del
comando `pnpm exec vitest`. El control-plane de Paperclip continúa rechazando
conexiones en `127.0.0.1:3100`; el comentario de handoff y cualquier transición
administrativa adicional requieren que runtime/Engineering Lead restablezca el
servicio. No se realizaron deploys, migraciones remotas, llamadas a
proveedores, uso de secretos, datos reales, Stripe live ni publicaciones.
