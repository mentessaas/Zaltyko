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
