# Matriz de cierre MVP — 25 de octubre de 2026

## Alcance

Esta matriz registra el candidato de la rama `codex/mvp-main-bridge-20261025`
y separa cuatro estados: **implementado**, **probado aisladamente**,
**comprobado en sandbox** y **publicado**. Una ruta o una prueba con mocks no
demuestra que el flujo esté desplegado o validado contra un usuario y datos
persistidos reales de sandbox.

## Corte vigente de validación

Candidato `474369eade24bd2d647290eefc4523e6c814eb83`: CI40221784665
COMPLETED/SUCCESS, incluidos Chromium/Firefox/WebKit, 5084 unitarias PASS
(3 omitidas), build, tipos/lint, seguridad/móvil y controles SQL. Replay
PostgreSQL40221815751 SUCCESS con diez suites nativas. El árbol del merge CI
c2c649fc es idéntico al HEAD:3dd21b4ee4df158d0c9b8cf8ca5a95bedbc5fcbb.

Preview de entregas diferenciada READY:
https://zaltyko-delivery-preview.vercel.app → dpl_BH3CCeYirKqdZsQg5YehLCkyzYhZ,
SHA474 exacto. Preflight14 booleanos true, gate remoto225 PASS, tipos PASS,
Next249391ms bajo360000,653 trazas/cero faltantes/CA incluida.
Health2026-10-25T19:20:59UTC: databaseok61.84ms,cronAuthmissing esperado.
Los42 alcances originales restaurados y comprobados; alias del ensayo sigue
fijo en dpl_8GL6DqKiuuZUoPs44fjbmRpHaZhY. Cero builds/pruebas locales.

No acredita aún recorrido autenticado de esta entrega: registro dedicado
preparado con contraseña vacía y condiciones sin aceptar; dos nuevos callbacks
solo preparados, SIN guardar, pendientes de confirmación del control navegador.
No cuenta ni correo nuevos creados/enviados. Producción NO publicada.
Catálogo productivo de solo lectura:139 tablas en public; esquemas canónicos ausentes;
requiere nuevo diff específico y autorización SQL separada. Main exige revisión
externa, sin bypass. Impago terminal natural pendiente de26 de octubre, ensayo intacto.

Los cortes que siguen son históricos y no sustituyen el estado anterior.


`7a42421ac04fd82a4ed3d63d328927cb9b638eeb`: PostgreSQL remoto
`40220734876` SUCCESS; CI `40220720889` build, lint/tipos, controles SQL,
móvil, seguridad y unitarias 5084 PASS/3 omitidas. Chromium superó perfil
del tutor y archivo (origen canónico resuelto), pero agotó 300s esperando
la etiqueta exacta del selector familiar en el alta nueva. Se separan
etiquetas y selects con htmlFor/id, también para grupo/sede; regresión
unitaria por rol/nombre accesible y assert visible previo al selector E2E.
No se amplían timeouts ni se retiran comprobaciones. Corrección aún sin CI.
Árbol del merge temporal CI `4960aa78` y HEAD idénticos:
`40a6b41a6b03078a41f66595480fba3f48466aa6`. Sin publicación de esta entrega.

`ab97a47cb7db404458df8e8147d95c3d68b0b447`: replay remoto
`40219817117` SUCCESS con diez suites PostgreSQL, reconstrucción vacía,
ACL/RLS, aislamiento, concurrencia y rechazo sin escrituras parciales.
CI `40219808150`: build, lint/tipos, SQL, móvil y seguridad SUCCESS;
unitarias 5082 PASS, 2 FAIL y 3 omitidas; otros navegadores pendientes al corte.
Los fallos de UI se corrigen separando ayuda mediante aria-describedby de la
etiqueta de fecha y conservando Asistencia en los cinco accesos diarios móviles
(Gimnastas permanece en Más). Chromium FAIL por
`invalid-origin` en el PATCH del tutor: fijar el hostname a la IP no bastó.
Next 15.5.12 `NextURL.parseURL` sustituye las IP loopback por `localhost`
(fuente oficial: `packages/next/src/server/web/next-url.ts`, líneas 22–30).
El harness pasa ahora navegador y servidor a `localhost`, conservando puerto,
guards de red y CSRF de producto sin cambios. Nueva ejecución aún pendiente.
No hay preview nueva READY ni publicación de esta entrega.

Los cortes siguientes son históricos.

Corte1e66: PostgreSQL40218353564 SUCCESS y build40218342190 SUCCESS;
unitarias5067PASS/1FAIL/3omitidas (expectativa de whitespace SQL, corregida),
Chromium rechaza PATCH de perfil con403. Captura PNG del runner confirma
mensaje de origen, no denegación de tenant. Se fija exclusivamente hostname
loopback del servidor sintético al mismo host validado del navegador y se observa
Origin real sin inyectarlo; pendiente CI, no se relaja hasSameOrigin ni producción.
Nuevo lote intake/fechas/E2E aún sin ejecución ni publicación.

Correcciones de pruebas enviadas en `1e66b4d4ce555a1589674c34a6d755d93c1664bd`.
CI40218342190 y replayPG40218353564 en curso. Review GitHub obligatoria
sigue REVIEW_REQUIRED; no promoción, merge ni despliegue de esta entrega.

Corte posterior de `576db57c`: el build remoto pasó, pero las unitarias
fallaron (5060 PASS, 8 FAIL, 3 omitidas) y Chromium rechazó un selector
ambiguo de familia existente. Se corrigen mocks de UPDATE/colas entre tests,
expectativas de autorización por sede, un literal Unicode mal acentuado,
la relectura previa al replay y selección por rol combobox. No se eliminan
asserts de aislamiento/persistencia y no se publica este corte fallido.

Candidato actual enviado: `576db57c3ef75c28b738849e1c9cbd5f2e0f63d5`.
Replay PostgreSQL remoto `40217881995` SUCCESS: reconstrucción vacía,
RLS/ACL, aislamiento y las ocho suites nativas, incluidas ficha por sede,
perfil de tutor y archivo ordinario. CI `40217622706` en curso al corte:
lint/tipos, RLS, migraciones, móvil y seguridad SUCCESS; build, unitarias
y navegadores aún no acreditados. No hay despliegue de esta entrega.
Las referencias siguientes conservan estados históricos.

Corte posterior: `0504f78bafdd67db27c17420404802d8b2864973` terminó con
CI completa `40213750248` SUCCESS y replay PostgreSQL `40213810321` SUCCESS.
La repetición de WebKit pasó con el mismo código de producto; no se ha demostrado
la causa del fallo intermitente anterior. El candidato añade captura PNG de
fallos sintéticos durante tres días, sin trazas, estado de autenticación ni vídeos.

**No publicar ese corte:** la revisión estática posterior encontró que la lectura
de una ficha podía aceptar como sede propia la de un hermano de su familia.
El parche separa las sedes del objetivo del ámbito ampliado necesario para editar
una persona compartida. Es un hallazgo estático; no acredita exposición de datos
reales. El parche y su regresión PostgreSQL aún no tienen validación remota.

También están implementados, pendientes de revisión final y CI remota, la edición
versionada del nombre del tutor y el archivo ordinario de gimnastas. El archivo
conserva identidad, familia, asistencia y deudas, termina vínculos operativos y
permanece disponible para Owner/Admin de todas las sedes aunque haya exceso SaaS.
No exime otras escrituras del bloqueo. Las tres nuevas suites PostgreSQL están
incluidas en el runner desechable y excluidas de la suite unitaria ordinaria.
No se ha ejecutado ninguna prueba ni build en el Mac ni desplegado estos cambios.

Los párrafos siguientes conservan los cortes históricos, no el estado vigente.

Último código enviado: `be8ae1735ebc5818559133e04cbe6a36fbc80f59`.
Replay PostgreSQL `40211462505` SUCCESS: reconstrucción vacía, RLS/ACL,
aislación entre academias y las cinco suites nativas terminaron con exit0.
Incluyen los casos de251cargos,105sesiones y contactos; no se extrapola a sandbox.
Gates operativos `40211452398` e integridad SQL `40211452390` SUCCESS.
CI `40211452403` FAILURE: unitarias, build, lint/tipos, móvil, seguridad/SBOM,
RLS, integridad Drizzle y Chromium/Firefox SUCCESS. WebKit falló en
`tests/e2e-owner-local-setup.spec.ts:489`: POST de membership aceptado yUUIDválido,
pero el nombre esperado no apareció en15s. No atribuir aún causa a producto o test.
Job121223429088, build169772,824ms; no fue un timeout de build.
Unitarias:5011PASS/3omitidas,648archivosPASS/1omitido; duración369,10s.
Fuente directa: log del job121223429063.
Los jobs autenticados/públicos omitidos no equivalen a pruebas aprobadas.
Árbol del mergeCI9a1e8fbb y del candidatobe8 coinciden:
`01d27c50a369a7c87049fbfe7c3c88f344a49fd5`.

GitGuardian incidente38975292 detectó la URI del fixture
`tests/delivery-preview-preflight.test.ts:22`, commit e1f781f4, con password
literal `synthetic`. Inspección del parche y clasificación mediante sesión
GitHub existente: Ignored / Not a secret (false positive). Sin cambios de
reglas, escáner, credenciales ni rotaciones; el check GitHub anterior aún FAILURE
al corte, no declararlo PASS por la clasificación. La API de rerequest devolvió404;
no se insiste ni se fabrica un check. Fuente: dashboard de GitGuardian y API Checks.

Última validación completa histórica:78c6e38b, CI40203109015 yPG40203116706 SUCCESS.
No hay publicación en producción ni nueva entrega READY acreditada.
El ensayo conserva su alias, sesiones A/B y recursos protegidos.

Revisión estática de alta: no se documenta una identidad Owner remota disponible
fuera del ensayo. A/B no se reutilizan para altas. Un Owner/Admin con academia
recibe409 al repetir bootstrap; la UI también redirige Manager. El recorrido nuevo
requiere identidad QA dedicada sin membresías, buzón y consentimiento reales.
No crear cuentas ni confirmar administrativamente para presentar un alta verificada.

## Cortes anteriores conservados

El candidato enviado en el corte anterior fue `7f75490295368259782635b19e7b5164bc14b008`.
Incluye edicion canonica de nombre/apellidos del gimnasta desde Owner con permisos,
concurrencia y recuperacion de respuestas inciertas. La CI
[`40202187222`](https://github.com/mentessaas/Zaltyko/actions/runs/40202187222)
ha completado build, lint/tipos, movil, RLS, integridad Drizzle, seguridad y Chromium;
unitarias, Firefox y WebKit siguen pendientes al corte. No es PASS completo.
El replay PG `40202214967` completo ocho casos de capacidad/ficha y cuatro de
facturacion, pero fallo la asercion del quinto caso: Drizzle envuelve el error
PostgreSQL en `cause`. La correccion de esa asercion conserva los snapshots y esta
pendiente de un nuevo replay remoto. No afirmar rollback validado por ese caso aun.

El candidato anterior de entrega es `91eb0c21e2337d9b4dcbf47b170044fe4ef35551`.
Incluye aislamiento de preview de entregas: rama exacta y ensayo short-paid desactivado,
sin relajar controles de base, TLS, Stripe TEST, Redis ni proveedores externos.
La CI [`40199478736`](https://github.com/mentessaas/Zaltyko/actions/runs/40199478736)
ya acredita unitarias, lint/tipos, build, móvil, seguridad/SBOM, RLS, integridad
Drizzle y Owner sintético Chromium/Firefox/WebKit: SUCCESS completo. Gates operativos `40199478745` e
integridad de fuentes SQL `40199478752` terminaron SUCCESS.

El candidato anterior `b270d9f212efa74979bd262305fb8b17f3667137` pasó la CI
[`40197832794`](https://github.com/mentessaas/Zaltyko/actions/runs/40197832794),
incluidos los tres navegadores sintéticos, el parser BiDi real y las denegaciones
HTTP de roles comerciales. QA revisó estáticamente ese cambio y el aislamiento
posterior `e1f781f4` sin P1/P2; eso no sustituye la aprobación requerida por GitHub.

El padre integrado `8ff33d7e02322456db7bcac54a7a5b6a4bc0d983` pasó la CI completa
[`40196302196`](https://github.com/mentessaas/Zaltyko/actions/runs/40196302196):
instalación congelada, lint/tipos, unitarias, seguridad/SBOM, móvil, build,
RLS/integridad SQL y Owner sintético Chromium/Firefox/WebKit. Gates operativos
`40196302181` e integridad de fuentes SQL `40196302183` también SUCCESS.
Los jobs autenticados/readiness permanecen `if:false`; el skip no acredita
credenciales ausentes ni flujo sandbox. Público, smoke y Lighthouse omitidos
no cuentan como aprobados. No se ejecutaron pruebas ni builds en el Mac.

La procedencia desde `f626351` se conserva mediante el origen `d5b8d961`,
descendiente suyo, y una importación de sus 1.939 blobs `src` idénticos sobre
main, con cinco archivos adicionales de main. No equivale a ascendencia Git
directa ni a despliegue. Véase [procedencia e integración](mvp-integration-provenance-2026-10-25.md).
PR #234 sigue pendiente de aprobación requerida por GitHub. Dos intentos de preview
de entrega no llegaron a READY: uno cancelado y otro bloqueado por el preflight
al no heredar configuracion aislada completa. El alias del ensayo se conserva.
La revisión inicial de QA detectó la incompatibilidad BiDi;
la revisión estática del parche posterior quedó realizada sin P1/P2. La aprobación requerida por GitHub sigue pendiente.

La reconstrucción aislada de PostgreSQL desde vacío pasó en el run
[`40190197121`](https://github.com/mentessaas/Zaltyko/actions/runs/40190197121)
para `234599c92051714b9953393221a5e1be5069cbea`. No hay cambios bajo `supabase/`
desde ese SHA hasta el HEAD actual, por lo que el SQL revisado es idéntico; la
CI de fuentes SQL del HEAD actual es una comprobación estática, no un segundo
replay. Ninguna base existente recibió SQL.

## Estado por recorrido

### Corte posterior: PostgreSQL del commit corregido

El run [`40203116706`](https://github.com/mentessaas/Zaltyko/actions/runs/40203116706)
termino **SUCCESS** para `78c6e38b5359deeda2f67e6354a5d801136465d1`.
El runner reconstruyo el snapshot exacto en PostgreSQL desechable, aplico el
hardening y seed de referencia solo alli, comprobo ACL/RLS y aislamiento de dos
academias sobre 28 tablas, y rechazo aplicar el baseline a una base poblada o sin
marcador aislado. Las suites PG de capacidad/ficha y ledger manual terminaron con
exit 0, incluyendo rollback, emision concurrente y replay idempotente. El log de
exito no imprime el desglose individual: no se le atribuye un conteo no observado.
Esto sustituye el fallo de asercion del run anterior; no equivale a prueba contra
la base remota de sandbox ni a despliegue. La CI completa `40203109015` terminó SUCCESS en una lectura posterior.
El alias del ensayo fue releido y conserva `dpl_8GL6DqKiuuZUoPs44fjbmRpHaZhY`.

La suite unitaria remota del mismo corte termino con **4914 PASS y 3 omitidas**
(642 archivos aprobados y uno omitido), job `121198362837`. El checkout registrado
por ese job fue el merge temporal `614ae5cd2e8e2061b3801c2619cde559a86cda89`,
con padres main `f84fd6dc` y candidato `78c6e38b`. La API GitHub y Git local
confirman el mismo arbol `d606893bfc0a1d5f6a9f918d7763edd0cc64b053` para
ese merge y el candidato: identidad de contenido, no de commit. Build, lint/tipos,
movil, seguridad, RLS, Drizzle y Chromium aprobaron; Firefox y WebKit terminaron SUCCESS en una lectura posterior. La CI completa
aprueba; el flujo autenticado sigue NO VERIFICADO.

| Recorrido | Implementado en código | Probado aisladamente | Sandbox del candidato actual | Publicado |
| --- | --- | --- | --- | --- |
| Alta, consentimiento, confirmación, recuperación y academia | Sí, rutas Owner y bootstrap existentes. | Unitarios y Owner sintético pasan en CI; E2E autenticado **SKIPPED**. | **NO VERIFICADO** en este HEAD. | No; PR #234 requiere revisión. |
| Familias, tutores y gimnastas | Parcial: alta y asociación familiar presentes; edición canónica Owner de nombre/apellidos implementada en 7f754902. No acredita CRUD familiar completo. | Casos SQL de ficha pasan en PG desechable; unitarias y navegadores del corte78c6 pasan; diff familiar posterior pendiente. | **NO VERIFICADO** en este HEAD. | No. |
| Grupos, clases, horarios e inscripciones | Sí, APIs y contratos presentes; las escrituras revisadas usan guard transaccional de plan. | Unitarios y navegadores Owner sintéticos pasan. | **NO VERIFICADO** en este HEAD. | No. |
| Asistencia y cuotas manuales | Sí, incluye emisión de cuotas y registro de pagos manuales; no inicia cobros familiares automáticos. | Unitarios, E2E Owner sintético y CI pasan. | **NO VERIFICADO** en este HEAD. | No. |
| Dashboard y experiencia móvil | Sí, proyección Owner y cliente móvil presentes. | Build remoto, job móvil y navegadores sintéticos pasan. | **NO VERIFICADO** con una academia QA autenticada en este HEAD. | No. |
| Free: solo lectura sobre límite, archivo y contratación | Sí, el candidato aplica guard transaccional a escrituras operativas y deja lectura, archivo y cambio de plan como salidas de regularización. | Unitarios y E2E Owner sintético pasan; el SQL de snapshot se replayó desde vacío en SHA anterior con SQL idéntico. | **NO VERIFICADO** con sesiones A/B en este HEAD; límites y ausencia de efectos parciales requieren prueba sandbox. | No. |
| Checkout, Portal, webhooks y ciclo SaaS | Código y configuración Stripe TEST presentes. | CI de código pasa; eventos de Stripe previos son evidencia histórica y no validan esta versión ni el ciclo terminal completo. | **NO VERIFICADO** en este HEAD. | No; Stripe Live y producción no se han configurado/verificado aquí. |
| Reconstrucción SQL desde estado vacío | Snapshot y manifiesto con hash coherente; el SQL no cambió desde el replay. | Replay desechable PostgreSQL pasa para SHA `78c6e38b`; validación de fuentes SQL y RLS pasa en ese corte. | No se aplicó SQL al sandbox original ni se leyeron filas de negocio. | No. |

## Evidencia del esquema

- Origen autorizado: `Zaltyko E2E Sandbox` (`aeeootdmuiqkfeernskw`), PostgreSQL
  17.6, región `eu-north-1`.
- Artefacto de estado actual:
  [`20261024172153_sandbox_schema_snapshot_baseline.sql`](../../supabase/schema-snapshots/20261024172153_sandbox_schema_snapshot_baseline.sql),
  SHA-256 `fd1bf2597b0dfd40dc6db824fa24773461f2776fa2ed7c994649be534c6a4b36`.
- Manifiesto:
  [`schema-snapshot-manifest.json`](../../supabase/schema-snapshot-manifest.json).
  El hash recalculado localmente coincide con el manifiesto. El snapshot dice
  explícitamente que **no recupera el historial de migraciones**.
- Conteos observados del snapshot: 231 tablas, 326 políticas, 502 claves
  foráneas, 38 rutinas y 78 entradas de migración listadas por la herramienta
  de metadatos. La inspección actual confirma 231 tablas y 230 con RLS habilitada;
  estos conteos no demuestran semántica correcta ni igualdad objeto por objeto.
- Extensiones instaladas observadas: `btree_gist`, `pg_stat_statements`,
  `pgcrypto`, `plpgsql`, `supabase_vault` y `uuid-ossp`.
- Replay remoto desechable: workflow `40190197121`, job
  `121159357193`, ejecución Linux efímera; **SUCCESS**. No usa credenciales de
  Supabase/Vercel/Stripe y no escribe en el sandbox de origen. El SHA actual
  conserva exactamente los mismos archivos SQL.

## Evidencia autenticada del ensayo congelado (no del candidato)

El 25 de octubre, ambas sesiones QA existentes dieron GET usage 200 en
`dpl_8GL6DqKiuuZUoPs44fjbmRpHaZhY`: Free, solo lectura y excedentes
31/30 gimnastas, 4/3 grupos, 11/10 clases. Stripe TEST confirma A cancelada
y B past_due, factura abierta con dos intentos y siguiente intento natural
2026-10-26T09:17:29Z. Los dos eventos de fallo de B constan firmados y procesados
en sandbox. No acredita agotamiento terminal ni ausencia de grant nuevo sin
consulta específica del ledger. No se hicieron escrituras de rechazo ni archivo.
Las sesiones y observaciones están documentadas en la auditoría durable de 2026-10-22.

## CI del candidato inicial (histórico)

Run `40189930084`, SHA `234599c92051714b9953393221a5e1be5069cbea`:

- **Pass observados:** integridad de migraciones Drizzle, cobertura RLS,
  móvil y SBOM/seguridad de dependencias.
- **Fallo observado:** typecheck en `src/lib/limits.ts:349`, por incompatibilidad
  entre `AcademyOperationalUsage` y `Record<string, unknown>`. Se corrigió en
  el código fuente del candidato posterior; el resultado remoto aún no existe.
- **Pendientes al corte:** unitarios, build y E2E sintético; Firefox/WebKit en
  cola. Flujos E2E autenticados omitidos; el workflow los desactiva expresamente.
- Run `40189930100` (gates estáticos) y run `40189930073` (integridad SQL)
  terminaron correctamente para el SHA inicial; no sustituyen el flujo
  autenticado ni el replay completo de base vacía.

## Decisiones y siguiente paso

1. Obtener revisión independiente de PR #234 y CI de la nueva integración con
   PR #236. La procedencia desde `f626351` está acreditada por comparación de
   los blobs del origen recuperado y su importación; revisar ese registro junto
   a las resoluciones antes de integrar.
2. Ejecutar E2E autenticado contra **este candidato** usando solo las dos
   sesiones QA existentes y el sandbox autorizado. CI omite ese job mediante `if:false`; no se comprobó
   disponibilidad de credenciales a partir de ese skip. Hubo una restauración histórica de sesiones y
   lecturas de uso en otra preview, pero no acreditan este HEAD; no crear cuentas
   ni cambiar contraseñas, roles, fechas o suscripciones para marcarlo como
   aprobado.
3. Probar en sandbox los límites Free y que las escrituras denegadas no dejen
   registros parciales. Mantener intactas las cuatro academias protegidas y
   los ensayos de caducidad/impago.
4. Preparar preview de entrega separada y configuración productiva aislada solo
   después de cerrar los gates anteriores; los intentos de esta rama no llegaron a READY.
5. Mantener producción sin cambios. Ninguna consulta ni escritura productiva,
   migración de destino, promoción o cambio de dominio está aprobada por esta
   matriz.


## Entrega familiar posterior a085d092a — pendiente de ejecución

Nueva asociación familia/tutor desde grupo sin inscripción previa en clase, confirmación de cambio de pagador en cliente/servidor y rechazo de familia simultánea que haría ambigua la cuota manual. Misma familia, sucesión posterior y replay histórico conservados. El panel mensual conserva comandos ambiguos en sessionStorage con reintento manual exacto tras desmontaje y cercas de ámbito. Nueve casos PostgreSQL añadidos al runner aislado, con snapshot15tablas para rechazos/rollback. Estos cambios están implementados y revisados estáticamente, pero NO VERIFICADOS por CI, sandbox o publicación en este corte. Contactos de tutores y CRUD familiar completo siguen pendientes; no se declara terminada la vertical completa.


### Primer replay de entrega familiar: no aprobado

Run40207633011 fue rechazado por expected_sha erróneo antes de instalar o iniciarPG; la cancelación llegó tras su terminación. Run40207666295 usó el SHA correcto18e4f0fea3e0f6eb44d01432e07d1a947e5fe721 y ejecutóPGaislado:13PASS previos y9FAIL de familia. Las nueve fallaron porque la fixture sembró4grupos bajoFree3 y quedó en sololectura. Se ajusta exclusivamente a3grupos (dosA y unoB compartido por dos gimnastas), con precondición explícita de uso3/3/0 y readOnlyfalse. No se relajan guards del producto ni snapshots. Nueva ejecución pendiente.


### Pagos manuales: implementación posterior a18e4f0fe

Paginación50+1 sustituye tope silencioso250; siguiente página con cursor de posición reautorizado y orden total due_at/ref/id conservando microsegundos. UI conserva selección y descarta respuestas antiguas al cambiar ámbito. Nuevo caso PGreal251cargos/seispáginas/otra sede/academia y casos UI/unidad/ruta pendientes de CI. No nueva infraestructura/secreto, sin cambio del POST monetario. Sandbox/publicación NO VERIFICADOS.


### Replay59da53f5:20PASS y3FAIL de fixtures

Run40208221416 reconstruyóPGaislado y ejecutó23casos:20PASS y3FAIL. El nuevo caso251cargos falló por cast42846 al interpolar arrays Drizzle como tupla; se corrigen solo las entradas de fixture a ARRAY[...]::uuid[] con parámetros tipados. Dos casosfamilia usaban atletasB/C con sedeA y fueron rechazados por elegibilidad; sus comandos se anclan a sedeB real sin cambiar guardas. Estas correcciones de fixtures están pendientes de un nuevo replay; no son PASS aún. Build y lint/tipos remotos del59da pasan al corte; unitarios y navegadores siguen pendientes.


### Correcciones tras unitarios del59da53f5 — no aprobadas aún

CI40208193151: build, lint/tipos, seguridad, SQL, mobile y recorridos sintéticos Chromium/Firefox PASS; unitarios FAIL y WebKit aún en curso al corte. La suite no está aprobada. Los fallos identificados son hash del runner desactualizado en manifiesto (no cambió el SQL snapshot), mocks de probes familiares/confirmación, labels duplicados y contaminación de sessionStorage entre casos mensuales. Se corrigen fixtures sin retirar la persistencia ni los guards. El cursor de pagos ahora rechaza caracteres fuera de base64url en la frontera HTTP antes de invocar el servicio.

### Contactos de tutores — implementación pendiente de gates

Hueco demostrado: la asociación familiar no permitía gestionar el correo/teléfono principal del tutor desde Owner. Nuevo GET/PATCH exige actor y academia/sede verificados, rol permitido y alcance de todas las sedes por tratarse de PII compartida. Guarda transaccional con clave idempotente, versión exacta de seis microsegundos y conservación de contactos anteriores; cambiar destino no acredita verificación ni envía mensajes. UI conserva el comando exacto ante respuesta incierta y recupera explícitamente; no crea cuentas ni activa proveedores. Se incluyen pruebas HTTP/UI y cinco casos PG reales en el runner desechable; nada ejecutado localmente. Implementación, revisión y pruebas remotas siguen siendo estados separados. No se publica con CI roja.


### Replaya004af54:24PASS/4FAIL — bloqueo de payload corregido, pendiente de rerun

Run40209662912 reconstruyó PG y terminó24PASS/4FAIL de28casos. Las tres suites previas pasan, incluidos251cargos paginados y nueve casos de familia. Cuatro casos nuevos de contacto fallaron antes del commit por `assertAnalyticsSafePayload`: guardianId está prohibido dentro de payload por política vigente. Se conserva guardianId exclusivamente en aggregateId (ya comparado explícitamente en replay) y se elimina su redundancia del payload y de la comparación de payload; actor/fingerprint permanecen exigidos. No se modifica la política ni su expresión regular. El caso PG exige ahora ausencia de guardianId en payload. Nueva ejecución requerida; no se atribuye PASS al bloque contacto. Gates40209655742 y SQL40209655758 SUCCESS; CI principal sigue en ejecución.


### Unitariosa004af54 —4986PASS/12FAIL/3omitidas

Job121218042399 cerró con643archivosPASS/3FAIL/1omitido. Quedaron fallos de los nuevos tests de contactos (copy/receipt/almacenamiento), un fixture de email que solo medía253 pese a esperar rechazo por superar254, y selector exacto de la fecha efectiva que incluía ayuda accesible. Se investigan/corrigen sin rebajar contratos. CI principal no es verde. Build y lint/tipos del mismo corte sí terminaronPASS.

### Asistencia: paginación de sesiones preparada

El selector anterior limitaba100sin señalizar truncamiento. GET y SSR ahora ofrecen páginas50+1 por(starts_at exacto,id), nextCursor y selectedSession separado si fue solicitado expresamente y no está en la página. Cada solicitud vuelve a autorizar actor/academia/sede, estadosscheduled/completed y ventana móvil±30d; el cursor no lleva filtros confiables ni secretos. No equivale a snapshot consistente ante cambios de datos/tiempo. UI carga más sin repetir POST, preserva selección y descarta respuestas viejas de otro ámbito. Nuevo PG105sesiones y testsHTTP/UI preparados; sin pruebas/build locales. El runner solo ejecuta esta suite enPGdesechableCI.

Contactos suma tres casosPG adicionales: aislamiento entre academias, sede sin vínculo y replay trasFree31/30con nueva escritura rechazada sin efectos parciales. Pendientes de ejecución remota.


### Replay06f7cb48:31PASS/2FAIL — limpieza incompatible de fixture

Run40210746095 terminó31PASS/2FAIL de33casos. Las cuatro suites de capacidad, ledger, familias y contactos pasan, incluidos los nuevos rechazos entre academias/sede y replay de contacto bajo sololectura. La suite de sesiones falló al terminar cada caso porque su finally borraba la organización y disparaba la protección append-only de organization_entitlement_changes. Esa limpieza podía ocultar el resultado del cuerpo; no se acredita aún la paginación105sesiones. Se retira solo ese borrado: UUIDaislados sobreviven hasta destrucción completa de la base desechable por el runner. Sin desactivar triggers ni borrar historia. Rerun necesario; fuenteSQLbaseline intacta. Gates40210735472 e integridad40210735562 SUCCESS; lint/tipos del mismo candidato PASS al corte y resto CIpendiente.


### Corrección de los tres unitarios restantes del06f7cb48

Job121221283687 terminó5008PASS/3FAIL/3omitidas (647archivosPASS/1FAIL/1omitido). Dos expectativas del test de contactos no coincidían con la interfaz: mayúscula de «Se muestran...» y botón que correctamente no se renderiza ante GETinválido. El tercer caso intentaba simular sessionStoragebloqueado espiando la instancia Storage, que jsdom trata como almacenamiento con propiedades nombradas; no interceptó setItem y permitió el PATCH de la fixture. Se espía Storage.prototype.setItem para comprobar realmente que el producto no envía nada cuando falla persistencia. No se cambia producto ni se retiran los asserts de fetchúnico/marcadorvacío. Cambios pendientes de nuevaCI, sin pruebas locales.


### Diagnóstico WebKit sin rebajar la prueba

Revisión estática: fixturegiven/familyName, insertSQL yconcat_ws delbundle coinciden;
router.refresh ocurre después del recibo confirmado. No se demuestra causa para
cambiar selector, tiempo ni forzar refreshmanual. La ejecución no conservóPNG.
Se añade solo upload de test-results/**/test-failed-*.png, failure-only, retención3d,
acciónoficialupload-artifactv7 fijada acf430e030ddbb5b0abf93d22962f4752f3646cd9.
No se suben trace/video/HTML/estado/cookies/red ni se cambian producto o asserts.
El siguiente push de esta evidencia también permite que GitGuardian reanalice el
hallazgo ya clasificado; no se fabrica uncheck ni se omite el gate requerido.


### Siguiente entrega: huecos demostrados y bloqueo de aislamiento

La ejecución0504f78b solo añade diagnóstico y documentación sobre el producto be8.
PG40213810321 y GitGuardian121230335867 terminaron SUCCESS; CI40213750248
sigue pendiente deWebKit al corte. No se despliega0504 aunque esaCI pase: revisión
estática detectó un defecto de aislamiento en GET del perfil de gimnasta.

`loadAffectedProfileScope` une las sedes propias con las de hermanos de familia.
`assertProfileScopeAccess` usa esa unión para autorizar lectura del target; por tanto,
un gestor con sedeA podría leer el nombre del target sin ancla propiaA, aprovechando
el vínculo de un hermanoA. Es evidencia estática, no exposición remota comprobada.
La corrección debe exigir sede propia del target paraGET y conservar la unión
solo para proteger modificaciones de la identidad compartida. Se prepara regresión
para targetB/hermanoA y target sin relaciones; sin aflojar permisos.

Huecos de operativa demostrados: el archivo ordinario de gimnasta no existe fuera
de la regularización por excedente; el nombre del tutor no tiene edición canónica.
Se preparan API/servidor/UI/pruebas para ambos como siguiente entrega, sin tocar
la ruta de regularización, datos remotos, cuotas históricas ni fixtures del ensayo.
La ficha sin grupo necesita comando explícito de alta y primera asignación: las
rutas actuales exigen ancla previa en sede. No se elimina ese requisito ni se
inventa un grupo automático; el vínculo familiar anterior requiere revisar todos
sus consumidores antes de habilitarlo. Sigue pendiente, no se marca implementado.


## Lote pendiente de CI — perfiles y archivo ordinario

Revisión estática independiente sin P1/P2 demostrables para archivo/UI y perfil
tutor; no equivale a prueba ejecutada. El PATCH del tutor exige origen propio
antes de resolver scope. El perfil abierto/pending bloquea cierre y mutaciones
vecinas sin bloquear su propio reintento exacto. Nuevas pruebas cubren ese estado
tras remount y marcadores inválidos. El recorrido sintético autenticado remoto
incluye renombrar al tutor, verificar DB y recarga, y archivar al gimnasta como
última escritura preservando familia, asistencia y ledger. El vínculo familiar
usa fecha civil actual de la sede consultada en la DB desechable; la cuota sigue
en el periodo siguiente. No se cambiaron aserciones/timeouts del paso WebKit
históricamente intermitente. Suite PostgreSQL nativa ampliada de cinco a ocho
archivos. Todo este lote sigue pendiente de ejecución remota al registrar la nota.
