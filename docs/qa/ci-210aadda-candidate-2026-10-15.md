# Candidato210aadda — 15 de octubre, 10:59 UTC

PR226 OPEN/draft/REVIEW_REQUIRED actualizado mediante push normal al SHA
`210aaddaed46dc4ee6b54191c4398fcf86f9d96d`, sin merge ni despliegue.
NO-GO para publicar: CI38724036863 cerró FAILURE. Chromium y Firefox pasan con
cleanup reportado; WebKit falla en precarga y el gate agregado falla.

## Cierre observado11:24UTC — WebKit detenido antes del stack

Main verificó API/logs: run exactSHA COMPLETED/FAILURE, actualizado11:18:47UTC.
WebKit116385372370 FAILURE a11:18:40UTC y gate116393272760 FAILURE11:18:46UTC.
La precarga comenzó11:15:26.578UTC; a11:18:37.959UTC informa fallo de Docker pull
exit1 para public.ecr.aws/supabase/logflare:1.34.14, indicador fijo `timeout`.
El fallback fue rechazado porque no había indicador exclusivo de rate limit.
No se cambia esa condición ni identidad/pins/plazos. El indicador no demuestra
por sí solo agotamiento de los600s del helper ni causa de red/CPU/registro.

No arrancaron runner ni stack Supabase según QA163; no hay cleanup de stack
requerido para WebKit ni resultado funcional de ese navegador en este SHA.
Chromium/Firefox y demás jobs ejecutados SUCCESS, con límites y tiempos debajo;
Static/Directory SUCCESS exactSHA reconfirmados por Main11:24UTC.
Sandbox/públicos omitidos siguen sin validar. No repetir corrida idéntica.

QA y Frontend investigan SOLOLOCAL/READONLY la cronología del timeout y la
relación entre plan de13 imágenes y exclusiones de servicios. Ningún cambio
de precarga, ampliación de fallback, nuevo build/pull/CI o push autorizado aún.
Siguen separados seguridad residual, esquema/recuperación/rolapp, revisión y release.

## Observación 11:14 UTC — avance parcial, no cierre de matriz

Main verificó API y logs del SHA exacto en el único CI38724036863:

- [Chromium116385372011](https://github.com/mentessaas/Zaltyko/actions/runs/38724036863/job/116385372011): SUCCESS, `1 passed (31.3s)` a11:06:04.597UTC; stack detenido y volúmenes desechables eliminados según runner a11:06:22.726UTC. Span next-build235617.086ms; hitos177943/204995/212490/212492ms.
- [Firefox116385372289](https://github.com/mentessaas/Zaltyko/actions/runs/38724036863/job/116385372289): SUCCESS, `1 passed (36.1s)` a11:13:55.763UTC; mismo cleanup reportado a11:14:14.084UTC. Span next-build236954.569ms; hitos177608/206487/213608/213608ms. Webpack3spans, suma172616.307ms y máximo135249.397ms: la suma no es tiempo de pared.
- WebKit116385372370 en curso; gate agregado aún no demostrado. Build, Unit Tests, lint/tipos, móvil, cobertura RLS declarativa, integridad migraciones y Security/SBOM SUCCESS. Directory/Static PASS según QA160. Sandbox readiness/auth y públicos/Smoke/Lighthouse SKIPPED.

Los dos builds pasan cerca del límite240s. Esto no prueba ahorro causal, estabilidad
universal ni que todos los navegadores hayan completado. Cleanup es evidencia del
runner, no inventario Docker independiente. No cambia el NO-GO por seguridad
residual, esquema/recuperación, rol real de aplicación y revisión del PR.
QA continúa únicamente WebKit/cierre/gate; no rerun, dispatch, nuevo push o despliegue.

## Observación inicial 10:59 UTC y siguiente paso

- [CI38724036863](https://github.com/mentessaas/Zaltyko/actions/runs/38724036863): queued.
- [Directory38724036865](https://github.com/mentessaas/Zaltyko/actions/runs/38724036865): in_progress.
- [Static38724036892](https://github.com/mentessaas/Zaltyko/actions/runs/38724036892): in_progress.

Son los runs automáticos del SHA exacto, ningún dispatch/rerun/runner duplicado.
Main observó cero registros GitHub deployment del SHA, no inventario universal.
QA monitoriza solo este SHA con backoff y cursores; no empujar notas mientras CI.

## Diferencia revisada frente a5344

Solo cambio funcional del harness: añadir Studio y postgres-meta al --exclude
existente de supavisor. Auth/DB/REST/Storage/Kong y servicios probados siguen,
igual que entorno obtenido del stack, migraciones, health checks, pins13/preload,
identidad,600s, Sentry/tracing, Node22, build240s y cleanup. No hay pausa/reanudación
de contenedores ni eliminación de comprobaciones. Las rutas /pg/* y /mcp de Kong
permanecen pero sin backend de gestión. No prueba todavía compatibilidad runtime
ni ahorro; no se afirma causa CPU/RAM/red del fallo anterior.

Frontend9949694c y QA158/159 GO estático; Main393/393 tests mock en12 archivos
PASS6.28s, TypeScript0, ESLint focal0 sin avisos, audit:envPASS73,
Prettier/diffcheck0. Primer focal18/18 en3 archivos; dos filtros de nombres que
no existían no se cuentan como pruebas ejecutadas. No nueva build/E2E/Docker/pull
o instalación local. [Fuentes, límites e integración](../deployment/local-e2e-exclude-management-services.md).

Incluye ec215d2e y883ed06d integrados selectivamente para evidencia de catálogo,
no ejecutor de DDL. Main ejecutó catálogo de roles en Sandbox y versión/extensiones
en Sandbox/producción mediante READ ONLY/10s, sin filas de negocio/Auth/contables:
[roles](../deployment/owner-pilot-fixed-role-evidence.md) y
[versión/extensiones](../deployment/owner-pilot-version-extensions.md).
17.6/pgcrypto1.3 no prueban backports, CVEs concretos aplicables ni uso de cifrados.
No upgrade, export, cambio de grants/policies, migración ni restauración.

## Protecciones y gates independientes

Reconfirmadas en solo lectura antes del push: previews Vercel desactivadas/main,
vercel.json deploymentEnabledfalse; Deploy disabled_manually/manual fail-closed
sin credenciales; main strict/enforce_admins/una review/dismiss stale/seis checks;
Production solo main/prevent_self_review (bypass administrativo permitido en
observación previa, no barrera absoluta); Actions read/no approve. No se cambian.

CI5344 cerró FAILURE: Chromium31.6s/WebKit32.3sPASS con cleanup reportado por runner,
Firefox build240s antes de Playwright y gateFAIL. Demás checks ejecutadosPASS,
Sandbox/públicosSKIPPED. [Historial exacto](./ci-5344e9d5-candidate-2026-10-15.md).
No atribuir resultados previos al nuevo candidato.

Siguen pendientes CI nuevo, alertas residuales de dependencias, compatibilidad/
historial/rol real del pool/recuperación del destino, aprobación independiente y
decisión específica de publicación. Backups ya solicitados al usuario, sin repetir.
La captación en chat separado no demuestra readiness del SaaS. Sin merge/deploy/
irreversibles/pagos ni rama Supabase de pago o fixtures reales.
