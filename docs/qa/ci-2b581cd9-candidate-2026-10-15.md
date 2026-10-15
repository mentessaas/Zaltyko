# Candidato2b581cd9: cierre CI FAILURE, tres fallos independientes

## Cierre confirmado —15oct09:57UTC

[CI38713511027](https://github.com/mentessaas/Zaltyko/actions/runs/38713511027) COMPLETED/FAILURE sobre SHA exacto2b581cd92be6cc1bf3531032a9914e006e409161. Main verificó API/logs y QA141 cerró la observación. RequiredGate116357831554FAILURE09:49:12UTC. Chromium/Unit/Build/lint/móvil/RLS/migraciones/Static/DirectoryPASS, con límites descritos abajo. Sandbox readiness/auth y públicosSKIPPED.

- Firefox116350475568FAILURE: `next build` agota240000ms antes de Playwright; cleanup comunicado09:46:56UTC. Config confirma worker activado, no diferencia de selección según navegador. Next informa compilación2.9min/294páginas/optimización/tracing; spancompletado137961.723ms es máximo de un nombre, no tiempo total. La causa de lentitud y beneficio causal del worker siguen NO VERIFICADOS.
- WebKit116350475834FAILURE: precarga kong:2.8.1 rechaza identidad hub-inspect con status0, antes de retag y Supabase. No corresponde atribuir cleanup de stack no iniciado. Logs sin campo observado y cero artifacts segúnQA142: parseo/formaJSON, OS, arquitectura, config o RepoDigests no se distinguen. Hipótesis `kong`/`library/kong` no demostrada; no relajar digest/config/plataforma para hacer pasar el job.
- SecurityFAIL por documentación de marcador, fix local57a09b27 revisado y verificado; SBOM no ejecutado. Este fix no resuelve Firefox ni WebKit ni cambia el resultado del SHA remoto.

Próximo trabajo autorizado LOCAL: QA instrumenta checks cerrados boolean/not-evaluated de identidad con fixtures/no-leaks; Backend prepara hitos de build allowlist con tiempos monotónicos y resumen comparable éxito/fallo, más count/sum/max de cinco fases permitidas. Son observabilidad, no arreglos causales demostrados. Sin builds/E2E/Docker/pulls/instalaciones ni nuevo push/run; revisión independiente antes de integración y candidato. Captación/lista de espera dispone de otro chat solicitado por el usuario, aislado de estos tres frentes y de los despliegues del SaaS.

Las observaciones siguientes son históricas y no mantienen el run abierto.

## Actualización09:47UTC — resultados parciales del SHA exacto

Main confirmó API del run38713511027 y logs de los jobs. Chromium116350475505SUCCESS:1testPASS32.4s09:38:44UTC; runner informa stack detenido y volúmenes desechables retirados09:39:05UTC. No inventario Docker independiente. Unit116350475345SUCCESS:529archivosPASS/1skip,2886testsPASS/3skip,334.20s; sin fallos. Firefox116350475568 en curso, WebKit116350475834 en cola. El run sigue abierto y Security sigueFAIL; gate/matriz no acreditados. No empujar fix local57a09b27 ni notas durante esta ejecución; no rerun/dispatch. Estos resultados pertenecen a2b, no al fix posterior.

15 octubre2026,09:31UTC. [PR226](https://github.com/mentessaas/Zaltyko/pull/226) OPEN/DRAFT/REVIEW_REQUIRED, SHA remoto confirmado `2b581cd92be6cc1bf3531032a9914e006e409161`. Push normal desde e7dff88b, sin merge/despliegue. Una sola corrida automática por este nuevo candidato; listado inmediato todavía vacío por indexación. No dispatch ni rerun.

## Observación posterior —09:38UTC

- [CI38713511027](https://github.com/mentessaas/Zaltyko/actions/runs/38713511027) sigue abierto, SHA exacto confirmado por Main. Static38713511033 y Directory38713511029 PASS según QA136.
- Build116350475347 PASS09:36:56UTC, incluidos contratos generados de rutas; lint/typecheck, móvil, RLS y migraciones PASS. Unitarios y Chromium abiertos; Firefox/WebKit en cola en esta observación. Aún sin resultado funcional ni cleanup del nuevo candidato.
- [Dependency Security & SBOM116350475551](https://github.com/mentessaas/Zaltyko/actions/runs/38713511027/job/116350475551) FAIL: auditoría de dependencias de producción PASS, pero `audit:env` identifica exclusivamente `ZALTYKO_E2E_WEBPACK_BUILD_WORKER` ausente de `.env.example`09:31:34UTC. SBOM no generado por ese fallo, no confundir con vulnerabilidad nueva. Main comprobó el log del job mediante API y reprodujo `pnpm audit:env` localmente (exit1, misma única variable).
- Frontend prepara corrección LOCAL mínima: documentar marcador sintético con valor por defecto desactivado y prueba focal; sin modificar el auditor, ampliar excepciones ni configurar entornos remotos. No empujar mientras corre la matriz actual ni repetir el SHA idéntico. CI completo, seguridad residual, esquema/recuperación y aprobación independiente siguen pendientes.

### Corrección local revisada —09:41UTC, sin push

Frontend `d0c32c99d190ec6e2b68503e1607c84acfa5f8fb`, Backend92 GO estático. Main integró únicamente la declaración con `false` y el test nuevo; el hunk se adaptó junto al marcador local ya existente, preservando sus advertencias y `VERCEL`. El padre antiguo del peer no reemplaza `.env.example` completo. Auditor/runtime/selector/wrapper intactos, sin valores reales ni entorno remoto.

Main `pnpm audit:env` PASS73 variables (antes exit1); regresiones de contrato/selector/wrapper18/18 PASS en3archivos10.21s. Nuevos tres casos verifican defaultfalse/noNEXT_PUBLIC, rechazo/aceptación del marcador y rechazo de otra variable no documentada usando el auditor real, fixtures temporales y cleanup. ESLint/Prettier focales y diffcheck PASS. No build/E2E/Docker ni CI nuevo. QA138 conserva monitoreo del run original; este fix local aún no cuenta como CI PASS.

## Qué cambia y qué se verificó

- WorkerWebpack exclusivamente en next build sintético, activado por dos marcadores exactos. Producción sin propiedad extra; Sentry/tracing/Node22/240s/errores/cleanup conservados. Es experimento revisado, no arreglo temporal demostrado. Backend2987da78 y ajustec3663449; Frontend84/QA135 GO estático.
- Parche raíz braces3.0.3 por pnpm.patchedDependencies, hashdymdrenw7322ki6dxkzzldxbhm,2refs. Integración selectiva e4d7caee; Backend88/QA133 GO. Padre Frontend anterior: no sustituir manifiesto/lock enteros; scripts actuales/js-yaml preservados. Sin cambios de versión; sin cambios ajenos de comillas/block.invalid.
- Main89/89focalPASS7archivos3.67s; incluye raíz braces10tests y config/wiring/diagnóstico/digest/CIcontratos. Primera prueba config5sfalló y queda documentada: optimizar2importsreales/8casosselectorVM no aumenta5s/15s/240s. No build local nuevo.
- Instalación congelada offline sin scripts salida0, sin descargas; typecheck0/ESLintfocal0/Prettier6filesPASS. Lock conserva formato original: intento de formatterglobal revertido tras igualdad YAML,8+/3−hunks. No atribuirle PrettierPASS. Patchunifiedcontext whitespace documentado.
- Incluye documentos/manifiesto/historial metadata locales posteriores a e7; no ejecutorapply ni DDL. SQL de reconciliación conserva bytes/hashes revisados/ejecutados, incluida advertencia cosmética EOF, sin alterar evidencia histórica.

## Protecciones y gates que siguen separados

Reconfirmadas antes del push: VercelpreviewDeploymentsDisabled=true/ProductionBranchmain; Deploydisabled_manually y YAMLmanualfailclosed sin credenciales; mainstrict/enforce_admins/1review/gate sintético; Productionprevent_self_review=true y can_admins_bypass=true, no protección absoluta. Actionscontentsread/sinaprobarPR. GitHubdeploymentrecords del nuevo SHA:0 en observación09:31UTC; no equivale a inventario de todo proveedor, no se ordena desplegar.

CI anterior e7/38707901100cerróFAILURE: Chromium/WebKitfuncionalesPASS+cleanupinformadorunner, Firefoxbuild240santesPlaywright/gateFAIL. Eso no es resultado de2b581cd9. QA monitoriza nuevoSHA conbackoff; no empujar estas notas duranteCI.

Siguen pendientes CI exacto completo, seguridad residual (mitigacioneslocalesnoresuelvenupstream), compatibilidad/rolapp/recuperacióndestino, aprobaciónindependienteGitHub y decisiónrelease. Petición de metadataBackupsyaenviada,no reiterar ni restaurar/exportar/contratar. Sin datos reales, pagoSupabase, filasnegocio/Auth/contables, DDL, merge o despliegue.
