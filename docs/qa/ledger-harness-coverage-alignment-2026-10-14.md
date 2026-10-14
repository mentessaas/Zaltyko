# Alineación de migración en los harnesses locales de ledger

## Alcance y evidencia

- `scripts/run-zaltyko-ledger-services-local.sh` crea un PostgreSQL temporal, aplica su lista explícita de migraciones y el fixture sintético de academias, y ejecuta `scripts/verify-zaltyko-ledger-services.ts`. Su lista incluía ledger, cuentas de pago y preferencias familiares, pero omitía `20261014001209_monthly_athlete_tariff_coverage_and_invoice_line_enrollments.sql`.
- `scripts/run-zaltyko-canonical-stack-local.sh` crea otro PostgreSQL temporal, aplica el fixture de autorización y una lista independiente de migraciones; luego ejecuta `zaltyko_ledger_foundation.sql` y verificadores de preferencias familiares y worker. Su lista también omitía la migración.
- `scripts/verify-zaltyko-ledger-services.ts` emite una factura con una línea `membership` y comprueba idempotencia, cargo y cobros. No contiene un caso de factura mensual por atleta.
- `supabase/tests/zaltyko_ledger_foundation.sql` conserva una línea legacy `membership` asociada a invoice/charge.
- `supabase/tests/zaltyko_monthly_athlete_tariff_pre_migration.sql` prepara una línea histórica mensual por inscripción y comprueba que, después de la migración, conserva `enrollment_id` y mantiene `location_id` y `athlete_id` en `NULL`.
- La migración es aditiva: añade columnas y tablas de cobertura/snapshot; no actualiza filas existentes. La nueva prueba estática verifica que ambos runners incluyen una sola referencia a la migración y mantienen los checks legacy.

## Cambio

Se añadió la migración al final de la lista de cada runner, después de que existan las tablas base de ledger, atletas, tarifas, inscripciones y plantillas. No se cambió el servicio, los fixtures, los tests SQL, la lista compartida de migraciones E2E ni el esquema.

## Validación y límites

Validación estática ejecutada: `pnpm exec vitest run tests/ledger-harness-migration-scope.test.ts` (3/3), `bash -n` en ambos scripts, presencia del archivo de migración, Prettier en el test y esta nota, y `git diff --check`.

Los harnesses PostgreSQL de ledger y stack canónico no se ejecutaron durante la ventana de QA Chromium autorizada. Por tanto, la integración de la migración en ambos PostgreSQL temporales queda pendiente de ejecución por Main tras QA; este cambio no acredita comportamiento runtime ni compatibilidad con base de datos remota.
