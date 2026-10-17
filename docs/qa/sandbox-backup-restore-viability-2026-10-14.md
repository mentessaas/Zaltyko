# Viabilidad de backup y restore del Sandbox — 14-10-2026

## Decisión

**No exportar ni iniciar un restore del Sandbox todavía.** Hay una vía lógica posible en el plan Free sin descargar datos al portátil, pero faltan un entorno de ejecución remoto autorizado, un destino seguro aprobado y una clasificación del contenido que permita definir qué datos se pueden copiar.

El estado de Main `3e764814` —pago, dashboard, tres navegadores y restore local PostgreSQL 17 PASS, según el handoff del 14-10-2026— se reconoce como evidencia del producto y del runner local. El restore local usa fixtures sintéticas y loopback; **no es una copia ni un ensayo de recuperación del proyecto remoto `aeeootdmuiqkfeernskw`**.

## Evidencia disponible y límites

- La lectura previa de metadatos de Supabase identificó el proyecto `Zaltyko E2E Sandbox` como `ACTIVE_HEALTHY`, PostgreSQL `17.6.1.147`, región `eu-north-1`; `get_organization` indicó plan `tier_free`. Corte observado el 14-10-2026. No se repitieron consultas durante esta actualización documental.
- La consulta previa de nombres y conteos de tablas (sin filas) mostró tablas pobladas en `public`, entre ellas `profiles` (8), `family_contacts` (265), `billing_events` (22) y `email_logs` (172). Estos conteos **no prueban que haya datos reales ni que sean sintéticos**. No se leyeron valores de filas ni se consultó Auth.
- Por tanto, el Sandbox **no está verificado como exclusivamente sintético**. Hasta que el responsable de datos confirme procedencia y alcance, `public` y cualquier tabla de dominio que contenga datos de personas deben tratarse como potencialmente personales.
- La guía oficial indica que el plan Free no permite descargar backups administrados; Supabase recomienda generar un dump con CLI y conservarlo fuera del proyecto. Los backups de base de datos no incluyen objetos de Storage. [Database Backups](https://supabase.com/docs/guides/platform/backups) y [Production Checklist](https://supabase.com/docs/guides/deployment/going-into-prod), consultadas el 14-10-2026.
- El runner restaurado en Main valida una base PostgreSQL local con fixtures; no establece recuperabilidad del Sandbox, RPO/RTO remoto ni paridad con el estado actual del proyecto. Referencia: [`synthetic-restore-runner-2026-10-14.md`](synthetic-restore-runner-2026-10-14.md).

## Alternativas evaluadas (sin ejecutar)

### A. Dump lógico selectivo en entorno remoto seguro

`supabase db dump` permite un respaldo lógico en plan Free. Por defecto produce esquema, sin filas; `--data-only` permite incluir datos y `--schema` acotar esquemas. Debe ejecutarse desde un runner remoto/efímero con credenciales inyectadas desde un gestor de secretos, transmitiendo el artefacto directamente a un destino cifrado, con control de acceso, ubicación, retención y borrado aprobados. No guardar el dump en el portátil ni en el checkout. [Referencia CLI `db dump`](https://supabase.com/docs/reference/cli/supabase-db-dump), consultada el 14-10-2026.

El CLI excluye esquemas gestionados como `auth` y `storage`, además de extensiones. Los objetos binarios de Storage requieren un respaldo separado. Por eso esta opción no constituye por sí sola una recuperación completa del proyecto.

### B. Limitarse al dominio greenfield afectado

Es posible estudiar un dump de solo esquema para `zaltyko` o para la porción de esquema relacionada con las migraciones #17/#18 del preflight. Eso evita copiar filas, pero solo reconstruye estructura y **no restaura el estado operativo**. Incluir datos de esas tablas tampoco puede considerarse libre de PII sin clasificar familias, perfiles, gimnastas, inscripciones, pagos y sus relaciones.

Una restauración sin Auth ni PII exigiría diseñar una selección cerrada de objetos, recorrer dependencias/foreign keys, generar fixtures sintéticas equivalentes y demostrar consistencia transaccional y funcional en un destino aislado. No hay evidencia actual de que ese subconjunto proporcione un restore fiel del Sandbox. Debe tratarse como prueba de esquema/fixtures sintéticas, no como backup recuperable de sus datos.

### C. Restore gestionado de Supabase

La opción oficial de restaurar a un proyecto nuevo usa backups físicos, requiere plan de pago y crea otro proyecto; la copia incluye los datos Auth. No satisface las condiciones actuales de no pagar y evitar Auth. [Restore to a new project](https://supabase.com/docs/guides/platform/clone-project), consultada el 14-10-2026.

## Bloqueos exactos antes de una operación

1. Responsable de datos confirma si el Sandbox es sintético; si no puede confirmarlo, aprueba explícitamente los esquemas/tablas y campos personales que podrían salir.
2. Seguridad/operaciones designa un runner remoto/efímero y un destino separado del portátil, con región aprobada, cifrado en tránsito y reposo, custodia de claves, permisos mínimos, retención, borrado y evidencia de checksum/restore.
3. Se aprueba la exclusión de Auth y Storage o se define por separado su tratamiento; el dump de PostgreSQL por sí solo no incluye los objetos de Storage.
4. Se acuerda si el objetivo es copia de esquema, backup lógico recuperable o fixture sintética. Para una restauración válida hay que probar el bundle y los datos incluidos en un entorno aislado compatible con PostgreSQL 17.
5. El operador autorizado inyecta las credenciales solo en ese runner. No se solicitan ni se registran en este cambio.

Hasta cerrar estos puntos, no hay destino seguro autorizado identificado. No ejecutar dumps, crear recursos, aplicar DDL/migraciones, pagar un plan ni iniciar runners.

## Alcance de esta nota

Actualización documental basada en metadatos y documentación oficial observados el 14-10-2026 y en el estado comunicado de Main. No se hicieron consultas nuevas a Supabase/Vercel, no se inspeccionaron filas ni Auth, no se exportaron datos, no se crearon recursos, no se ejecutaron runners ni se modificó el esquema remoto.
