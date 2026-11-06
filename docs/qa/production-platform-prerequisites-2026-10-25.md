# Prerrequisitos de plataforma para la propuesta SQL

## Hallazgos

Lectura de catálogo del 25-10-2026, proyecto productivo identificado por la URL
pública de su configuración: `jegxfahsvugilbthbked`, distinto del sandbox
`aeeootdmuiqkfeernskw`. Transacción `BEGIN READ ONLY`, timeout de cinco segundos
y `ROLLBACK`; `transaction_read_only=on` confirmado en la respuesta.

- `auth.users.id` existe, es UUID y no admite nulos. La lectura posterior de
  `pg_constraint.conkey`, expandida con orden de columnas y `pg_attribute`,
  confirmó la clave primaria exactamente `{id}`.
- `auth.uid()` devuelve UUID y `auth.jwt()` JSONB; ambas son SECURITY INVOKER.
- `extensions.gen_random_uuid()` devuelve UUID y es SECURITY INVOKER.
- Existen los roles `anon`, `authenticated`, `postgres` y `service_role`.
- El corte previo confirma 139 tablas públicas y ausencia de `zaltyko` y
  `zaltyko_domain_private`; `btree_gist` no está instalado.
- `pg_available_extensions` confirma `btree_gist` 1.7 disponible sin instalar;
  `pgcrypto` 1.3 y `uuid-ossp` 1.1 ya instalados. Disponibilidad no aprueba
  instalación ni demuestra que el rol futuro pueda ejecutarla.
- No hay filas de `pg_default_acl` para `postgres`/`supabase_admin` globales
  ni en los dos namespaces canónicos ausentes. No se consultaron ACL de datos
  personales ni se alteraron defaults.
- `postgres` tiene BYPASSRLS, CREATEDB y CREATEROLE; no es superusuario ni
  miembro de `supabase_admin`, rol que sí existe. Tiene CREATE en la base y
  CREATE/USAGE en `extensions`, USAGE de `auth`, REFERENCES de `auth.users` y
  EXECUTE de `auth.uid()`/`auth.jwt()`. Son privilegios de ese rol en el corte,
  no de cualquier credencial futura de aplicación.
- El control de `btree_gist`1.7 declara `trusted=true`, `relocatable=true` y
  `superuser=true`. Se preservan los tres valores del catálogo; todavía no se
  instaló en producción. El candidato debe probarse sin SUPERUSER y no intentar
  modificar defaults de `supabase_admin`.

## Fuente

Supabase MCP `execute_sql`, únicamente `pg_catalog` y ajustes locales de la
transacción. No se consultaron filas de personas, credenciales ni secretos;
no se ejecutaron DDL, DML, grants o cambios de configuración persistentes.

## Importancia

Estos prerrequisitos parciales permiten redactar una propuesta aditiva sin
recrear Auth. No acreditan permisos efectivos de la aplicación, equivalencia
funcional, compatibilidad de datos legacy, aprobación de extensión ni preparación
de producción. La ausencia de namespace no autoriza aplicar un baseline completo.

## Siguiente paso

La propuesta AST y el rehearsal PostgreSQL desechable 40229946414 ya pasaron;
ver canonical-domain-proposal-design-2026-10-25.md. Falta convertir ese estado
deseado en un paquete específico de revisión de instalación, sin reutilizar
los guards de CI como si acreditaran el destino productivo. Aplicar SQL sigue
pendiente de un diff exacto revisado y autorización separada.
