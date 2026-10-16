# Build de 240 s: corrección acotada del catálogo de idiomas

16 de octubre de 2026, 23:00 Europe/Madrid. **Corrección LOCAL; CI pendiente.**
Base: `cfaeb94972ec02139829822b45b2a4c3a364db74`, PR226. No se ha empujado,
relanzado CI, conectado a bases ni desplegado. La excepción de review sigue
inactiva. Este informe sustituye únicamente la ausencia anterior de un ajuste
concreto; no sustituye el resultado FAILURE del CI de cfa ni los gates remotos.

## Hallazgo y cambio

1. El CI38888631317 agotó 240000 ms durante el build de la celda Firefox,
   antes de Playwright. Chromium y WebKit pasaron. Evidencia ya recogida en
   [el cierre de cfa](ci-cfaeb949-candidate-2026-10-16.md); no se repitieron logs.
2. Treinta archivos de `src/` importan `date-fns/locale`, usando `es` o
   `es, enUS`. El paquete instalado es date-fns4.4.0 y ese barrel reexporta
   95 idiomas. Next15.5.27 optimiza `date-fns`, pero no `date-fns/locale`:
   `node_modules/next/dist/server/config.js`, lista de defaults.
3. La transformación SWC real conserva el import sin el subpath explícito;
   al añadirlo genera `__barrel_optimize__?names=enUS,es!=!date-fns/locale`.
4. **Único cambio de comportamiento:** añadir `date-fns/locale` a
   `experimental.optimizePackageImports` en `next.config.mjs`. No cambiar los
   treinta consumidores, fechas, idiomas, API, permisos ni modelo de datos.

La [documentación oficial de Next15](https://nextjs.org/docs/15/app/api-reference/config/next-config-js/optimizePackageImports)
describe la selección de módulos; la implementación instalada confirmó aquí el
tratamiento del subpath. No se trasladan porcentajes comerciales de otros proyectos.

## Experimento A/B reproducible, sin aplicación ni datos

`scripts/diagnose-date-locale-build.mjs` usa SWC y el barrel loader instalados de
Next15.5.27 y su **Webpack compilado5.98.0**, no el webpack raíz5.110.3.
Node22.22.3, entorno vaciado, sin `.env`, app, servidor, DB, fixtures o servicios.
Compila únicamente un import sintético de idiomas; cache=false,
minify=false, concatenateModules=false, shouldEmit=false. No emite bundles ni
escribe `.next`; deadline propio60s, distinto del límite240s de la aplicación.
El timer permanece referenciado, comienza después de inicializar Webpack y
termina el proceso al ejecutarse; no interrumpe trabajo síncrono bloqueante ni
garantiza cierre cooperativo al vencer. El script rechaza selectores de Rspack/webpack alternativo
antes de inicializar el compilador, sin mostrar valores del entorno.

| Target / orden | Catálogo completo | Selección es/enUS |
| --- | ---: | ---: |
| web, base primero | 542 módulos / 95 idiomas / 584 ms | 20 módulos / 2 idiomas / 86 ms |
| node22, selección primero | 542 módulos / 95 idiomas / 583 ms | 20 módulos / 2 idiomas / 47 ms |

Módulos internos de locales:531→16 en ambos targets. Se invirtió el orden para
mostrar la sensibilidad al calentamiento. Los tiempos son microbenchmark, no
una predicción del build completo; la reducción del grafo es la evidencia
principal. Una primera exploración con webpack raíz se descartó como medición
del compilador de Next y se repitió con el compilador correcto.
Tras el refuerzo de revisión se repitió el sondeo: mismo grafo542→20,
95→2 idiomas y531→16 módulos de locales; web808→93ms y node22 445→49ms.
La variabilidad confirma que no se debe extrapolar el tiempo a la app completa.

Ejecución utilizada, con el Node22 existente del host:

```sh
env -i PATH=/usr/bin:/bin NEXT_TELEMETRY_DISABLED=1 \
  /Users/elvisvaldesinerarte/.hermes/node/bin/node \
  scripts/diagnose-date-locale-build.mjs
```

## Verificación LOCAL

- Verificación final23:04Madrid:35/35 pruebas, cuatro suites,8.31s:11 nuevas
  de import/config/identidad/formato y rechazo de compilador alternativo,
  10 worker,8 límites internacionales de fechas,6 progreso del build.
  Corrida anterior33/33 antes de los dos contratos adicionales, no discrepancia.
- TypeScript `--noEmit --incremental false`: exit0.
- ESLint de los tres archivos nuevos/modificados: maxWarnings0, exit0.
- Prettier tres archivos: PASS tras corregir estilo de los dos archivos nuevos.
- Sin cambios de workflow, runner, lockfiles, SQL ni dependencias. Límite240s,
  Node22, matriz, worker, Sentry, tracing/certificado y cleanup intactos.
- El primer sondeo SWC no ejecutó: un PATH mínimo seleccionaba Node18; se
  corrigió usando el ejecutable absoluto Node22 antes de recoger resultados.

Esto corrige una amplificación de compilación demostrada, **no acredita aún
que todos los builds completos terminen antes de240s ni identifica una causa
única del timeout histórico**. No se ejecutó Nextbuild completo, browsers,
Postgres, Docker, installs, pulls ni operaciones de proveedor en esta pasada.
El trabajo NFT global y otros módulos sigue fuera de esta atribución.
Frontend y QA revisaron el candidato estáticamente. QA pidió el rechazo de
compilador alternativo y mantener el timer activo: incorporados y delta final
revisado sin bloqueantes. El entorno saneado sigue siendo precondición. Backend no
identificó un ajuste causal de NFT: el certificado es un include individual,
sin glob amplio. Sus hipótesis sobre clusters/barrels no se implementaron.

## Autorización siguiente, separada de publicación

Texto concreto para el humano, vinculado al commit LOCAL que incluya únicamente
esta corrección, prueba, sondeo e informe:

> Autorizo una única actualización sustantiva de PR226 con el candidato de
> optimización de locales revisado y la ejecución de su CI existente, sin
> reruns ni dispatch adicionales, manteniendo240s, Node22, matriz, checks,
> Sentry, tracing, worker y cleanup. Sin merge, despliegue, cambios de
> protecciones, SQL remoto, copias, restauraciones, gastos ni borrado de cuentas.

Esta autorización **aún no se ha recibido**. El permiso de push de cfa ya se
consumió y no se reutiliza. El CI existente usa solo su stack desechable
sintético para la matriz local; no se convierte en permiso sobre el Sandbox
remoto ni sobre producción. No incorporar los dos archivos de esquema puros
ni los documentos sucios previos por accidente. Si falla, parar, sin reintentos.

## Qué falta para probar el MVP en un destino privado

El permiso anterior habilitaría verificar el candidato, no un lanzamiento.
Prueba funcional prevista: academia/sede/grupo/gimnasta, dos clases, inscripción,
asistencia, una cuota mensual única, pago manual y dashboard.

| Bloque | Trabajo o decisión pendiente | No autoriza este turno |
| --- | --- | --- |
| Recuperación B-01 | Acreditar copia/cobertura y destino existente0€, clasificación/custodia/responsables, objetivos y ventana; cerrar método y contención previa | Copiar, exportar o restaurar |
| Sandbox C | Preparar/revisar ejecutor real de solo deltas17/18, ledger/ACL/extensión, atomicidad y escritores cerrados; aprobar paquete exacto después | DDL ni adoptar objetos con procedencia desconocida |
| Validación D | Identificar runtime privado existente y rol app exactos; aprobar solo datos sintéticos y alcance del recorrido | Desplegar si falta ese runtime ni usar usuarios reales |
| GitHub / producción | Review independiente o decisión futura sobre excepción con sus precondiciones; CI automático de main separado | Aplicar1→0→1, bypass, merge o publicar |

Las fichas de recuperación ya pedidas al humano siguen en
[B-01](../plans/2026-10-16-phase-b-recovery-package.md); no se repiten ni se
suplen con datos inventados. No existe un «sí» genérico que cierre las condiciones
técnicas pendientes. No prometer prueba remota hoy antes de cerrarlas.

La continuidad legacy de cfa se conserva; no se migran historias ni se eliminan
cuentas. Captación sigue separada. NO-GO de publicación mientras haya gates
abiertos, incluso si el siguiente CI pasa. Informe por correo al destinatario
solicitado, sin credenciales ni datos de academias.
