# Destino remoto — metadatos del 15 de octubre

## Alcance y autorización

El usuario autorizó consultar y tocar Sandbox/producción cuando sea necesario para cerrar la validación. Esta pasada se limita a listar proyectos y consultar `pg_catalog.pg_class`/`pg_namespace`: sin filas de negocio, Auth, PII, exportaciones, DDL ni escrituras. No se ha autorizado aquí un despliegue, merge o una operación irreversible concreta.

## Observación

| Proyecto | Esquema | Tablas ordinarias | Con RLS habilitada |
| --- | --- | ---: | ---: |
| Zaltyko (`jegxfahsvugilbthbked`) | public | 139 | 139 |
| Zaltyko E2E Sandbox (`aeeootdmuiqkfeernskw`) | public | 138 | 138 |
| Zaltyko E2E Sandbox | zaltyko | 80 | 80 |

La consulta no devuelve tablas ordinarias del esquema `zaltyko` en el proyecto Zaltyko. No demuestra que el namespace no exista ni compara todavía columnas, restricciones o funciones. Ambos proyectos figuraban ACTIVE_HEALTHY en la API de administración; esto no prueba readiness funcional.

## Qué no se concluye

- RLS habilitada no demuestra políticas correctas ni aislamiento efectivo.
- El nombre Sandbox no acredita datos sintéticos ni permiso para usar filas existentes como fixtures.
- Los conteos no demuestran compatibilidad del candidato ni sustituyen la revisión de migraciones y recuperación.

## Siguiente paso

Backend prepara contrato local mínimo del candidato `5001651c` y consultas de catálogo de solo lectura. Comparar después tablas/columnas/constraints/funciones requeridas; elaborar plan de aplicación y recuperación antes de ejecutar DDL. No crear recursos de pago ni exportar datos personales.

## Ampliación observada: namespaces, extensiones y forma de tablas

Main revisó Backend `59b19e0a`; Frontend72 GO como artefacto estático, no como validador SQL genérico. Consultas derivadas de los SELECT 1/2/10 y 3/4/5 del archivo revisado, envueltas en transacciones READ ONLY y statement_timeout10s. Inventarios 3/4/5 filtrados a ocho nombres fijos del contrato; no se ejecutaron los diez SELECT completos. Se conserva únicamente salida estructural en `remote-schema-catalog-2026-10-15.json`.

- Producción: namespaces `zaltyko` y `zaltyko_domain_private` **no existen**. `auth`, `public` y legacy `zaltyko_private` sí existen. No es un destino preparado para las rutas Owner nuevas.
- Sandbox: namespaces nuevos sí existen, pero faltan las tres tablas canónicas de consentimiento Owner y las dos mensuales (`price_plan_class_template_coverage`, `invoice_line_enrollments`). `invoice_lines` tiene 13 columnas y no tiene `location_id` ni `athlete_id`. No se inspeccionaron filas.
- Ambos: `btree_gist` ausente; `pgcrypto` 1.3 en extensions. El SQL mensual requiere btree_gist para exclusión GiST sobre UUID/intervalo de fechas. La estructura actual no satisface ese contrato. Esto no prueba qué migraciones se ejecutaron ni autoriza reconciliar su historial.
- El rol efectivo de la herramienta tiene BYPASSRLS, no superuser. Su path resuelto incluye public, no zaltyko ni auth; otros esquemas se redactan. No inferir rol, grants ni search_path de la conexión de la aplicación con estos valores.
- Sandbox: inventario de relaciones total246 frente al límite400; no hubo truncamiento de ese inventario. Las tres relaciones objetivo existentes (organizations, enrollments, invoice_lines) tienen RLS y FORCE RLS, sin acreditar semántica o aislamiento efectivo.

Contraste local Backend71: las 16 migraciones base declaran80 tablas; consentimiento añade3 y mensual añade2, con extensión solo en el último delta. La coincidencia con80tablas Sandbox es compatible con esa explicación, pero sigue sin identificar historial/checksums aplicados.

No se crearon extensiones/esquemas/tablas ni se cambiaron grants, datos, credenciales o despliegues. Backup recuperable, historial aplicado, privilegios de aplicación y plan de activación siguen NO VERIFICADOS. El nombre Sandbox no acredita ausencia de datos reales.

Changelog del proveedor consultado: [cambio PostgreSQL15.19/17.11](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes). Su aviso btree_gist afecta índices sobre float/NaN; el nuevo contrato usa UUID/daterange. No se deduce necesidad de reindex ni se ejecutan las consultas de filas/DDL sugeridas por el proveedor. Versiones efectivas y compatibilidad de restauración requieren verificación separada.
