# Instalación canónica — paquete de revisión, no aplicación

## Hallazgos

El estado deseado del snapshot sandbox puede reproducirse en PostgreSQL17.6
desechable con propietarios, ACL, aislamiento sintético y ROLLBACK, según
CI40229946414. Producción no es una base vacía: conserva 139 tablas públicas
y `zaltyko_private`; ambos namespaces canónicos estaban ausentes en el corte
de catálogo del 25 de octubre. No se ha aplicado DDL ni DML productivo.

El delta de revisión previsto queda limitado a:

| Componente | Estado observado | Operación propuesta |
|---|---|---|
| `btree_gist` | 1.7 disponible, no instalado | Instalar 1.7 en `extensions`, sujeto a revisión y autorización |
| `zaltyko` | Ausente | Crear sus 92 tablas, 61 enums, restricciones, índices, policies, rutinas y triggers del inventario fijado |
| `zaltyko_domain_private` | Ausente | Crear cinco helpers canónicos; excluir ledger E2E y sus objetos ligados |
| Propiedad/ACL | Objetos nuevos | Conservar owner `postgres`, grants explícitos y dos defaults acotados; sin reset global/public/legacy |
| Auth/UUID | Prerrequisitos presentes | Referenciar funciones y PK existentes; no recrear Auth, roles ni usuarios |
| Filas y suscripciones | Fuera de alcance | Sin seeds, backfill, fixtures, compras ni cambios de suscripción |

El paquete de revisión debe terminar en ROLLBACK y abortar incondicionalmente
antes de cualquier DDL con `REVIEW_ONLY_INSTALLATION_NOT_APPROVED`. Retirar ese
bloqueo no es parte de su generación: exigiría un nuevo diff final revisado,
archivo de migración con procedencia propia y autorización humana de aplicación.
No usar el nombre del proyecto en un comentario como verificación de conexión.

## Fuente

- Snapshot `fd1bf2597b0dfd40dc6db824fa24773461f2776fa2ed7c994649be534c6a4b36`;
  su manifiesto declara que no recupera historial migratorio.
- Propuesta DDL `3d8ad235ed8f73989114a262c64acf6071ca6870e4082ebb04c2a461f544e8ea`;
  rehearsal `d0c888a0367ace20c555ff2ea09383b334153cf3016f1e837cd9a6e38b9f23f4`.
- Catálogo productivo READ ONLY del proyecto `jegxfahsvugilbthbked`, distinto
  de sandbox `aeeootdmuiqkfeernskw`: PK Auth exactamente `{id}`, versiones de
  extensiones y ausencia de defaults globales relevantes confirmadas, sin filas
  de aplicación ni secretos. Ver production-platform-prerequisites-2026-10-25.md.

## Importancia

La instalación de objetos nuevos no migra datos legacy ni valida la contratación
Live. El ensayo aislado tampoco acredita permisos del usuario real de conexión,
PostgREST, Auth alojado, una actualización sobre datos existentes o todos los
permisos de cada objeto. El estado del catálogo debe revalidarse justo antes
de cualquier aplicación aprobada; si aparece un namespace objetivo, abortar y
revisar un diff nuevo en lugar de usar IF NOT EXISTS para ocultar divergencias.

## Siguiente paso

Generar el SQL exacto de revisión y su manifiesto en CI sin secretos, conservando
los artefactos anteriores y sus hashes. Revisarlo independientemente. Después,
solo con autorización específica, preparar el archivo final de aplicación y
su validación de compatibilidad. Ningún resultado de este documento autoriza
SQL persistente, ledger inventado, cambios de proveedores o promoción pública.
