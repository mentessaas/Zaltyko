# QA — Corrida local Chromium de Owner E2E

Fecha: 2026-10-15
Rama: `codex/a2-local-owner-e2e-safety-20261014`
SHA ejecutado: `17b3b8fec1a4c4efe1054cbe9593081e7bcdda16`
Base del launcher: `792be92f567a5514676baf9fda53746fea2afd02`

## Resultado

**FAIL — no se completó el flujo Owner.** Se ejecutó una vez Chromium con un
worker y el timeout original del spec (300 s). No hubo reintento ni cambio de
código o timeout.

El spec excedió 300 000 ms esperando una respuesta a
`POST /auth/v1/signup` en `tests/e2e-owner-local-setup.spec.ts:213`. La traza
confirma que Chromium emitió el POST, pero terminó con estado de respuesta `-1`
(sin respuesta HTTP). La consola registró denegación CORS al acceder al espacio
de direcciones `loopback` y `net::ERR_FAILED`, consistente con un bloqueo de
Local Network Access (LNA). Por tanto, el error no fue que el spec omitiera
emitir el POST; no se observó una respuesta de Supabase Auth.

La respuesta de la comprobación HIBP llegó como `200` desde el fixture local.
Por separado, el guard registró el intento a
`https://browser.sentry-cdn.com` como bloqueado; la consola anotó un error de
`replayIntegration`. La evidencia no establece causalidad entre Sentry y el
fallo de Auth. El flujo no llegó a demostrar bootstrap, operaciones, pago,
dashboard ni aislamiento de academia/sede/coach.

## Ejecución y preflight

- Checkout aislado y limpio, HEAD exacto al iniciar; `.next` no existía antes.
- Node `v22.22.3`; entrypoints locales de Next `15.5.27`, Playwright `1.63.0`
  y tsx `4.23.13`; `package.json`, lockfile y configuración de dependencias
  coincidentes. No se usaron pnpm, Corepack, npx ni instalaciones.
- Docker usó el socket Unix local de OrbStack. Hash del Supabase CLI coincidente
  y las 13 imágenes requeridas ya estaban presentes en el preflight; no se
  solicitaron ni observaron pulls.
- Comando exacto con entorno limpio, desde la raíz del checkout:

  ```sh
  env -i PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin HOME=/Users/elvisvaldesinerarte TMPDIR=/tmp LANG=en_US.UTF-8 E2E_LOCAL_PROJECT=chromium /Users/elvisvaldesinerarte/.local/bin/node /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/.nosync/Zaltyko-a2-local-owner-e2e-safety-20261014/node_modules/tsx/dist/cli.mjs scripts/run-e2e-local.ts
  ```

- El runner completó preparación local y build; Playwright inició un test y un
  worker. Exit code final: `1`.

## Cleanup y artefactos

- El runner informó: `Supabase local stack stopped and disposable data volumes
  removed.` La comprobación posterior no encontró contenedores, volúmenes,
  redes ni directorios `/tmp/zaltyko-e2e-local-*` del harness. No quedaron
  procesos del runner, Supabase, Next ni Playwright.
- Se conservó sin cambios el contenedor preexistente
  `supabase_storage_zaltyko-local-staging-20261004`; no publica puertos.
- Se conservaron los artefactos del fallo en
  `test-results/e2e-owner-local-setup-Isol-3104f-r-operations-through-the-UI-chromium/`:
  `test-failed-1.png`, `video.webm`, `trace.zip` y `error-context.md`.
  `playwright-report/index.html` y `.next/` también permanecen en este worktree
  aislado.
- No se ejecutaron Firefox/WebKit, sandbox, producción ni servicios remotos.
