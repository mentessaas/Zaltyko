---
status: active
owner: tech
last_reviewed: 2026-06-22
source:
  - ../README.md
  - ../package.json
  - ../docs/development-guide.md
---
# Runbook desarrollo

## Setup

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

### pnpm

- La configuracion canonica de pnpm vive en `pnpm-workspace.yaml` (`overrides`, `allowBuilds`, `onlyBuiltDependencies`).
- `.npmrc` mantiene flags de instalacion local/CI (`auto-install-peers`, `strict-peer-dependencies`, `confirmModulesPurge=false`).
- Si aparece un prompt de build scripts, usar `pnpm approve-builds --all` solo despues de revisar que los paquetes coinciden con `allowBuilds`.
- La instalacion reproducible esperada es:

```bash
CI=true pnpm install --frozen-lockfile
```

## Base de datos local/remota

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

## Verificaciones

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm audit:api-routes:strict
pnpm test:e2e
pnpm test:a11y
```

## E2E autenticado

1. Verificar Supabase:

```bash
pnpm test:e2e:verify-supabase
```

2. Preparar usuarios y generar storage states:

```bash
BASE_URL=http://127.0.0.1:3000 pnpm test:e2e:auth
```

El comando ejecuta `pnpm e2e:prepare-auth` y genera:

- `E2E_STORAGE_STATE` / `E2E_OWNER_STORAGE_STATE`: `.auth/user.json`
- `E2E_COACH_STORAGE_STATE`: `.auth/coach.json`
- `E2E_SUPER_ADMIN_STORAGE_STATE`: `.auth/super-admin.json`

3. Ejecutar auditorias con `E2E_ACADEMY_ID` y los storage states por rol configurados.

## Antes de cerrar un cambio

- Ejecutar las pruebas proporcionales al riesgo.
- Actualizar esta vault si cambian producto, negocio, marketing, ventas, arquitectura, deploy, seguridad o roadmap.
- Registrar deuda nueva en [[Backlog priorizado]].
