# Verificación de ramas y release — Zaltyko

Fecha: 2026-10-13
Alcance: revisión de solo lectura de PRs, ramas de trabajo y estado Vercel.

## Hallazgos

1. El PR #224 (`feat(marketing): rebrand Zaltyko for gymnastics academies`)
   seguía abierto, requería revisión y mostraba `BLOCKED`; los checks visibles
   estaban verdes. La preview histórica no demuestra que esta rama de trabajo
   esté integrada ni publicada.
2. Los aliases `zaltyko.com` y `www.zaltyko.com` apuntaban a
   `dpl_8fcdzLweJt7vDRBxNeR9Tu6kfzgv`, una versión anterior al corte greenfield.
3. El deployment más reciente consultado, `dpl_ApsAqqYms8V4z34tLPkiBqkbB9iA`,
   aparecía `BLOCKED` sin target; el error de Vercel remitía a configuración
   del equipo/proyecto.
4. Había numerosas ramas/working trees con trabajo local no integrado; algunos
   estaban muy sucios. No se limpiaron, archivaron, fusionaron ni rebasaron.
5. Los historiales remotos de migraciones y el conjunto greenfield local no
   estaban reconciliados. No se intentó aplicar ni reparar ningún historial.

## Implicación y recomendación

La URL pública seguía sirviendo una release anterior; no es evidencia de que
Owner Dashboard, Health Score o el SaaS greenfield estén en producción. No
fusionar ni desplegar como remedio inmediato: primero revisión independiente,
integración de cambios aprobados, build/deploy verificable y reconciliación del
plan de migraciones con backup y rollback. Mantener secretos, cobros Live y datos
de producción fuera de la fase local.

## Evidencia consultada

- PR: [mentessaas/Zaltyko#224](https://github.com/mentessaas/Zaltyko/pull/224)
- Deployment activo observado: `dpl_8fcdzLweJt7vDRBxNeR9Tu6kfzgv`
- Último deployment consultado: `dpl_ApsAqqYms8V4z34tLPkiBqkbB9iA`
- Rama local de esta implementación: `codex/zaltyko-plan-implementation`
- Plan y decisiones de implementación: `docs/plans/2026-10-13-full-saas-implementation-plan.md`,
  `vault/06-Roadmap-y-Tareas/Decisiones.md`.

## Revalidación remota — 2026-10-13 05:31 UTC

La instantánea inicial de arriba se actualizó en solo lectura:

- `zaltyko.com` y `www.zaltyko.com` siguen apuntando a
  `dpl_8fcdzLweJt7vDRBxNeR9Tu6kfzgv`, deployment **READY** de `main` en
  `aac785213a9d3678c6215da62ef4e9f6931d3163`. Producción no contiene el núcleo
  greenfield de esta rama.
- PR #224 sigue abierto. PR #225 («P0: cerrar cobro automático legacy y
  corregir la promesa pública») también sigue abierto, sin fusionar, en
  `f68ec68d140868fb5f0df0f1d4571d35665af3fb`.
- El preview de #225 está **READY** en
  `https://zaltyko-bnzd409h2-mentessaas-projects.vercel.app/`.
  `E2E Authenticated Flows`, build, unit tests, lint/types, RLS, migraciones,
  SBOM/dependencias, credenciales readiness, gate operativo, mobile y GitGuardian
  terminan en `success`; E2E público, Lighthouse y smoke figuran `skipped` por
  configuración, no como fallos.
- La rama `codex/zaltyko-plan-implementation` seguía solo en el worktree local
  al tomar esta instantánea; aún no había PR ni Preview para esos cambios.

## Disposición

El riesgo P0 del cron y la promesa pública aún no están corregidos en producción:
la mitigación está en PR #225 y requiere revisión independiente. No iniciar
captación basándose en el copy objetivo ni en previews. La nueva rama tampoco
debe integrarse como un único cambio de producción: primero publicar un PR de
revisión, ejecutar sus gates y conciliar el historial Supabase antes de diseñar
un cutover. Esta revalidación no cambió GitHub, Vercel, aliases, Supabase,
credenciales ni datos productivos.

## Límites

Es una instantánea de solo lectura del 2026-10-13, no una comprobación continua.
No se cambió Vercel, GitHub, producción, aliases, credenciales ni Supabase.
Revalidar antes de cualquier aprobación o release.
