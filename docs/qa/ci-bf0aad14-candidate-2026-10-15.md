# Candidato bf0aad14 — una corrida acotada autorizada

## Cierre verificado — 14:37 UTC

Main API/logs y QA208 confirman **CI38749323693 COMPLETED/FAILURE**, SHA exacto
`bf0aad14b51e27ec149ddd74738ba31be97ae5b9`, updated14:35:30UTC.
Gate116483093666 FAILURE/completed14:35:29UTC. Static38749323931 y
Directory38749323676 SUCCESS, ambos exactSHA. Unit/Build/lint/tipos/móvil/
RLS/migraciones/SecuritySBOM SUCCESS; readiness/auth/Public/Smoke/Lighthouse
SKIPPED. Los omitidos no acreditan pruebas del destino.

| Proyecto / job | Resultado y build | Host: muestras / duración / memoria disponible mínima / PSI CPU some máximo | Cleanup reportado por runner UTC |
| --- | --- | --- | --- |
| Chromium116471243746 | Timeout240000ms antes de Playwright; compiled185730/generated214976/optimizing-tracing222384ms | 240 /240205ms /7973.33MiB(49.87%) /30.08% | 14:19:46.952 |
| Firefox116471244247 | SUCCESS: test26.9s; resumen Playwright1PASS36.2s; next-build238910.458ms; hitos177807/206601/214233/214233ms | 240 /239646ms /8263.66MiB(51.68%) /25.85% | 14:27:23.759 |
| WebKit116471244090 | Timeout240000ms antes de Playwright; solo compiled224977ms | 241 /240834ms /7935.24MiB(49.63%) /30.22% | 14:35:20.733 |

En los tres: CPU host máxima100%, cero lecturas no disponibles. Swap máximo
Chromium0.02734375MiB/Firefox-WebKit0.046875MiB. PSI memoria some/full máximos:
2.17/2.17%,3.52/3.3%,2.57/2.17%; PSI I/O some/full máximos:
10.62/10%,11.95/10.9%,6.78/6.78%, respectivamente.
No son muestras alineadas ni atribución de CPU a Next: incluyen Supabase,
máximos aislados no explican el timeout y MemAvailable no acredita límites
por proceso/contenedor ni ausencia universal de presión. Cleanup es texto
del runner, no inventario Docker independiente. No nuevos pulls/builds locales.

Trazas completadas: Chromium webpack3spans sum180842.972/max144140.456ms;
WebKit webpack3 sum220011.857/max181099.319ms. Firefox también registra
static-generation25638.542ms/node-file-trace-build56310.26ms/
apply-include-excludes259.906ms y webpack3 sum172347.512/max134365.143ms.
Las sumas de spans no son tiempo de pared ni se suman a next-build como fases
disjuntas; una fase ausente en el resumen de un proceso interrumpido no prueba
que no se ejecutó. Las precargas terminaron en los tres jobs, sin acreditar
disponibilidad/cuota/rapidez universal de Hub ni causalidad de la política.

**Única autorización de CI consumida. No rerun/dispatch/push/CI adicional.**
Frontend recibe SOLO comparación estática con la nueva evidencia, sin editar,
builds/tests/Docker ni relajación de240s/Node22/Sentry/tracing/semántica/cleanup.
No optimización a ciegas ni nueva instrumentación. No repetir pregunta de
Backups. NO-GO de CI, seguridad/destino/rol app/recuperación/review/publicación.

Fuentes: API del run y jobs exactos; logs de los jobs116471243746,
116471244247 y116471244090 consultados vía GitHub API. No datos reales/DDL/
merge/deploy. El estado inicial siguiente es histórico.

## Estado observado — 14:12–14:14 UTC

Push normal confirmado a PR226, sin merge: `bf0aad14b51e27ec149ddd74738ba31be97ae5b9`.
PR OPEN/draft/REVIEW_REQUIRED. El único run automático de CI es
[38749323693](https://github.com/mentessaas/Zaltyko/actions/runs/38749323693),
creado14:12:26UTC para ese SHA. Static Gates38749323931 y Directory38749323676
también corresponden al SHA; en la primera lectura estaban en curso.
La consulta GitHub deployments filtrada por SHA devuelve cero registros;
no es un inventario universal de Vercel. No hay publicación.

Main observa jobs: Chromium116471243746/Unit116471243726/Build116471244223/
lint116471244149 en curso; Firefox116471244247/WebKit116471244090 en cola.
Móvil116471243810/SecuritySBOM116471243998/migraciones116471244201/RLS116471244321
SUCCESS. Readiness116471245885/auth116471248686 SKIPPED. La respuesta de run
todavía indica queued, aunque sus jobs ya progresan. No hay todavía resultado
funcional, cleanup ni gate agregado nuevo. Los omitidos no validan destino.

QA monitoriza solo esos tres runs con backoff, sin nuevas acciones remotas.
No empujar notas mientras CI corre, ni repetir/dispatch/cancelar ejecuciones.

## Cambios revisados y evidencia local

Incluye política Hub primaria exacta para las once imágenes activas ya revisada,
sin alterar catálogo13/pins/identidad/600s, y sampler host Frontend57af90c3 tras
QA203 GO estático exacto. Se integraron cinco archivos, sin formatter churn del
Changelog aislado. Muestreo solo durante `run(next build)` y bajo gate exacto
GitHubActions/Linux/browser. Máximo1Hz/250muestras; cinco fuentes fijas procfs,
4KiB útiles (+1centinela para rechazar overflow salvo CPU), resumen numérico
cerrado sin raw procfs/PID/argv/secretos. Trazas fuera del intervalo del sampler.

Main **528/528 pruebas en13archivos PASS**, 5.78s (tests1.19s), ESLint sin avisos,
Prettier5files/audit:env73/diff-check PASS. Código/tests/manifiestos TS/JSON/YAML
idénticos al commit Frontend con tsc `--noEmit --incremental false` exit0;
Main no repitió tsc sobre esa misma fuente. Rechazos timeout/abort del sampler
son sintéticos, no prueba de eventos reales del proceso. Sin installs/build/
E2E/Docker/pulls locales. [Límites de medición](./build-host-resource-sampler-2026-10-15.md).

## Protecciones reconfirmadas antes del push

Main14:11UTC: Vercel previews disabled true/productionBranch main y
vercel.json deploymentEnabled false; Deploy workflow disabled_manually y YAML
manual fail-closed sin credenciales ni deploy. Main strict/enforce_admins,
una revisión/dismiss_stale y seis checks obligatorios, incluido el gate
sintético. Production solo main/prevent_self_review; can_admins_bypass true
(no protección absoluta). Actions read/no aprobar PRs. Sin cambios de permisos.

## Límites y gates restantes

La autorización humana ya se ha utilizado para esta única corrida adicional;
no es permiso para encadenar diagnósticos/CI. Sin aumento de240s, nuevos jobs/
runners ni cambios de Sentry/tracing/Node22/entorno/grupos de procesos/cleanup.
Host incluye Supabase: las métricas no atribuyen consumo a Next ni prueban
causa del timeout. Cuota/rapidez/disponibilidad Hub y estabilidad build siguen
sin acreditarse hasta la evidencia correspondiente; no trasladar PASS de0dfb.

Siete alertas abiertas de main notificadas por GitHub al push; no se cierran
por el PASS del job root. Seguridad residual móvil, compatibilidad/historial/
rol real de aplicación/recuperación del destino, revisión independiente GitHub
y decisión de publicación siguen pendientes. No DDL/filas reales/pagos/merge/
deploy. La evidencia de Backups ya fue solicitada: no repetir esa petición.
**NO-GO para publicar.**
