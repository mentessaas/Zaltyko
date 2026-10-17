# Diagnóstico acotado del build local

Experimento de observabilidad basado en `2b581cd9`, sin optimización de build
presumida. Conserva Sentry/tracing, Node 22, entorno, timeout de build 240000 ms,
propagación de errores, señales, grupos de procesos y cleanup.

## Resumen idéntico en éxito y fallo

`withBuildDiagnostic` emite una vez al finalizar el intento, tanto si devuelve
resultado como si lanza error. Errores del lector/emisor se ignoran sin sustituir
el resultado original. El callback de salida es síncrono y está protegido contra
excepciones antes de continuar la captura original del proceso.

`buildTracePhases` conserva exclusivamente las cinco fases existentes:
next-build, run-webpack-compiler, static-generation, node-file-trace-build y
apply-include-excludes. Cada entrada contiene `phase`, `count`,
`accumulatedDurationMs` y `maxDurationMs`. La suma agrega spans completados,
no representa tiempo de pared ni duración total del build. Puede incluir spans
solapados o jerárquicos; no sumar fases para inferir duración real. Con workers
hay varios spans de compilador y el máximo no representa su suma.

Archivo regular con descriptor, sin seguir symlink final; máximo 8 MiB y 100000
eventos. Tipos, JSON, duraciones o sumas no válidas fallan cerrado. No se emiten
atributos, rutas, nombres ajenos, argumentos, entorno ni errores del lector.
Un span interrumpido puede faltar. El archivo puede contener eventos anteriores
si se reutiliza el checkout; no acredita por sí solo ejecución actual/readiness.

## Hitos observados

`buildProgress` contiene como máximo cuatro entradas de `milestones`, con
`milestone` fijo (compiled/generated/optimizing/tracing) y `elapsedMs`, más
`truncated` booleano. Los tiempos son monotónicos relativos a la creación del
observador inmediatamente antes del build: recepción de mensajes completos,
no tiempo interno de Next ni duración exacta de cada fase. Un tail sin salto
se observa al finalizar. stdout y stderr se procesan por separado; no se puede
reconstruir el orden interno del proceso a partir del orden de entrega.

Decodificación UTF8 incremental, líneas partidas y CR/LF; se eliminan únicamente
secuencias ANSI SGR de color. Otros controles/OSC/cursor y sufijos arbitrarios
no se reconocen. Máximo 1024 caracteres por línea y 1 MiB de entrada total;
se descartan líneas excesivas completas y datos posteriores al límite. No se
conserva texto bruto en el observador. La captura de errores previa del runner
sigue teniendo sus propios límites y redacción, sin ampliarlos aquí.

## Límites y validación

Lectura/parseo síncronos acotados por bytes; el límite de eventos se verifica
tras deserializar cada línea. No hay deadline global que incluya diagnóstico y
cleanup dentro de 240 s. O_NOFOLLOW protege el archivo final, no un directorio
.next symlink. Un callback síncrono protegido no equivale a aislamiento de CPU.

Fixtures/mock de particiones de bytes (UTF8/ANSI incluidos), streams, controles
maliciosos, límites, tipos, tiempos, campos permitidos, sumas/máximos, éxito/fallo,
excepciones del observador y preservación de timeout/grupos/cleanup. No se ejecutan
builds, E2E, Docker, instalaciones, consultas ni operaciones remotas. Sin métricas
de recursos ni causa de lentitud demostrada. Frontend91 GO estático y Main integró
el cambio; evidencia consolidada en docs/qa/ci-2b581cd9-local-diagnostics-2026-10-15.md.

Validación local final: cinco archivos focales, 53 tests PASS (5,20 s de suite,
1,82 s de tests); ESLint focal y Prettier de archivos modificados PASS. No se
ejecutó typecheck global; Main revisará el candidato integrado.
