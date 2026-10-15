# Controles financieros — PostgreSQL local sintético

## Resultado observado

Una corrida en `fa5429f60ce1eef0658d9268d515bcdf24c9b60a`: **PASS**, salida 0, limpieza PASS. Servicios de aplicación reales con PostgreSQL 17.11; **no rutas HTTP**, navegador, CI remoto ni esquema de destino.

- Dos emisiones concurrentes con la misma clave: una factura y respuestas replay `[false, true]`; una línea y un cargo nuevos.
- Dos pagos concurrentes con la misma clave: un pago y una asignación.
- Misma clave con payload divergente: `IDEMPOTENCY_CONFLICT`, conteos financieros sin cambios.
- Comandos con organización ajena, sede fuera de alcance o coach: denegados, sin cambios en conteos de facturas, líneas, cargos, pagos, asignaciones, outbox y auditoría.

Log observado por Main: `/tmp/zaltyko-monthly-financial-fa5429.XXXXXX.log` (nombre literal), SHA-256 `d1db37a477af13280d6e124809a28226c53d394b492c697ecfeb11f4e8e68167`. Contiene JSON PASS, `monthly billing paging cleanup: PASS` y `RUNNER_EXIT=0`. QA reportó ausencia de procesos del runner y directorios PostgreSQL temporales; revisión independiente de esa evidencia solicitada, pendiente al redactar.

## Preparación y límites

Fixture sintético existente más datos financieros sintéticos. El primer preflight no inició runner por PATH incompleto; Main verificó las herramientas locales y proporcionó PATH explícito. La única ejecución funcional posterior no se repitió. Node 22.22.2, PostgreSQL 17.11, Python 3.14.3 disponibles localmente.

Caso `financial` del runner existente, ejecución directa Node/tsx fijado local bajo entorno limpio; watchdog existente de 8 segundos para el verificador, SQL 8 segundos y lock 4 segundos, sin ampliarlos. Migraciones y fixture se preparan antes del watchdog. Corrección de placeholder SQL revisada antes de ejecutar; contrato focal 8/8 PASS.

El cambio inicial de QA se cometió directamente en integración contra la instrucción de aislamiento. Se preservó sin revertir trabajo ajeno, se detuvieron sus escrituras y Main corrigió los dos ajustes siguientes, revisados independientemente antes de autorizar la corrida. No modifica producto, migraciones ni dependencias.

## No acredita publicación

No se invocaron POST HTTP negativos ni se probó aquí la identidad de sesión, middleware o RLS con un usuario restringido de base de datos. Siguen separados los gates de CI remoto, revisión independiente del PR, compatibilidad de esquema de destino y autorización de publicación. Sandbox y producción no se tocaron.
