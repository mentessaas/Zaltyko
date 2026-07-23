---
status: active
owner: tech
last_reviewed: 2026-07-16
source:
  - ../docs/MIGRATIONS_RLS_RUNBOOK.md
  - ../docs/migrations-backlog.md
  - ../supabase/README.md
---

# Runbook migraciones

## Principios

- Revisar Supabase changelog reciente antes de trabajo de migraciones.
- No aplicar SQL destructivo sin inspeccion manual.
- Confirmar RLS para toda tabla tenant-aware (`pnpm validate:rls` debe seguir en 100% / 69 tablas).
- Mantener Drizzle schema y migraciones alineados.
- No usar `drizzle-kit push` contra staging o producción. `pnpm db:migrate` queda bloqueado por
  código cuando `DATABASE_URL` no apunta a loopback; aplicar SQL versionado y revisado con
  `pnpm db:migrate:reviewed supabase/migrations/<archivo>.sql`.

## Estado a 2026-07-16

- El directorio `drizzle/` **esta versionado**. `pnpm check:migrations` valida siempre ambos historiales: 6 migraciones Drizzle y 40 migraciones Supabase en el estado actual; las migraciones Día 2/Día 3 siguen pendientes y no aplicadas.
- SSL: exportar `NODE_EXTRA_CA_CERTS` con `certs/supabase-root-ca.crt`; runtime y ledger remoto fallan cerrado si falta o no existe. Next incluye esa CA pública en el trace de deploy. No usar `rejectUnauthorized:false`.
- Runtime serverless: `DATABASE_POOL_MAX` vale 5 por defecto en producción. Es un presupuesto por instancia, no la capacidad total; solo se eleva con métricas reales de Supavisor/Vercel.
- Build: durante `NEXT_PHASE` el acceso Drizzle está deshabilitado antes de abrir sockets. Las páginas con datos DB deben ser dinámicas y no enumerar filas en `generateStaticParams`.
- El drift historico de tablas faltantes y diferencias semanticas se cerro el 2026-07-13 con `20260713090000_reconcile_phase1_schema_drift.sql`. DB y ORM quedaron alineados, incluido `push_tokens`; se verificaron 113 tablas, columnas, indices unicos y claves foraneas semanticas.
- `validate:rls` trata `rls-consolidated.sql` como snapshot y las migraciones como historial: una policy repetida entre ambos no es duplicado; si falla si una misma fuente declara dos veces la misma policy.
- `pnpm test:rls:local` fuerza `RLS_AUDIT_DATABASE_URL` hacia su PostgreSQL efímero antes de ejecutar el auditor de policies; no debe confiar en la precedencia de `.env.local`. El cluster y sus fixtures terminan siempre en rollback/borrado.
- No se ejecutó el seed global durante Sprint 0 ni Fases 1-4. Los catálogos federativos usan su sincronizador acotado; Fases 3 y 4 solo necesitaron schema aditivo, no datos iniciales.
- El 2026-07-12 se reviso el changelog oficial reciente de Supabase y se verifico que el
  proyecto ejecuta PostgreSQL 17.6. No hizo falta migracion de schema para el catalogo RFEG.
- El 2026-07-16 se revisó de nuevo el changelog oficial de Supabase antes del lote Día 3. No se identificó un cambio incompatible con el SQL aditivo. `20260716214500_day3_communication_academy_scope.sql` añade `academy_id` nullable a tres recursos de comunicación, solo rellena tenants con una academia inequívoca y reemplaza policies tenant-wide por member/manager. Está versionada y no aplicada; debe probarse junto con la dependencia Día 2 antes de promoción.
- El ensayo conjunto ya está automatizado en `pnpm test:rls:local`: aplica Día 2 y Día 3 sobre un clúster PostgreSQL efímero, ejecuta la matriz owner/coach/parent/athlete/viewer/super-admin/anónimo, verifica 102 tablas públicas con 0 sin RLS y revierte/elimina el entorno. Las policies SELECT de comunicación se limitan explícitamente `TO authenticated`; no confiar en un `CASE` para impedir que el planner evalúe helpers privados con rol `anon`. Este resultado habilita el trabajo de Día 4, pero no sustituye promoción revisada ni pruebas PostgREST/Realtime.
- La referencia federativa se sincroniza de forma acotada con
  `pnpm db:sync-sport-configs` (dry-run) y
  `pnpm db:sync-sport-configs -- --apply` (aplicacion). No usar `pnpm db:seed` para este
  objetivo: el seed global tambien crea/actualiza datos demo, usuarios y billing.
- La sincronizacion RFEG `rfeg-2026-v2` fue aplicada a Supabase el 2026-07-12 y verificada
  con un segundo dry-run sin diferencias. Los codigos retirados se desactivan, no se borran.
- La migracion no destructiva `20260712230000_phase1_trial_and_billing_events.sql` fue inspeccionada,
  aplicada en una transaccion y verificada el 2026-07-12. Crea `academy_trials` con RLS/policy e
  indices; agrega lease/trazabilidad a `billing_events` y cursor de orden a `subscriptions`.
- La reconciliacion `20260713090000_reconcile_phase1_schema_drift.sql` se aplico con el runner del
  repositorio, se probo su rollback en transaccion y dejo sincronizados `drizzle/0003`, snapshot y
  journal. El gate posterior confirma 4+28 migraciones, RLS 64/64 y build de produccion.
- La migración aditiva `20260713150000_link_assessments_to_class_sessions.sql` añade
  `athlete_assessments.session_id` nullable, FK `ON DELETE SET NULL` e índice de consulta. Fue
  inspeccionada, aplicada a PostgreSQL 17.6, probada con rollback transaccional y verificada por
  columna/FK/índice. Drizzle `0004` y su snapshot quedaron sincronizados; el gate final confirma
  5+29 migraciones, RLS 64/64, 425 pruebas y build de 214 páginas.
- La migración aditiva `20260713170000_phase4_commercial_validation.sql` crea `growth_events` y
  `commercial_interviews`, índices, FKs y checks de completitud; habilita RLS y sustituye las policies
  permisivas históricas de `leads` por acceso directo exclusivo de super-admin. Se revisó el changelog
  reciente de Supabase, se inspeccionó SQL, se ejecutó rollback smoke y se aplicó a PostgreSQL 17.6.
  La verificación productiva confirma ambas tablas vacías, RLS activo y policies correctas; las fixtures
  transaccionales se revirtieron. Drizzle `0005`, snapshot y journal quedan sincronizados; gate 6+31,
  RLS 65/65, 431 pruebas y build de 216 páginas. No se ejecutó seed global.
- Una comprobación final con `pnpm db:migrate` detectó que el constraint `coaches_slug_unique`, ya
  presente desde Drizzle `0000`, faltaba en Supabase. El push interactivo se canceló sin ejecutar SQL
  ante su advertencia de truncado. Se verificaron 3 filas, todas con `slug` nulo y 0 duplicados, y se
  aplicó la migración idempotente `20260713173000_reconcile_coaches_slug_unique.sql`, que aborta si
  encuentra duplicados y solo añade el constraint. No se borró ni modificó ninguna fila.
- Tras reconciliar ese constraint, la auditoría global de `drizzle-kit push` seguía proponiendo
  desactivar RLS, borrar `__drizzle_migrations`, recrear enums y cambiar una PK. Se eligió
  explícitamente `No, abort`; no se ejecutó ninguna de esas sentencias. El wrapper ahora bloquea
  bases remotas para que este diagnóstico no pueda convertirse en pérdida de datos accidental.
- El 2026-07-13 se aplicó la migración aditiva `20260713200000_create_sql_migration_ledger.sql` y se
  hizo bootstrap explícito del historial real: 32 archivos bajo `supabase/migrations/`, incluidos los
  dos `0009_*`, quedaron registrados por nombre de archivo y hash SHA-256 en
  `public.zaltyko_schema_migrations`. RLS está habilitado y `anon`/`authenticated` no tienen permisos.
  `pnpm db:migrate:ledger` verificó después cero pendientes; no se ejecutó seed global.

## Flujo recomendado

1. Revisar schema actual en `src/db/schema/`.
2. Generar migracion con `pnpm db:generate`.
3. Leer SQL generado.
4. Confirmar RLS y politicas necesarias.
5. En local, usar `pnpm db:migrate`. En staging/producción, ejecutar `pnpm db:migrate:ledger` tras
   inspeccionar los SQL; si enumera solo los cambios aprobados, ejecutar
   `pnpm db:migrate:ledger --apply` y repetir el dry-run. El runner usa una transacción y advisory lock;
   rechaza hashes cambiados, archivos ausentes y SQL no transaccional (`VACUUM`/`CREATE INDEX CONCURRENTLY`).
6. Reservar `pnpm db:migrate:reviewed <archivo>` para bootstrap/break-glass documentado, nunca como
   flujo rutinario ni como sustituto de la verificación del ledger.
7. Actualizar docs/vault si cambia modelo de datos o comportamiento.

## Evidencia

- Registrar riesgos o pendientes en [[Backlog priorizado]].
- Para cambios grandes, crear decision en [[Decisiones]].
