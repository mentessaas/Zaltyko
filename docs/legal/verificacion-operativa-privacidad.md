# Verificación operativa de privacidad — corte estático

## Hallazgos y fuente
Revisión local 2 noviembre 2026, sin ejecución ni consultas a cuentas de proveedores.

| Control | Evidencia concreta | Límite / siguiente paso |
|---|---|---|
| Redis rate limit | src/lib/rate-limit.ts elimina eventos fuera de ventana y llama kv.expire(key,window) tras alta de evento | TTL deslizante de ese conjunto, no caducidad de todo Redis. No es ventana total fija desde primera petición. No mide TTL productivo |
| Cliente Sentry | instrumentation-client.ts carga Replay de forma diferida, máscara de texto y bloqueo de medios; beforeSend devuelve evento sin filtrado adicional | Revisar URL, breadcrumbs, contexto/red, cookies y muestras sintéticas. No probar usando datos reales |
| Node Sentry | instrumentation.ts elimina authorization/cookie/x-api-key y tres nombres de query del evento | Filtro limitado, sensible a nombres/formato y no cubre todos los campos, cuerpos o trazas. No certificar saneado integral |
| Edge Sentry | instrumentation.ts beforeSend devuelve evento fuera de development | Configuración distinta a sentry.edge.config.ts; confirmar cuál interviene en artefacto antes de atribuir filtro |
| Entornos | register() no inicializa Sentry servidor en preview | Prueba de preview no acredita comportamiento productivo de observabilidad |
| Devolución | Existen exports de atletas, historial y reportes | No se encontró circuito canónico integral de devolución/supresión por academia en búsquedas acotadas; ausencia no prueba inexistencia total |
| Recuperación | Runbook existente con RPO/RTO propuestos | Restore no acreditado; no ejecutar ni reactivar ensayo cancelado |

## Importancia
No firmar un plazo de borrado ni prometer recuperación que no se haya acreditado. No publicar “sin datos personales” para Sentry por existir máscaras. No hay prueba de filtración en este corte: son límites de controles estáticos que requieren verificación.

## Cola priorizada para cerrar
1. Revisar filtrado homogéneo Node/Edge/cliente y tratamiento de Replay. Preparar corrección separada y CI remota si se implementa; no hacer cambios silenciosos de proveedor.
2. Inventariar regiones/retenciones/DPA reales desde cada cuenta con lectura autorizada y sin exportar secretos. Documentación pública no sustituye ese paso.
3. Probar solicitud de derecho y devolución acotada con datos sintéticos; definir estrategia compatible con ledger/auditoría inmutables antes de cualquier purga.
4. Verificar canal de soporte y respuesta a incidentes con operador y suplencia asignados.
5. Cerrar objetivos de conservación, aceptación versionada de DPA y datos fiscales, manteniendo Live cerrado hasta sus requisitos propios.

## Estado
Revisión estática realizada; código de aplicación sin nuevas modificaciones en esta tarea. SQL, proveedores, ensayos, producción y despliegues sin cambios.


## Actualización 3 noviembre — prevalece sobre el corte estático anterior
El defecto de uniformidad de filtros quedó corregido en a69b25ee y publicado solo en entregas. CI exacta completa;10casos sintéticosPASS. Bundle cliente observado con filtro compartido/PIIoff/logsoff/breadcrumbs0;32scripts inspeccionados y Replayrequests0 en una recarga QA C. Node/Edge acreditados por pruebas/config, no entrega real desde preview. La tabla anterior se conserva como evidencia del diagnóstico previo, no como descripción del código de entregas actual. Producción no modificada; retención, saneado real de sobres y contratos siguen abiertos.


## 3 noviembre — procedimiento de derechos revisable
El frente Backend terminó tenant-data-return-erasure-runbook.md, en auditorias/2026-11-03 de la raíz durable. Define ámbito, dependencias, Auth compartido, ledger, archivos, exclusiones, manifiesto y comprobación posterior/restore. No ejecuta devolución ni supresión: exportaciones actuales son parciales y no se ha acreditado un cruce directo de identificadores legacy/canónico. No usar DELETEperfil o cascadas como procedimiento de academia. Un procedimiento manual revisado puede evaluarse antes de automatizarlo; el documento no acredita capacidad integral operativa ni exige implementar por inferencia una nueva purga. Cualquier operación de datos requiere alcance y aprobación propios.


## Cierre estático adicional — 3 noviembre,85ff32c1
El [preflight canónico](/Users/elvisvaldesinerarte/projects/Zaltyko/auditorias/2026-11-03/canonical-return-preflight-review.md) concreta tablas, claves y límites para una futura comprobación acotada: organización exacta, Auth compartido excluido, ledger separado, conteos sin payload/PII y cobertura Storage/legacy pendiente. Es revisión de fuentes, no devolución/borrado ejecutados. La prueba propuesta será en CI remota efímera, nunca servicios o DB en el Mac; analítica avanzada no forma parte del MVP. Ninguna lectura de datos reales, fixture o supresión queda autorizada por este documento.
