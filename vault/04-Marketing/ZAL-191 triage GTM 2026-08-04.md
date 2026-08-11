---
status: draft
owner: marketing
last_reviewed: 2026-08-04 (refresh post-arbitraje + post-refresh API)
type: triage
issue: ZAL-191
project: GTM — Instrumentación y Atribución (fe922514-7c8c-45c8-aa0e-2aa3a21b1f34)
source:
  - ../00-Inicio/Guia de trabajo para agentes.md
  - ./Decisiones.md
  - ./Brief - Taxonomía y atribución GTM (DRAFT).md
  - ./Brief - ROI por canal (Bumble).md
  - ./Brief - Copy consentimiento gate (DRAFT).md
  - ../06-Roadmap-y-Tareas/Changelog interno.md
---

# Triage GTM-DEP — ZAL-191 (2026-08-04)

> **Triage post-arbitraje CEO.** El CEO desbloqueó ZAL-191 vía arbitraje el 2026-08-04 (gate fantasma: Hermin y Gemita ya no figuran en el roster activo). Este documento registra el estado real de las 9 issues del proyecto GTM tras la verificación de bloqueadores, identifica los unblocks que dependen de Marketing y los que NO dependen de Marketing, y deja el plan operativo del lead de marketing para los próximos heartbeats.
>
> Owner: Marketing (04643dd6). Lead proyecto GTM-DEP. **No publica ni envía campañas: redacta borradores.**

## 1. Contexto del arbitraje

- ZAL-191 quedó `blocked` el 2026-08-02 con unblockDescriptor que referenciaba gates de Hermin (privacy) y Gemita (voto D-006 5/5).
- Verificación 2026-08-04: ambos agentes están fuera del roster activo. El CEO asume la autoridad que se les atribuía y la reasigna:
  - Privacy → **Platform & Security** (agent 6909a098).
  - Voto D-006 5/5 → CEO.
- ZAL-191 transicionada a `in_progress` (executionRunId vivo: `b3fbdc72-0ed0-4872-812f-f6352b6f916e`); `blockedBy: []`.

## 2. Triage de las 9 issues del proyecto (lectura 2026-08-04)

| Issue | Status | Assignee | Bloqueadores activos | UnblockDescriptor | Estado real |
|---|---|---|---|---|---|
| ZAL-156 parent track | blocked | 5bcea506 (Web Dev) | 4 IDs | board: "Eng Lead checkout parent" | El gate Hermin/Gemita ya no bloquea; el unblock vigente es operativo (Engineering Lead debe hacer checkout del parent). Marketing no es owner del unblock. |
| ZAL-157 GTM-DEP.1 UTM capture | blocked | 5bcea506 (Web Dev) | 3 IDs (post-código) | None | Implementación cerrada el 2026-08-03 (ZAL-200 con peer-verification fresca de Eng Lead sobre SHA `7c65298d2`). Bloqueadores son QA pendiente. |
| ZAL-158 GTM-DEP.2 Consent gate | blocked | 5bcea506 (Web Dev) | 1 ID (ZAL-139) | n/a (blockedBy-driven) | **CORRECCIÓN post-refresh API (2026-08-04)**: el `blockedBy` real es **ZAL-139 [D-006] Definir y validar plantillas Resend d0/d2/d7** (in_review, agent 5d63f5f6). El gate Hermin privacy puede estar cerrado, pero ZAL-158 NO depende de él: depende de la decisión D-006 sobre plantillas Resend. Cuando ZAL-139 cierre, Web Dev activa. Brief Copy consentimiento (DRAFT) listo para entregar cuando arranque. |
| ZAL-159 GTM-DEP.3 Canal registro | blocked | 5bcea506 (Web Dev) | 1 ID | None | Taxonomía implementada (ZAL-200 cierre). Bloqueador es QA pendiente. Tabla `utm_source → canal` validada por Marketing (ver brief taxonomía). |
| ZAL-160 GTM-DEP.4 page_view consentido | blocked | 5bcea506 (Web Dev) | 1 ID (revisión Eng Lead) | None | Revisión Eng Lead en `in_review` (ZAL-177, acade097); 3 bugs de integración pendientes de Web Dev. |
| ZAL-174 Revisión P&S trigger | blocked | 6909a098 (P&S) | **0 IDs** | self: "Paperclip eximir review-only del commit-proof gate" | **ZAL-174 NO está bloqueada por nadie** (blockedBy=[]); el unblock requiere acción de Paperclip/board: eximir las subtareas review-only del commit-proof gate o asignar un proyecto con codeRepoPaths. |
| ZAL-176 QA atribución first-touch | blocked | c07d53ca (QA) | 2 IDs | self: "QA en espera de ZAL-174" | Espera pasiva a ZAL-174. Cuando cierre, QA ejecuta matriz 109/109 tests + atribución + E2E. |
| ZAL-177 Revisión Eng Lead page_view | **in_review** | acade097 (Eng Lead) | 1 ID | self: "Web Dev corregir 3 bugs (usePageTracking mount, doble emisión, initAnalytics gating)" | Review en curso, 3 bugs identificados. No requiere marketing. |
| ZAL-178 QA page_view consentido | blocked | c07d53ca (QA) | 1 ID | self: "QA en espera de ZAL-193" | Espera pasiva a ZAL-193 (Eng Lead review de page_view). |

## 3. Hallazgos estructurales

1. **El CEO acertó en el arbitraje**: el gate Hermin está cerrado y la mención a Gemita era herencia de un contexto anterior. Los `unblockDescriptor` lo confirman.
2. **El cuello de botella real NO es de Marketing**: las 9 issues dependen de Web Dev (5bcea506), P&S (6909a098), QA (c07d53ca) y Eng Lead (acade097). Marketing no es owner del unblock de ninguna de las 9.
3. **Hay un cuello de botella de control-plane**: ZAL-174 está técnicamente desbloqueada (blockedBy=[]) pero requiere decisión de Paperclip/board sobre el commit-proof gate para review-only subtasks. Esto NO es un issue de marketing.
4. **La cadena ZAL-160 → ZAL-177 → ZAL-178 sigue el patrón adverso de workMode=standard**: la review de Eng Lead sobre page_view consentido (ZAL-177) encontró 3 bugs que Web Dev debe corregir; QA espera en ZAL-178. Marketing no participa en este loop.

## 4. Lo que Marketing mantiene vigente (los 3 briefs DRAFT)

| Brief | Estado | Coherencia post-arbitraje |
|---|---|---|
| `Brief - Taxonomía y atribución GTM (DRAFT).md` | draft interno | Vigente. Tabla `utm_source → canal` validada, regla `paid > social > email > organic > direct` confirmada, `whatsapp` explícitamente `social`. No requiere actualización por el arbitraje. |
| `Brief - ROI por canal (Bumble).md` | draft interno | Vigente. Fórmula, lista canónica de canales y reglas de honestidad (`N<5` muestra insuficiente, `N<30` cohorte temprana) siguen siendo el contrato. No requiere actualización. |
| `Brief - Copy consentimiento gate (DRAFT).md` | draft interno | Vigente. Principio de cadena única, copy ES propuesto, micro-copy auxiliar, y la nota "no promete RGPD/100% privado" siguen siendo el contrato. **Cambio menor**: la mención "cuando ZAL-158 entre a implementación, circular v2 a board para aprobación" sigue siendo válida. |

**Decisión**: los 3 briefs NO requieren reescritura por el arbitraje. El arbitraje libera la coordinación, no cambia la taxonomía ni el copy.

## 5. Plan operativo de Marketing para los próximos heartbeats

| Heartbeat | Acción esperada |
|---|---|
| 2026-08-04 (este) | Triage + acknowledge al CEO. Mantener ZAL-191 en `in_progress`. Sin PATCH a `done` (rol continuo). |
| Cuando ZAL-158 arranque | Entregar brief Copy consentimiento (DRAFT) a Web Dev; circular v2 a board para aprobación de copy ↔ privacy. |
| Cuando `canal_registro` tenga denominador ≥10 | Preparar claim cuantitativo provisional para discovery + entrevista de pricing. |
| Cuando ZAL-160 cierre y ZAL-178 arranque | Coordinar con QA smoke específico de atribución first-touch vs UTM en URL directa. |
| Cuando board lo pida | Exponer el brief ROI Bumble con datos reales. |
| Continuo | Mantener briefs vivos, no introducir nuevos claims sin denominador, no publicar nada sin aprobación board. |

## 6. Riesgos y fuera de scope

- **No es rol de Marketing** desbloquear ZAL-156/ZAL-157/ZAL-158/ZAL-159/ZAL-160/ZAL-176/ZAL-178: cada una tiene su propio assignee con `unblockDescriptor` claro. Tocar esas issues es pisar boundary de otros agentes.
- **ZAL-174** (P&S) requiere decisión de board sobre el control-plane (commit-proof gate para review-only). Escalación natural: ZAL-239 style (request_board_approval) si bloquea QA.
- **No fabricar denominadores**: mientras `canal_registro` esté vacío o `n<10` por canal, ningún claim cuantitativo en briefs ni en copy público.
- **GDPR / multi-touch / server-side UTM**: siguen fuera de scope MVP (ZAL-156 confirmó). No promover re-scopeo sin brief separado y board approval.

## 7. Estado de ZAL-191

- Status: `in_progress` (CEO la transicionó el 2026-08-04).
- `blockedBy: []`.
- `executionRunId: b3fbdc72-0ed0-4872-812f-f6352b6f916e`.
- Asignada a Marketing (04643dd6).
- Briefs vigentes: 3 (taxonomía, ROI, copy consentimiento) sin cambios.
- Próximo deliverable: este triage + comment acknowledge + esperar a que las 9 issues avancen.

## 8. Próximo paso (este lead)

- PATCH comment acknowledge en ZAL-191 con este triage como referencia.
- Mantener ZAL-191 en `in_progress` (rol continuo de coordinación; el cierre del proyecto depende de las 9 sub-issues, no de marketing).
- Sin claims públicos, sin campañas, sin cambios de pricing, sin contacto con producción.

## 9. Refresh heartbeat 2026-08-04 (run 4c472587-...-ae7dc)

**Re-verificación de las 9 issues vía API (timestamp 2026-08-04):**

- Ningún status cambió desde el run previo (b3fbdc72) salvo confirmación de que la ejecución actual tiene nuevo `executionRunId` (`4c472587-5b13-494c-b14f-a608d20ae7dc`).
- **Hallazgo material**: ZAL-158's `blockedBy` es **ZAL-139 [D-006] Resend plantillas** (in_review, agent 5d63f5f6), no el Hermin privacy gate. El triage previo confundió la fuente del bloqueo.
- Implicación para Marketing: el copy de consentimiento (ZAL-158) espera a D-006 (ZAL-139), no a Hermin. Si el board pide actualizar el brief Copy, el gating natural es ZAL-139, no la privacy review.
- ZAL-174 sigue con `blockedBy=[]` (cuello de botella Paperclip/board, no marketing).
- ZAL-177 sigue en `in_review` (acade097); 3 bugs pendientes de Web Dev.
- 0 comments en ZAL-191: este heartbeat añade el primer comment durable con refresh del estado.

**Decisiones tomadas este heartbeat:**

1. Corregir el triage (sección 2, fila ZAL-158) con la cadena real de `blockedBy`.
2. Post un comment acknowledge en ZAL-191 referenciando el doc.
3. NO tocar las 9 sub-issues (boundary de otros agentes).

**Próximo paso (continuación):**

- Heartbeat queda registrado. Sin PATCH a `done` (rol continuo, no cierre).
- Cuando ZAL-139 → done: confirmar con Web Dev (5bcea506) que arranca ZAL-158; circular v2 del brief Copy consentimiento a board.
- Cuando ZAL-174 desbloquee: confirmar con QA (c07d53ca) que arranca ZAL-176.
- Cuando ZAL-177 cierre y ZAL-193 (Eng Lead page_view review) avance: confirmar con QA que ZAL-178 está lista.
- Sin denominador suficiente (`canal_registro` con N<10 por canal): ningún claim cuantitativo en briefs.
