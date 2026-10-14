# QA59 — Seguridad del harness local de Owner E2E

Fecha: 2026-10-15
Rama: `codex/a2-local-owner-e2e-safety-20261014`
Base: `ae3e7b6e727a8613dc514cd6c7db1b6c1017149e`

## Cambios acotados

- Antes de ejecutar cualquier comando Docker, el runner resuelve `DOCKER_CONTEXT`,
  `DOCKER_HOST` o el contexto activo y acepta solo un endpoint de socket Unix
  local. No imprime el endpoint ni credenciales. Los comandos Docker reciben el
  socket validado fijado en `DOCKER_HOST`; no se ejecutan pulls.
- El runner envía señales al grupo detached completo, programa SIGKILL tras la
  gracia aunque el líder ya haya cerrado, espera la desaparición del grupo y
  reporta `ProcessGroupCleanupError` si persiste. Ante ese error conserva los
  archivos del proyecto temporal para facilitar limpieza/diagnóstico.
- La suite con Supabase local bloquea service workers para que la ruta de
  Playwright observe solicitudes. El spec ya no espera un controlador de SW:
  **esta suite no verifica el comportamiento del service worker**.
- En HTML local, el guard reescribe solo documentos servidos desde el origen
  local de la app y elimina hints `preconnect`/`dns-prefetch` a orígenes no
  permitidos. Conserva hints al origen local de Supabase.
- Follow-up launcher: Next y Playwright resuelven el `bin` desde el manifiesto
  del paquete instalado y se ejecutan como `process.execPath <entrypoint.js>`.
  El `webServer` usa el mismo entrypoint JavaScript de Next. Mocks comprueban que
  el argumento de Node es el archivo real del paquete y nunca `node_modules/.bin`.
- El guard HTTP de Playwright no demuestra aislamiento egress completo: no
  prueba DNS/TLS especulativo, tráfico del servidor, sockets ni otros canales.
  Quitar hints HTML conocidos reduce una vía observada, pero no equivale a una
  barrera de red del sistema. Un aislamiento de red efectivo exigiría un
  namespace/firewall o entorno aislado autorizado; no se instaló ni modificó
  nada en el sistema.

## Comando local autorizado para una ejecución posterior

`E2E_LOCAL_PROJECT=chromium ./node_modules/.bin/tsx scripts/run-e2e-local.ts`

Invocación directa de Node/tsx, sin script de pnpm ni bootstrap. El runner
construye un entorno reducido para sus procesos hijos. Este comando no se
ejecutó en QA59.

## Verificación de esta pasada

- Tests mock focales: 5 archivos, 35/35 tests PASS.
- Follow-up launcher: 3 archivos, 23/23 tests mock PASS; TypeScript, ESLint
  focal, Prettier y `git diff --check` PASS.
- `./node_modules/.bin/tsc --noEmit`: PASS.
- ESLint focal, Prettier `--check` y `git diff --check`: PASS.
- No se inició Docker/Supabase ni se ejecutó build, Playwright/E2E,
  PostgreSQL, contenedores o tráfico de red.
