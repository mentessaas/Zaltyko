# Logflare: origen primario Hub fijado por digest

Nota histórica del candidato0dfb: el siguiente cambio permanece solo local y se
documenta por separado en [Hub primario del plan activo](./active-images-hub-primary-2026-10-15.md).
No interpretar esa preparación como nuevo CI ni como corrección del build240s.

## Alcance

Cambio local basado en `210aadda`, validado exclusivamente con mocks.
Solo `public.ecr.aws/supabase/logflare:1.34.14` utiliza Hub como origen primario.
Se reutiliza el pin existente de `supabase/logflare`; no es una Docker Official Image.
No cambia el catálogo de 13 imágenes, versiones, digests ni metadatos.

## Secuencia y rechazos

1. Un único pull del digest Hub existente, con `--platform linux/amd64`.
2. Verificación de plataforma, config ID y RepoDigest exactos.
3. Retag del ID verificado al nombre ECR esperado.
4. Inspección y repetición de la verificación sobre ese tag.

Las cuatro operaciones comparten 600s por imagen. Un fallo, cancelación,
status inválido o reloj inválido/agotar presupuesto termina la secuencia.
No hay retry ni petición alternativa a ECR. El mensaje fijo del pull primario
no lo denomina fallback; stdout/stderr del proveedor no se exponen.
Los otros 12 pins conservan ECR y el fallback Hub exclusivamente ante rate-limit
con status entero positivo y sin otro indicador de fallo.

## Evidencia

`vitest run --project web` sobre `local-e2e-logflare-primary`,
`local-e2e-digest-fallback`, `local-e2e-repo-digest-representations` y
`local-e2e-image-preloader`: **4 archivos, 371 tests PASS**.
Se conservan los negativos por los 13 pins; solo se adapta la secuencia positiva
de Logflare y el mock de precarga para su verificación/retag.

Sin installs, build, Docker, pulls, E2E, CI, cambios remotos o despliegue.
Disponibilidad, cuota y rendimiento de Hub: **NO VERIFICADOS**.
El cambio evita la petición inicial ECR de ese pin; no demuestra la causa del
timeout previo ni la preparación de release.

## Integración Main — 11:58 UTC

Backend `3ba7fbab` revisado por Frontend105 y QA171: GO estático, sin ejecución
de pruebas por esos revisores. Main integra solo los hunks sobre `cde83ff0`,
preservando el plan activo compartido11 y catálogo/pins13 sin cambios.
Main ejecuta 11 archivos existentes, incluidos selección activa, identidad,
precarga, fallback, runner, build/worker y entrypoints: **453/453 mocks PASS**,
9.44s (tests2.98s). TypeScript `--noEmit --incremental false` exit0,
ESLint focal sin avisos, Prettier6files y diff-check PASS; audit:env PASS73.
No instalaciones, build, E2E, Docker ni pulls locales.

Protecciones reconfirmadas solo lectura11:57UTC: proyecto Vercel exacto,
previewsdisabledtrue/main; Deploy disabled_manually y YAML manual fail-closed
sin credenciales; main strict/enforce_admins/una review/dismissstale/seis checks;
Production solo main/prevent_self_review y can_admins_bypasstrue (no absoluto);
Actions read/noapprove. No se modificaron las protecciones.
Se justifica preparar un candidato distinto, una sola corrida automática por SHA:
evita explícitamente la petición inicial ECR fallida para Logflare. No demuestra
que Hub vaya a estar disponible ni que WebKit vaya a pasar. CI210 sigue FAILURE;
seguridad residual, destino/recuperación/rolapp, review independiente y publicación
siguen separados y NO-GO. Sin merge, despliegue ni DDL.

QA173 revisa además los hunks y spec exactos de integración en lectura y da GO
para un candidato distinto. Main reconfirma CI210 completed/failure y remoto210
antes del push normal; no rerun ni dispatch.
