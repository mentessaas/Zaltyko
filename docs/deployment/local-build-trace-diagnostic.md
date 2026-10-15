# Diagnóstico acotado del build local

Helper Frontend `c60a28b1` integrado selectivamente por Main con wrapper de fallo en scripts/run-e2e-local.ts, revisado por Backend72. No se importa un runner paralelo ni se aplica el archivo patch auxiliar de Frontend.

La salida adicional es un objeto JSON `{ buildTracePhases: [...] }`; cada elemento contiene exclusivamente `phase` y `durationMs`. Las fases son literales permitidos del Next instalado: next-build, run-webpack-compiler, static-generation, node-file-trace-build y apply-include-excludes. Por cada fase se emite la duración máxima de los spans terminados, convertida de microsegundos; no representa tiempo total ni suma fases concurrentes. No se emiten atributos, rutas, argumentos, identificadores, entorno ni errores del lector.

Lectura de archivo regular con descriptor, sin seguir symlink final, máximo 8 MiB y 100000 eventos; crecimiento concurrente también acotado. JSON malformado, archivo ausente/excesivo o error producen array vacío. No se leen métricas ni procesos/contenedores. Un span interrumpido puede no haberse escrito; ausencia no significa que una fase no consumiera tiempo. El archivo puede contener spans anteriores si se reutiliza el checkout: es diagnóstico orientativo, nunca prueba de ejecución actual ni readiness.

El wrapper solo diagnostica tras fallo; vuelve a lanzar el mismo error incluso si lectura o emisión fallan. El diff conserva 240000 ms, manejo exterior de errores/señales y finally de cleanup. No cambia éxito/fallo del runner ni configuración de tracing.

El parseo síncrono queda acotado por bytes; el límite de eventos se comprueba después de deserializar cada línea, no antes. No existe deadline global de240s que incluya diagnóstico/cleanup. O_NOFOLLOW protege el archivo final, no un directorio .next symlink. No presentar estos límites como más fuertes de lo que son.

Main:31/31 pruebas de diagnóstico/core/wiring PASS tras adaptar la aserción de llamada directa al nuevo wrapper, manteniendo CLI, argumentos, entorno production, timeout y abort signal. Typecheck y formato focal PASS. No prueba runtime del build ni corrección de su causa.

Validación: fixtures puras y archivos temporales sintéticos; sin builds, DB, E2E, instalaciones, remotos o CI. Las pruebas cubren secretos en atributos, fases desconocidas, JSON malformado/truncado, límites, symlink, duración inválida y preservación del error/cleanup.
