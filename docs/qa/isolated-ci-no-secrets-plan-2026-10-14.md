# CI manual sin secretos para checks estáticos

Fecha: 2026-10-14

Estado: propuesta implementada en una rama local propia para revisión; no ejecutada ni publicada.

Base exacta: `67820e47832ad0aece4e4f2576b42c1576af2e74` (`codex/mvp-monthly-billing-local-e2e-20261013`).

Rama local de propuesta: `codex/ci-isolated-no-secrets-20261014`.

## Diseño

La propuesta añade `.github/workflows/ci-isolated.yml`, activable solo mediante `workflow_dispatch`. Declara únicamente `permissions: contents: read`, desactiva credenciales persistentes del checkout y no usa secretos de Actions, artefactos ni permisos de escritura. Los valores de aplicación configurados en el job son placeholders y sus endpoints apuntan a `127.0.0.1`. El evento manual **no está disponible todavía**: GitHub exige que el workflow exista en la rama por defecto antes de poder despacharlo. Publicar/mergear este archivo para habilitarlo queda fuera del alcance.

El job propuesto instala dependencias y ejecuta el contrato estático del workflow, lint, tipos, Vitest, validación estática RLS, integridad de migraciones y `gate:all`. Excluye los E2E autenticados, provisión de cuentas, Stripe, smoke contra producción, `vercel`, Supabase remoto y cualquier aplicación de migraciones a una instancia remota.

`tests/ci-isolated-workflow-contract.test.ts` fija como contrato que el flujo solo se active manualmente, no lea secretos, no conceda escritura, no use endpoints externos ni invoque E2E/deploy y conserve los gates enumerados.

## Auditoría de efectos indirectos y límites de red

En el SHA base, `gate:all` coordina tres gates que analizan el código fuente local; el helper `run-tsx` solo inicia un proceso Node local. `validate:rls` lee el schema y SQL con operaciones de filesystem, y `check:migrations` inspecciona el journal y archivos de migración. No encontré en esos caminos clientes HTTP/Postgres, carga de `.env` ni lectura de URLs de conexión.

El `package.json` raíz no declara `preinstall`, `install`, `postinstall` ni `prepare`. `pnpm-workspace.yaml` incluye solo `.`; el `postinstall: patch-package` de `mobile/package.json` no forma parte de la instalación raíz propuesta. Eso no demuestra que instalar dependencias carezca de efectos externos: el runner descarga actions y paquetes, y scripts de instalación/transitivos podrían usar red. No hay firewall ni aislamiento de egress en este diseño; los endpoints loopback reducen el riesgo de que el código use accidentalmente Supabase/DB desde su configuración, pero no garantizan bloqueo de conexiones externas.

Las referencias de actions se mantuvieron en las versiones por tag existentes en `ci.yml` (`actions/checkout@v7`, `pnpm/action-setup@v6`, `actions/setup-node@v7`). No encontré pins SHA revisados en los workflows locales inspeccionados y no inventé ninguno.

## Riesgo de Preview y límites

El evento manual del workflow no solicita despliegue. Sin embargo, publicar el commit en el repositorio conectado a Vercel puede iniciar un Preview por la integración Git, aunque este workflow no se ejecute automáticamente. Fusionarlo en `main` también expondría el cambio a los triggers de producción definidos en el flujo existente. No se modificó Vercel ni su configuración y no se publicó nada; por ello, la propuesta permanece local. No presentarla como una forma verificada de suprimir Preview al publicar.

El workflow manual no sustituye al CI completo de release ni al E2E autenticado. En la base `67820e`, el CI existente activa `e2e-auth` para PRs si el gate de secretos lo habilita; ese job ejecuta `pnpm e2e:prepare-domain`, provisioning con `E2E_ALLOW_PROVISIONING=true` y `scripts/apply-e2e-contact-schema.ts` con credenciales E2E. Por tanto, crear o actualizar un PR contra `main`/`develop` podría escribir en Sandbox aunque el nuevo workflow sea manual. Guardrail explícito: **no hacer push ni crear/actualizar PR hasta separar o desactivar ese camino de escritura sin reducir sus gates**, algo que queda fuera de esta rama y de esta autorización.

No cambia `.github/workflows/ci.yml` ni `deploy.yml`, no baja sus gates y no certifica comportamiento contra Sandbox o producción. En particular, el nuevo `workflow_dispatch` no evita que el CI existente se dispare al abrir/actualizar un PR; se mantiene el guardrail de no publicar hasta separar el job de escritura a Sandbox sin reducir gates.

## Validación y límites de esta pasada

No ejecuté el workflow ni E2E/PG. Ejecuté cuatro suites Vitest focales: 17/17 tests PASS (`ci-isolated-workflow-contract`, `e2e-local-migration-scope`, `ledger-harness-migration-scope`, `synthetic-restore-runner-contract`); también `prettier --check` y ESLint del test nuevo: PASS. No hice push, PR, deploy, consulta de Vercel/Supabase, acceso a datos de Sandbox o producción, ni cambios en Main o en los workflows existentes.
