# Prerrequisitos de plataforma para la propuesta SQL

## Hallazgos

Lectura de catálogo del 25-10-2026, proyecto productivo identificado por la URL
pública de su configuración: `jegxfahsvugilbthbked`, distinto del sandbox
`aeeootdmuiqkfeernskw`. Transacción `BEGIN READ ONLY`, timeout de cinco segundos
y `ROLLBACK`; `transaction_read_only=on` confirmado en la respuesta.

- `auth.users.id` existe, es UUID y no admite nulos; la tabla tiene clave primaria.
  Esta consulta no demuestra que dicha clave primaria sea exclusivamente `id`.
- `auth.uid()` devuelve UUID y `auth.jwt()` JSONB; ambas son SECURITY INVOKER.
- `extensions.gen_random_uuid()` devuelve UUID y es SECURITY INVOKER.
- Existen los roles `anon`, `authenticated`, `postgres` y `service_role`.
- El corte previo confirma 139 tablas públicas y ausencia de `zaltyko` y
  `zaltyko_domain_private`; `btree_gist` no está instalado.

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

Generar una propuesta AST de los dos namespaces nuevos, excluir el ledger E2E,
conservar los objetos legacy y revisar cuerpos de funciones/permisos. Validar
remotamente contra PostgreSQL aislado con objetos legacy presentes. Aplicar SQL
productivo continúa pendiente de un diff exacto revisado y autorización separada.
