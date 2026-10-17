# CI remoto 5001651c — primer fallo observado

Run `38698304250`, candidato `5001651cc860548bde69ba8c5b878bac7c29da8b`. No se relanzó ni canceló ningún job.

Los tres jobs Owner E2E fallaron en preparación de imágenes, antes del runner funcional. El log del job Chromium `116300043788`, leído directamente mediante API GitHub, informa: `Could not preload pinned Supabase image public.ecr.aws/supabase/postgrest:v14.7.` Salida 1. La causa subyacente del pull todavía **NO VERIFICADA**: el preloader no incluye stderr del comando en ese error. No atribuirlo a producto, arquitectura del registry o disponibilidad del tag sin evidencia adicional.

Jobs Sandbox `E2E Credentials Readiness` y `E2E Authenticated Flows`: SKIPPED. Lint/typecheck, Mobile, migraciones, cobertura declarativa RLS y Dependency Security/SBOM: SUCCESS en el snapshot observado. Build y Unit Tests aún en curso. Gate agregado no puede aprobar con la matriz fallida.

No hubo arranque del Supabase local de E2E en estos jobs porque el fallo precede al paso del runner. No equivale a cleanup de una sesión funcional ejecutada. No se consultaron datos de Sandbox ni producción.

Se solicita diagnóstico de solo lectura a QA sobre los otros logs y metadatos públicos del registry; sin pulls, cambios de versión, ampliación de timeout ni reintentos.

Snapshot posterior del mismo SHA: Unit Tests SUCCESS; Build sigue en curso; Local Synthetic Owner E2E Required Gate FAILURE. No se ha relanzado la matriz.

## Dependencias: revisión estática independiente

Frontend revisó el candidato sin modificar archivos ni instalar paquetes. SDK MCP resuelve 1.32.1, superior a la corrección 1.31.0 del [aviso SDK](https://github.com/advisories/GHSA-6qxp-vccf-f47h). No extrapolar las alertas de main a esta versión.

En móvil sigue pendiente shell-quote 1.10.0, transitivo de react-devtools-core; el [aviso shell-quote](https://github.com/advisories/GHSA-pqg4-j6r4-53mv) indica corrección 1.11.0. La alcanzabilidad desde entradas de usuarios del producto no está demostrada. Braces 3.0.3 y node-forge 1.4.0 mantienen parches locales móviles, no versiones upstream corregidas: [aviso braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), [aviso node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv). La copia raíz de braces no lleva ese parche; su alcance requiere revisión adicional.

El workflow móvil no ejecuta auditoría de dependencias; su SUCCESS no cierra estos avisos. SBOM válido tampoco equivale a ausencia de vulnerabilidades. No se han cambiado dependencias ni cerrado alertas remotas.

## Corrección candidata posterior (todavía sin nueva ejecución CI)

QA preparó diagnóstico que Main endureció a etiquetas fijas permitidas: rate-limit, autenticación/permisos, manifiesto/plataforma, disco, timeout o red/registro. No imprime stderr arbitrario ni URLs; los indicadores no prueban causa raíz. Se conserva código de salida, versiones, plazos y fallo bloqueante. Revisión independiente QA103: GO; prueba local Main 13/13 PASS. Falta ejecución remota del nuevo candidato; no se presenta como fallo resuelto.

Se integra selectivamente el cambio móvil de Frontend `bb8b94ba`: shell-quote 1.11.0 fijado en overrides npm, workspace pnpm y ambos lockfiles, más regresión sin ejecutar shell. Frontend reporta instalación congelada pnpm9.15.9 y npm ci, scripts generales deshabilitados y postinstall revisado ejecutado expresamente: parches braces/node-forge aplicados; suite móvil 337/337, typecheck/lint/formato PASS. Main revisó diff acotado sin upgrades raíz. Esta evidencia es local del checkout Frontend, no del nuevo CI ni aplicación distribuida. Npm informó 23 avisos high adicionales: requieren inventario/alcance, no cierre automático ni audit fix masivo.
