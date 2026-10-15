# Pago y Owner Dashboard — estado de publicación

## Decisión: NO-GO para publicar

No confundir validación local con CI remoto, compatibilidad del destino o autorización de despliegue. Sandbox y producción no se han utilizado en esta pasada.

## Evidencia local cerrada

- Chromium, Firefox y WebKit: recorrido sintético completo sobre producto `a1edf37`, persistencia del pago y dashboard, 375/768/1280, negativos GET y limpieza. Informes `local-owner-e2e-*-a1edf37-2026-10-15.md`. Service workers bloqueados en la prueba, no validados en producción.
- Suite unitaria completa sobre `bf094a1f`: 2736 PASS, 3 skip; informe `vitest-full-suite-bf094a1f-2026-10-15.md`. No equivale a una ejecución completa posterior a los nuevos tests/CI.
- Opciones y retención: harnesses PostgreSQL 17 sintéticos aprobados con sus SHAs e informes individuales.
- Controles financieros sobre `fa5429f6`: concurrencia/idempotencia de emisión y pago, payload divergente, denegaciones tenant/sede/coach sin escrituras; cleanup PASS confirmado independientemente. Informe `monthly-financial-controls-pg17-2026-10-15.md`. Servicios, no HTTP ni RLS con rol restringido de base de datos.
- Handlers sobre `df53a788`: dos archivos, 10/10 pruebas PASS; revisión independiente Frontend 49 GO. Handler real con identidad/scope/servicio simulados explícitamente: emisión sin usuario devuelve 401 antes de parseo/procesamiento; pago manager/coach devuelve 403 antes de rate limit/servicio. No demuestra validación real de cookies ni membresía/RLS.
- Definición de CI local sintético integrada y revisada: matriz tres navegadores bloqueante, Sandbox remoto desactivado, instalador verificado. Contratos focales 23/23 y Python 5/5 PASS. Informe `integration-ci-checks-2026-10-15.md`.

## Gates pendientes independientes

1. Ejecutar CI remoto sobre el candidato exacto y configurar/verificar el nuevo check requerido. La definición existe solo localmente: no se ha publicado ni ejecutado.
2. Verificar compatibilidad del esquema del destino autorizado y su procedimiento de recuperación. No consultar ni modificar el Sandbox o producción sin nueva autorización.
3. Revisión independiente del PR y resolución de los requisitos de GitHub sobre el candidato actual. Las revisiones locales de agentes no sustituyen una aprobación requerida por GitHub.
4. Confirmar el candidato de despliegue y autorización explícita antes de publicar. Ningún PASS local habilita un despliegue automático.

La primera acción externa propuesta es publicar únicamente la rama candidata y actualizar el PR de revisión para ejecutar CI sintético sin secretos de Sandbox. Requiere confirmar antes que esa publicación no dispara despliegues o flujos remotos no autorizados. No se ha realizado.

Revisión estática independiente Frontend 50: PR a main/develop activa CI; los jobs de Sandbox están desactivados. `deploy.yml` conserva despliegue automático al push a main y despacho manual sin restricción de rama en YAML. No usar ninguno para esta validación. Integración Git de Vercel, previews automáticas, Production Branch y protecciones del entorno remoto: **NO VERIFICADO**. Antes de publicar cualquier rama, se solicita autorización para inspeccionar exclusivamente esa configuración remota de GitHub/Vercel, sin leer valores secretos, ejecutar workflows o desplegar. Typecheck sobre `df53a788`: salida 0.
