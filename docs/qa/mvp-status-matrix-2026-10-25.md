# Matriz de cierre MVP — 25 de octubre de 2026

## Alcance

Esta matriz registra el candidato de la rama `codex/mvp-main-bridge-20261025`
y separa cuatro estados: **implementado**, **probado aisladamente**,
**comprobado en sandbox** y **publicado**. Una ruta o una prueba con mocks no
demuestra que el flujo esté desplegado o validado contra un usuario y datos
persistidos reales de sandbox.

## Corte vigente de validación

Último código publicado en la rama: `78c6e38b5359deeda2f67e6354a5d801136465d1`.
CI `40203109015`, gates `40203109025`, integridad SQL `40203109016` y replay PG
`40203116706` terminaron **SUCCESS**. Unitarias4914 PASS/3 omitidas; Owner
sintético Chromium/Firefox/WebKit pasa. E2E autenticado/readiness siguen omitidos.
Nuevas asociaciones familiares desde grupos, confirmación de pagador y persistencia
de comandos ambiguos están en trabajo local posterior, sin CI ni sandbox todavía.
No hay publicación en producción ni nueva entrega READY acreditada.

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
