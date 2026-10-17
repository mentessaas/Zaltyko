# Hub primario por digest para el plan activo — 2026-10-15

## Alcance de esta entrega

Implementación local aislada desde `0dfb8762d5f8eda83b0213b4210bec0ad0c744a2`.
La selección primaria Hub es la pertenencia exacta al plan activo versionado de
11 imágenes y requiere además el pin ECR exacto. El catálogo/pins siguen en 13;
Studio y `postgres-meta` permanecen excluidos de la precarga. Si se invoca el
helper directamente para esas dos referencias, mantienen ECR como primario y
Hub solo ante un status entero positivo con rate-limit exclusivo.

## Secuencia y protección de identidad

Para cada imagen activa ausente del daemon: un pull de
`docker.io/<repositorio>@<manifest-fijado>` con `--platform linux/amd64`,
verificación de plataforma/config SHA-256/RepoDigest, retag del ID verificado al
ref ECR exacto y postverificación. Conserva seis checks de identidad, alias
exactos permitidos derivados del pin, errores saneados y 600s compartidos por
imagen. Un error, timeout/cancelación, status inválido, identidad incorrecta o
agotamiento de presupuesto detiene el flujo sin retry ni llamada a ECR.

El plan activo, las exclusiones, los pins, sus versiones/digests y el atajo de
imagen ya presente no cambian. La inspección local inicial que devuelve éxito
sigue omitiendo el pull sin verificar allí la identidad de esa imagen.

## Evidencia de pins y límites

La evidencia guardada compara 13/13 manifiestos ECR y Hub para `linux/amd64`;
los digests coinciden. El catálogo conserva el config SHA-256 fijado por imagen,
que el helper exige al inspeccionar tanto el origen Hub como el tag final. No se
descargaron blobs de configuración/capas en aquella comparación y no se repitió
ninguna petición de registry para esta entrega. El mapa de imágenes corresponde
a Supabase CLI `2.84.2`; la versión del daemon Docker no está fijada por el
preloader, que solo exige respuesta no vacía a `docker info`.

La matriz tiene tres daemons independientes y serializados. Si las 11 imágenes
faltan en los tres, el techo sería 33 pulls Hub; el código conserva el skip de
imágenes ya presentes, por lo que no se afirma que todas se descarguen. Cuota,
disponibilidad y rapidez de Hub: **NO VERIFICADAS**. El cambio elimina la
petición ECR primaria para el conjunto activo, pero no demuestra causa raíz,
resolución del fallo imgproxy/Logflare ni estabilidad del build de 240s.

## Validación local

Vitest focal con mocks: 4 archivos, **391 tests PASS**. Incluye selección exacta
11/2, secuencia y fallos por etapa, reloj/presupuesto, identidad Kong y otros
repositorios, negative cases de los 13 pins, fallback directo de las dos
exclusiones y precarga limitada a 11. No se ejecutaron instalaciones, build,
E2E, Docker, pulls, CI ni escrituras remotas. TypeScript `--noEmit`, ESLint focal
sin avisos y Prettier focal pasan. La revisión QA/Frontend/Main queda pendiente;
esto no autoriza otra ejecución CI.

## Integración Main — 12:40 UTC, solo local

Main integra los hunks de Backend `c98077a6` tras Frontend110/QA184 GO estático,
sobre HEAD local `fd69f178`. Se preserva la nota histórica de Logflare en su ruta
original. Tampoco se elimina su suite: sus dos matrices que exigían ECR se
acotan a las dos exclusiones, manteniendo los demás negativos de Logflare.
La nueva matriz prueba además excepciones lanzadas en las cuatro etapas para
los once pins, atendiendo el hueco menor observado por QA184.

Primera batería Main: 506 PASS y 3 FAIL de 509; tres expectativas de Kong aún
exigían las cinco llamadas antiguas con ECR. Se actualizan a igualdad de la
secuencia exacta de cuatro comandos Hub/inspect/retagID/postinspect, sin cambiar
las comprobaciones de identidad. Segunda batería: **509/509 mocks PASS en
12 archivos**, 10.50s (tests2.45s). Frontend111 y QA186 GO estático de la variante
integrada; TypeScript `--noEmit --incremental false` terminó exit0.
ESLint focal sin avisos, Prettier8files/diff-check y audit:env73 PASS.

Sin installs, build, Docker, pulls, E2E, CI, push, DDL ni escrituras remotas.
Frontend109 no identifica un ajuste mínimo justificable para el build240s:
conservar Sentry/tracing/Node22/entorno/plazo. El cambio de origen no soluciona
por sí solo ese bloqueo y no autoriza automáticamente otro candidato/CI.
CI remoto sigue en0dfb FAILURE; seguridad, esquema/rolapp/recuperación,
review independiente del PR y decisión de publicación siguen NO-GO.

Fuentes: [pull por digest y plataforma](https://docs.docker.com/reference/cli/docker/image/pull/),
[comparación previa de manifiestos](./ci-firefox-build-images-evidence-2026-10-15.md).
Changelog Supabase revisado: .NET14oct y deprecación TLS HTTP efectiva10nov no
cambian este mapa local CLI2.84.2 ni acreditan disponibilidad de los registros.

## Siguiente evidencia y decisión requerida

Main consultó únicamente metadata de artifacts del run38731333899: un SBOM,
sin artifact de perfil del build; no se descargó su contenido. Los logs actuales
no separan CPU/memoria/IO del tramo final. No se repite la investigación estática
ya cerrada por Frontend109 ni se inventa una optimización.

Se solicita decisión específica para una única corrida adicional del CI existente
con medición acotada y saneada de CPU/memoria del build, sin nuevos runners/jobs,
ampliar240s, retirar checks, Sentry/tracing, acceder a datos o desplegar. No está
autorizada todavía: no se ha implementado instrumentación ni empujado4f62f423.
No repetir la petición automáticamente mientras espera respuesta humana.

Actualización posterior: el usuario responde explícitamente «Si te autorizo a
todos pero termina de poner todo listo» al permiso solicitado. Se autoriza esa
única corrida adicional con métricas saneadas; Backend prepara local aislado y
Frontend/QA/Main revisan antes de integrar/push. Todavía no se implementó ni
ejecutó el diagnóstico en CI. Se conservan240s/checks/matriz/Sentry/tracing y
protecciones; no autoriza merge/despliegue ni uso de datos reales.

### Seguimiento de implementación — 13:57 UTC

Frontend asume completar el helper, wiring y pruebas en copia aislada basada en
`844902db`. Backend deja un helper parcial, sin tests/wiring/commit de entrega;
su cierre posterior respondió billing histórico y **no acredita** la tarea de
instrumentación. No se recrea ese servicio ni se integra el parcial sin revisión.
QA espera el diff completo y Main conserva únicamente documentación local.

La medición aprobada es de ámbito **host**, que incluye los servicios Supabase,
no de consumo atribuible exclusivamente al proceso Next. Cinco fuentes fijas de
`/proc`, máximo una muestra por segundo, 250 muestras y lecturas acotadas; solo
un resumen numérico cerrado. La primera línea CPU completa puede aceptarse del
prefijo acotado de `/proc/stat`, aunque su cuerpo posterior sea mayor; no se
procesan los registros de procesos ni el resto de ese cuerpo.

Según las [referencias del kernel para procfs](https://www.kernel.org/doc/html/v6.10/filesystems/proc.html),
MemAvailable es una estimación e iowait tiene limitaciones y puede decrecer.
Las [métricas PSI](https://www.kernel.org/doc/html/v6.6/accounting/psi.html)
son proporciones de tiempo en espera sobre ventanas móviles; `avg10` no es
porcentaje de CPU del build ni una ventana exclusiva de su ejecución. Los
resultados se interpretarán con esos límites, sin afirmar causalidad.

Pendientes entrega, revisión estática QA/Main, contratos con mocks y checks
locales. No se ha ejecutado la corrida autorizada ni empujado un candidato.
