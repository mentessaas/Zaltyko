# Borrado de cuentas y de fichas que vinieron de una solicitud (pendiente)

Estado al 13-11-2026. Este documento describe un problema y propone una
solución para una PR propia. **No hay cambios de esquema ni de código aquí.**
La política de supresión vigente está en
`src/modules/data-rights/application/activated-modules-erasure-policy.ts`.
`tests/data-rights-activated-modules-contract.test.ts` la deduce de las claves
foráneas.

## 1. Borrar una cuenta falla en cuanto la persona ha trabajado en una academia

### Qué ocurre

`deleteAuthUser` (`src/lib/supabase/admin-operations.ts`) borra la cuenta en
`auth.users`. La usan dos rutas de super-admin:

- `src/app/api/super-admin/users/[profileId]/route.ts`;
- `src/app/api/super-admin/academies/route.ts`, solo para deshacer un alta
  fallida.

Ese borrado arrastra en cascada sus pertenencias (`organization_members.user_id`
tiene `on delete cascade`). Después, PostgreSQL comprueba quién apunta a esas
filas. Si alguna referencia es RESTRICT o NO ACTION (sin `on delete`), la
sentencia entera falla. No se borra nada: ni la cuenta ni sus pertenencias.

### Referencias directas a `auth.users` que bloquean

| Tabla | Columna | Acción | Origen |
|---|---|---|---|
| `zaltyko.organization_member_invitations` | `accepted_by_user_id` | NO ACTION | candidato de acceso de equipo (activado el 12-11-2026) |
| `zaltyko.organization_team_command_receipts` | `actor_user_id` (NOT NULL) | NO ACTION | candidato de acceso de equipo |
| `zaltyko.payments` | `recorded_by_user_id` | RESTRICT | `20261006093047` |
| `zaltyko.insight_actions` | `actor_user_id` | RESTRICT | `20261006113000` |
| `zaltyko.organization_saas_webhook_reconciliation_decisions` | `actor_user_id` | RESTRICT | candidato de instalación canónica |

`accepted_by_user_id` no admite `set null`: el CHECK de estado exige
`accepted_by_user_id is not null` en las invitaciones aceptadas.
`actor_user_id` de los recibos es NOT NULL.

### Referencias a `organization_members` que bloquean (autoría)

**Funciones activadas el 12-11-2026 (NO ACTION):**

- `athlete_objectives.created_by_member_id` y `status_changed_by_member_id`;
- `athlete_objective_status_history.changed_by_member_id`;
- `athlete_observations.author_member_id` y `updated_by_member_id`;
- `session_plans.created_by_member_id` y `updated_by_member_id`;
- `session_plan_blocks.done_by_member_id`;
- `class_plan_templates.updated_by_member_id`;
- `admission_links.created_by_member_id`;
- `admission_requests.handled_by_member_id`;
- `organization_member_invitations.invited_by_member_id`,
  `accepted_member_id` y `revoked_by_member_id`;
- `organization_team_command_receipts.member_id`.

**Núcleo (historial aplicado y candidato de instalación canónica, RESTRICT):**

- `staff_profiles.member_id`;
- `enrollment_status_history.changed_by_member_id`;
- `attendance_records.recorded_by_member_id`;
- `trial_status_history.changed_by_member_id`;
- `trial_followups.completed_by_member_id`;
- `group_membership_history.changed_by_member_id`;
- `family_collection_preferences.updated_by_member_id`;
- `insight_actions.actor_member_id`;
- `organization_saas_checkout_operations.requested_by_member_id`;
- `organization_saas_trials.started_by_member_id`.

Solo `class_template_staff.assigned_by_member_id` y
`session_staff_overrides.changed_by_member_id` usan
`on delete set null (columna)`: no bloquean.

### Consecuencia

Una entrenadora que pasó lista una vez, o una directora que invitó a alguien,
no puede borrarse desde super-admin: la ruta devuelve error y la cuenta sigue
intacta. Es coherente, porque nada se borra a medias. Pero el derecho de
supresión de esa persona no tiene hoy un camino que funcione.

### Propuesta: seudonimizar la pertenencia, no borrarla

1. **No borrar `organization_members`.** La fila es la autoría de registros
   de la academia (asistencia, cambios de estado, observaciones), que la
   academia debe conservar como responsable. Se marca como retirada:
   - `status = 'removed'`, o un estado nuevo como `erased`;
   - `user_id` pasa a null o a una identidad técnica «cuenta eliminada».
   `user_id` es hoy NOT NULL con cascada: el cambio necesita una migración.
2. **Ficha del equipo.** Si tiene `staff_profiles` y `people`, se sustituyen
   nombre y apellidos por «Persona eliminada» y se desvincula `member_id`.
   Antes hay que decidir si la ficha se conserva para el histórico de clases.
3. **Referencias directas a `auth.users`.**
   - En los recibos de acceso de equipo, `actor_user_id` pasa a null con
     `on delete set null`, quitando el NOT NULL. Su valor de idempotencia
     caduca con la invitación.
   - En las invitaciones aceptadas, el CHECK debe admitir
     `accepted_by_user_id` null cuando la cuenta se suprime. Se mantiene
     `accepted_member_id`, que apunta a la pertenencia seudonimizada.
   - En `payments`, `insight_actions` y las decisiones de conciliación SaaS,
     mismo tratamiento (`set null`), revisado con el ledger.
4. **Orden del procedimiento.** En una transacción: seudonimizar las
   pertenencias en todas las academias, ajustar las referencias directas y,
   por último, borrar `auth.users`. Así la cascada ya no encuentra filas que
   bloqueen.
5. **Alcance.** Una cuenta puede pertenecer a varias academias. La supresión
   de la cuenta las afecta a todas; la baja en una academia sola es otra
   operación (retirar la pertenencia sin tocar la cuenta).
6. **Pruebas.** Una prueba PostgreSQL que cree autoría en cada tabla de la
   lista y compruebe que el procedimiento termina, que no quedan datos de
   identidad y que los registros de la academia se conservan.

## 2. La ficha de una gimnasta que vino de una solicitud no se puede borrar

### Qué ocurre

`zaltyko.admission_requests.converted_athlete_id` apunta a
`zaltyko.athletes` sin `on delete` (NO ACTION). Al convertir una solicitud
(estados `converted` y `waitlisted`), la solicitud queda enlazada a la ficha.
Borrar esa ficha falla mientras exista la solicitud.

La solicitud tampoco se puede anonimizar:

- el CHECK de anonimización solo admite `status = 'declined'`;
- el CHECK de estado exige `converted_athlete_id is not null` en
  `converted` y `waitlisted`.

Hoy ningún flujo borra fichas (se archivan con `is_active = false`), y el
núcleo ya bloquea ese borrado por otras vías (RESTRICT en `enrollments`,
`attendance_records`, `family_members`, `trials`, `waitlist_entries`,
`invoice_lines` e `invoice_line_enrollments`). Pero cuando exista la supresión
de una gimnasta, la solicitud será una dependencia más, y además guarda el
contacto de la familia y el año de nacimiento.

### Propuesta

1. Al suprimir la ficha, anonimizar también la solicitud convertida con los
   mismos valores que una descartada:
   - nombres y email sustituidos;
   - teléfono, año y comentario a null;
   - `anonymized_at = now()`.
2. Para que el CHECK lo admita, hay dos opciones:
   - permitir `anonymized_at` en `converted` y `waitlisted`;
   - pasar `converted_athlete_id` a `on delete set null (converted_athlete_id)`,
     junto con un estado de cierre que no exija la referencia, por ejemplo
     `converted` con `anonymized_at` no nulo.
3. La lista de espera (`waitlist_entry_id`) sigue el mismo camino que la ficha.

## Siguiente paso

Una PR propia con la migración, el procedimiento en `src/modules/data-rights`
y sus pruebas PostgreSQL. Necesita la decisión de Elvis sobre qué se conserva
de la ficha del equipo y sobre el estado final de una solicitud convertida.
