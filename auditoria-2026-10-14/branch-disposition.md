# Ramas y release — corte 14-10-2026

## Hallazgos clave

1. GitHub devuelve 22 PR abiertos. #226 es la integración principal, DRAFT y
   REVIEW_REQUIRED en `dec076e1`; #225 y #224 también requieren revisión.
2. Los tres frentes están separados: Backend consentimiento canónico,
   Frontend alta/Setup y QA walkthrough. Sus ramas activas no se descartan.
3. Varias ramas de entregas anteriores son ancestros de la integración local;
   no necesitan volver a fusionarse. Esto no demuestra que sus worktrees estén
   limpios ni permite borrarlos.
4. CI `38486557090`: build, unitarios, tipos/lint, RLS, integridad de migraciones,
   dependencias y móvil pasan; setup E2E experimental falla. E2E autenticado
   sigue en ejecución al corte. No hay DEMO-READY.

## Disposición revisable

| Grupo | Decisión | Siguiente paso |
|---|---|---|
| #226 | Conservar como única integración | Integrar bloques revisados y probar recorrido completo |
| #225 | Conservar mitigación P0 independiente | Revisión humana efectiva; no omitir gate |
| #224 | No fusionar automáticamente encima de #226 | Comparar delta público con rebrand ya integrado |
| Backend `owner-canonical-contractual-consent-20261014` | Conservar activo | Servicio/esquema, pruebas reales y SHA |
| Frontend `owner-canonical-signup-20261014` | Conservar activo | b07cfd3 integrado; Setup contractual pendiente |
| QA `mvp-qa-release-227-20261014` | Conservar activo | Integrar schema aprobado y ejecutar tres navegadores |
| Entregas `mvp-monthly-billing-{backend,frontend,qa}-20261013`, `owner-consent-bootstrap-gate`, `profile-setup-recovery-login-20261014`, `register-onboarding-network-errors-20261014`, `owner-operational-summary-ui-20261014`, `owner-privacy-analytics-20261014` | Integradas por ascendencia; candidatas a archivo, no borradas | Comprobar dirty/untracked y adjuntos antes de archivar |
| Dependabot #213–223 salvo números no presentes | Revisar delta/versiones, no lote de majors | Priorizar vulnerabilidad efectiva; preservar lockfile y gates |
| PR antiguos #66/#73/#80/#99/#112/#115/#116/#126 | No incorporar sin revisión de delta | Clasificar reglas vigentes frente al dominio nuevo antes de cerrar |

`git branch --merged HEAD` solo verifica ascendencia, no equivalencia funcional
tras cambios posteriores. La disposición de PR antiguos es pendiente: no se
afirma que sean redundantes sin inspeccionar sus diffs.

## Evidencia y límites

- Fuente: `gh pr list --repo mentessaas/Zaltyko --state open --limit 100`,
  `git branch --merged HEAD`, `gh run view 38486557090` y API Deployments.
- [PR principal](https://github.com/mentessaas/Zaltyko/pull/226),
  [P0](https://github.com/mentessaas/Zaltyko/pull/225),
  [CI observado](https://github.com/mentessaas/Zaltyko/actions/runs/38486557090).
- GitHub registra Preview de `dec076e1`, deployment `7052984016`; estado de
  runtime, entorno de datos y dominio productivo no verificados en esta pasada.
- Solo inventario/decisiones documentales: no se borraron ramas, cerraron PR,
  modificaron aliases ni aplicaron migraciones remotas.
