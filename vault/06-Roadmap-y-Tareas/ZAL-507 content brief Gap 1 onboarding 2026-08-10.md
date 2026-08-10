# ZAL-507 — Content brief Gap 1 (drift §3 vs CHECKLIST_DEFINITIONS)

Work product del Content Agent para cerrar Gap 1 de [ZAL-324](/ZAL/issues/ZAL-324).

## Lectura del drift (evidencia 2026-08-10)

Verifiqué `src/lib/onboarding-utils.ts:27-69` y los labels canónicos son:

| `key` | `label` (código, fuente de verdad) |
|---|---|
| `add_5_athletes` | Añade al menos 5 atletas |
| `create_first_group` | Crea tu primer grupo de entrenamiento |
| `setup_weekly_schedule` | Configura tu calendario semanal |
| `invite_first_coach` | Invita a tu primer entrenador |
| `enable_payments` | Activa métodos de pago |
| `send_first_communication` | Envía tu primera comunicación a padres |
| `login_again` | Vuelve a entrar a Zaltyko |

**Caveat:** el documento `vault/04-Marketing/ZAL-139-onboarding-owner-v0.3.md` §3 que la brief original referenciaba no aparece físicamente en el árbol (`find` por nombre y por palabras clave del §3 devuelve 0 hits en `vault/`). El brief ZAL-311 lo daba por existente, pero solo `vault/06-Roadmap-y-Tareas/Changelog interno.md` menciona ZAL-139 como `done`. Si §3 existe fuera de este repo (Notion, Drive, attachment de ZAL-139 que no se versionó), no lo pude leer.

Consecuencia práctica: si §3 efectivamente está vivo y diverge como dice el brief, el drift es real; si §3 no se versionó, el "drift" se reduce a que el código manda por defecto y el siguiente round copy puede escribir §3 directamente desde `CHECKLIST_DEFINITIONS`. **En ambos casos, la recomendación siguiente es la misma: código como fuente de verdad.**

## Recomendación editorial — Opción A del veredicto ZAL-311

Aplicar **Opción A**: que el integrador resuelva `next_step_label` desde `onboarding_checklist_items.label` (la fila persistida al crear/avanzar el checklist), no desde cadenas hardcoded en §3 del copy.

**Razones:**

1. **Coherencia pantalla ↔ email.** El dueño ve esos mismos labels en el panel de onboarding (ChecklistWidget). Si el email dice otra cosa, rompe confianza con el producto.
2. **Una sola fuente de verdad.** Cambiar §3 para coincidir con el código resuelve el síntoma pero deja dos textos que se desincronizan en el próximo edit a `CHECKLIST_DEFINITIONS`.
3. **El código ya está auditado y aprobado** (ZAL-137). El doc §3 deriva del mismo producto as-built.

**Fallback aceptable** (solo si Web Developer ve fricción técnica en implementar la lectura dinámica): reescribir §3 verbatim desde `CHECKLIST_DEFINITIONS.label`, sin tocar código. Riesgo: vuelve a desincronizarse cuando alguien edite el código. Documentar en §3 "Fuente: src/lib/onboarding-utils.ts".

**No recomendado:** invertir la dirección (mover los labels de §3 al código). Obliga a mantener dos fuentes en paralelo y reintroduce el drift en el siguiente round.

## Retoques editoriales a `CHECKLIST_DEFINITIONS.label` (propuesta Content)

Estos cambios son opcionales. Si Web Developer acepta Opción A y los integra, la copia del email mejorará sin perder coherencia con el panel.

| `key` | `label` actual | `label` propuesto | Razón |
|---|---|---|---|
| `add_5_athletes` | Añade al menos 5 atletas | (sin cambio) | El umbral "5" es trigger de growth; no reformular. |
| `create_first_group` | Crea tu primer grupo de entrenamiento | Crea tu primer grupo | "de entrenamiento" es redundante en contexto academia/gimnasia. |
| `setup_weekly_schedule` | Configura tu calendario semanal | (sin cambio) | "calendario" es más concreto que "horario" y matchea el módulo Clases. |
| `invite_first_coach` | Invita a tu primer entrenador | (sin cambio) | OK. |
| `enable_payments` | Activa métodos de pago | Activa los cobros de tu academia | Menos jerga técnica, más concreto. |
| `send_first_communication` | Envía tu primera comunicación a padres | Envía tu primera comunicación a las familias | "familias" evita singular implícito y match con multi-atleta. |
| `login_again` | Vuelve a entrar a Zaltyko | Vuelve a Zaltyko | Más corto; el dueño ya entró. |

Si Web Developer acepta los retoques, Content emite los textos finales en una sección §3.1 del v0.3 del attachment de [ZAL-139](/ZAL/issues/ZAL-139) (issue separada de [ZAL-324](/ZAL/issues/ZAL-324)).

## Límites (recordatorio)

- Solo entrega editorial. **No** implementar código; integrador es Web Developer.
- **No** publicar ni activar la secuencia; sigue bloqueada por [ZAL-324](/ZAL/issues/ZAL-324).
- **No** introducir claims ni promesas nuevas.
- Mantener español neutro, sin acrobática/trampolín, sin pricing, sin tiempos cerrados.
