# Memoria del build remoto — 2026-11-04

## Hallazgo y fuente

PR234, SHA `ad0817c7f865bdb0677b2a3798468cc43d6047b0`. El job Build126571639549 de [CI41828974752](https://github.com/mentessaas/Zaltyko/actions/runs/41828974752) falló durante `Creating an optimized production build`: V8 agotó el heap alrededor de 1960 MiB, `FATAL ERROR: Ineffective mark-compacts near heap limit`, salida134. Es agotamiento del heap de Node observado, no un fallo TypeScript ni evidencia de agotamiento total de RAM del runner. Unitarias/lint/tipos/seguridad/RLS/SQL/Chromium pasaron; Firefox concluyó SUCCESS a las12:38:45UTC; WebKit seguía en curso al corte. CI aislada41829000111 terminó SUCCESS, incluido su build con configuración preview/placeholders; no sustituye el build principal fallido. No se atribuyen resultados de otro SHA.

## Cambio acotado

`NODE_OPTIONS: --max-old-space-size=4096` únicamente en el paso Build de CI principal y en Build candidate with placeholders only de CI aislada. Aumenta el límite de old space de V8; no limita toda la memoria del proceso ni garantiza por sí solo que el build termine. Los dos jobs siguen en el runner estándar existente. No se cambia producto, Sentry, TLS, minificación, dependencias, instalación congelada, timeouts, tests ni gates.

La sintaxis está documentada en [Node20](https://nodejs.org/docs/latest-v20.x/api/cli.html#--max-old-space-sizesize-in-mib). GitHub documenta RAM de 8 GB para ubuntu-latest de repositorios privados y 16 GB para públicos: [runners estándar](https://docs.github.com/en/actions/reference/runners/github-hosted-runners). El presupuesto old-space propuesto deja margen para otros usos, pero el resultado debe acreditarse ejecutando el build. No se configura un runner mayor ni infraestructura nueva.

## Validación y límites

Revisión estática y `git diff --check`; no se ejecutó build, lint, tipo, test o instalación local. Se ejecutará CI completa y aislada para el nuevo SHA, incluidos builds reales, contrato de rutas generado, tres navegadores y controles SQL/RLS. Un PASS de Firefox posterior no explica por sí solo el fallo previo de reapertura familiar. No se aplicará SQL ni se desplegará por este cambio.

## Siguiente paso

Confirmar build remoto y todos los gates del mismo commit; inspeccionar fallos sin reducir controles. La aceptación alojada ES/MX, SQL específico y preparación comercial siguen pendientes. Verificador de archivos de devolución y sus tests nuevos permanecen fuera de este cambio; no afirmar restauración selectiva.

## Segundo consumidor observado: contrato de rutas generado

En dc14c61d, job126918066609 de CI41928195829, `pnpm build` terminó correctamente pero el paso posterior `Type check generated Next.js route contracts` agotó el heap V8 a unos2041MiB, salida134. Su entorno no heredaba el `NODE_OPTIONS` del paso Build. El log del job identifica el proceso `tsc --noEmit`; no demuestra un error de tipos ni falta total de RAM del runner.

Se asigna el mismo old-space4096 únicamente a ese paso. Se conserva `pnpm typecheck` completo, el runner estándar, timeouts y todos los demás controles. La corrección todavía necesita ejecución remota; no se ejecutaron pruebas, tipos ni builds en Mac. Los navegadores del candidato anterior continúan sin cancelación.
