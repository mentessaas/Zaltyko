# Anexo de conservación y devolución — propuesta

Fecha: 2 noviembre 2026. Ningún plazo de esta propuesta está aplicado por un job ni constituye estado verificado del servicio. No se activan cron, borrados, exportaciones ni backups. No ampliar límites legales por esta tabla.

| Categoría | Criterio/objetivo propuesto | Situación y cierre necesario |
|---|---|---|
| Operativa de academia | Durante servicio e instrucciones válidas; al terminar, ventana de devolución propuesta 30 días y supresión activa dentro de los 30 días posteriores a instrucción validada | Propuesta contractual; implementar/probar devolución y supresión por academia con dependencias y ledger. No prometer ya disponible |
| Fichas archivadas | Conservan historial mientras exista finalidad del responsable | Archivo no es borrado. Academia define necesidad y revisiones; no fijar retención perpetua |
| Cuenta y membresías | Mientras acceso sea necesario; desvincular sin destruir identidades compartidas | Validar flujo Auth, pertenencias y derechos; conservación legal separada |
| Facturación SaaS propia | Plazo legal aplicable desde cada hecho contable/fiscal y reclamación | Validación fiscal pendiente; no aplicar automáticamente un plazo único a toda la base |
| Cuotas/pagos de familias | Instrucciones y obligaciones de la academia, con acceso restringido tras baja | Ledger/auditoría inmutables requieren estrategia legal/técnica de minimización, no DELETE improvisado |
| Seguridad y auditoría | Propuesta: revisión de necesidad a 90 días para logs ordinarios; conservar incidentes concretos solo mientras necesarios | Inventario real de logs, inmutabilidad y configuración pendientes; 90 días no es TTL actual ni límite universal |
| Redis | Ventana/TTL por clase de clave y finalidad | Hay rate limiting en código; no demuestra TTL de todas las claves ni región productiva. Inventariar sin volcar valores |
| Correo y soporte | Durante gestión de solicitud y plazo necesario para acreditar su resolución | Retención real en Brevo y buzón pendiente; separar contenido, eventos de entrega y supresiones |
| Sentry/trazas/replay | Mínimo necesario; propuesta de máximo 30 días para eventos ordinarios, sujeto a viabilidad | Retención y región de organización no verificadas. Entregas a69b25ee no carga Replay y minimiza errores/trazas; no elimina datos históricos del proveedor ni prueba configuración productiva. La propuesta30días no se ha aplicado |
| Copias de seguridad | Ciclo efectivo del plan/proveedor documentado; sin uso ordinario tras supresión | Plan y retención productivos no acreditados aquí. No confundir eliminación de proyecto/cuenta proveedor con eliminación de una academia |

## Procedimiento propuesto
1. Verificar solicitante y academia; registrar instrucción y suspensión legal específica si existe.
2. Inventariar datos activos, Auth compartido, adjuntos, correo, cachés, observabilidad y copias sin extraer secretos.
3. Devolver solo datos del responsable por canal seguro y registrar recepción; no enviar exports por correo sin protección.
4. Aplicar supresión/minimización autorizada respetando obligaciones legales y relaciones entre tablas; validar aislamiento y ausencia de pérdida ajena.
5. Registrar alcance, fecha, excepciones y caducidad real de copias; mantener lista mínima de supresiones para reaplicar tras restauración.
6. Certificar únicamente lo ejecutado. Revisar periódicamente excepciones y completar agotamiento de copias.

## Recuperación: límites de evidencia
El runbook docs/runbooks/zaltyko-backup-restore.md propone RPO24h/RTO8h, ambos NO VERIFICADOS. No existe acreditación aquí de restore productivo ensayado. El ensayo de restore anterior cancelado no se reactiva. La documentación pública de Supabase indica dependencia del plan: https://supabase.com/docs/guides/platform/backups . No contratar PITR ni cambiar plan por esta revisión.
