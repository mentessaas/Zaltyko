# Pago y Owner Dashboard — estado de publicación

## Decisión: NO-GO para publicar

No confundir validación local con CI remoto, compatibilidad del destino o autorización de despliegue. La autorización posterior permite inspección de metadata remota; no se han aplicado DDL ni modificado filas de negocio.

## Actualización vigente — candidato de6c3a64

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
