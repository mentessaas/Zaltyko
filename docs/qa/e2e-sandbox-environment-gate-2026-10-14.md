# Barrera de aprobación para E2E remoto

Fecha: 2026-10-14

Base exacta: `ab4b3d9377402c75f1a861b71b88c292b508538f` (`Zaltyko-monthly-billing-local-e2e-20261013`).

Rama de revisión local: `codex/e2e-sandbox-env-barrier-20261014`.

## Cambios acotados

- `e2e-readiness` y `e2e-auth` declaran el Environment `e2e-sandbox`.
- Si faltan credenciales durante un PR, `check-e2e-readiness.sh` conserva `enabled=false` como diagnóstico y termina con código 1. Ya no permite que Dependabot ni un fork conviertan E2E omitido en verde.
- `E2E Authenticated PR Required Gate` evalúa ambos resultados con `always()` y solo pasa cuando los dos son `success`; `skipped`, `cancelled` o `failure` bloquean ese check.
- No se modifican los demás jobs, no se amplía el smoke a producción, no se baja ningún gate y no se añade PostgreSQL/E2E local.

## Requisitos externos antes de publicar

El nombre `environment: e2e-sandbox` en YAML no acredita que GitHub tenga protección configurada. Antes de publicar, ese Environment debe requerir aprobación de reviewers y no permitir autoaprobación o bypass. Las credenciales E2E deben moverse a secretos del Environment y quitarse de Repository Secrets antes de que cualquier PR use la rama; si quedan secretos duplicados a nivel repo, otros jobs/workflows podrían consumirlos sin pasar por este Environment. No he accedido a GitHub ni configurado estas reglas o secretos.

El fail-closed para Dependabot y PRs de fork es intencional: sin credenciales en el Environment, el PR no satisface el check remoto y no puede mergearse por un `enabled=false` exitoso. El push a `develop` conserva el comportamiento previo de `enabled=false` sin error cuando faltan variables; el push a `main` sigue fallando.

Se asignó el mismo Environment a dos jobs para respetar el alcance. GitHub puede solicitar aprobación por cada job; si aparecen dos solicitudes, la alternativa mínima es integrar la comprobación de readiness como primer paso de `e2e-auth` y mantener el gate estable sobre el único job protegido. No consolidé los jobs aquí.

El gate estable solo bloquea merges si branch protection lo marca como check requerido. Esa configuración tampoco se ha inspeccionado ni cambiado. Hasta configurar y verificar Environment, secretos y check requerido, el cambio permanece **NO-GO para publicar**. El E2E remoto conserva la capacidad de provisionar y aplicar esquema en Sandbox, pero no debería obtener credenciales antes de la aprobación configurada.

## Validación

Los dos contratos focales pasan: 11/11 tests. Cubren el YAML y ejecutan el script de readiness con un entorno allowlist limpio, sin heredar secretos del proceso: PR sin credenciales, Dependabot/fork, `main` sin credenciales, `develop` sin credenciales, credenciales test dummy completas y ref de producción. Prettier, ESLint del test, `bash -n` y `git diff --check` también pasan. No se ejecutó E2E, Postgres, Supabase, producción ni plataforma externa. No se cambiaron los workflows de deploy/producción ni otros gates.
