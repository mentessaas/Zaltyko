# Candidato e7dff88b — CI cerrado en FAILURE, no listo para publicar

15 octubre 2026, 08:45 UTC. [PR226](https://github.com/mentessaas/Zaltyko/pull/226), draft y REVIEW_REQUIRED. SHA exacto `e7dff88b39ba4fdf19c2f35f1f918a8ff3fa02a1` confirmado remoto tras push normal, sin merge.

## Cambios revisados

- Correcciones unitarias cwd móvil y mock de paginación, sin cambiar servicio/fixtures/deadline.
- Manifiesto18 y catálogo DB estáticos; inspección remota previa de metadata, sin DDL ni filas de negocio.
- Diagnóstico de build con cinco fases numéricas permitidas, conservando error/cleanup y build240s. No es una corrección demostrada del timeout.
- Alternativa ECR→Hub por13digests/configs linuxamd64 idénticos observados. Solo rate-limit exclusivo y exit entero positivo; 600s compartidos, identidad antes/después de retag y entorno filtrado. Frontend75GO estático, QA119 sin bloqueantes. Main80/80mockPASS, tsc0, formatoPASS; no Docker local adicional.

## Ejecuciones automáticas únicas

- [CI38707901100](https://github.com/mentessaas/Zaltyko/actions/runs/38707901100): queued al observar. Tres navegadores siguen siendo bloqueantes; no hay dispatch ni rerun.
- [Static38707901067](https://github.com/mentessaas/Zaltyko/actions/runs/38707901067): in_progress.
- [Directory38707901250](https://github.com/mentessaas/Zaltyko/actions/runs/38707901250): in_progress.

Son estados de esta observación, no resultados finales. QA monitoriza el SHA exacto con backoff. No repetir navegadores/harnesses locales ya aprobados. Cuota Hub, normalización RepoDigests, comportamiento Supabase tras retag y tracing240s siguen sujetos a evidencia remota.

Observación posterior QA123: Static yDirectoryPASS; Build, unitarios,lint/móvil/security/RLS/migracionesPASS según jobs. Solo matriz/gate funcional siguen abiertos, Chromium dentrodelE2E, Firefox/WebKitencola; sin resultado funcional ni cleanup todavía. No equivale a publicación lista.

### Observación posterior — 09:02 UTC

Chromium [job116331776745](https://github.com/mentessaas/Zaltyko/actions/runs/38707901100/job/116331776745) SUCCESS sobre el mismo SHA. Main comprobó el log del job: `1 passed (28.5s)` a las08:53:59UTC y `Supabase local stack stopped and disposable data volumes removed.` a las08:54:19UTC. Limpieza informada por el runner; no inspección independiente de inventario Docker. Es evidencia funcional remota de Chromium, no PASS global ni de producción.

QA126: Firefox superó precarga y entró en E2E aislado, sin resultado funcional todavía; WebKit sigue pendiente. Matriz y gate agregado aún abiertos. Static/Directory y los demás jobs enumerados arriba PASS; readiness/auth de Sandbox SKIPPED. No hay rerun, dispatch, ampliación de plazos ni nueva prueba local.

Actualización QA127, 09:04UTC: Firefox falló por build240s tras completar294páginas y llegar a Collecting build traces, antes de Playwright. El diagnóstico contiene una fase completada `run-webpack-compiler` de169841ms; no prueba la causa del retraso final. Cleanup informado por runner09:02:10UTC, sin marcador de error de parada. WebKit comenzó; cierre global pendiente. Chromium PASS no resuelve este fallo. QA compara logs/fases de ambos jobs sin nueva ejecución ni cambio de límites.

09:11UTC, QA130: WebKit continúa en E2E; resultado/cleanup aún pendientes. Backend84 no encontró bloqueo explícito del build worker con callback/Sentry; prepara experimento sintético de doble marcador y pruebas de separación, **no fix ni mejora temporal demostrada**. Se descarta Node20 EOL como supuesto arreglo. [Investigación y límites](./build-worker-investigation-e7dff88b-2026-10-15.md). Frontend81 informa9regresiones raíz bracesPASS e instalación congelada offline; pendiente revisar diff final/procedencia del parche antes de integración, no resuelve alertas upstream.

Auditoría independiente Frontend77 y consulta Main de alertas: siete registros abiertos en main corresponden a cuatro advisories. En el candidato, MCP SDK1.32.1 y shell-quote1.11.0 corrigen por versión tres registros; quedan cuatro registros de braces/node-forge con mitigación móvil local, no resolución upstream. El lock raíz también contiene braces3.0.3 y el parche móvil no lo cubre; alcance pendiente de análisis estático. Véase [matriz de seguridad](../security/dependency-alerts-e7dff88b-2026-10-15.md). No se han cerrado alertas ni aprobado la release.

## Cierre verificado — 09:27 UTC

Main verificó estado remoto: CI38707901100 COMPLETED/FAILURE del SHA exacto. Chromium y WebKit SUCCESS; Firefox y gate agregado FAILURE. Los demás jobs ejecutados PASS; Sandbox readiness/auth, smoke/Lighthouse/public E2E SKIPPED. Static/Directory PASS según QA131. Main comprobó también log WebKitjob116331776812: `1 passed (40.2s)`09:10:24UTC y cleanup informado09:10:41UTC. No prueba independiente de inventario Docker.

Preparación LOCAL posterior, no resultado de ese run: integración selectiva de Frontende4d7caee (rootbraces) y Backend2987da78 (worker sintético), con ajustec3663449 para coste de tests de config. QA133/135 y crossreviews Frontend84/Backend88 GO estático. No se sustituyeron package.json/lock completos del padre antiguo de Frontend: scripts actuales y js-yaml conservados.

Primera validación integrada:31PASS/1FAIL por test config>5s; se registra, no se oculta ni aumenta timeout. Ajuste revisado conserva8casos del selector real enVM y2imports reales config con caché Sentry; nueva suite Main7archivos89/89PASS,3.67s, tests938ms. Instalación congelada offline sin scripts salida0, sin descargas; comportamientos raíz braces10PASS. Typecheck salida0, ESLint focal salida0, Prettier6archivosPASS. Lock conserva formato original; intento de formatter masivo revertido tras comparación YAML semánticamente idéntica, dejando8+/3−. No presentar ese lock como PrettierPASS. Unifiedpatch conserva espacios de contexto, diffcheck general excluye ese archivo.

Revisión previa a cualquier nuevo push: Main strict/enforce_admins/1review/gate intactos; Deploy disabled_manually y YAML fail-closed; Vercel previewDeploymentsDisabled=true,productionBranchmain; Production prevent_self_review=true,can_admins_bypass=true. Accionescontentsread/sinaprobarPR. Solo se propone una corrida automática de un candidato distinto revisado; sin dispatch/rerun, build local nuevo, DDL, merge ni despliegue. Worker es experimento, no ahorro probado; braces sigue mitigación local sin fix upstream.

## Protecciones y gates separados

Antes del push e7: Vercel previewDeploymentsDisabled=true, ProductionBranch=main; Deploy disabled_manually y fail-closed en YAML; main strict/enforce_admins, una aprobación y gate sintético requerido. Entorno Production restringido a main, prevent_self_review=true; can_admins_bypass=true, no protección absoluta. GitHub deployment records del SHA nuevo: cero en esa observación; no se ha ordenado publicar.

Esquema/backup/privilegios efectivos de la app, aprobación independiente del PR y autorización de publicación siguen pendientes aunque CI pase. GitHub anuncia7alertas en main (2critical/5high); no son aplicabilidad demostrada al candidato. Móvil conserva2advisories residuales braces/node-forge mitigados localmente, no cerrados upstream. Sin secretos, fixtures reales ni recurso Supabase de pago.
