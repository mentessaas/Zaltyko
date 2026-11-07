# QA de derechos de datos del núcleo — 2026-11-04

## Corte y límites

Revisión estática del worktree de main-bridge en HEAD `3e2ad57f`, rama `codex/mvp-main-bridge-20261025`. Los archivos nuevos de Product Discovery, el esquema candidato y la migración estaban sin seguimiento al corte; los cambios existentes de exportación se preservaron. Esta nota no acredita que el código se haya integrado o aplicado en un entorno.

No ejecuté tests, builds, SQL, servicios, CI ni consultas remotas. No edité la matriz de estado ni repetí la aceptación Owner del export. Leí estáticamente la nueva suite PostgreSQL candidata; no añadí un test unitario de servicio duplicado ni ejecuté esa suite.

## Hallazgos

### P0 — No activar medición hasta decidir la conservación de señales

El worktree actual ya separa preferencias y señales de `audit_log`: la preferencia es mutable por miembro/scope y retirarla elimina su fila; la señal se deduplica por academia, propuesta, versión y fase, sin actor, ubicación ni intención. La migración candidata no define TTL ni plazo de conservación para `first_seen_at`. Si se instala, el componente registra exposición automáticamente al mostrar una propuesta. No aplicar ni habilitar medición alojada hasta acordar finalidad y conservación de estas señales agregadas.

Mientras faltan las dos tablas, el service responde con `measurementAvailable: false` sin consultar preferencias; un POST devuelve 503 antes de persistir y la UI oculta los controles de interés. Esto es protección estática del estado sin esquema, no un kill switch para una migración ya aplicada.

**Fuente:** [service candidato](../../src/modules/product-discovery/application/product-discovery.ts#L16), [migración candidata](../../supabase/migrations/20261104120000_product_discovery_preferences.sql), [registro automático de exposición](../../src/components/owner-dashboard/OwnerProductDiscovery.tsx#L205).

**Importancia:** instalar el esquema convierte la señal de medición en activa; actualmente no existe en la migración un vencimiento de los conteos de academia.

**Siguiente paso:** acordar finalidad, responsable y plazo antes de autorizar la migración. Si la decisión no está lista, dejar el esquema ausente y conservar el catálogo informativo sin escritura.

### P0 — La exportación de academia sigue siendo parcial

La aceptación Owner registrada para el export existente cubre un paquete acotado con 46 tablas, 385 filas y `coverage.complete=false`; no equivale a devolución integral, supresión, restauración selectiva ni tratamiento de proveedores/copias. `audit_log` está excluido porque before/after/metadata son JSON arbitrario y pueden contener identificadores Auth compartidos. Esta revisión toma esa evidencia como antecedente y no vuelve a ejecutar ni a reauditar la entrega.

La nueva clasificación propuesta acepta las dos tablas de Product Discovery como módulo opcional solo si aparecen ambas y sus columnas son exactas. La ausencia de ambas conserva compatibilidad; una sola tabla, una tabla desconocida o una columna nueva falla cerrado. En el retorno de academia las preferencias de miembros no se exportan como valores; se reportan conteos sin contenido. El GET Owner devuelve el estado actual del miembro autenticado, pero esa respuesta funcional no es un paquete formal de portabilidad individual.

**Fuente:** [registro de aceptación y límite del export](./mvp-status-matrix-2026-10-25.md#L467), [clasificación de audit_log](../../src/modules/data-rights/application/catalog.ts#L402), [catálogo opcional candidato](../../src/modules/data-rights/application/catalog.ts#L25), [verificación exacta del esquema](../../src/modules/data-rights/application/canonical-academy-return.ts#L157), [test de clasificación candidato, no ejecutado](../../tests/canonical-academy-data-export.test.ts#L40).

**Importancia:** no presentar la descarga actual como cumplimiento integral del derecho de devolución ni como prueba de borrado.

**Siguiente paso:** terminar el inventario de datos por titular/academia, decidir cómo entregar el estado individual fuera de la pantalla operativa y mantener el manifiesto de exclusiones. El conteo sin valores no sustituye una respuesta individual cuando esta sea necesaria.

### P1 — Retirar y consultar estado propio no equivalen a portabilidad individual

La tabla candidata de intereses borra el estado voluntario al retirarlo y lo elimina por cascada al borrar la membresía, sede u organización. GET devuelve solo el estado actual del miembro para su academia y scope. El retorno del Owner excluye los valores de preferencias y publica únicamente el conteo con `valuesExported: false`; no hay un artefacto individual de devolución en esta entrega. El anexo de conservación contiene objetivos propuestos, no plazos implementados.

**Fuente:** [migración candidata de Product Discovery](../../supabase/migrations/20261104120000_product_discovery_preferences.sql), [GET/service candidato](../../src/modules/product-discovery/application/product-discovery.ts#L46), [conteo sin valores en export](../../src/modules/data-rights/application/canonical-academy-return.ts#L487), [propuesta de conservación no aplicada](../legal/anexo-conservacion-borrador.md).

**Importancia:** una retirada elimina la selección activa, pero no equivale a exportar todos los datos del miembro ni cierra los derechos de otras tablas del núcleo.

**Siguiente paso:** decidir si la respuesta autenticada del miembro satisface la devolución de esta preferencia o si hace falta un paquete individual descargable. No incluir preferencias de un miembro en el retorno de la academia.

### P1 — La baja de una cuenta compartida no debe borrar datos de todas sus academias

La identidad de Auth puede participar en más de una organización. Las preferencias nuevas se relacionan con la membresía de academia, no usan un identificador global en la tabla de señales. La exportación de academia omite identificadores Auth compartidos. El alcance de una retirada o supresión debe permanecer limitado a miembro/scope, sin eliminar la cuenta global como atajo.

**Fuente:** [contrato de claves omitidas en exportación](../../src/modules/data-rights/application/catalog.ts#L34), [FK miembro/scope de intereses](../../supabase/migrations/20261104120000_product_discovery_preferences.sql#L5).

**Importancia:** evita que una solicitud acotada a una academia afecte accesos o datos ajenos.

**Siguiente paso:** aceptar casos con una persona miembro de dos academias: devolución por alcance autorizado, retirada de una sede, retirada organizacional y baja de membresía sin borrar la identidad Auth compartida.

### P1 — Restauración selectiva y re-aplicación de supresiones siguen NO VERIFICADAS

No encontré evidencia de restauración selectiva de academia ni de una lista de supresiones que se reaplique tras restaurar una copia. El runbook de restauración y el anexo de conservación describen propuestas; no demuestran un ensayo actual ni los plazos de copias de proveedores.

**Fuente:** [viabilidad de backup/restore](./sandbox-backup-restore-viability-2026-10-14.md), [anexo de conservación](../legal/anexo-conservacion-borrador.md), [runbook de devolución y supresión](../legal/procedimientos-derechos-incidentes.md).

**Importancia:** una restauración podría reintroducir estados previamente retirados si no existe un mecanismo de supresión posterior al restore.

**Siguiente paso:** definir y probar el flujo en un entorno aislado compatible antes de prometer recuperación o supresión de copias. No asignar plazos de retención por inferencia.

## Gates de cierre

| Gate | Evidencia requerida | Estado |
| --- | --- | --- |
| Esquema Product Discovery | Revisión del SQL candidato, RLS/grants, columnas y constraints; luego migración autorizada de forma separada | Candidato local; NO APLICADO |
| Retirada | El DELETE afecta solo a miembro + sede/organización y devuelve estado vacío; sin auditoría de intención anterior | Contrato estático en service; ejecución no verificada |
| Señales | Clave única por academia/feature/versión/fase sin actor; retención y supresión de academia acordadas | Deduplicación en DDL; retención pendiente |
| Export | Cero o dos tablas opcionales exactas; conteos sin valores; no se atribuyen preferencias a la academia | Código/test candidato; no ejecutado aquí |
| Portabilidad individual | El titular obtiene su estado con alcance correcto y respuesta descargable si el contrato la exige | GET de estado funcional; paquete formal NO VERIFICADO |
| Restore | Supresiones se re-aplican después de restauración y no vuelven a uso normal los datos retirados | NO VERIFICADO |

## Contratos candidatos que requieren revisión

La nueva suite `tests/product-discovery-pg.test.ts` es candidata a ejecutarse solo en un PostgreSQL desechable Linux de GitHub; su guard rechaza targets y credenciales externos. Estáticamente cubre baseline sin tablas, concurrencia/deduplicación, interés por scope, retirada, rechazos y retorno parcial sin efectos en un conjunto de tablas operativas y outbox. No demuestra ejecución porque no la corrí. No cubre una revocación de membresía o cambio de scope entre la resolución inicial y el write; el service sí revalida membresía y sede en su transacción. El plazo de señales queda fuera de esa suite.

La explicación antigua de `discoverySignalKey` sobre la clave única de `audit_log` fue retirada del catálogo y del test de catálogo durante esta revisión; no queda como discrepancia vigente en el worktree.

No se decidió aquí fundamento, plazo legal, tratamiento de ledger, retención de copias ni condiciones contractuales. No se activan cron, borrados masivos, migraciones ni medición alojada por esta revisión.
