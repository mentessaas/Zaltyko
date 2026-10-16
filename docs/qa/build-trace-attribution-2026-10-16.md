# Diagnóstico acotado de atribución del build — 2026-10-16

## Estado y autorización

### Estado vigente — 16 oct, 07:37 UTC

El único push autorizado ya se realizó a las07:36UTC: candidato
`cd764dc2de0d52bad5f5df4b49fbc3562f4cff27`. CI38868296319 está queued;
Static38868296301 y Directory38868296302 SUCCESS exactSHA. Autorización
**CONSUMIDA**, sin otra ejecución, merge o despliegue. QA observa el run.
El código es idéntico a `e8782f3a` revisado y validado, sin modificaciones
de fuentes tras GO. Vercel reconfirmado07:36 previewsdisabled/prodmain.
Detalle en [ci-cd764dc2-candidate-2026-10-16.md](./ci-cd764dc2-candidate-2026-10-16.md).
Las secciones inferiores conservan la preparación previa; no autorizan rerun.

### Integración local comprobada — 16 oct, 07:30 UTC

Frontend entregó `1799cda4bb48706f842ace41a85890b20845af78`, posterior
a `10eb216d`. Main integró selectivamente cuatro archivos mediante
`apply_patch`: catálogo, analizador, runner y tests. Sus cuatro hashes de blob
son idénticos a los del commit entregado. No se integró el Changelog del
worktree temporal; ese directorio ya no está disponible, pero los commits
permanecen en Git. No se realizó ninguna limpieza o eliminación.

Main: **82/82 pruebas sintéticas en cinco suites**, 3.99 s (tests 705 ms),
`tsc --noEmit --incremental false` exit 0, ESLint sin warnings, Prettier de
cuatro archivos y este documento PASS, `audit:env` 73 variables documentadas
sin inspeccionar valores y `git diff --check` PASS. El warning de pnpm sobre
campos ignorados no acredita parches de dependencias; no se modificaron.
No hubo instalaciones, build, E2E, Docker, pulls o pruebas con datos reales.

QA revisó `1799cda4`: privacidad, ancestry, ranking y presupuesto GO estático;
detectó que la suma de `traceEntryCount` podía superar 1000000 aunque cada
entrada fuera válida. Main corrigió únicamente ese hallazgo en
`e8782f3a67466902a000109161d51b3db904d8f4`: también se valida el agregado;
si desborda, se omite todo el campo de esa clave, se bloquea su reaparición
parcial con spans posteriores y se incrementa `invalidTraceEntryCounts`.
No se inventa un total truncado. Tres regresiones nuevas: 2×600000 con/sin
span posterior, suma exacta del límite y otra clave independiente.

Main tras el cambio: **85/85 pruebas sintéticas, cinco suites, 18.60 s
(tests 2.97 s)**, lint y diff-check PASS. Typecheck final exit 0 a las
07:34 UTC; QA final GO estático sobre el SHA exacto `e8782f3a` para UNA
corrida existente. Catálogo y runner idénticos a `1799cda4`; resto del
dictamen de privacidad/ancestry/ranking/lifecycle se mantiene. QA no ejecutó
pruebas ni build. **Todavía no hay push ni nueva ejecución de CI; permiso
no consumido.**
Protecciones reconfirmadas readonly a las 07:28–07:29 UTC: PR226 abierto/en
borrador sobre `bf0aad14`, revisión requerida; main strict/admins/una review/
dismiss-stale/seis checks, Actions read/sin aprobación; Deploy deshabilitado y
manual fail-closed; Vercel previews deshabilitados, rama productiva main y
`vercel.json` deploymentEnabled false. Production solo main y prevent-self-review,
con bypass administrativo permitido: no es protección absoluta. Sin merge/deploy.

El humano autoriza preparar, revisar y ejecutar **una única corrida adicional
del CI existente**, manteniendo 240 segundos y sin desplegar. La autorización
anterior se consumió en `bf0aad14` / CI `38749323693`, terminado con fallo.
Esta nueva corrida aún no se ha ejecutado. No se autorizan reruns, dispatch,
nuevos jobs/runners ni optimizaciones de producto/configuración sin evidencia.

Frontend155 propone el diseño; Backend137 contrasta la semántica de Next;
QA216–217 aprueba el diseño con condiciones. La aprobación de diseño no es
aprobación del código ni acredita el resultado de CI. Solo los tres chats APP
de release participan; Main integra y controla el único push sustantivo.

## Pregunta y alcance de la evidencia

La corrida anterior agotó 240 segundos durante el build en Chromium y WebKit;
Firefox completó un build de 238910.458 ms y su prueba funcional. Hay coste
observado en compilación y tracing, pero no atribución causal suficiente.
Consultar el cierre exacto en
[ci-bf0aad14-candidate-2026-10-15.md](./ci-bf0aad14-candidate-2026-10-15.md).

El diagnóstico propuesto consume la traza que Next ya produce, después del
build y fuera del sampler de recursos host. No añade hooks de instrumentación
durante la compilación ni modifica Node22, Sentry, tracing, worker, variables
de producción, matriz, checks, señales, errores, timeout o cleanup.

Separa tres compiladores cerrados: `server`, `edge-server`, `client`. Relaciona
spans por `(traceId, id)` cuando hay traceId; sin traceId utiliza un espacio
separado, únicamente con IDs inequívocos. No enlaza ambos espacios. Los eventos
pueden llegar fuera de orden y en batches diferentes. Duplicados, padres
ausentes, ciclos, conflictos o exceso de profundidad quedan sin atribución y
se reflejan en calidad del resumen.

QA218 aprueba una frontera explícita: un `worker-main-client`,
`worker-main-server` o `worker-main-edge-server` único y válido puede actuar
como ancla sin exigir el span raíz `next-build`, que quizá siga abierto al
timeout. Un padre ausente por encima del ancla se declara como brecha y
resultado parcial; no impide atribuir hijos con relaciones válidas hasta ella.
Un padre ausente por debajo, ancla inválida/duplicada, self-parent, ciclo o
conflicto de compilador no se atribuye. No se rellena el tiempo del span raíz.

Contadores cerrados deben exponer tipos de módulo no admitidos, identidades
desconocidas, grupos sin atribución y grupos omitidos por el top 10. Estado de
archivo completo no significa cobertura completa de módulos/rutas ni causa.

Los módulos solo pueden producir etiquetas de un catálogo fijo y versionado
de nombres de archivos `src` y paquetes del lockfile. Las páginas solo pueden
producir plantillas estáticas revisadas. Tags de entrada se usan exclusivamente
para coincidencia con ese catálogo; lo desconocido produce `unknown`. Nunca
se imprimen rutas absolutas, requests/loaders/queries arbitrarios, IDs,
traceId, tags completos, contenido fuente, perfiles crudos o entorno.

Main preparó mediante `apply_patch` un catálogo de 1866 nombres de archivos y
1214 nombres de paquetes, a partir de nombres versionados, sin leer contenidos
fuente ni valores de entorno. El CI solo importará constantes. Las comprobaciones
por ruta se limitan a siete plantillas `/owner`; rutas restantes se consideran
desconocidas, sin afirmar cobertura de todas las páginas del producto.

`check-page` mide comprobaciones de página estática, no generación final ni
tracing NFT por ruta. `node-file-trace-plugin` y `collect-traced-files` pueden
asociarse al compilador mediante ancestros inequívocos. `traceEntryCount`
solo se acepta desde el span/tag permitido tras validar tipo y rango.
`node-file-trace-build` y `apply-include-excludes` son `aggregate_only`:
no existe evidencia suficiente para repartir su tiempo por ruta o módulo.

Todos los acumulados son **inclusivos y potencialmente solapados**. No son
consumo de CPU, fases disjuntas ni prueba de causalidad. La ausencia de un span
completado tras timeout no demuestra que esa fase no se ejecutara.

## Límites y fallo seguro del diagnóstico

- Una lectura de `.next/trace` alimenta los dos resúmenes, con hasta 8 MiB.
- Hasta 1 MiB por línea, 100000 eventos, profundidad de ancestros 64.
- Top 10 por categoría y resumen JSON cerrado de hasta 16 KiB.
  Esa cota se refiere al informe de fases/detalle, no a la línea completa de
  stderr. El sobre del runner y progreso cerrado (cuatro hitos, milisegundos
  enteros 0..86400000) añade como máximo 268 bytes; con newline, la línea es
  como máximo 16653 bytes, inferior a 17 KiB. No se amplía la lectura.
- Presupuesto cooperativo de postproceso de 1 s; `elapsedMs` finito, reloj de
  pared. No garantiza interrupción dura de una lectura o `JSON.parse` síncrono.
- Estado explícito de lectura/procesamiento y truncamiento; conservar solo
  registros completos y relaciones resueltas dentro de límites. Agotar el
  presupuesto o truncar marca ambos resúmenes como parciales.
- Leer/procesar el archivo entero nunca significa que el build acabó bien.
- Apertura sin seguir symlinks, no bloqueante, solo archivo regular, cierre
  en finally. Fallos de lectura/emisión nunca reemplazan resultado o error
  del build ni evitan el cleanup externo.

El presupuesto de postproceso está fuera del límite de build de 240 s y del
sampler. Puede añadir un pequeño coste al cierre; no se atribuye ese coste a
la compilación. Los catálogos se preparan antes del CI usando nombres, sin
leer fuentes ni valores de entorno durante el diagnóstico.

## Validación requerida antes del único push

Pruebas sintéticas focales de relaciones fuera de orden/batches, traceId
opcional, duplicados/huérfanos/ciclos/profundidad, duraciones inválidas,
marcadores sensibles en tags, catálogo desconocido, traza parcial, límites de
bytes/línea/eventos/salida/presupuesto y peor caso acotado. Verificar que
lectura/emisión fallidas preservan éxito/error/timeout/abort y cleanup.

Revisión exacta independiente del diff; lint, formato, comprobación de tipos
y checks focales proporcionales. No ejecutar builds, E2E, Docker, pulls ni
instalaciones locales. Reconfirmar protecciones readonly antes del push.

Tras el push: registrar SHA y corrida exactos y marcar permiso consumido. No
empujar notas durante la ejecución ni encadenar otra corrida. Observar el
resultado de esa corrida; no trasladar PASS entre SHAs ni equiparar cleanup
reportado con inventario Docker independiente.

## Fuentes de semántica

Contraste con Next instalado **15.5.27** y fuentes oficiales de la misma versión:

- [Tipos de traza](https://github.com/vercel/next.js/blob/v15.5.27/packages/next/src/trace/types.ts).
- [Spans de módulos y compilador](https://github.com/vercel/next.js/blob/v15.5.27/packages/next/src/build/webpack/plugins/profiling-plugin.ts).
- [Worker de webpack](https://github.com/vercel/next.js/blob/v15.5.27/packages/next/src/build/webpack-build/impl.ts).
- [Tracing de archivos agregado](https://github.com/vercel/next.js/blob/v15.5.27/packages/next/src/build/collect-build-traces.ts).
- [Plugin de entradas para tracing](https://github.com/vercel/next.js/blob/v15.5.27/packages/next/src/build/webpack/plugins/next-trace-entrypoints-plugin.ts).
- [Reporte de trazas JSON](https://github.com/vercel/next.js/blob/v15.5.27/packages/next/src/trace/report/to-json.ts).

## Gates de publicación independientes

Sin merge, despliegue, DDL, restauración, pagos ni datos reales. Seguridad,
esquema/orden de release, rol efectivo de aplicación, recuperación y revisión
independiente de PR siguen pendientes. El diagnóstico o un CI verde no
convierten esos gates en PASS. **Publicación continúa NO-GO.**
