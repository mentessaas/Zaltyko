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

**Verificación de esta tarea:** no se ejecutaron el generador, `pglast`, SQL, tests, build, servicios, consultas remotas ni despliegues. El resultado de AST parsing/round-trip está **PENDIENTE DE CI**. El artefacto no fue generado, revisado ni aplicado en esta tarea.

**Vault:** el coordinador registró la preparación y sus límites en
`vault/06-Roadmap-y-Tareas/Changelog interno.md`. La lectura de prerrequisitos
productivos realizada por el coordinador se documenta por separado; no forma
parte de la verificación estática del generador descrita arriba.
