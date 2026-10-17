# Preflight de esquema para Zaltyko E2E Sandbox — 14-10-2026

## Actualización de integración local

Main integró el preflight de solo lectura en `44dcc7f2`. Validación posterior:
10 pruebas focales PASS, `tsc --noEmit` exit 0 y ejecución estática de
`pnpm e2e:schema-delta:preflight` exit 0. Esta última devuelve explícitamente
`NO_VERIFICADO`: no se utilizó `--connect` ni se consultó la base remota.
La dependencia compartida `btree_gist` no se atribuye a una delta pendiente;
triggers y policies de consentimiento pertenecen a su propia migración.

El restore sintético ya pasó también en PostgreSQL **17.11**; la referencia
a PostgreSQL 14 más abajo describe el corte histórico de este informe.
Esto no demuestra backup/restauración del Sandbox real ni autoriza su DDL.

## Resultado

**NO-GO para DDL remoto por ahora.** La base del Sandbox sí está reconciliada:
las 16 migraciones del allowlist compartido aparecen en el ledger privado con
hashes idénticos a este checkout. La delta pendiente para el recorrido mensual
es de dos archivos locales, pero ambos están deliberadamente fuera de ese
allowlist. ADR-0027 ya define aceptación explícita en `/owner/setup` para
identidades previas, sin backfill ni renovación automática del estado legacy;
hay que verificar ese flujo en Preview. No se ejecutaron escrituras ni se
consultaron filas de personas o negocio.

## Corte, alcance y evidencia

- Checkout de trabajo: `codex/sandbox-schema-preflight-20261014`, basado en
  Main `e0ebecfa96a6c9d297e4603516a1aebd9c8e56fa`.
- Destino leído: proyecto `aeeootdmuiqkfeernskw` (“Zaltyko E2E Sandbox”),
  `ACTIVE_HEALTHY`, PostgreSQL `17.6.1.147`, región `eu-north-1`. La API de
  proyectos no devuelve el plan de facturación; el carácter gratuito procede
  del encargo y no quedó verificado por esa API.
- Consultas: metadatos del proyecto, historial Supabase, tablas/columnas,
  catálogos `pg_catalog` e `information_schema`, policies, grants y filas de
  los tres ledgers limitadas a metadatos de migración. Sin secretos ni filas de
  usuarios/familias/gimnastas/facturas/pagos.
- Main registra tres navegadores PASS y dos restores sintéticos locales PASS.
  El restore se ejecutó con un manifiesto local de 11 migraciones y PostgreSQL
  14; no acredita el bundle remoto completo ni compatibilidad de PostgreSQL 17.
  La corrida Chromium avanzó de SHA durante la prueba; Firefox y WebKit sí
  quedaron fijados al mismo SHA. Véanse las notas de readiness y restore.

## Ledger y delta exacta

Los tres historiales observados son distintos y no deben mezclarse:

1. La lista nativa Supabase termina en `20261005002950` (`harden_internal_fk_indexes_stage_20261005`).
2. `zaltyko_domain_private.e2e_schema_migrations` tiene 16 filas. Las versiones,
   nombres y SHA-256 coinciden con los 16 archivos del allowlist actual
   `E2E_DOMAIN_MIGRATIONS` y se aplicaron el 13-10-2026. Este es el historial
   que usa el runner E2E del Sandbox.
3. `public.zaltyko_schema_migrations` no tiene filas para los 11 nombres del
   runner de restore. Es un ledger distinto; no se debe copiar ni bootstrapear
   allí el historial privado.

### Base compartida ya instalada

El orden es el del allowlist E2E. Cada hash remoto privado se comparó con el
SHA-256 del archivo del checkout `e0ebecfa`.

| # | Migración | SHA-256 local = ledger privado |
|---:|---|---|
| 1 | `20261006080702_establish_zaltyko_domain_foundation.sql` | `925035bc477c99031a42dfed6681701b39911b679e9a0ebb4a801654cae490e0` |
| 2 | `20261013100000_model_sport_profiles_and_complementary_activities.sql` | `238f3eb4fd49033f526e2ed97383d3c3954f38661dbd1291b17da5459ab8bde7` |
| 3 | `20261006085254_add_operational_enrollment_invariants.sql` | `8f77222e3e653cb1062b60c877c3389c354f611c0cfddf075ab764fc957786b1` |
| 4 | `20261006090034_add_trials_waitlists_families.sql` | `7561ac07a133bbbf31319faab6445e132a14dbbaf380df4c925b523566ab1d44` |
| 5 | `20261006093047_add_internal_billing_ledger.sql` | `60aecb28f12db1ce4588e361649636ac137026f9652ddc773c8982f870ab7aa7` |
| 6 | `20261006094607_add_versioned_metric_engine.sql` | `1c292e6c9fb9bd514e802608399c2c818fca47cfba469b2f818bf240e120d9de` |
| 7 | `20261006100146_add_explainable_health_score.sql` | `6889ca37c6f2f6a128521416fe7c1894e8fc9407193a77da4650680fc38f5760` |
| 8 | `20261006113000_add_actionable_insights.sql` | `c7668beb5b249bd1049a89128e0c5d2375d91ec1b1d53f5d15137101e18c88b2` |
| 9 | `20261006123000_add_organization_bootstrap.sql` | `8743984e7614990dd77d70beb3c528b98b0a983872cc265b1f75c64187f13b35` |
| 10 | `20261006131000_add_organization_default_currency.sql` | `3ecac1c3307b502320c08b1984a25ba7b518ae460e17c34cbc37c06a41b3c73c` |
| 11 | `20261006160012_track_owner_pipeline_freshness.sql` | `8c391de53ae0d6b5b9d99cefe3fb31e0af8116395f9058d67bf49ec359ff5026` |
| 12 | `20261006165917_owner_cohort_retention_projections.sql` | `599e01586738b47fe55bf755db05b818138bcd7b35266fac543abeec08efd242` |
| 13 | `20261013120000_owner_dashboard_layout_preferences.sql` | `6bac2775a38f59dfb50c7c3e95ad87ded59381f56ea9b22ac18842ed20ae755c` |
| 14 | `20261013082806_organization_payment_accounts.sql` | `09a5d20ad3db559bbd2c2ea0f88fc8c3d2f8a23edafbb88ecaf84fc0850264b5` |
| 15 | `20261013160000_canonical_family_collection_and_entitlements.sql` | `26681ba811375945539b622bda57e51e765d5fbd61b8afd094282647331cad08` |
| 16 | `20261013170001_record_group_membership_history.sql` | `6d555ed6324ef7784966f533dd63745d2244b2e4f931eae6ad0f7e31b7e0b926` |

### Delta local aún no aplicada

El runner sintético local ordena estos archivos después de la base. El runner
remoto `apply-e2e-domain-migrations.ts` solo admite los 16 anteriores; la
conciliación considera una fila no incluida en su manifiesto como huérfana. Por
tanto, no hay ruta remota aprobada para añadirlos sin diseñar/revisar una
extensión versionada del mecanismo. No se editó el allowlist.

| Orden propuesto | Migración | SHA-256 del checkout | Estado observado |
|---:|---|---|---|
| 17 | `20261013235142_owner_signup_consent_canonical.sql` | `addaafa75b1770a3ae7a68fb7eec274a7dd1e5936e792371a5562b0f4ae8508d` | Ausente del ledger; tablas canónicas ausentes |
| 18 | `20261014001209_monthly_athlete_tariff_coverage_and_invoice_line_enrollments.sql` | `a95007f6e4fff135c856b21889de27204ab37768b5853c6aa9592d829497395d` | Ausente del ledger; extensión/columnas/tablas objetivo ausentes |

La secuencia local de restore que pasó contiene 11 archivos, no los 18 del
escenario completo: omite seis piezas analíticas/dashboard/bootstrap del grupo
compartido y añade estas dos migraciones locales. Sus dos PASS no prueban una
restauración de los 18 archivos juntos. La propuesta para el Sandbox no es
reaplicar la base: es conservar las 16 coincidencias verificadas y tratar solo
la delta, una vez superados los gates que siguen.

## Esquema, dependencias y compatibilidad

- El Sandbox tiene 80 tablas en `zaltyko`; todas tienen RLS activada y forzada.
  El esquema no concede `USAGE` a `anon`. `authenticated` tiene lecturas
  limitadas; las escrituras del dominio pasan por `service_role`, salvo
  `owner_dashboard_layouts`, que concede INSERT/UPDATE autenticados bajo RLS.
- La base canónica ya incluye `families`, `enrollments`, `price_plans`,
  `enrollment_price_assignments`, `invoices`, `invoice_lines`,
  `group_membership_history` y `family_collection_preferences`. Esta última
  existe y su migración #15 sí tiene hash reconciliado en el ledger privado.
- Para la delta mensual faltan `price_plan_class_template_coverage`,
  `invoice_line_enrollments`, `invoice_lines.location_id`,
  `invoice_lines.athlete_id` y la extensión `btree_gist`. El `invoice_lines`
  existente conserva el `enrollment_id` legacy nullable. La migración mensual
  depende de las claves compuestas/tablas del ledger ya creadas por la base;
  agrega columnas nullable y tablas nuevas, sin reescribir las líneas
  históricas. Sus dos tablas nuevas fuerzan RLS, niegan acceso a `anon` y
  `authenticated`, y dan escritura solo a `service_role`.
- La migración de consentimiento depende de `auth.users`, ya parte de Supabase;
  crea `zaltyko.owner_signup_consent_policy`, `owner_signup_consents` y
  `owner_signup_consent_audits`, con RLS forzada, lectura propia y escritura de
  servicio. La lectura del catálogo confirma `auth.users` y la FK actual de
  `zaltyko.organization_members.user_id` a `auth.users.id`; no falta el vínculo
  Auth base. El nuevo `owner_signup_consents.user_id → auth.users.id` todavía
  no existe porque la tabla canónica no está aplicada. El archivo inicializa
  `policy_version='v1-2026-08-01'`, la versión inicial aprobada por ADR-0027.
- El allowlist E2E existente y el runner guardado deben permanecer intactos en
  esta tarea. Para admitir la delta después se necesita aprobación separada de
  un manifiesto/runner que siga validando el ref, hashes, prefijo de ledger,
  RLS forzada, transacción por archivo y entrada de ledger atómica. El runner
  actual detiene una fila extra como huérfana; una aplicación manual al ledger
  privado rompería la siguiente conciliación.
- La migración `20261006085254` ya está en la base con hash correcto, aunque su
  SQL histórico no contiene `BEGIN/COMMIT`; no se propone repetirla. Los dos
  archivos pendientes sí delimitan transacción y el runner revisado envuelve
  cada archivo junto con su fila de ledger en una transacción.

## RLS, permisos y modelos legacy

- `zaltyko` y `zaltyko_domain_private` no dan `USAGE` a `anon`; sí a
  `authenticated` y `service_role`. `zaltyko_private`, el namespace legacy,
  conserva su propio `USAGE` para `anon`, `authenticated` y `service_role`.
  La migración fundacional documenta y respeta esa separación; no se deben
  mover, reemplazar ni revocar los helpers legacy como parte de este delta.
- `zaltyko_domain_private.e2e_schema_migrations` no tiene RLS, pero no tiene
  grants de tabla a `anon`, `authenticated` ni `service_role`; no cambiar esos
  permisos en este preflight.
- Existen `public.owner_consent` y `public.owner_consent_audit`. Ambas tienen
  RLS activada pero no forzada. Los roles `anon` y `authenticated` tienen
  grants de SELECT/INSERT/UPDATE/DELETE en ambas; las policies observadas solo
  permiten SELECT cuando `auth.uid() = owner_id`, y no hay policies de
  mutación. No se leyeron filas ni se comprobó cuántos consentimientos existen.
  ADR-0027 define que los registros legacy `current`, `revoked` u obsoletos no
  se importan: Owners existentes deben aceptar explícitamente en `/owner/setup`.
  No hay reaceptación automática ni regrant por metadata. Mantener íntegro el
  almacenamiento público y no copiar sus grants al esquema nuevo.
- La migración canónica no lee, migra, borra ni actualiza `public.owner_consent`.
  El servicio nuevo exige aceptación explícita autenticada para identidades
  anteriores y registra grant/regrant con audit append-only. Verificar ese
  comportamiento en Preview; no hace falta crear una migración compleja para
  vincular clientes, porque el dominio ya enlaza membresías con `auth.users`.

## Diseño propuesto del runner delta — no implementado

Mantener intactos `E2E_DOMAIN_MIGRATIONS` y
`zaltyko_domain_private.e2e_schema_migrations`. Crear, solo tras aprobar código
y backup, un runner separado para los dos archivos delta y un ledger privado
`zaltyko_domain_private.e2e_delta_schema_migrations`.

- `--dry-run` por defecto. Informar ref destino, SHA de aplicación, nombres,
  versiones y SHA-256 fuente; exigir que la base principal sea exactamente
  16/16 y que hashes/columnas/objetos precondición coincidan.
- Rechazar cualquier mismatch, fila desconocida, objeto delta ya existente sin
  ledger, o artefacto de backup sin evidencia verificable. El modo de escritura
  requeriría `--apply`, confirmación literal del ref Sandbox y un identificador
  no secreto del backup aprobado.
- Serializar con el mismo advisory lock de migraciones E2E. Aplicar #17 y #18
  en orden, cada archivo y su fila de ledger delta en una transacción. No
  escribir ni extender el ledger base. Un retry con mismos hashes sería no-op;
  un prefijo delta válido podría continuar; drift/orphans abortan.
- Verificar al cierre exactamente 2/2 hashes y el esquema/RLS/grants esperados.
  El runner no leería filas de negocio ni ejecutaría SQL arbitrario.

Este diseño conserva las 16 verificaciones remotas actuales y permite que el
runner compartido siga comparando exactamente su allowlist de 16. No se creó
el runner ni el ledger.

## Backup, rollback y gates antes de cualquier escritura futura

1. Fijar ref `aeeootdmuiqkfeernskw`, SHA de aplicación y hashes de la tabla
   anterior. Repetir los tres ledgers y catálogo justo antes de operar.
2. El plan Free no ofrece descarga de los backups administrados; Supabase
   recomienda exportar con CLI y mantener una copia externa. Antes de DDL,
   un operador autorizado debe producir una copia lógica cifrada, restringida,
   con checksum y retención aprobada, y restaurarla en entorno aislado. No
   guardar dumps de datos de familias en el checkout ni exportar `auth.users`
   al equipo personal. Si no se puede completar un restore verificable, no
   escribir el Sandbox.
3. Validar el bundle y la extensión en restore local con PostgreSQL 17
   compatible con el destino; el PASS actual fue con PG14. Verificar diff de
   columnas, constraints, índices, extensión, policies, grants, triggers y
   ledgers antes de cualquier operación remota.
4. Solo tras revisar este diseño, aprobar e implementar el runner delta,
   aplicar #17 y #18 como migraciones versionadas individuales. El runner hace
   atómico cada SQL + fila del ledger; no hace atómico el par completo. Si
   #17 queda confirmada y #18 falla, detenerse ahí, conservar evidencia y no
   ejecutar una reversión ad hoc.
5. Ante fallo antes del commit, la transacción revierte el DDL y la fila actual.
   Después de un commit, preferir restore probado o corrección forward revisada;
   no usar `DROP` para simular rollback, especialmente para tablas/auditoría de
   consentimiento. La disponibilidad de RPO/RTO del plan gratuito no está
   verificada.

## Plan de smoke en Preview — no ejecutado

1. Confirmar que Preview corresponde al SHA aprobado y que su URL Supabase
   termina en el ref de este Sandbox; no imprimir valores de entorno ni usar
   el ref productivo. Esa correspondencia no se verificó en este preflight.
2. Usar solo cuenta y organización sintéticas autorizadas. Si no hay fixture
   autorizada, no provisionar cuentas por iniciativa propia. Para Owners con
   identidad previa, incluida la que tenga un estado legacy current, revoked u
   obsoleto, comprobar aceptación explícita en `/owner/setup`; no importar ni
   reotorgar consentimiento automáticamente. Mantener intacto
   `public.owner_consent`.
3. En la UI Owner crear o usar dos clases para una gimnasta sintética, asignar
   tarifa con cobertura explícita de ambas, emitir la cuota del mes y registrar
   el pago manual recibido. Comprobar una línea/cargo mensual, snapshots de las
   dos inscripciones, persistencia y estado del dashboard; no llamar a Stripe.
4. Verificar acceso denegado entre organizaciones/sedes y para roles no
   autorizados, policies/grants efectivos, errores sin fuga de PII y
   viewports 375/768/1280. Cerrar la fixture por los servicios disponibles y
   comprobar cleanup; el smoke no acredita Preview/producción general.

## Fuentes

- Estado local y runner: `scripts/lib/e2e-domain-migrations.ts`,
  `scripts/apply-e2e-domain-migrations.ts`,
  `scripts/run-zaltyko-synthetic-restore-local.sh`.
- Corte de producto: `docs/qa/monthly-billing-e2e-readiness-2026-10-14.md` y
  `docs/qa/synthetic-restore-runner-2026-10-14.md`.
- [Supabase: Database Backups](https://supabase.com/docs/guides/platform/backups)
  y [Production Checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
  sobre backups y plan Free.
- [Supabase changelog: PostgreSQL 17.11 y `btree_gist`](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes).
  La migración mensual crea un índice GiST dependiente de `btree_gist`; comprobar
  advertencias de reindexado si el proyecto se actualiza a la versión afectada.

## Límites

Este documento es un preflight y plan; no autoriza aplicar la delta. No modifica
allowlists, ledgers, SQL, datos remotos ni despliegues. El plan Free se toma del
contexto de la solicitud, no de los metadatos disponibles en MCP. No se
verificaron filas legacy de consentimiento, disponibilidad de backup, RPO/RTO,
mapa Preview→Sandbox, actores autenticados ni compatibilidad remota posterior a
la migración.

## Runner de consulta previa — DRYRUN_READONLY

Se añadió `pnpm e2e:schema-delta:preflight` como consulta separada. Sin opciones
devuelve el plan estático con `NO_VERIFICADO` y los dos hashes locales. La
consulta catalogada requiere `--connect --confirm-target aeeootdmuiqkfeernskw`,
ref, URL de Supabase y CA TLS explícitos/configurados. Abre una transacción
`READ ONLY` y valida el ledger base exacto de 16 migraciones, sus checksums, las
dependencias de catálogo y el ledger delta si existe. No crea el ledger ni
aplica SQL; tampoco existe opción de escritura. Los errores muestran códigos
seguros, no URL, usuario, contraseña, certificado ni texto del driver.

Los tests usan un cliente PostgreSQL simulado. No conectan con el Sandbox. La
consulta remota sigue pendiente de revisión Main y no equivale a backup,
compatibilidad PG17, aprobación de DDL ni autorización de aplicación.

### Corrección de propiedad de objetos

La extensión `btree_gist` se trata como dependencia compartida, no como objeto
propiedad de la migración mensual: si ya existe en la base de 16, no genera
drift. Triggers y policies de consentimiento pertenecen a la migración #17;
los objetos de cobertura/snapshots quedan en #18. Los fixtures verifican base
de 16 con la extensión preexistente y el prefijo #17 aplicado sin objetos #18.
El resultado expone `sharedDependencies.btreeGistPresent` sin clasificarlo como
objeto delta. La carga de `.env` usa `quiet` para evitar que dotenv imprima rutas
o valores de configuración durante una ejecución explícita.
