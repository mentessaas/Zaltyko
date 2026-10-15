# Pago y Owner Dashboard — estado de publicación

## Decisión: NO-GO para publicar

No confundir validación local con CI remoto, compatibilidad del destino o autorización de despliegue. La autorización posterior permite inspección de metadata remota; no se han aplicado DDL ni modificado filas de negocio.

## Candidato vigente — 5344e9d5, 10:19 UTC

10:37UTC: Main verificó Chromium31.6sPASS/cleanup reportado por runner10:26:57,
Build/UnitSUCCESS. QA153 informa Firefoxbuild240sFAIL antesPlaywright/cleanup;
WebKit y cierre/gate pendientes. Catálogo Sandbox de roles/esquemas/privilegios
ejecutado READONLY10s tras revisión, no identidad del pool ni aislamiento RLS
funcional. Sin DDL/producción/nuevoCI/push. NO-GO sigue por CI y gates independientes.
[Detalle actualizado](./ci-5344e9d5-candidate-2026-10-15.md).

10:22UTC: Security/SBOM, lint/tipos, móvil, RLS/migraciones y Static/Directory PASS en el SHA exacto. Build/Unit y matriz/gate pendientes, sin evidencia funcional/cleanup nueva; alertas residuales y destino/recovery/review siguen separados. No listo. [Detalle](./ci-5344e9d5-candidate-2026-10-15.md).

PR226 actualizado sin merge al SHA5344e9d5e246ce6dc91d096e5f57571beaae40fb. CI38719360128 queued, Static38719360372 y Directory38719360008 en curso; ningún PASS funcional ni cleanup de este SHA demostrado. Main379/379mockPASS, Frontend92/QA149GO y protecciones reconfirmadas antes del push. [Evidencia y límites](./ci-5344e9d5-candidate-2026-10-15.md). No duplicar corridas ni empujar notas durante CI. Las secciones inferiores son historial.

## Candidato vigente —2b581cd9,09:31UTC

**Preparación10:18UTC:** alias exactos del mismo pin/digest integrados, Frontend92/QA149GO y Main379/379mockPASS9files/tsc0/eslint0. Protecciones GitHub/Vercel reconfirmadas; preparar único SHA nuevo sin rerun. No es CI verde ni demuestra resolverFirefox/WebKit; NO-GO continúa. [Revisión y evidencia](./ci-2b581cd9-local-diagnostics-2026-10-15.md#actualización1018utc--alias-revisados-e-integrados-localmente).

**Preparación local10:12UTC:** observabilidad de identidad/build integrada tras Frontend91GO; Main126/126mockPASS y tsc0. Ningún build/Docker/CI nuevo. Guard de status entero positivo, identidad exacta y240s intactos; alias familiares solo propuesta aprobada para commit separado. No cambia el cierreFAIL ni el NO-GO. [Evidencia y límites](./ci-2b581cd9-local-diagnostics-2026-10-15.md).

**Cierre09:57UTC:** CI38713511027COMPLETED/FAILURE y gateFAIL; Chromium32.4sPASS/cleanup y Unit2886PASS3skip. Firefox build240s antesPlaywright/cleanup; WebKit falla identidadkonghub-inspect antesretag/Supabase, campo noverificado; Securityaudit:envFAIL con fix soloLOCAL57a09b27. QA/Backend preparan observabilidad local sin relajarchecks ni prometerresolver. No nuevo push/run hasta revisión; esquema/recuperación/seguridadresidual/reviewPR pendientes. [Evidencia final](./ci-2b581cd9-candidate-2026-10-15.md). Estados abiertos de párrafos inferiores son históricos.

Observación09:38UTC: CI38713511027 abierto; Build/lint/móvil/RLS/migraciones y Static/Directory PASS. Security FAIL por marcador sintético no documentado en `.env.example`, reproducido localmente; Frontend prepara corrección mínima, sin relajar auditor. Matriz/Unit pendientes, no resultado funcional ni cleanup nuevo demostrado. No listo para publicar; no push mientras corre CI. Detalle en el informe del candidato.

09:41UTC: corrección documental integrada solo LOCAL, Backend92GO; audit:envPASS73 y18/18focalesMain, ESLint/Prettier/diffcheckPASS. Auditor/runtime intactos. No push adicional ni resultado CI verde atribuido al fix local.

PR226 actualizado sinmerge al SHA `2b581cd92be6cc1bf3531032a9914e006e409161` tras89/89MainPASS, revisionesestáticas yproteccionesreconfirmadas. Una sola CI automática nueva pendiente de indexación; no dispatch/rerun. Cambios: workerúnicamentebuildsintético+parchebracesraíz, conservandoSentry/tracing/22/240s/3navegadores/cleanup. No demuestran CI verde ni readinessdestino. [Evidencia/alcance](./ci-2b581cd9-candidate-2026-10-15.md). Las secciones siguientes son historial de candidatos anteriores.

## Actualización vigente — candidato e7dff88b

**Cierre09:27UTC:** CI38707901100FAILURE del SHA exacto: Chromium1PASS28.5s y WebKit1PASS40.2s; cleanup de ambos verificado en logs Main, reportado por runner. Firefoxbuild240santesPlaywright y gateFAILURE. Otros jobs ejecutados/Static/DirectoryPASS; Sandbox y públicos no ejecutados. Candidato siguiente preparado localmente con worker solo sintético y rootbraces; QA135GO estático, Main89/89focalPASS tras corregir coste del test sin subir5s/240s. No es CI verde ni versión publicada; nuevo push sujeto a protecciones. [Cierre y evidencia](./ci-e7dff88b-candidate-2026-10-15.md).

**09:02UTC:** Chromium remoto SUCCESS en CI38707901100 sobre `e7dff88b39ba4fdf19c2f35f1f918a8ff3fa02a1`: Main comprobó `1 passed (28.5s)` y cleanup informado por runner. Firefox dentro del E2E según QA126; WebKit y gate agregado pendientes. Build/unitarios/lint/móvil/RLS/migraciones/security, Static y Directory PASS. Sandbox readiness/auth SKIPPED. [Detalle y límites](./ci-e7dff88b-candidate-2026-10-15.md).

**09:04UTC, QA127:** Firefox volvió a agotar build240s antes de Playwright; runner informa cleanup09:02:10UTC. WebKit iniciado, cierre global pendiente. No atribuir causa al único span completado del diagnóstico ni relanzar sin corrección revisada. Se mantienen plazos y checks.

Seguridad: tres de siete registros de alerta de main tienen versiones corregidas en candidato; cuatro registros de dos advisories siguen mitigados localmente en móvil, no cerrados upstream. Braces raíz requiere análisis adicional. [Matriz exacta y fuentes](../security/dependency-alerts-e7dff88b-2026-10-15.md). Esquema/rol app/recuperación y revisión independiente GitHub siguen pendientes; no listo para publicar. Petición de metadata de Backups ya enviada al usuario; no repetir mientras se espera. No DDL, merge ni despliegue.

Backend81 auditó el candidato solo estáticamente: autenticación/roles/idempotencia no equivalen a interruptor de activación. Bootstrap, mutaciones financieras y outbox no tienen cierre operativo específico del piloto. No desplegar primero confiando en que tablas ausentes impidan escrituras; crear esquema puede habilitar operaciones inmediatamente si ya están expuestas. [Evidencia y propuesta sin implementar](./owner-pilot-activation-audit-e7dff88b-2026-10-15.md). Mantener orden de preparación validado y decisión explícita de publicación; no inventar flags existentes.

### Historial de preparación y ejecución previa

**Observación posterior, 08:45UTC:** PR226 actualizado sin merge a `e7dff88b39ba4fdf19c2f35f1f918a8ff3fa02a1`. CI38707901100 queued, Static38707901067 y Directory38707901250 en curso. No son PASS. Revisión estática Frontend75 yQA119, protecciones reconfirmadas; [evidencia nueva](./ci-e7dff88b-candidate-2026-10-15.md). Lo siguiente describe el fallo anterior y su preparación, no el estado final de la nueva corrida.

Preparado localmente, aún sin otro CI: correcciones unitarias `c8f9c621`, catálogo seguro `509f3597`, diagnóstico build `8cf19bb1` y fallback ECR→Hub por digest exacto. Frontend75 y QA119 dan GO estático del fallback después de cerrar status null; Main80/80 mock PASS, typecheck salida0. Una nueva corrida justificada sobre un nuevo SHA, no un rerun idéntico, debe demostrar descargas y pruebas. Ni el fallback ni el diagnóstico demuestran resolver el build240s. Se mantienen tres navegadores, todos los checks y los mismos plazos.

CI `38703429157` terminó FAILURE: Chromium/WebKit fallan en precarga con indicador rate-limit; Firefox supera precarga pero agota build240s durante tracing, sin iniciar Playwright. Registra cleanup. Unitarios: tres fallos (cwd móvil y coste del mock paginación); fixes locales revisados y 4/4 de paginación con coverage PASS, aún sin nuevo candidato CI. Otros build/lint/móvil/security/RLS/migraciones PASS; Sandbox SKIPPED. Detalle y límites: `ci-de6c3a64-failures-2026-10-15.md`.

Manifiesto18/hashchecker local PASS no acredita compatibilidad destino ni recuperación. Seguridad residual braces/node-forge mitigada localmente, aprobación independiente PR y autorización de release siguen pendientes. Metadata remota consultada sin filas: `remote-schema-metadata-2026-10-15.md`. Las secciones inferiores sobre 5001651c y anteriores son históricas y no describen el candidato vigente.

## Evidencia local cerrada

- Chromium, Firefox y WebKit: recorrido sintético completo sobre producto `a1edf37`, persistencia del pago y dashboard, 375/768/1280, negativos GET y limpieza. Informes `local-owner-e2e-*-a1edf37-2026-10-15.md`. Service workers bloqueados en la prueba, no validados en producción.
- Suite unitaria completa sobre `bf094a1f`: 2736 PASS, 3 skip; informe `vitest-full-suite-bf094a1f-2026-10-15.md`. No equivale a una ejecución completa posterior a los nuevos tests/CI.
- Opciones y retención: harnesses PostgreSQL 17 sintéticos aprobados con sus SHAs e informes individuales.
- Controles financieros sobre `fa5429f6`: concurrencia/idempotencia de emisión y pago, payload divergente, denegaciones tenant/sede/coach sin escrituras; cleanup PASS confirmado independientemente. Informe `monthly-financial-controls-pg17-2026-10-15.md`. Servicios, no HTTP ni RLS con rol restringido de base de datos.
- Handlers sobre `df53a788`: dos archivos, 10/10 pruebas PASS; revisión independiente Frontend 49 GO. Handler real con identidad/scope/servicio simulados explícitamente: emisión sin usuario devuelve 401 antes de parseo/procesamiento; pago manager/coach devuelve 403 antes de rate limit/servicio. No demuestra validación real de cookies ni membresía/RLS.
- Definición de CI local sintético integrada y revisada: matriz tres navegadores bloqueante, Sandbox remoto desactivado, instalador verificado. Contratos focales 23/23 y Python 5/5 PASS. Informe `integration-ci-checks-2026-10-15.md`.

## Gates pendientes independientes

### Actualización vigente — 15 de octubre, candidato `5001651c`

Esta actualización sustituye el estado histórico de configuración/publicación de rama descrito debajo. PR #226 actualizado sin merge; CI `38698304250` completado: build, unitarios, lint/typecheck, móvil, migraciones, cobertura declarativa RLS y seguridad/SBOM PASS. Matriz Owner E2E y gate agregado FAILURE durante descarga de imágenes, antes de pruebas funcionales. Los jobs Sandbox están SKIPPED. Véase `ci-5001651c-initial-failure-2026-10-15.md`.

QA verificó que las tres imágenes que fallaron son distintas (Chromium: postgrest, Firefox: postgres, WebKit: logflare); los manifiestos públicos responden actualmente HTTP 200 y ofrecen linux/amd64. Esto no acredita la respuesta del registro durante el run. Causa exacta pendiente: se prepara diagnóstico saneado de la descarga, conservando versiones, plazos y comprobaciones.

Protecciones verificadas en la pasada de configuración: previews Vercel desactivadas, Deploy workflow deshabilitado y fail-closed en candidato, gate sintético requerido y enforce_admins en main; entorno Production restringido a main con revisión independiente. El bypass administrativo del entorno sigue permitido: no presentar protección absoluta. Ningún despliegue autorizado.

Dependencias móviles requieren cierre separado: shell-quote afectado y parches locales de braces/node-forge no equivalen a versiones upstream corregidas. La aprobación independiente del PR, compatibilidad/recuperación del destino y autorización explícita de publicación siguen pendientes. No se consultan Sandbox ni producción.

### Estado histórico anterior a actualizar el PR

1. Ejecutar CI remoto sobre el candidato exacto y configurar/verificar el nuevo check requerido. La definición existe solo localmente: no se ha publicado ni ejecutado.
2. Verificar compatibilidad del esquema del destino autorizado y su procedimiento de recuperación. No consultar ni modificar el Sandbox o producción sin nueva autorización.
3. Revisión independiente del PR y resolución de los requisitos de GitHub sobre el candidato actual. Las revisiones locales de agentes no sustituyen una aprobación requerida por GitHub.
4. Confirmar el candidato de despliegue y autorización explícita antes de publicar. Ningún PASS local habilita un despliegue automático.

La primera acción externa propuesta es publicar únicamente la rama candidata y actualizar el PR de revisión para ejecutar CI sintético sin secretos de Sandbox. Requiere confirmar antes que esa publicación no dispara despliegues o flujos remotos no autorizados. No se ha realizado.

Revisión estática independiente Frontend 50: PR a main/develop activa CI; los jobs de Sandbox están desactivados. `deploy.yml` conserva despliegue automático al push a main y despacho manual sin restricción de rama en YAML. No usar ninguno para esta validación. Integración Git de Vercel, previews automáticas, Production Branch y protecciones del entorno remoto: **NO VERIFICADO**. Antes de publicar cualquier rama, se solicita autorización para inspeccionar exclusivamente esa configuración remota de GitHub/Vercel, sin leer valores secretos, ejecutar workflows o desplegar. Typecheck sobre `df53a788`: salida 0.
