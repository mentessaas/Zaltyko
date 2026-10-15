# Experimento local de Webpack build worker

Base: candidato `e7dff88b`. Estado: experimento revisable, no integrado ni publicado.

Next 15.5.27 deshabilita por defecto el build worker cuando existe un callback
Webpack. Su opción explícita `experimental.webpackBuildWorker: true` permite
usarlo; el worker recarga la configuración e incluye las variables de su padre.
Sentry 10.73.0 conserva el callback del usuario dentro de su wrapper. No se
identificó un bloqueo explícito en esas fuentes instaladas.

La configuración añade la propiedad únicamente con ambos valores exactos:
`E2E_LOCAL_SUPABASE=true` y `ZALTYKO_E2E_WEBPACK_BUILD_WORKER=true`.
El wrapper establece el segundo solo en el entorno del proceso `next build`:
no lo hereda del entorno externo ni lo añade al entorno compartido con el servidor.
Fuera de esa conjunción la propiedad permanece ausente.

Se conservan Sentry, tracing, checks, Node 22, 240 segundos, propagación de errores
y cleanup. No se emplea `VERCEL_ENV=preview`. Node 20 en otros jobs queda como
deuda de alineación a Node 22 después de revisión separada; no se modifica aquí.

Validación focal actualizada: 2 archivos, 15 pruebas PASS (3,02 s de suite;
1,78 s de tests en esta ejecución). La matriz de ocho casos evalúa la expresión
real de selección extraída de next.config.mjs en contextos VM separados. Una
única prueba importa la configuración real dos veces (baseline y ambos marcadores)
en un subproceso con entorno explícito, sin credenciales heredadas. URLs distintas
fuerzan reevaluar la configuración; Sentry permanece en la caché de dependencias.
Se conservan checks de ausencia/presencia, callback, túnel, tracing y comparación
de la configuración observada salvo el worker; los contratos del wrapper siguen.

La revisión de Main detectó un caso superior a 5 s con una importación por proceso.
Un primer intento con nueve importaciones en un solo proceso también excedió 5 s
y se descartó. La versión actual reduce las evaluaciones reales de diez a dos y
los procesos hijos de diez a uno. No aumenta el timeout por test de 5 s ni el
límite del subproceso de 15 s. El PASS local no garantiza tiempos bajo toda carga.

No se ejecutaron builds, E2E, Docker, instalaciones, DDL ni operaciones remotas.
La compatibilidad durante un build, el consumo de memoria y cualquier ahorro
temporal siguen NO VERIFICADOS. El span de compilación completado no demuestra
la causa del timeout. Requiere revisión QA/Main antes de integrar o publicar.

No se modifica vault en esta entrega aislada: el experimento se documenta aquí
para su revisión y eventual consolidación por Main; no es una decisión de release.
