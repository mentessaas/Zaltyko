---
status: active
owner: tech
last_reviewed: 2026-07-12
source:
  - ../docs/MIGRATIONS_RLS_RUNBOOK.md
  - ../docs/migrations-backlog.md
  - ../supabase/README.md
---
# Runbook migraciones

## Principios

- Revisar Supabase changelog reciente antes de trabajo de migraciones.
- No aplicar SQL destructivo sin inspeccion manual.
- Confirmar RLS para toda tabla tenant-aware (`pnpm validate:rls` debe seguir en 100% / 64 tablas).
- Mantener Drizzle schema y migraciones alineados.

## Estado a 2026-07-12

- El directorio `drizzle/` **esta versionado**. `pnpm check:migrations` valida siempre ambos historiales: 3 migraciones Drizzle y 27 migraciones Supabase en el estado actual.
- SSL: exportar `NODE_EXTRA_CA_CERTS` con `certs/supabase-root-ca.crt`; `scripts/db-migrate.ts` lo resuelve a ruta absoluta.
- El drift historico de tablas faltantes se cerro el 2026-07-03; DB y ORM quedaron alineados salvo `push_tokens`, superseded por `push_subscriptions`.
- `validate:rls` trata `rls-consolidated.sql` como snapshot y las migraciones como historial: una policy repetida entre ambos no es duplicado; si falla si una misma fuente declara dos veces la misma policy.
- No se aplico ninguna migracion ni seed a Supabase durante el Sprint 0 del 2026-07-12.
- El 2026-07-12 se reviso el changelog oficial reciente de Supabase y se verifico que el
  proyecto ejecuta PostgreSQL 17.6. No hizo falta migracion de schema para el catalogo RFEG.
- La referencia federativa se sincroniza de forma acotada con
  `pnpm db:sync-sport-configs` (dry-run) y
  `pnpm db:sync-sport-configs -- --apply` (aplicacion). No usar `pnpm db:seed` para este
  objetivo: el seed global tambien crea/actualiza datos demo, usuarios y billing.
- La sincronizacion RFEG `rfeg-2026-v2` fue aplicada a Supabase el 2026-07-12 y verificada
  con un segundo dry-run sin diferencias. Los codigos retirados se desactivan, no se borran.
- La migracion no destructiva `20260712230000_phase1_trial_and_billing_events.sql` fue inspeccionada,
  aplicada en una transaccion y verificada el 2026-07-12. Crea `academy_trials` con RLS/policy e
  indices; agrega lease/trazabilidad a `billing_events` y cursor de orden a `subscriptions`.
- `pnpm db:generate` se cancelo antes de escribir archivos porque Drizzle detecto drift historico
  no relacionado en `academy_diagnostics` y `academy_expenses`. No aceptar automaticamente ese
  diff: reconciliar primero snapshots, journal, schema materializado y migraciones manuales. El
  seguimiento vive en [[Backlog priorizado]].

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
