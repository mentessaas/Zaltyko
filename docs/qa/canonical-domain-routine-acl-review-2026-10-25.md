# Revisión de rutinas y ACL para ensayo de esquema canónico

## Alcance

- **Revisión estática, solo lectura**, del snapshot `supabase/schema-snapshots/20261024172153_sandbox_schema_snapshot_baseline.sql` en HEAD `e6968c3e921ed310f706602a247639381c448f72`.
- Se revisan las rutinas de `zaltyko` y `zaltyko_domain_private`, sus cuerpos, `search_path`, propietarios, grants y defaults de ACL que pueden influir en un ensayo transaccional desechable.
- No se ejecutó SQL, no se conectó a ninguna base, ni se ejecutaron pruebas o builds. Este documento no aprueba una migración ni su aplicación.
- El manifiesto fuente identifica un **snapshot del estado actual**, no historial migratorio recuperado; su hora exacta está marcada `NO VERIFICADO` (`supabase/schema-snapshot-manifest.json:1-8,19-22`).

## Resultado principal

El snapshot contiene **16 definiciones de rutina canónicas**, no 17: 11 en `zaltyko` y 5 en `zaltyko_domain_private` (`...sql:5581-6410`). Todas declaran `OWNER TO postgres`. Cuatro son `SECURITY DEFINER`; todas fijan explícitamente `search_path`. La lectura textual encontró referencias externas a `auth.uid()` en solo dos cuerpos. No encontró referencias a `public`, `zaltyko_private`, `extensions` ni SQL dinámico en estos 16 cuerpos.

Las referencias externas y los privilegios enumerados aquí son hechos del snapshot; **no verifican** que una futura base destino tenga los mismos roles, funciones de Auth, defaults globales, versión o ACL efectivos.

## Inventario de rutinas

| Rutina | Modo y `search_path` | Dependencias del cuerpo / asociación capturada |
|---|---|---|
| `zaltyko.guard_entitlement_revision()` (`5581-5602`) | `RETURNS trigger`; invoker; `pg_catalog, zaltyko` | Solo `OLD/NEW`, `now()` y campos del registro; trigger `organization_entitlements_revision_guard` (`7243`). |
| `zaltyko.guard_organization_saas_trial()` (`5604-5694`) | trigger; invoker; `pg_catalog, zaltyko` | `organizations`, `organization_saas_trials`, `organization_entitlements`, `clock_timestamp()`; trigger de INSERT/UPDATE de trials (`7247`). Toma lock de organización y deriva los tiempos; no sustituir su cuerpo por una versión aproximada. |
| `zaltyko.guard_organization_saas_webhook_identity()` (`5696-5720`) | trigger; invoker; `pg_catalog, zaltyko` | Campos `OLD/NEW`; trigger de identidad en webhook events (`7249`). |
| `zaltyko.guard_saas_reconciliation_decision_link()` (`5722-5753`) | trigger; invoker; `pg_catalog, zaltyko` | `organization_saas_webhook_events`, `organization_saas_webhook_reconciliation_results`; constraint trigger diferido al insertar decision (`7253`). |
| `zaltyko.guard_saas_reconciliation_result_insert()` (`5755-5990`) | trigger; invoker; `pg_catalog, zaltyko` | Decisions, webhook events, entitlements y subscriptions SaaS de `zaltyko`; trigger BEFORE INSERT en resultados (`7257`). |
| `zaltyko.guard_saas_webhook_requeue()` (`5992-6246`) | trigger; invoker; `pg_catalog, zaltyko` | Decisions, subscriptions, entitlements y campos de webhook de `zaltyko`; trigger de transición/requeue (`7251`). |
| `zaltyko.record_entitlement_revision()` (`6248-6269`) | trigger; invoker; `pg_catalog, zaltyko` | Inserta en `organization_entitlement_changes`; trigger AFTER INSERT/UPDATE de entitlements (`7245`). |
| `zaltyko.reject_entitlement_history_mutation()` (`6271-6282`) | trigger; invoker; `pg_catalog, zaltyko` | Solo lanza excepción; trigger append-only de entitlement history (`7241`). |
| `zaltyko.reject_owner_signup_consent_audit_mutation()` (`6284-6294`) | trigger; invoker; `pg_catalog` | Solo lanza excepción; triggers BEFORE DELETE/UPDATE y BEFORE TRUNCATE (`7263,7265`). |
| `zaltyko.reject_saas_reconciliation_mutation()` (`6296-6307`) | trigger; invoker; `search_path` vacío | Solo lanza excepción; triggers de inmutabilidad de decisions y results (`7255,7259`). |
| `zaltyko.seed_free_entitlement()` (`6309-6326`) | trigger; invoker; `pg_catalog, zaltyko` | Inserta entitlement Free en `organization_entitlements`; trigger AFTER INSERT en organizations (`7261`). |
| `zaltyko_domain_private.has_location_access(uuid, uuid)` (`6328-6353`) | SQL `STABLE SECURITY DEFINER`; owner `postgres`; `search_path` vacío | Lee `zaltyko.organization_members` y `member_location_scopes`; único helper externo del cuerpo: `auth.uid()` (`6335-6348`). Las políticas de sede lo llaman, p. ej. `sessions_select_scoped` (`8416`). |
| `zaltyko_domain_private.has_organization_access(uuid)` (`6355-6370`) | SQL `STABLE SECURITY DEFINER`; owner `postgres`; `search_path` vacío | Lee `zaltyko.organization_members`; llama `auth.uid()` (`6363-6367`). Lo usan políticas tenant, p. ej. `athletes_select_member` (`8283`). |
| `zaltyko_domain_private.prevent_invoice_line_enrollment_mutation()` (`6372-6384`) | trigger; invoker; `pg_catalog` | Solo lanza excepción; triggers row y truncate sobre `invoice_line_enrollments` (`7237,7239`). |
| `zaltyko_domain_private.reject_audit_mutation()` (`6386-6397`) | trigger `SECURITY DEFINER`; owner `postgres`; `search_path` vacío | Solo lanza excepción; trigger inmutable de `zaltyko.audit_log` (`7233`). No consulta datos ni referencias fuera del schema canónico. |
| `zaltyko_domain_private.reject_insight_history_mutation()` (`6399-6410`) | trigger `SECURITY DEFINER`; owner `postgres`; `search_path` vacío | Solo lanza excepción; trigger inmutable de `zaltyko.insight_status_history` (`7235`). No consulta datos ni referencias fuera del schema canónico. |

### Dependencias que deben existir, sin recrearlas desde este paquete

1. `auth.uid() RETURNS uuid` es un helper gestionado por Supabase, citado por los dos helpers de acceso y por políticas de `zaltyko`; debe validarse como prerrequisito de plataforma. No copiar ni redefinir `auth` en el SQL canónico (`...sql:6335,6365`; manifiesto `:81-89`).
2. Las definiciones canónicas incluyen diez FKs a `auth.users`, confirmadas por el inventario AST generado en CI40228139489. El manifiesto del snapshot completo cuenta 18 FKs externos a Auth incluyendo esquemas legacy (`schema-snapshot-manifest.json:23-35`); no confundir ambos alcances. Verificar `auth.users(id)` compatible y la función Auth existente antes de considerar un rehearsal completo. No basta con que el parser acepte los nombres.
3. Los tipos internos `zaltyko.*`, las tablas relacionadas y triggers deben entrar completos y en orden de dependencias. Las rutinas invoker de arriba dependen solo de `zaltyko` y funciones `pg_catalog` como `now()`/`clock_timestamp()`; los dos helpers `SECURITY DEFINER` agregan únicamente la dependencia explícita de `auth.uid()`.
4. No incorporar `public`, `zaltyko_private`, `vault` o extensiones en el paquete canónico. Sí registrar y resolver externamente las dependencias que el DDL no pueda auto-contener.

## Propietarios, ACL y defaults observados

### Rutinas

- Snapshot asigna las 16 rutinas a `postgres` (`...sql:5602,5694,5720,5753,5990,6246,6269,6282,6294,6307,6326,6353,6370,6384,6397,6410`). En las cuatro `SECURITY DEFINER` el propietario efectivo determina privilegios: cualquier rehearsal debe verificar propietario `postgres`, `prosecdef=true` y el `proconfig/search_path` indicado, sin crear/elevar roles ni cambiar propiedades persistentes.
- ACL explícita observada (`...sql:9039-9044`, repetición idéntica `9069-9070`):
  - `PUBLIC EXECUTE` únicamente en `guard_saas_reconciliation_result_insert()` y `guard_saas_webhook_requeue()`.
  - `has_location_access` y `has_organization_access`: `EXECUTE` a `authenticated` y `service_role`; no hay grant a `anon`.
  - Las otras 12 rutinas quedan owner-only tras la normalización del snapshot.
- Los dos grants a `PUBLIC` son de funciones `RETURNS trigger`, invoker y ligadas a triggers concretos (`...sql:5755-5758,5992-5995,7251,7257`). No las convierte en funciones invocables directamente con `SELECT`; su grant debe conservarse únicamente si una prueba del replay confirma que la forma y bindings siguen siendo trigger-only y los roles sin privilegio de tabla no pueden crear triggers. No extenderlo a otras rutinas.
- El helper `authenticated` requiere `USAGE` en `zaltyko_domain_private` y `EXECUTE` solo en los dos helpers; `service_role` tiene los mismos grants de schema/execute en la captura (`...sql:8463-8466,9041-9044`). `anon` no tiene `USAGE` ahí. El permiso de schema no reemplaza los grants/RLS de las tablas que leen las políticas.

### ACL por defecto

- Defaults de schema de la captura: para objetos futuros creados como `postgres` en `zaltyko`, `service_role` recibe `SELECT, UPDATE, USAGE` sobre secuencias y `DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE` sobre tablas (`...sql:420-421`). No hay `ALTER DEFAULT PRIVILEGES` de schema `zaltyko_domain_private`; no inventarlo.
- El DO de normalización de defaults empieza en `...sql:366-398` y recorre `public`, ambos schemas canónicos y `zaltyko_private`, para `postgres` y `supabase_admin`. **No copiar ese bucle a un paquete aditivo**: afecta defaults de otras áreas y depende de roles fuente. Las líneas 399-419 son defaults de `public`, fuera de alcance.
- El DO de ACL de objetos en `...sql:8470-8519` revoca privilegios globalmente en los cuatro schemas, seguido por los grants capturados. Es válido solo en el baseline vacío/cerrado; no es una migración incremental ni debe usarse para limpiar schemas existentes.
- DDL PostgreSQL otorga por defecto EXECUTE a `PUBLIC` en nuevas funciones. El rehearsal debe aplicar/medir el reset acotado **solo después de confirmar que los dos schemas son nuevos y no contienen objetos**, y afirmar el ACL efectivo exacto del inventario. No usar un REVOKE de todos los schemas de la base ni confiar en un grant/revoke implícito.

## Gates verificables para aceptar un ensayo de replay

Todos son requisitos del ensayo desechable; ninguno autoriza aplicar esto sobre una base existente:

1. **Destino aislado y vacío:** runner CI desechable, Postgres/Supabase PG17 compatible, host loopback validado; ningún secret/URL remoto de DB. Confirmar que `zaltyko` y `zaltyko_domain_private` están ausentes o sin relaciones, rutinas ni tipos de aplicación; abortar si tienen contenido. No tocar ni resetear `public`, `zaltyko_private` ni extensiones. Dejar que el guard del snapshot confirme el marcador local y el estado vacío antes del DDL (`...sql:13-49`).
2. **Inventario exacto:** afirmar las 16 rutinas, 4 `SECURITY DEFINER`, propietarios y rutas de búsqueda listados arriba; afirmar que todos los triggers esperados siguen ligados al nombre y tabla/evento de la captura (`...sql:7233-7265`). Fallar si aparece rutina nueva, SQL dinámico, dependencia externa no enumerada, `public`, `zaltyko_private`, owner distinto o `search_path` cambiado.
3. **ACL efectiva y no expansión:** verificar `aclexplode(proacl)`, schema USAGE y privilegios por rol: solo 2 PUBLIC grants a funciones trigger-only, solo los 2 helpers a `authenticated/service_role`, cero execute de helpers a `anon`, demás 12 owner-only; comparar grants de tablas/columnas/RLS por inventario, no usar “GRANT ALL”. Verificar defaults específicos descritos arriba y que no cambió ningún default global ni de `public`.
4. **Comportamiento de RLS/tenant:** ejecutar el fixture sintético autorizado `scripts/ci/sandbox-tenant-isolation.sql` únicamente dentro del runner local desechable. Debe probar acceso positivo del tenant correcto y denegaciones cruzadas de organización/sede bajo `authenticated`, además de no acceso `anon`. La existencia de policy DDL no prueba efectividad ACL/RLS.
5. **Integridad del ensayo:** comprobar DDL y ACL dentro de la transacción de rehearsal, conservar `ROLLBACK`, verificar después que las dos schemas están nuevamente vacías/ausentes y que ningún estado fuera de ellas cambió. Registrar SHA del snapshot, manifest, SQL propuesto y artefactos; describirlo como replay en blanco, no historial migratorio recuperado ni aprobación de producción.
6. **Siguiente paso separado:** cualquier preparación de aplicación futura exige comparar un diff independiente contra el catálogo destino real, revisar compatibilidad/orden/owners/ACL/permisos, prueba aditiva de migración e instrucciones humanas específicas. Este documento y el replay no aprueban consultas o escrituras en producción.

## Fuente e importancia

- Fuente primaria: snapshot de esquema sandbox identificado por SHA-256 `fd1bf2597b0dfd40dc6db824fa24773461f2776fa2ed7c994649be534c6a4b36` y su manifiesto `supabase/schema-snapshot-manifest.json`.
- Importancia: `SECURITY DEFINER`, propietario y `search_path` son una sola frontera de seguridad; el reset global de ACLs/defaults podría alterar objetos no relacionados si se reusara fuera del guard de base vacía. La verificación aquí es estática y la efectividad runtime sigue **NO VERIFICADA**.
- Siguiente paso: trasladar estos asserts al rehearsal de CI separado; revisar el reporte resultante y sus hashes. No aplicar ni transformar el snapshot en migración de producción como parte de ese paso.
