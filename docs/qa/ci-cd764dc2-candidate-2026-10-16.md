# Candidato cd764dc2 — corrida única de atribución de trazas

## Estado observado — 2026-10-16, 07:37 UTC

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
