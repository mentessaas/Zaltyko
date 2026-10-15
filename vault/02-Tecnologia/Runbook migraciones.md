---
status: active
owner: tech
last_reviewed: 2026-10-13
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

## Revalidación — 2026-10-02: grants, policies y sandbox del directorio

- Se revisó el [cambio oficial de Supabase sobre exposición de tablas en Data API](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically): el 30 de octubre de 2026 los proyectos existentes dejan de exponer automáticamente tablas públicas nuevas. Grants y RLS son controles separados.
- La migración `20261002102000_directory_explicit_deny_policies.sql` añade policies `false` para las diez tablas privadas del directorio. La migración `20261002120000_internal_table_explicit_deny_policies.sql` hace lo mismo para `lead_interactions` y `zaltyko_schema_migrations` y preserva todos los permisos de `service_role`. La prueba PostgreSQL revisa privilegios y roles.
- El job `Directory integrity` aplica la migración base y la nueva migración en PostgreSQL efímero, ejecuta `supabase/tests/public_directory_access.sql`, verifica la restauración y corre los 61 checks de integración.
- El sandbox E2E recibió las migraciones de directorio y la migración interna con Supabase MCP y las registra en el historial nativo de Supabase. Su ledger aplicacional `zaltyko_schema_migrations` sigue con 45 filas, última versión `20260805150000`; las migraciones nuevas no están registradas allí. No correr el ledger aplicacional contra ese sandbox hasta reconciliar todos los archivos posteriores al corte.
- En producción, el catálogo del directorio aún no existe. El ledger aplicacional tiene 54 filas y termina en `20260913100000`; el historial nativo de Supabase tiene 48 y contiene ocho migraciones posteriores con archivos locales, más `harden_rls_search_paths` sin archivo local. Esa fila nativa conserva siete sentencias y un comentario original que la marcaba local-only hasta reconciliar backup y ledger.
- No ejecutar el runner aplicacional en producción ni el sandbox hasta clasificar todos los archivos posteriores a sus cortes, recuperar/revisar la migración fuente faltante y conciliar los hashes de SQL ya aplicados. La presencia en el historial nativo no demuestra por sí sola que el contenido coincida byte por byte con el archivo local.
- Producción no se migró para el directorio. Tras reconciliar el historial, exigir backup y restauración verificados, ejecutar el runner versionado únicamente sobre la lista aprobada y mantener apagados los flags hasta validar permisos y rollback a lectores anteriores.

La verificación local del 2026-10-02 pasa `pnpm validate:rls` (79/79 tablas), `pnpm check:migrations` (7 migraciones Drizzle y 93 Supabase) y 61 checks PostgreSQL con restauración del dump. El Security Advisor del sandbox ya no señala esas dos tablas internas; solo queda protección contra contraseñas filtradas, opción disponible en Pro o superior. La organización observada está en Free. [Documentación de Supabase](https://supabase.com/docs/guides/auth/password-security).

El Advisor de producción todavía señala tres tablas RLS sin policies (`__drizzle_migrations`, `lead_interactions`, `zaltyko_schema_migrations`). Performance Advisor lista 60 FKs sin índice, 58 policies con reevaluación RLS por fila, 358 avisos de policies permisivas solapadas, 214 índices sin uso observado y dos índices duplicados. Son avisos de inventario; no se crean ni eliminan índices en bloque antes de reconciliar los historiales.

### Migration local del modelo deportivo — 2026-10-13

`20261013100000_model_sport_profiles_and_complementary_activities.sql`
actualiza el esquema greenfield `zaltyko`: perfiles deportivos, relación M:N
con la academia y clasificación de programas. Requiere `zaltyko.programs` vacía
y aborta si encuentra filas, para no descartar silenciosamente su clasificación.
Los fixtures sintéticos se insertan después.

Los runners `test:zaltyko-*:local` la aplican en PostgreSQL efímero. No está
aprobada para ningún proyecto remoto. Antes de promoverla, revisar ledgers,
procedencia y estado real de tablas, y aprobar el cutover por separado.

### Proyección de cohortes y servicios de analítica — 2026-10-13

El writer/reader de cohortes usa las tablas `zaltyko.retention_cohort_projection_runs`
y `zaltyko.retention_cohort_projections` creadas por
`20261006165917_owner_cohort_retention_projections.sql`; no requiere añadir una
migración para este cambio. El benchmark y los retries corren solo en PostgreSQL
efímero/local. Grants y RLS no se relajan; el proceso con privilegios de servicio
es el único escritor. Antes de cualquier promoción remota, reconciliar historial
y hashes de migraciones del proyecto destino, revisar la ruta del worker y medir
timeouts/rollback con backup restaurable. No usar `drizzle-kit push`.

### Preferencias Owner Dashboard — 2026-10-13

`20261013120000_owner_dashboard_layout_preferences.sql` crea la preferencia
por usuario/academia. Está probada solo en migraciones efímeras. RLS se fuerza,
`authenticated` solo tiene SELECT/INSERT/UPDATE de su fila y no existe permiso
DELETE. Antes de promover, reconciliar hashes/ledgers remotos y revisar el plan
de cutover; su migración no se puede aplicar a un entorno divergente sin revisar
la procedencia y aprobar por separado.

### Ledger local: pagos manuales — 2026-10-13

La migración local greenfield `20261006093047_add_internal_billing_ledger.sql`
define el origen `manual/provider` y campos mutuamente condicionados para pagos.
La tabla queda dentro de los grants/RLS del ledger. Los servicios y sus fixtures
se prueban exclusivamente contra PostgreSQL efímero. La migración de ledger fue
editada en esta rama y ya no debe tratarse como checksum compatible con
historiales remotos existentes. No correrla en Supabase remoto ni reconciliar
ledgers automáticamente: primero comparar procedencia, SQL/hash, estructura y
efectos, con un plan de cutover aprobado. La UI/API local de registro manual no
requiere cambio de esquema remoto; el runner efímero incluye además
`20261006131000_add_organization_default_currency.sql` para resolver el scope
del owner en la consulta. La modificación del runner solo afecta pruebas
locales. El flujo no inicia cargos ni toca Stripe.

### Reconciliación de historiales remotos — 2026-10-13

La lectura de solo metadatos confirma que producción
(`jegxfahsvugilbthbked`) contiene 54 filas en
`public.zaltyko_schema_migrations`: las 54 coinciden con los SHA-256 de sus
archivos locales, sin huérfanos; hay 54 archivos locales pendientes. El sandbox
E2E (`aeeootdmuiqkfeernskw`) contiene 45 filas: 44 hashes coinciden y
`20260805120000_academies_status_semantics.sql` difiere; no hay huérfanos y
quedan 63 archivos locales pendientes. El repositorio tiene 108 migraciones SQL
locales. Los historiales nativos de Supabase también divergen (53 entradas en
producción y 70 en E2E). La inspección de catálogo previa no encontró tablas en
los esquemas nuevos `zaltyko`/`zaltyko_private` de ninguno de los proyectos.

No se ejecutó SQL ni se modificó ningún ledger. La ausencia de huérfanos en el
ledger aplicacional no reconcilia por sí sola el historial nativo ni demuestra
qué SQL produjo el hash distinto del sandbox. No ejecutar el runner, `db push`
ni `apply_migration` en producción o en el sandbox legacy. El E2E greenfield
requiere primero un destino aislado y limpio; revisar el coste y obtener
confirmación explícita antes de crear un proyecto o rama. Después, registrar
solo migraciones aprobadas con el runner versionado, verificar RLS y grants y
ejecutar E2E sintético antes de cualquier promoción.

### Aislamiento de helpers del núcleo greenfield — 2026-10-13

Producción y E2E ya tienen `zaltyko_private` heredado, con `USAGE` para
`anon`, `authenticated` y `service_role`. La migración fundacional greenfield
antes revocaba permisos del esquema y cambiaba su comentario; eso podía alterar
políticas o rutas legacy durante una promoción gradual aunque los nombres de
función nuevos fueran distintos.

ADR-0021 separa los helpers nuevos en `zaltyko_domain_private`. Los archivos
históricos ya aplicados permanecen inmutables; las migraciones greenfield aún no
aparecen en los historiales remotos. El harness local siembra un helper legacy
sintético y verifica que sobreviven sus permisos, función y comentario, mientras
`anon` no obtiene acceso al esquema nuevo. No aplicar esos SQL al proyecto
legacy: el aislamiento elimina un efecto lateral, pero no resuelve el drift de
ledgers ni autoriza un cutover.

### Próximo mantenimiento PostgreSQL — 2026-10-13

Supabase anunció PostgreSQL 17.11 desde 17.6. En la lectura de proyectos ambos
siguen en 17.6; `pgcrypto` está instalado y `ltree`/`btree_gist` no aparecen
instalados. El repositorio no contiene llamadas `pgp_*`, pero eso no descarta
datos cifrados heredados. Antes de aceptar o programar el upgrade, ejecutar las
consultas de detección oficiales para índices y revisar columnas/datos de
`pgcrypto`; no reindexar ni migrar datos sin evidencia y ventana aprobada.
Supabase también anunció retirar un subconjunto antiguo de TLS 1.2 el
10-11-2026; usar clientes y runtimes con TLS moderno.

Fuentes actuales: [PostgreSQL 17.11: acciones para extensiones](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes) y
[cambio de suites TLS](https://supabase.com/changelog?types=breaking-change).

## Flujo recomendado

**Actualización15oct2026,10:51UTC (metadata-only):** Main confirmó por SQL
`server_version_num=170006` en Sandbox y producción; pgcrypto1.3 en extensions,
ltree/btree_gist ausentes. SQL fijo revisado Frontend98/Main, READONLY10s,
sin filas reales ni DDL. [Evidencia y hash](../../docs/deployment/owner-pilot-version-extensions.md).
No prueba backports ni CVEs individualmente aplicables. La instrucción histórica
de revisar datos cifrados no autoriza hacerlo bajo este seguimiento: requiere
alcance/clasificación/recuperación y decisión específicos antes de upgrade,
reindex, restauración o escaneos de filas. La lectura de catálogo no cierra ese gate.

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

### Sandbox E2E: migraciones greenfield con ledger aislado — 2026-10-13

La lectura actual confirma que `Zaltyko E2E Sandbox` sigue activo y conserva
tablas legacy en `public`, pero no tiene el esquema nuevo `zaltyko`. El E2E
autenticado falló al consultar `zaltyko.organization_members`. No se leyeron
valores de personas, familias, cargos, credenciales ni historial de Auth.

Para no conciliar ni aplicar el historial legacy, el corte local añade
`scripts/apply-e2e-domain-migrations.ts`: acepta únicamente el ref
`aeeootdmuiqkfeernskw`, exige `E2E_ALLOW_PROVISIONING=true`, valida que URL y
conexiones pertenezcan al Sandbox y aplica una allowlist cerrada de 16
migraciones dentro de `zaltyko`. Mantiene hashes en
`zaltyko_domain_private.e2e_schema_migrations`, no modifica
`public.zaltyko_schema_migrations` ni aplica migraciones legacy. Si encuentra
schema sin ledger, una ledger con filas huérfanas o hashes distintos, falla
cerrado. Un prefijo de migraciones completo y registrado puede reanudarse de
forma idempotente; cada migración y su hash se confirman en la misma transacción.
El seed de owner/admin/coach usa una organización de prueba fija y sintética; no
reutiliza academias ni datos personales de `public`.

Las 16 migraciones y el contrato de RLS forzada pasan en PostgreSQL efímero
local. La integración de CI todavía no se ha subido/ejecutado; por tanto el
estado remoto sigue sin cambio. Tras pasar CI, comprobar solo presencia de
tablas, ledger/hash, RLS/grants y advisors en el Sandbox. No promover estas
migraciones a producción hasta preparar backup restaurable, cutover, pruebas de
aislamiento y release con revisión. No crear una rama de Supabase: el usuario
rechazó el coste potencial de hasta 35 USD/mes.
