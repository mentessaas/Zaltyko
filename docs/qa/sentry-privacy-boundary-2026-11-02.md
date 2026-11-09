# Sentry: límite de datos del candidato

## Hallazgos
Navegador, Node y Edge comparten sentryPrivacyOptions. La salida usa una lista permitida: identificadores técnicos validados, tiempos, nivel, entorno conocido, SHA release y excepciones sin texto libre. Se preservan líneas/columnas y nombres de chunks generados restringidos. No se conservan request, usuario, breadcrumbs, tags, extras, atributos de contexto, mensajes de excepción ni spans con SQL/URLs. La entrada no se modifica; los adjuntos del hint se vacían. Desarrollo descarta eventos como antes.

Session Replay no se carga ni se muestrea; logs SDK y PII por defecto quedan desactivados. El seguimiento de errores continúa, y las transacciones conservan tiempos/correlación sin detalle de spans. Esto reduce diagnóstico y agrupación: no se afirma equivalencia de detalle con la configuración anterior. No toca ajustes del proveedor, ni datos previamente recibidos por Sentry. No constituye saneado retroactivo o certificación de ausencia de toda información personal.

## Fuente
instrumentation-client.ts, instrumentation.ts, sentry.server.config.ts, sentry.edge.config.ts, src/lib/monitoring/sentry-privacy.ts. SDK instalado por lockfile en CI, línea 10.x de Sentry. Sin cambios de dependencia.

## Importancia
El filtrado de antes solo cubría ciertos headers/query en Node y no era uniforme. La lista permitida evita depender de nombres concretos de secretos o formato de objetos libres. Replay se excluye hasta revisión específica de necesidad, captura, información y conservación.

## Validación
Regresiones sintéticas en tests/lib/sentry-privacy.test.ts: datos anidados y cabeceras, texto SQL y personas, no mutación, ciclos descartados, adjuntos, trazas/spans, chunks, development y cableado de las cuatro entradas/cinco inicializaciones. Se exige CI completa sin excepciones. No ejecutado localmente. Verificación alojada pendiente tras CI/revisión/publicación autorizadas; preview omite init servidor y no acredita runtime productivo.

## Siguiente paso
Verificar CI exacta, revisión externa y comportamiento con datos sintéticos antes de publicación. Mantener pendientes contrato, región y retención reales del proveedor. No SQL, Live, ensayo ni configuración remota modificados.
