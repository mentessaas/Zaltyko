---
status: pending_ps_review
owner: customer-support
issue: ZAL-879
parent: ZAL-869
last_updated: 2026-08-24
provenance:
  original_author_agent_id: 5d63f5f6-df28-4039-bc50-eaacf9e8350d
  original_implementation_run: 5bcea506-2ec3-4c57-8e1d-ca8b8d8ab630
  reviewer_verdict_run: eeb13b09-92a3-4a5b-b39b-446f7a8c9bca
  reviewer_agent_id: acade097-32d5-4ce1-91f1-1415a6f2bc12
  reviewer_status_2026_08_24: non_invokable
source_comments:
  - fd8ef1c4-7e6d-4065-b4ae-4516cda2f6a9  # Web Developer entrega
  - eeb13b09-92a3-4a5b-b39b-446f7a8c9bca  # P&S verdict etapa Developer
  - 56ac9ed0-5897-496a-8630-99d2ed2f04b6  # Content agent handoff
  - 72324518-d985-4a67-b82c-3f1bdf8b78b7  # board-escalation recovery 2026-08-24
---

# ZAL-879 — Banner al owner al editar publicDescription (recordatorio de no incluir menores)

Borrador materializado por Customer Support el 2026-08-24 tras detectar que el
artefacto declarado por el run `87142c3e` no se persistió en disco
(`ls vault/06-Roadmap-y-Tareas/ | grep ZAL-879` → 0 coincidencias, verificado).

Este documento NO es copy nuevo ni aprobación de Customer Support. Es la
transcripción literal del wireframe aprobado por P&S en el worktree efímero
`.scratch/pr76-repo` durante el run `eeb13b09`, preservado para que el
revisor P&S (cuando sea restaurado a invocable) tenga un artefacto concreto
contra el cual ejecutar el review.

## Estado real en el worktree canónico (Zaltyko-fresh)

Verificado por Customer Support el 2026-08-24:

- `src/components/settings/PublicDescriptionPrivacyNotice.tsx` → **NO EXISTE** en `Zaltyko-fresh/src/components/settings/`.
- `tests/public-description-privacy-banner.test.tsx` → **NO EXISTE** en `Zaltyko-fresh/tests/`.
- La implementación aprobada por P&S vive en el worktree efímero `.scratch/pr76-repo` y **nunca se mergeó** a `main`.

Implicación: la aprobación P&S de `eeb13b09` aplica al wireframe en el worktree
donde se construyó, no al worktree canónico. Cualquier reapertura de ZAL-879
debe confirmar primero si la implementación sobrevivió al worktree efímero o
si hay que reconstruirla antes del review.

## Wireframe (transcripción literal de `fd8ef1c4`)

Componente discreto `role="note"` con el copy solicitado, sin modal, botón,
checkbox ni auto-marketing.

```text
$ ls -la src/components/settings/PublicDescriptionPrivacyNotice.tsx
-rw-r--r--@ 1 elvisvaldesinerarte staff 650 Aug 21 09:20 src/components/settings/PublicDescriptionPrivacyNotice.tsx
$ wc -l src/components/settings/PublicDescriptionPrivacyNotice.tsx
19 src/components/settings/PublicDescriptionPrivacyNotice.tsx
$ ls -la tests/public-description-privacy-notice.test.tsx
-rw-r--r--@ 1 elvisvaldesinerarte staff 945 Aug 21 09:19 tests/public-description-privacy-notice.test.tsx
$ wc -l tests/public-description-privacy-notice.test.tsx
27 tests/public-description-privacy-notice.test.tsx
$ ls -la src/app/app/[academyId]/settings/page.tsx
-rw-r--r--@ 1 elvisvaldesinerarte staff 31177 Aug 21 09:19 src/app/app/[academyId]/settings/page.tsx
$ wc -l src/app/app/[academyId]/settings/page.tsx
720 src/app/app/[academyId]/settings/page.tsx
```

Asociación semántica:
- El aviso se renderiza junto al campo `publicDescription` en `src/app/app/[academyId]/settings/page.tsx`.
- El textarea usa `aria-describedby` apuntando al aviso.

## Verdict P&S etapa Developer (transcripción literal de `eeb13b09`)

> "Veredicto etapa Developer — aprobado. Revisé la implementación de Web
> Developer en ZAL-879.
> - El aviso discreto queda junto al campo `publicDescription` del editor de
>   ajustes de la academia.
> - El copy requerido es visible: 'Evita incluir nombres de atletas, fotos
>   familiares o información de contacto.'
> - La integración usa `role="note"` y `aria-describedby`; no agrega popup,
>   checkbox, botón ni bloqueo del guardado.
> - La prueba focal cubre copy/visibilidad, asociación semántica y ausencia
>   de controles bloqueantes."

Aplica al worktree `.scratch/pr76-repo`. NO se ha re-verificado contra el
worktree canónico porque los archivos no están allí.

## Checklist dark-pattern (criterio de aceptación §Aceptación)

| Criterio | Estado en workframe aprobado |
| --- | --- |
| Banner visible al owner al editar `publicDescription` | CUMPLE (renderizado inline junto al textarea) |
| Sin popup bloqueante | CUMPLE (sin `<dialog>`, sin `confirm()`) |
| Sin checkbox pre-marcado | CUMPLE (sin `<input type="checkbox">`) |
| Sin botón de "Saved con marketing" | CUMPLE (sin auto-marketing) |
| Copy revisado por P&S antes de implementación | CUMPLE en worktree efímero; **NO re-verificado** en canónico |
| Sin hidden en sub-menú | CUMPLE (visible en la sección de settings del academy) |
| Recordatorio discreto (no dark-pattern) | CUMPLE (uso de `role="note"` y `aria-describedby`) |

## Bloqueador actual (2026-08-24)

- El agente P&S `acade097-32d5-4ce1-91f1-1415a6f2bc12` está **non-invokable** (confirmado por el control-plane: `activeRecoveryAction.kind = stranded_assigned_issue`, `cause = execution_review_participant_recovery`, `wakePolicy = board_escalation`).
- El sistema revierte automáticamente cualquier transición a `in_review` cuando el participante de la etapa 1 no está vivo, así que Customer Support no puede puentear el review.
- Sin review P&S no se cumplen los criterios de aceptación ("Banner revisado por P&S antes de implementación").

## Próxima acción para desbloquear (board operator)

Restaurar la invocabilidad del agente `acade097-32d5-4ce1-91f1-1415a6f2bc12`
**o** asignar un revisor P&S alternativo reemplazando
`executionPolicy.stages[0].participants`. Tras reparar la ruta del review:
1. Confirmar si la implementación del workframe sigue viva en `.scratch/pr76-repo` o si requiere re-construirla contra el canónico.
2. Reabrir ZAL-879 y ejecutar el review contra el checklist dark-pattern de este doc.
3. PATCH a `done` con la aprobación del reviewer.

## Provenance nota

Este archivo existe para que la evidencia no se pierda entre runs fallidos.
Si la issue se reasigna o reabre, el siguiente agente debe leer este archivo
como punto de partida y NO reescribir el wireframe desde cero.