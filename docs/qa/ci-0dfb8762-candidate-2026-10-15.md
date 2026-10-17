# Candidato0dfb8762 — 15 de octubre, 12:00 UTC

PR226 actualizado mediante push normal al SHA exacto
`0dfb8762d5f8eda83b0213b4210bec0ad0c744a2`: OPEN/draft/blocked, sin merge.
Main verificó el head remoto y cero registros GitHub deployment para ese SHA;
no es inventario universal de Vercel. No despliegue ni cambio de base de datos.

## Ejecuciones automáticas únicas observadas

### Cierre confirmado12:20UTC — CI y gate FAILURE

Main API confirma SHA exacto, COMPLETED/FAILURE, updated12:17:02UTC;
gate116416673717 FAILURE12:17:01. QA179 confirma Static/Directory SUCCESS.
WebKit116409588310 supera precarga pero agota build240000ms a12:16:37.110UTC,
antes de Playwright; cleanup de stack/volúmenes reportado a12:16:55.041UTC.
Hitos185047/213742/220791/220791ms, webpack3spans acumulados180387.632ms,
máximo143727.831ms: no tiempo de pared total ni causa completa demostrada.
ChromiumPASS y FirefoxprecargaFAIL del corte inferior se mantienen; no nueva
corrida ni resultados funcionales Firefox/WebKit en este SHA. Otros ejecutados
PASS; Sandbox/auth/públicosSKIPPED no validan destino remoto.

Frontend108/Backend113 GO de diseño condicionado para Hub primario por digest
SOLO11 activos, sin excepciones sucesivas: identidad antes/después retagID,
600s por imagen, sin retry/ECR alternativo. Pins13 intactos, dos excluidos
conservan política ECR/fallback429 si helper se invoca directamente. Hasta33 pulls
potenciales; cuota/disponibilidad/rendimiento Hub no verificados. Main autoriza
SOLO implementación LOCAL aislada Backend+mocks, pendiente reviews; Frontend
investiga readonly build240s recurrente sin ampliar plazos ni retirar tracing/
Sentry. QA idle espera diff. No integración/candidato/CI nuevo autorizado aún;
cambio de origen no resuelve por sí mismo el bloqueo build. NO-GO publicación.

### Revisión estática Frontend109 — sin ajuste build justificable

Frontend no identifica una modificación mínima respaldada por evidencia que
conserve build de producción real, Sentry/tracing, entorno, Node22 y240s.
Los hitos de salida y spans no separan la tarea final; source maps desactivados
y worker sintético ya presentes no prueban que Sentry sea el cuello. El navegador
aún no se ejecutaba. Sin builds ni tests nuevos en esta revisión. Se conserva
el código de build sin cambios; no reabrir la misma investigación sin evidencia
adicional ni asumir que cambiar el registro de imágenes resolverá ese timeout.
Backend115 continúa implementación LOCAL del origen fijo11; entrega/reviews
pendientes. QA180 espera diff. No nuevo push/CI ni decisión de publicar.

### Actualización12:14–12:16UTC — Firefox detenido antes del stack

Main confirmó API SHAexacto/run38731333899 aún in_progress y logs de los jobs:

- Chromium116409588496 SUCCESS: `1 passed (25.3s)` a12:05:49.764UTC; stack detenido
  y volúmenes eliminados según runner a12:06:06.738UTC. Next-build161215.456ms;
  hitoscompiled125360/generated142583/optimizing146993/tracing146993ms.
- Firefox116409588429 FAILURE: precarga public.ecr.aws/supabase/imgproxy:v3.8.0,
  exit1/indicador cerrado timeout a12:09:33.431UTC. Fallback correctamente
  rechazado por no ser rate-limit exclusivo. Antes del runner/stack; no prueba
  funcional Firefox ni cleanup de stack requerido. No se amplía fallback.
- WebKit116409588310 en curso/gate pendiente. Build116409588391,
  Unit116409588265, lint116409588230, móvil116409587854, RLS116409588353,
  migrations116409588135 y SecuritySBOM116409588283 SUCCESS en API Main.
  Static/Directory SUCCESS según QA175; Sandbox/auth/públicosSKIPPED.

Cleanup es evidencia del runner, no inventario Docker independiente. La mejora
de duración Chromium no demuestra causalidad ni estabilidad universal. Alcanzar
imgproxy tras Logflare sin error no publica los seis checks individuales.

Se solicita SOLO propuesta readonly a Backend/Frontend sobre política Hubprimaria
por digest para conjunto fijo ya verificado, frente a encadenar excepciones por
imagen; identidad/pins/600s/240s y fail-closed sin retryECR intactos. NO código,
nuevoCI/push/pulls ni cambio del run actual autorizado mientras cierra la matriz.
La causa completa, cuota/disponibilidad Hub y readiness siguen sin demostrar.

### Corte inicial12:00UTC (histórico)

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
