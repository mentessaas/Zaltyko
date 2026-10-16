# Candidato cd764dc2 — corrida única de atribución de trazas

## Cierre CI exacto — 2026-10-16, 08:10 UTC

CI38868296319 terminó **COMPLETED/SUCCESS**, updated07:59:04UTC, para
`cd764dc2de0d52bad5f5df4b49fbc3562f4cff27`. Main reconfirmó API y jobs;
gate116873698349SUCCESS. Static38868296301 y Directory38868296302SUCCESS
exactSHA (QA). Chromium/Firefox/WebKit: 1passed31.3/35.0/36.7s; fase next-build
213590.206/221241.228/231119.265ms, bajo240s. Cleanup reportado por runner:
07:43:30.864/07:51:14.916/07:58:57.716UTC; NO inventarioDockerindependiente.

Los3detailcomplete,22564events,249.893/263.09/262.911ms de análisis. Server
webpack96.3/103.3/109.8s; NFTglobal51.1/51.7/52.9s aggregate_only. Spans
inclusivos/solapados NOCPU/tiempoparedcausal.1225IDsdesconocidos,7spans
no soportados y1255rutas sinatribuir impiden cobertura universal; top10por
679client/1864servergrupos. **Timeout anterior NO reproducido; NO causa
raíz demostrada ni fix de rendimiento acreditado.** Frontend cerró revisión
readonly (cursor2): NO-GO optimizar código/config sin ajuste causal mínimo;
no inició inspecciones, pruebas ni ejecuciones. Todos los peers quedan IDLE.

Autorización **CONSUMIDA**, sin más push/rerun/dispatch/cancel ni despliegue.
Auth/readiness/public/smoke/LighthouseSKIPPED, no validación de producción.
Seguridad residual, esquema/orden/rolapp/recuperación/review/publicación
siguen **NO-GO**, independientes del CI verde. Backups ya consultados;
no repetir pregunta ni operarDB. Notas SOLOLOCAL, no empujar por documentos.
Fuente: docs/qa/ci-cd764dc2-candidate-2026-10-16.md y API/logs saneados del
[único run](https://github.com/mentessaas/Zaltyko/actions/runs/38868296319).
La cola y autorizaciones de debajo son HISTÓRICO, no estado vigente.

## Evidencia final saneada

| Navegador | Job | E2E reportado | next-build (traza) | worker server | webpack server |
| --- | --- | --- | --- | --- | --- |
| Chromium | 116866132067 | 1 passed, 31.3s | 213590.206ms | 117641.146ms | 96306.361ms |
| Firefox | 116866132190 | 1 passed, 35.0s | 221241.228ms | 125144.268ms | 103324.997ms |
| WebKit | 116866132116 | 1 passed, 36.7s | 231119.265ms | 132956.765ms | 109800.165ms |

Estos spans son inclusivos, no sumables como fases disjuntas. El build medido
por el sampler host que entregó QA fue214.2/221.9/231.8s; es otra medida,
no la duración oficial del job. APIjobs sí confirma los3SUCCESS y gateSUCCESS.
Unit/Build/lint/tipos/móvil/RLS/migraciones/SecuritySBOMSUCCESS; readiness,
auth, público, smoke y LighthouseSKIPPED por condiciones del workflow.

La lista top10 client incluye date-fns(835spans,12.3–13.2s inclusivos),
lucide-react(329,9.0–10.5s), globals.css(2,10.1–10.7s) y
motion.css(2,5.75–6.04s). Server date-fns(1672,21.6–24.9s) y
lucide-react(456,19.5–34.3s) son candidatos observados, NO causas demostradas.
La agrupación server unknown contiene1042spans/256–268s solapados:
no es un módulo ni coste de pared atribuible. Sentry se mantiene intacto;
aparecer en ranking NO autoriza quitarlo. No se ha optimizado ningún paquete.

NFT plugin server5.32–5.90s, traceEntryCount1268; collect-traced-files
367.396/393.453/398.771ms. NFTglobal51075.196/51666.844/52904.784ms,
apply-include-excludes233.791/250.936/251.037ms, ambos aggregate_only.
No hay atribución NFTglobal a ruta/módulo ni prueba causal del timeout.
Lectura complete no significa cobertura total: moduleCoverage.complete
describe procesamiento del input acotado, no emisión de todos los grupos.

Main comprobó el marcador exacto
`Supabase local stack stopped and disposable data volumes removed.`
en los3logs a07:43:30.8642822/07:51:14.9160260/07:58:57.7168244UTC.
El primer filtro buscó otro texto y devolviófalse; NO era fallo de cleanup.
El escaneo QA de “supabase stop” tampoco prueba ausencia. Evidencia final:
cleanup REPORTADO por runner, no inventario independiente de contenedores.
No se descargaron artifacts/perfiles; solo campos cerrados del JSON saneado,
resúmenes de test y marcador fijo. No fuentes/env/secrets/filas reales.

Dictamen: la corrida sintética pasó; no reprodujo el timeout anterior.
No afirmar rendimiento arreglado, causa única, cobertura auth remota ni
pilot-ready. Frontend cerró interpretación readonly: NO-GO optimización;
unknown/solapamiento/top10 impiden ajuste causal mínimo demostrado.
No repetir CI ni pedir otra autorización de ejecución por este resultado.

## Estado observado — 2026-10-16, 07:37 UTC (histórico)

Main envió un único push normal a la rama existente de PR226 a las07:36UTC:
`bf0aad14` → `cd764dc2de0d52bad5f5df4b49fbc3562f4cff27`.
La autorización humana adicional está **CONSUMIDA**. No otro push, rerun,
dispatch, cancelación, nuevos jobs/runners, merge o despliegue.

| Workflow exactSHA          | ID          | Estado observado            |
| -------------------------- | ----------- | --------------------------- |
| CI                         | 38868296319 | QUEUED; creado07:36:32UTC   |
| Static Gates (operational) | 38868296301 | SUCCESS; updated07:37:07UTC |
| Directory integrity        | 38868296302 | SUCCESS; updated07:37:09UTC |

Fuentes: API de GitHub `gh run list --commit cd764dc2...` y resultado del push.
[Corrida CI](https://github.com/mentessaas/Zaltyko/actions/runs/38868296319).
QA del release observa únicamente ese run, con backoff y sin acciones remotas.
No hay aún matriz funcional, cleanup ni gate de esta corrida. No trasladar
PASS de otros SHAs. Queued no es fallo ni bloqueo de publicación adicional.

## Revisión e integración

Código fuente revisado: `e8782f3a67466902a000109161d51b3db904d8f4`.
El candidato añade documentación, sin cambio TS respecto a ese SHA.
Frontend entregó1799cda4; Main integró solo catálogo/parser/runner/tests
medianteapply_patch y comprobó cuatro blobs idénticos. QA encontró un agregado
traceEntryCount sin cota total; Main lo corrigió en e8782f3a. QA final dio GO
estático para UNA corrida, no publicación. No Changelog temporal integrado.

Main85/85 pruebas sintéticas en5suites,18.60s(tests2.97s),tsc noEmit
incrementalfalse exit0, ESLint0warnings, Prettier4files+docPASS,audit:env73
variables documentadas sin valores,diffcheckPASS. Ningún install/build/E2E/
Docker/pull local. Warning pnpmignored no acredita mitigaciones de paquetes.

[Contrato, límites y semántica](./build-trace-attribution-2026-10-16.md):
traza existente postbuild,catálogosfijos,2pass/ancestryvalidada,workerancla
cerradaúnica,top10cooperativo64,unknown/partial/counterscerrados.
Lectura8MiB/línea1MiB/100kevents100knodes/depth64,1scooperativo nohardkill,
informe16KiB; stderr con sobre/progreso+newline<=16653bytes(<17KiB).
traceEntryCountindividual/agregado0..1e6; overflowomitetotaly bloqueareentrada.
Sin perfilescrudos, fuentes, secrets, env, IDs runtime o filasreales.

Spans inclusivos/solapados NO equivalen a CPU o fases disjuntas. NFT global
aggregate_only no atribuye por ruta/módulo. Un worker que no devolvió eventos
antes de ser interrumpido no queda recuperado. Ausencia de span no prueba
ausencia de trabajo. Siete plantillasowner no son cobertura universal.

## Protecciones y gates separados

Readonly GH07:28–29UTC y Vercel reconfirmado07:36UTC: previewDeploymentsDisabled
true/productionBranchmain,vercel.jsondeploymentEnabledfalse; Deploy309380364
disabled_manually/manualfailclosed sincreds; mainstrict/admins/1review/
dismissstale/6checks; Actionsread/noapprove. Productionmainonly,
preventselfreviewtrue y can_admins_bypasstrue: no garantía absoluta.
PR226OPEN/DRAFT/REVIEW_REQUIRED antesdelpush. Sin cambios de protecciones.

GitHub al push informa7vulnerabilidadesdefault(2critical5high); no es un
audit nuevo de aplicabilidad. Seguridad residual, esquema/orden/rol efectivo
de aplicación, recuperación y revisión independiente siguen pendientes.
Sin DDL/restore/export/pagos ni datos reales. Backups ya preguntados, no reiterar.
**NO-GO publicación**, incluso si esta corrida llega a verde.

Notas posteriores al push serán soloLOCAL: no disparar otroCI por documentos.
