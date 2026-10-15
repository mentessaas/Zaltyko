# Candidato210aadda — 15 de octubre, 10:59 UTC

PR226 OPEN/draft/REVIEW_REQUIRED actualizado mediante push normal al SHA
`210aaddaed46dc4ee6b54191c4398fcf86f9d96d`, sin merge ni despliegue.
NO-GO para publicar: todavía no hay prueba funcional/cleanup/gate de este SHA.

## Evidencia y siguiente paso

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
