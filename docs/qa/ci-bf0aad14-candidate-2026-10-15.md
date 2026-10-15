# Candidato bf0aad14 — una corrida acotada autorizada

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
