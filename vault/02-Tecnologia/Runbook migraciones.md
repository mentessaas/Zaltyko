---
status: active
owner: tech
last_reviewed: 2026-06-26
source:
  - ../docs/MIGRATIONS_RLS_RUNBOOK.md
  - ../docs/migrations-backlog.md
  - ../supabase/README.md
---
# Runbook migraciones

## Principios

- Revisar Supabase changelog reciente antes de trabajo de migraciones.
- No aplicar SQL destructivo sin inspeccion manual.
- Confirmar RLS para toda tabla tenant-aware (`pnpm validate:rls` debe seguir en 100% / 62 tablas).
- Mantener Drizzle schema y migraciones alineados.

## Estado a 2026-06-26

- El directorio `drizzle/` **esta versionado** (antes en `.gitignore`); `pnpm check:migrations` valida integridad del journal en CI.
- SSL: exportar `NODE_EXTRA_CA_CERTS` con `certs/supabase-root-ca.crt`; `scripts/db-migrate.ts` lo resuelve a ruta absoluta.
- **Pendiente P0**: 25 tablas del schema TS no existen aun en DB. `drizzle-kit push --force` es destructivo; requiere plan tabla por tabla. Ver [[Registro de riesgos]] y [[Backlog priorizado]].

## Flujo recomendado

1. Revisar schema actual en `src/db/schema/`.
2. Generar migracion con `pnpm db:generate`.
3. Leer SQL generado.
4. Confirmar RLS y politicas necesarias.
5. Aplicar con `pnpm db:migrate` solo cuando el SQL sea correcto.
6. Actualizar docs/vault si cambia modelo de datos o comportamiento.

## Evidencia

- Registrar riesgos o pendientes en [[Backlog priorizado]].
- Para cambios grandes, crear decision en [[Decisiones]].
