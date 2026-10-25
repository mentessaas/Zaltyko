# Candidatos SQL pendientes de autorización

Estos archivos están fuera de `supabase/migrations` deliberadamente. No forman
parte del historial aplicable, no se recorren automáticamente y no recuperan
migraciones perdidas. No ejecutar el directorio ni aplicar el snapshot sandbox
completo sobre una base existente.

## Candidato de instalación canónica

La CLI Supabase 2.84.2 creó el nombre
`20261025202902_canonical_domain_installation_candidate.sql` mediante
`supabase migration new canonical_domain_installation_candidate`. Se apartó
inmediatamente el archivo vacío a esta carpeta, antes de añadir cualquier SQL.
Su contenido final se generará en CI a partir del AST y el snapshot fijados;
no se editará mediante recortes de texto del dump.

El alcance propuesto es la extensión `btree_gist`1.7 y los dos namespaces
canónicos ausentes, con sus objetos, propietarios y permisos revisados. No
incluye filas, roles, Auth, ledger E2E ni alteraciones de public/legacy. La
normalización de defaults se limita al creador `postgres`: el rol productivo
no es superusuario ni miembro de `supabase_admin`, y no debe alterar defaults
de ese administrador.

El archivo candidato termina en COMMIT y requiere un modo externo explícito.
La CI solo permite `ci` con el nombre exacto de la base desechable; el modo
productivo propuesto queda bloqueado sin marcadores externos específicos. Esos
marcadores no prueban por sí solos la identidad de una conexión ni constituyen
autorización humana. No configurarlos ni ejecutar el modo productivo todavía.

## Criterio de revisión y aplicación futura

1. Verificar el hash exacto del SQL generado, su manifiesto y la procedencia.
2. Exigir instalación del mismo archivo en PostgreSQL desechable con
   `postgres` no-superusuario, `BYPASSRLS`, permisos CREATE y sin membresía de
   `supabase_admin`; comprobar ACL/RLS, aislamiento y denegaciones.
3. Confirmar que el modo ausente y la reinstalación se rechazan sin efectos
   parciales, preservando los objetos legacy de control.
4. Revalidar el catálogo destino inmediatamente antes de cualquier aplicación.
   Si existen esquemas/objetos objetivo, no ocultarlos con IF NOT EXISTS:
   preparar otro diff.
5. Obtener autorización humana separada sobre el archivo/hash, el destino y
   la instalación de extensión. Solo entonces definir el procedimiento de
   aplicación/versionado y su verificación posterior. No inferirlo de CI verde.

La prueba de base desechable no acredita una instalación Supabase completa,
PostgREST, un usuario servidor productivo distinto, migración de datos legacy,
Stripe Live ni publicación del MVP. No contiene procedimientos de rollback
destructivo de datos. El ensayo natural de impago permanece independiente.

El bootstrap de CI es un superusuario distinto de `postgres`, para probar la
instalación trusted sin conceder SUPERUSER al propietario del candidato. No
se afirma equivalencia del propietario de cada objeto de extensión con el
bootstrap productivo. PostgreSQL ejecuta los scripts trusted como bootstrap,
aunque la extensión pertenezca al llamador: [documentación PostgreSQL17](https://www.postgresql.org/docs/17/sql-createextension.html).
