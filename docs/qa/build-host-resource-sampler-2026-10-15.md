# Muestra acotada de presión del host durante el build sintético

Esta instrumentación observa presión compartida del runner Linux; no atribuye
CPU o memoria al proceso `next build` ni demuestra causalidad del timeout.
Solo rodea el callback del build cuando concurren GitHub Actions, CI, `RUNNER_OS`
Linux, `process.platform` Linux y un proyecto browser exacto.

Lee únicamente `/proc/stat`, `/proc/meminfo` y las tres rutas fijas de PSI.
Cada fuente admite hasta 4 KiB de contenido útil; las fuentes distintas de
`/proc/stat` leen como máximo un byte centinela adicional para rechazar exceso.
Para `/proc/stat` basta leer el prefijo de 4 KiB y parsear solo la primera línea
`cpu` completa que quepa ahí; el resto del archivo se ignora.
La suma CPU excluye guest/guest_nice duplicados.
Muestrea como máximo a 1 Hz y 250 muestras; el sampler emite una única línea
JSON de resumen con campos fijos numéricos, nulos o `scope: host`, separada del
diagnóstico de build que ya existía. No registra texto procfs,
variables de entorno, argumentos, PID, rutas libres ni salida del build.

Según [procfs del kernel](https://www.kernel.org/doc/html/v6.10/filesystems/proc.html),
`iowait` puede decrecer; cualquier delta idle inválido se omite. `MemAvailable`
es una estimación del kernel, no memoria libre exacta. [PSI](https://www.kernel.org/doc/html/v6.6/accounting/psi.html)
`avg10` es una ventana móvil de diez segundos: `some/full` representa presión
compartida del host, no porcentaje de CPU ni medida exclusiva del build.

El sampler envuelve solo la llamada `run(next build)`; la lectura/emisión de
trazas existente queda fuera de su intervalo. Termina en `finally` antes del
cleanup exterior del stack. Errores
de lectura, timer o emisor no cambian el resultado/error del build ni el flujo
de cleanup. No añade entorno al proceso Next/worker ni a Playwright. Sentry,
tracing, Node 22 y timeout 240 s continúan intactos.

Las pruebas de timeout/abort son rechazos sintéticos del callback; no simulan ni
afirman un timeout o cancelación real del proceso. La prueba de métricas usa
mocks focales; no ejecuta build ni Docker.
La única corrida CI adicional requiere el permiso explícito ya concedido por
el usuario y revisión posterior de la evidencia. Un resultado de host puede
contextualizar, pero no identificar el cuello del build.

## Integración Main — 14:11 UTC

Commit Frontend `57af90c3`, GO estático exacto QA203. Main integra únicamente
cinco archivos; no copia el Changelog histórico formateado del worktree aislado.
La igualdad del índice con ese commit se verificó para código/tests/manifiestos
TypeScript/JSON/YAML: sin diferencias. TypeScript `--noEmit --incremental false`
pasó en esa entrega; Main no lo repite sobre el mismo código.

Main ejecutó **528/528 pruebas en 13 archivos** en 5.78s (tests 1.19s), incluyendo
precarga/identidad/Hub11/runner/core/worker/trazas y el sampler nuevo. ESLint focal
sin avisos, Prettier de cinco archivos, audit:env73 y diff-check PASS. La suite
Frontend focal anterior fue 25/25; no es una ejecución del build ni del navegador.
Sin instalaciones, build, E2E, Docker, pulls, escrituras DB ni despliegue locales.
Preparación de la única corrida adicional autorizada; ningún resultado CI nuevo
se deduce de estos checks.
