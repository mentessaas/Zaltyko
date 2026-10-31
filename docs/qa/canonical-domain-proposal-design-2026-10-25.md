# Generador AST de propuesta del dominio canónico

## Hallazgos

- Se añadió `scripts/ci/prepare-canonical-domain-proposal.py`, un generador de artefactos de revisión. Solo acepta el snapshot aprobado y su manifiesto con SHA-256 fijados; comprueba el proyecto de origen, PostgreSQL 17.6, ausencia declarada de filas/secretos e historial no recuperado.
- El parser está fijado en `pglast==7.21`, cuya rama v7 sigue el parser PostgreSQL 17. El proceso exige `GITHUB_ACTIONS=true`, `RUNNER_OS=Linux`, identidad de commit y ausencia de variables de conexión/credenciales. El CLI exacto, previsto para el runner remoto aislado, es:

  ```sh
  python3 scripts/ci/prepare-canonical-domain-proposal.py \
    --snapshot supabase/schema-snapshots/20261024172153_sandbox_schema_snapshot_baseline.sql \
    --manifest supabase/schema-snapshot-manifest.json \
    --output artifacts/canonical-domain-proposal.sql \
    --manifest-output artifacts/canonical-domain-proposal.json
  ```

- La selección se hace por tipos/nodos AST y nombres cualificados, no por regex, corte de texto ni concatenación de migraciones. Cada sentencia incluida se vuelve a parsear y comparar por AST antes de escribir artefactos. Los nodos no clasificados, bloques `DO` desconocidos, cambios de hash, destino/versión distintos o parser incompatible abortan antes de producir archivos.
- El alcance selecciona únicamente definiciones con objeto principal en `zaltyko` o `zaltyko_domain_private`; mantiene orden del snapshot y excluye el ledger `zaltyko_domain_private.e2e_schema_migrations` y sus sentencias ligadas. No emite DDL de `public`, `zaltyko_private`, Auth, extensiones ni vault.
- La salida SQL es un **borrador no aplicable** con `BEGIN`, límites locales y `ROLLBACK` final. Su manifiesto declara `applyReady: false`; inventaría objetos/renglones de procedencia, exclusiones, dependencias cualificadas visibles en AST y extensiones que no se emiten. El artefacto no instala nada ni conecta a una base.

## Fuente

- Snapshot `supabase/schema-snapshots/20261024172153_sandbox_schema_snapshot_baseline.sql`, SHA-256 `fd1bf2597b0dfd40dc6db824fa24773461f2776fa2ed7c994649be534c6a4b36`; manifiesto `supabase/schema-snapshot-manifest.json`, SHA-256 `80c65acbb72345925b932fba2032259c6f7138a7c85da14c2babf6a23e34c6cc`.
- Documentación oficial de [`pglast` v7 introduction](https://pglast.readthedocs.io/en/v7/introduction.html), [API del parser v7](https://pglast.readthedocs.io/en/v7/parser.html) y [`RawStream`](https://pglast.readthedocs.io/en/v7/stream.html). La API documenta `parse_sql()`, `get_postgresql_version()` y serialización del AST; la rama v7 apunta a PostgreSQL 17.
- El workflow separado `.github/workflows/canonical-domain-proposal.yml` instala el pin en Python 3.12 y ejecuta el proceso dentro de un namespace de red sin ruta por defecto, sin secretos, conexión o comando de aplicación SQL. El workflow produce artefactos para revisión.

## Importancia

El artefacto permite revisar un delta derivado del estado deseado sin presentar el snapshot como historia recuperada ni alterar el esquema legacy. La salida no es un instalador idempotente: requiere comparar objeto por objeto con el catálogo vigente y aprobar un diff nuevo.

Los permisos y la propiedad son un bloqueo antes de cualquier aplicación. El generador omite `GRANT`/`REVOKE`, `ALTER OWNER`, `ALTER DEFAULT PRIVILEGES` y bloques de normalización ACL. PostgreSQL concede `EXECUTE` a `PUBLIC` por defecto para funciones nuevas; por tanto, las rutinas del borrador no tienen una ACL aprobada y no deben aplicarse hasta definir y revisar sus permisos. Toda rutina queda marcada para inspección manual: el AST SQL exterior no demuestra efectos de su cuerpo, dependencias dinámicas ni seguridad completa de `SECURITY DEFINER`.

El manifiesto enumera referencias externas cualificadas que sí aparecen en AST, pero no puede inferir llamadas dinámicas, dependencias dentro de cuerpos SQL/PLpgSQL opacos, resolución de nombres no cualificados, permisos efectivos ni compatibilidad de tipos/funciones de `public`, `auth` y `extensions`. Las extensiones son prerequisitos identificados, no se crean ni actualizan. La ausencia de una referencia en el manifiesto no prueba ausencia de dependencia.

## Siguiente paso

Revisar el artefacto de salida en CI remota; comprobar cobertura y orden contra el snapshot; comparar cada objeto y dependencia contra el catálogo vigente mediante el preflight de solo lectura autorizado; diseñar por separado ACL/owners/default privileges; redactar y revisar un DDL nuevo versionado con hashes propios y precondiciones. Ningún paso de este generador autoriza aplicar SQL ni reemplazar el ledger existente.

## Rehearsal efímero de ACL y ownership

- La opción nueva `--rehearsal-output artifacts/canonical-domain-rehearsal.sql` produce un segundo artefacto y añade `sqlRehearsal` al JSON existente, sin modificar el campo ni los bytes del borrador `sqlProposal`. El runner debe pasar la opción expresamente y publicar ambos SQL junto al mismo manifiesto.
- El segundo SQL es únicamente para una base desechable PostgreSQL 17.6 llamada `zaltyko_canonical_rehearsal_ci`. Antes de cualquier DDL comprueba el nombre exacto de base, el GUC externo `app.canonical_domain_rehearsal=ci-explicit`, que ambos schemas no existan y que existan `postgres`, `anon`, `authenticated` y `service_role`. El llamador establece el marcador mediante su entorno de conexión; el SQL no se autoriza a sí mismo. Después de la comprobación fija el GUC local y asume `postgres`; no crea roles ni instala extensiones.
- Crea ambos schemas sin `IF NOT EXISTS`, limpia ACL predeterminadas únicamente dentro de esos schemas, reproduce el DDL seleccionado, difiere los `ALTER OWNER` (incluidos los `ALTER TABLE ... OWNER`) hasta que existan los objetos, normaliza ACL de schemas/tablas/secuencias/rutinas/enums dentro del alcance y reaplica las sentencias de grants/default grants del snapshot seleccionadas por AST. Grants exactamente repetidos se deduplican, conservando las líneas fuente en el manifiesto. Los grants explícitos a `PUBLIC` observados quedan identificados; no se consideran una recomendación de seguridad.
- La limpieza de ACL predeterminadas está limitada a schemas objetivo y creadores `postgres` y `supabase_admin` cuando este último existe. La limpieza de objetos revoca ACL de roles (excepto el owner `postgres`) y `PUBLIC` dentro de los dos schemas; las funciones pierden el `PUBLIC EXECUTE` implícito antes de restaurar solo los grants explícitos del snapshot. Se normaliza `USAGE` de los enums seleccionados, pero no ACL de los tipos compuestos generados por tablas, siguiendo la distinción de defaults de plataforma del snapshot. Ningún bloque `DO` de normalización ACL del snapshot ni DDL de `public`, `zaltyko_private` o el ledger E2E se copia al rehearsal.
- El SQL termina en `ROLLBACK`; el manifiesto informa `applyReady: false`, propósito `ephemeral-postgresql-rehearsal-only`, hash y tamaño exactos. Aunque el replay llegue a completarse en CI efímera, eso no convierte el archivo en migración aplicable. Owners/grants, rutinas `SECURITY DEFINER`, cuerpos de funciones y sus efectos siguen necesitando revisión independiente.
- El generador aún no se ha ejecutado con `--rehearsal-output` en CI en esta revisión. Sintaxis/replay de PostgreSQL, disponibilidad de roles/extensiones en el runner y ACL efectivas permanecen pendientes del job efímero. No se ejecutó parser, SQL, tests, build, conexión ni servicio local/remoto en esta modificación.

**Verificación de esta tarea:** no se ejecutaron el generador, `pglast`, SQL, tests, build, servicios, consultas remotas ni despliegues. El resultado de AST parsing/round-trip está **PENDIENTE DE CI**. El artefacto no fue generado, revisado ni aplicado en esta tarea.

**Vault:** el coordinador registró la preparación y sus límites en
`vault/06-Roadmap-y-Tareas/Changelog interno.md`. La lectura de prerrequisitos
productivos realizada por el coordinador se documenta por separado; no forma
parte de la verificación estática del generador descrita arriba.

## Resultado remoto posterior del coordinador

### Ensayo aislado completado

CI [40229946414](https://github.com/mentessaas/Zaltyko/actions/runs/40229946414)
SUCCESS en `edd3bf75ef6c197a480549958841f6b507ded381`, 25 de octubre,
20:16:41 UTC. Generación AST y rehearsal PostgreSQL17.6 desechable aprobados:
92 tablas con RLS forzada, 64 policies, 16 rutinas/cuatro definidores,
61 enums, ACL de rutinas/esquemas/tablas representativas y los dos defaults
acotados. Fixture de dos academias y tres sedes: lecturas permitidas/denegadas,
INSERT/UPDATE de cliente rechazados sin filas parciales. Se comprobó ROLLBACK,
preservación de canaries public/legacy y rechazo de esquema existente antes
del DDL del artefacto. Auth es un stand-in SQL, no un login Supabase real.

SQL rehearsal SHA-256:
`d0c888a0367ace20c555ff2ea09383b334153cf3016f1e837cd9a6e38b9f23f4`.
Fixture SHA-256:
`04dd16835406198d3ebb12f3396674bbc279e5dcd7500e5c30fefb24a2bf6d4c`.
Artefactos descargados y hashes comprobados sin ejecutarlos en el Mac.
El SQL de propuesta conserva SHA `3d8ad235ed8f73989114a262c64acf6071ca6870e4082ebb04c2a461f544e8ea`.

Fallos previos del runner conservados: 40229718696 rechazó un paréntesis
faltante en la aserción de asociación de triggers; 40229812250 rechazó códigos
sintéticos de sede en mayúsculas mediante locations_code_check. Se cerró la
subconsulta y se pasaron únicamente los códigos fixture a minúsculas, con nuevo
pin de hash. No se retiraron restricciones ni aserciones.

Esto verifica un ensayo transaccional en blanco con plataforma sintética.
No verifica un upgrade sobre datos existentes, la plataforma Supabase completa,
todos los permisos de cada objeto ni un recorrido autenticado de la entrega.
No es historial migratorio recuperado ni autorización de aplicación productiva;
`applyReady=false` y ROLLBACK permanecen intactos. El diff productivo revisado
y su autorización separada siguen pendientes.

### Generación previa sin ejecución SQL

CI [40228139489](https://github.com/mentessaas/Zaltyko/actions/runs/40228139489)
SUCCESS en `e6968c3e921ed310f706602a247639381c448f72`. Se generaron 1394
sentencias con equivalencia AST comprobada individualmente: dos esquemas,
92 tablas, 61 enums, 851 restricciones, 107 índices, 64 policies, 16 rutinas,
17 triggers y 184 alteraciones de tabla adicionales. Cuatro rutinas se
identifican como SECURITY DEFINER y siguen pendientes de revisión de cuerpo/ACL.

SQL: 348043 bytes, SHA-256
`3d8ad235ed8f73989114a262c64acf6071ca6870e4082ebb04c2a461f544e8ea`,
verificado tras descargar el artefacto. `applyReady=false`, ROLLBACK final;
no se ejecutó SQL contra PostgreSQL, sandbox ni producción. Esto verifica
generación y procedencia; no dependencias completas, permisos ni replay.

Fallos previos conservados: YAML de instalación rechazado antes de ejecutar;
posterior rechazo del round-trip al reutilizar el buffer RawStream. Corregidos
con bloque YAML y serializador nuevo por sentencia. La clasificación posterior
de restricciones y opciones Boolean se verificó mediante conteos fijos del
snapshot y detección exacta de cuatro definidores, sin retirar controles.

## Artefacto de revisión de instalación exacta

- La opción opcional `--installation-review-output artifacts/canonical-domain-installation-review.sql` añade `installationReview` al mismo manifiesto JSON, con ruta, SHA-256, tamaño, `applyReady: false` y el proyecto esperado `jegxfahsvugilbthbked` como metadato solamente. No cambia el borrador `sqlProposal` ni el artefacto `sqlRehearsal` ya generado por sus opciones existentes.
- El runner CI debe solicitarla de manera explícita junto a `--output artifacts/canonical-domain-proposal.sql`, `--manifest-output artifacts/canonical-domain-proposal.json` y, cuando corresponda, `--rehearsal-output artifacts/canonical-domain-rehearsal.sql`; el generador no activa esta salida por defecto.
- La selección y clasificación de DDL, propietarios, ACL explícitas y ACL predeterminadas se reutiliza desde los nodos AST clasificados. Aunque no se solicite `--rehearsal-output`, esta opción obliga a clasificar esos nodos y falla cerrada si no puede determinar su ámbito; no recorta SQL ni reconstruye sentencias por expresiones regulares.
- El SQL de instalación es deliberadamente inerte: comienza una transacción, establece límites locales y ejecuta un `RAISE EXCEPTION 'REVIEW_ONLY_INSTALLATION_NOT_APPROVED'` incondicional antes de cualquier DDL. Termina textualmente en `ROLLBACK`. Detrás del guard incluye metadatos de precondición, una sentencia exacta `CREATE EXTENSION btree_gist WITH SCHEMA extensions VERSION '1.7'` sin `IF NOT EXISTS`, y `CREATE SCHEMA` sin `IF NOT EXISTS` para exactamente `zaltyko` y `zaltyko_domain_private`, seguido de los mismos objetos, owners, ACL y defaults clasificados. La instalación propuesta de la extensión es contenido de revisión; el generador no ejecuta ni aplica nada.
- El artefacto no crea roles, objetos de Auth/plataforma, datos ni ledger E2E. `extensions` está fuera del alcance de objetos seleccionados, salvo la única sentencia explícita del prerequisito `btree_gist`; no se crea el esquema `extensions`. No incorpora DDL de `public`, `zaltyko_private`, otras extensiones ni datos. El conjunto de roles requeridos se comprueba como existente en el contenido detrás del guard; no se crean roles.
- El manifiesto registra hechos de catálogo proporcionados por una lectura remota de solo lectura fechada 2026-10-25, no una garantía persistente: cuatro roles requeridos, cero schemas canónicos presentes, 139 tablas `public`, esquema legacy presente, `auth.users` con PK `id`, `auth.uid()` de tipo `uuid`, `auth.jwt()` de tipo `jsonb`, `extensions.gen_random_uuid()` de tipo `uuid`, `pgcrypto` 1.3 y `uuid-ossp` 1.1 instaladas, `btree_gist` 1.7 disponible pero no instalado y cero ACL globales relevantes para `postgres`/`supabase_admin`. No afirma que exista un objeto `extensions.uuid`.
- Los cuerpos de rutinas tienen revisión estática anotada y la reconstrucción/rehearsal PostgreSQL 17 desechable tuvo éxito remoto en la ejecución 40229946414. Ninguno prueba compatibilidad productiva, aplicación, promoción ni autorización. La referencia de proyecto es solo metadato esperado y el snapshot procede de otro sandbox.
- Esta opción no da permiso para quitar el guard, ejecutar el archivo, crear una migración o conectarse a un proveedor. Cualquier futura migración debe ser un archivo/CLI propio, diff de instalación revisado contra el catálogo entonces vigente y autorización explícita separada. El estado de disponibilidad y de los prerequisitos debe volver a comprobarse antes de una decisión futura.

**Verificación de esta extensión:** el generador, el parser y el SQL no se ejecutaron localmente ni contra una base. El round-trip AST del artefacto de instalación queda pendiente de CI remota; esta edición solo habilita su generación y comprobación de parseo en el runner. El archivo de instalación no se ha generado ni aplicado en esta tarea.

## Candidato de instalación con guard de destino

- La opción `--migration-candidate-output artifacts/20261025202902_canonical_domain_installation_candidate.sql` solo acepta ese path/nombre exacto y añade `migrationCandidate` al manifiesto con `path`, `sha256`, `sizeBytes`, `applyReady: false`, `approvedForProduction: false` y procedencia del nombre generado por Supabase CLI. El CLI no modifica el archivo vacío fuera de `artifacts/` que se reservó para no incorporarlo al historial de migraciones aplicables.
- La salida utiliza los mismos arrays ya clasificados de DDL, owners, ACL y default ACL que la revisión de instalación, incluidos la extensión btree_gist 1.7 sin `IF NOT EXISTS`, exactamente dos schemas canónicos, y las exclusiones de roles/Auth/datos/ledger E2E. La propuesta, rehearsal y artefacto hard-stop no se reescriben por esta opción.
- El candidato usa `BEGIN`/`COMMIT`, pero primero exige el GUC externo `app.canonical_installation_mode`; si falta o no coincide, falla antes de DDL con `canonical installation mode is not approved`. Solo acepta `ci` con `current_database() = 'zaltyko_canonical_rehearsal_ci'`, o `production-reviewed-20261025202902` acompañado del GUC `app.canonical_installation_target_project_ref = 'jegxfahsvugilbthbked'`. Ese GUC es una atestación de sesión, no prueba la identidad de la URL/conexión; cualquier ejecución productiva futura exige una comprobación independiente y autorizada del destino por el runner.
- Antes de DDL, el guard verifica que ambos schemas estén ausentes (colisión: `canonical installation target schema already exists; refusing candidate`), PostgreSQL mayor 17, los roles existentes, que la sesión pueda asumir `postgres`, que btree_gist 1.7 esté disponible y que no esté ya instalada. Tras esas comprobaciones fija `SET LOCAL ROLE postgres`; no crea roles, objetos Auth/plataforma, datos ni ledger. Las condiciones CI/prod no autorizan por sí mismas una ejecución.
- La normalización de ACL predeterminadas del candidato se limita al creador `postgres` dentro de los dos schemas nuevos, coherente con `SET LOCAL ROLE postgres` y los default grants AST del snapshot. Una inspección productiva de solo lectura del 25-10 observó que `supabase_admin` existe, que `postgres` no puede asumirlo y no es superuser; por eso el candidato no intenta ejecutar `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin`, ni cambia defaults globales. Esta observación es puntual, no persistente ni una garantía de acceso futuro.
- Aunque incluye un modo de ensayo de CI transaccional con commit para permitir que el runner compruebe la instalación exacta, el manifiesto mantiene `applyReady: false` y `approvedForProduction: false`. Su salida/parseo o un replay en la base efímera no es aprobación ni permiso de despliegue o aplicación en producción. La futura revisión productiva necesita compatibilidad contra el catálogo vigente, prueba del runner de identidad del destino y autorización separada.

**Verificación de esta extensión:** no se ejecutaron el generador, parser, tests, SQL, base de datos, build ni instalación local/remota. El round-trip de AST y el plan de instalación exacta quedan pendientes del CI remoto que el coordinador configure; no se ha aplicado el candidato a ningún proyecto.
