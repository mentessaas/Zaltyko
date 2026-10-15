# Candidato0dfb8762 — 15 de octubre, 12:00 UTC

PR226 actualizado mediante push normal al SHA exacto
`0dfb8762d5f8eda83b0213b4210bec0ad0c744a2`: OPEN/draft/blocked, sin merge.
Main verificó el head remoto y cero registros GitHub deployment para ese SHA;
no es inventario universal de Vercel. No despliegue ni cambio de base de datos.

## Ejecuciones automáticas únicas observadas

- [CI38731333899](https://github.com/mentessaas/Zaltyko/actions/runs/38731333899): queued.
- [Static38731333844](https://github.com/mentessaas/Zaltyko/actions/runs/38731333844): in_progress.
- [Directory38731333850](https://github.com/mentessaas/Zaltyko/actions/runs/38731333850): in_progress.

No resultado funcional/cleanup/gate nuevo demostrado. QA monitoriza únicamente
estos runs y SHA con backoff, sin dispatch/rerun/cancel ni runners/pulls duplicados.
No empujar notas durante CI. Los resultados de210 no se atribuyen a este candidato.

## Cambio revisado y validación local

Incluye el plan activo fijo11, compartido entre precarga y preflight, que omite
solo Studio/postgres-meta ya excluidos del arranque. Catálogo/pins13 intactos.
Incluye Backend3ba7fbab por hunks sobre Mainactual: origen primario Hub por digest
SOLO referencia exacta Logflare, verify→retagID→postverify/600s compartidos;
sinretry/ECR alternativo. Los otros12pins conservan ECR→Hub solo rate-limit
exclusivo con status entero positivo; no fallback ante timeout. Identidad,
Node22/Sentry/tracing/build240s/checks/cleanup intactos.

Frontend105/QA171 GO estático y QA173 GO diff integrado/candidato distinto.
Main453/453mock11filesPASS9.44s (tests2.98s), tsc0, ESLint0warnings,
Prettier6files/diffcheckPASS/audit:env73. Sin installs/build/E2E/Docker/pulls locales.
[Secuencia, pruebas y límites](./logflare-hub-primary-2026-10-15.md).

El cambio evita una petición ECR concreta fallida, no demuestra su causa ni
disponibilidad, cuota o rapidez de Hub. Builds anteriores cerca240s no prueban
estabilidad universal. Sin aumento de plazos ni relajación de comprobaciones.

## Protecciones y NO-GO independiente

Reconfirmadas Main solo lectura11:57UTC: Vercelproyecto/team exactos,
previewDeploymentsDisabledtrue/ProductionBranchmain, vercel.jsondeploymentfalse;
Deploy309380364disabled_manually/manualfailclosed/contentsread/sincredenciales;
mainstrict/enforce_admins/1review/dismissstale/seischecks; Productionmainonly/
preventselfreview/can_admins_bypasstrue (no absoluto), Actionsread/noapprove.

CI210 cerróFAIL: Chromium31.3s/Firefox36.1sPASS y cleanup reportado por runners;
WebKit falló precargaECRlogflare antesstack/gateFAIL. [Historial](./ci-210aadda-candidate-2026-10-15.md).
NO-GO para publicar: falta CI exacto agregado, seguridad residual, compatibilidad/
historial/rolapp/recuperación del destino, aprobación independiente PR y decisión
específica release. Sandbox/auth/públicosSKIPPED no son validación remota.
Backups ya solicitados sin repetir; sin DDL, export, filas reales, secretos,
Supabase de pago, merge, despliegue o pagos.
