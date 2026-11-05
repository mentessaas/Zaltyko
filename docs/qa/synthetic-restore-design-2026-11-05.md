# Preparación sintética de backup y restore PostgreSQL

- Fecha: 5 de noviembre de 2026
- Worktree: `/Users/elvisvaldesinerarte/Projects/Zaltyko/trabajos/Zaltyko-backup-probe-20261105`
- Rama/HEAD de referencia: `codex/disposable-backup-probe-20261105` / `030a3a87c0c26c61e130e193a3074f268967eecf`
- Estado: diseño implementado para revisión; no se ha ejecutado el modo `synthetic-restore`.

## Hallazgos

- El Tech Lead reporta el inventario GitHub `41941485318` sobre el SHA indicado. `pg_dump` y `pg_restore` PostgreSQL 17.11 aparecieron en `cache/stack/slim-services/postgres/17.11.0.002-r0/linux-amd64/bin`. Digests observados: `pg_dump` `c7e2ee460b6833d147f527821dedbde7bec5c0db07fbd154ed910f52e2a31e1d`; `pg_restore` `4a5dca1246b608fff73374c6e160afee9a10ebd7b550c3db8474fd7af5edeb1c`. Son datos reportados, no una allowlist ni verificación independiente. El guard y el inventario pasaron; otros cuatro jobs quedaron `SKIPPED`. El comando de parada de Supabase devolvió 0, sin comprobación de procesos/PID. No hubo SQL, migraciones, dump ni restore.
- El baseline revisado es [`20261024172153_sandbox_schema_snapshot_baseline.sql`](../../supabase/schema-snapshots/20261024172153_sandbox_schema_snapshot_baseline.sql). Declara `extensions`, `vault`, `public`, `zaltyko`, `zaltyko_domain_private` y `zaltyko_private`, y fija `btree_gist` 1.7, `pg_stat_statements` 1.11, `pgcrypto` 1.3, `plpgsql` 1.0, `supabase_vault` 0.3.1 y `uuid-ossp` 1.1.
- El baseline referencia `auth.users`, `auth.uid()` y `auth.jwt()`, pero no captura el esquema Auth. La preparación sintética añade una compatibilidad mínima local con `auth.users(id,email)` y esas dos funciones; no inicia Auth HTTP ni añade contraseña, hash, identidad o token.
- `src/db/index.ts` no expone cierre del pool. El servicio de ledger se invoca por importación dinámica en un proceso Node separado. El proceso termina y el padre comprueba en `pg_stat_activity` que no queden conexiones del servicio antes de ejecutar el dump.

## Diseño implementado

**Selector y límites.** `DISPOSABLE_BACKUP_MODE` acepta solo `inventory` o `synthetic-restore` y por defecto conserva `inventory`. Este modo vuelve a comprobar rama/SHA, entorno GitHub Linux, Node 22/OpenSSL/AES-GCM, paths privados, manifiesto del inventario y digests observados para esos binarios en esta ejecución. La comparación del digest identifica el archivo observado en el mismo runner; no lo autentica contra una allowlist. El workflow queda bajo propiedad del Tech Lead.

**Bases desechables.** El runner crea `zk_src_<run>_<attempt>_<sha8>` y `zk_dst_<run>_<attempt>_<sha8>` desde `template0`, con encoding/locale del template, owner `supabase_admin` y comentario marcador único por rama, run, intento, SHA y rol. Rechaza colisiones. Comprueba loopback, puerto, usuario, superusuario y PostgreSQL 17. Nunca cambia la base `postgres`, salvo consultas de catálogo necesarias para crear/eliminar las dos bases propias.

**Esquema y fixture.** Antes del baseline verifica los seis roles requeridos y cada versión exacta de extensión. Si una versión falta, detiene el ensayo; no omite `supabase_vault` ni altera el baseline. Comprueba los SHA fijados del baseline, la migración RLS y el seed Owner; aplica las fuentes originales sin cambiarlas, con el marcador de replay del baseline. El prerequisito Auth es una pieza separada e incluida en el dump.

**Ledger y aislamiento.** Prepara dos academias sintéticas con una factura/cargo cada una: EUR y MXN, `35025` céntimos facturados, `12550` pagados por el servicio real `recordManualPaymentForCharge()` y saldo esperado de `22475`. Guarda IDs y claves sintéticas en un archivo 0600 temporal. No realiza cobros ni llama a proveedores. Ejecuta la fixture [`sandbox-tenant-isolation.sql`](../../scripts/ci/sandbox-tenant-isolation.sql) sin colisión de UUIDs y en transacción con rollback. Para ambas academias comprueba que `authenticated` no puede leer directamente `zaltyko.outbox_events`; no infiere que se hayan probado rutas HTTP de Owner.

**Dump autenticado y restore.** Crea un archivo custom completo con PostgreSQL 17 `pg_dump`, sin filtros de esquema/extensión. Limita el archivo a 64 MiB. Cifra con AES-256-GCM nativo de Node 22, IV aleatorio de 12 bytes, tag de 16 bytes y AAD ligado a marcador/SHA/nombres. La clave aleatoria de 32 bytes solo vive en memoria. Rechaza un ciphertext alterado antes del restore y valida el TOC. El guard del destino, tras verificar su marcador y owner, exige cero relaciones, esquemas de usuario salvo `public`, rutinas y tipos en todos los esquemas no `pg_*`, incluido `public` y excluido `information_schema`. Antes del restore, siembra en el destino vacío una tabla centinela sintética de propiedad y comentario comprobables; el guard debe rechazarla sin alterarla, luego se elimina solo esa tabla y se confirma de nuevo el estado vacío. Descifra a un archivo privado 0600 y revalida marcador, owner, objetos y huella del origen inmediatamente antes de restaurar con `pg_restore --exit-on-error --single-transaction`. Tras la comparación del restore, vuelve a invocar el guard esperando rechazo y compara huellas de catálogo/datos antes y después; no hace un segundo restore. No usa `--create`, `--clean`, `--no-owner`, `--no-acl`, filtros TOC ni `pg_dumpall`.

**Comparación y limpieza.** La huella ordenada compara esquema, extensiones, owners/ACLs de relación, ACLs por columna normalizadas por nombres de esquema/tabla/columna, ordinal y roles, ACLs por defecto, columnas, tipos, índices, constraints/FK, RLS/policies, rutinas, triggers, secuencias y hashes SHA-256/recuentos de filas. Compara el origen antes del dump, antes del restore y después; compara el destino con el estado inicial del origen. Vuelve a verificar ledger/outbox/audit e aislamiento tras restaurar. El cleanup elimina bases solo si nombre, comentario y owner coinciden; verifica ausencia. Si cleanup falla, informa fallo sin ocultar el error principal. Archivos raw, cifrados y descifrados se eliminan incluso cuando falla el ensayo.

## Importancia y límites

El flujo convierte la observación del inventario en una propuesta revisable de restauración lógica de PostgreSQL en dos bases del runner efímero. El control negativo del destino ocupado y la repetición del guard sobre el destino restaurado están implementados, pero sin ejecutar. Todavía no hay evidencia de ejecución de `synthetic-restore`, de aplicación real del baseline en ese camino, de compatibilidad del set de extensiones en el runner ni de restauración exitosa. No se afirma recuperación de Supabase Hosted, Auth HTTP, Storage, roles globales, WAL/backup físico, RPO/RTO ni producción. No se ejecutaron pruebas, typecheck, build, SQL local, CI dispatch ni llamadas a proveedores como parte de esta implementación.

## Fuente y siguiente paso

- Código de control: [`verify-sandbox-schema-replay.sh`](../../scripts/ci/verify-sandbox-schema-replay.sh) y [`synthetic-backup-restore.ts`](../../scripts/ci/synthetic-backup-restore.ts). El workflow está separado y lo mantiene el Tech Lead.
- Fixtures de referencia: [`billing-ledger-postgres.integration.test.ts`](../../tests/billing-ledger-postgres.integration.test.ts), [`sandbox-tenant-isolation.sql`](../../scripts/ci/sandbox-tenant-isolation.sql) y [`20261024172153_sandbox_schema_snapshot_baseline.sql`](../../supabase/schema-snapshots/20261024172153_sandbox_schema_snapshot_baseline.sql).
- Documentación de PostgreSQL 17: [pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html), [pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html), [pg_dumpall](https://www.postgresql.org/docs/17/app-pg-dumpall.html) y [CREATE DATABASE](https://www.postgresql.org/docs/17/sql-createdatabase.html).

**Siguiente paso:** revisión del Tech Lead del diff estático y del contrato del workflow. El dispatch de `synthetic-restore` queda separado como ejecución remota autorizada; este cambio no la ha iniciado.


## Primer intento remoto — f421c694

Run41952068788 terminó FAILURE antes de iniciar PostgreSQL: el typecheck encontró cuatro errores del helper (dos entornos ProcessEnv sin NODE_ENV, stdin ignorado tipado como Writable, asignación al NODE_ENV readonly de Next). No hubo dump ni restore ni aplicación del baseline en ese intento. El ajuste mantiene el typecheck y los guards; añade NODE_ENV=test a entornos construidos explícitamente, comprueba el valor heredado en el hijo y representa stdin como null sin cast. Pendiente nueva ejecución remota del SHA corregido.
