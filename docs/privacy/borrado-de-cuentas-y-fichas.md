# Borrado de cuentas y de fichas que vinieron de una solicitud

Estado al 14-11-2026.

- **Supresión de cuentas (sección 1): resuelta en código y preparada como
  candidata SQL** (`docs/deployment/candidates/20261114120000_account_erasure_candidate.sql`,
  con su paso de validación),
  **sin aplicar en ningún entorno**. Mientras no se aplique, suprimir una cuenta
  desde super-admin responde 503 y no borra nada.
- **Fichas de gimnasta que vinieron de una solicitud (sección 2): pendiente.**

La política declarada por tabla está en
`src/modules/data-rights/application/activated-modules-erasure-policy.ts`;
`tests/data-rights-activated-modules-contract.test.ts` la deduce de las claves
foráneas, incluidas las que cambia la candidata.

## 1. Supresión de cuentas

### Problema (antes de la candidata)

Borrar una cuenta fallaba en cuanto la persona había trabajado en una academia.

#### Qué ocurre

`deleteAuthUser` (`src/lib/supabase/admin-operations.ts`) borra la cuenta en
`auth.users`. La usan dos rutas de super-admin:

- `src/app/api/super-admin/users/[profileId]/route.ts`;
- `src/app/api/super-admin/academies/route.ts`, solo para deshacer un alta
  fallida.

Ese borrado arrastra en cascada sus pertenencias (`organization_members.user_id`
tiene `on delete cascade`). Después, PostgreSQL comprueba quién apunta a esas
filas. Si alguna referencia es RESTRICT o NO ACTION (sin `on delete`), la
sentencia entera falla. No se borra nada: ni la cuenta ni sus pertenencias.

#### Referencias directas a `auth.users` que bloquean

| Tabla | Columna | Acción | Origen |
|---|---|---|---|
| `zaltyko.organization_member_invitations` | `accepted_by_user_id` | NO ACTION | candidato de acceso de equipo (activado el 12-11-2026) |
| `zaltyko.organization_team_command_receipts` | `actor_user_id` (NOT NULL) | NO ACTION | candidato de acceso de equipo |
| `zaltyko.payments` | `recorded_by_user_id` | RESTRICT | `20261006093047` |
| `zaltyko.insight_actions` | `actor_user_id` | RESTRICT | `20261006113000` |
| `zaltyko.organization_saas_webhook_reconciliation_decisions` | `actor_user_id` | RESTRICT | candidato de instalación canónica |

Revisión del 14-11-2026: además, `zaltyko.audit_log` y
`zaltyko.insight_status_history` ya tenían `on delete set null`, pero sus
triggers de solo inserción (`audit_log_immutable`,
`insight_status_history_immutable`) rechazan cualquier UPDATE, también el que
hace la clave foránea. Toda persona que haya firmado una entrada de auditoría
(prácticamente toda dueña) era imposible de borrar. Y el directorio público
(`public.directory_grants`, `directory_claims`, `directory_revisions`,
`directory_subscriptions`, `directory_audit`) apunta a `auth.users` sin
`on delete`. `public.profiles` no tiene clave a `auth.users`, y las claves
hacia `public.profiles` ya son CASCADE o SET NULL; pero borrar un perfil
borraba en cascada sus academias legacy (`public.academies.owner_id`), con
sus cobros y facturas.

`accepted_by_user_id` no admite `set null`: el CHECK de estado exige
`accepted_by_user_id is not null` en las invitaciones aceptadas.
`actor_user_id` de los recibos es NOT NULL.

#### Referencias a `organization_members` que bloquean (autoría)

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

#### Consecuencia

Una entrenadora que pasó lista una vez, o una directora que invitó a alguien,
no puede borrarse desde super-admin: la ruta devuelve error y la cuenta sigue
intacta. Es coherente, porque nada se borra a medias. Pero el derecho de
supresión de esa persona no tiene hoy un camino que funcione.

### Decisión: seudonimizar la pertenencia, no borrarla

La pertenencia (`zaltyko.organization_members`) es la autoría de registros que
la academia debe conservar como responsable del tratamiento (asistencia,
cambios de estado, observaciones, cobros). No se borra: se revoca y pierde la
cuenta. Los registros conservan la autoría apuntando a una pertenencia sin
persona. Lo que solo pertenecía a la cuenta se borra con ella. Lo que es
evidencia fiscal de Zaltyko se conserva y bloquea la supresión.

| Tabla.columna → `auth.users` | Antes | Después | Por qué |
|---|---|---|---|
| `zaltyko.organization_members.user_id` | CASCADE, NOT NULL | **SET NULL** + CHECK `user_id is not null or status = 'revoked'` | Autoría de la academia; el CHECK impide borrar la cuenta sin revocar antes |
| `zaltyko.payments.recorded_by_user_id` | RESTRICT | **SET NULL** (el CHECK ya no exige quién anotó un pago manual) | Cobro: obligación contable de conservarlo |
| `zaltyko.insight_actions.actor_user_id` | RESTRICT, NOT NULL | **SET NULL** | Se conserva con `actor_member_id` |
| `zaltyko.audit_log.actor_user_id` | SET NULL (bloqueado por el trigger) | SET NULL; el trigger admite **solo** ese vaciado y solo si la cuenta ya no existe | Auditoría de la academia |
| `zaltyko.insight_status_history.actor_user_id` | igual | igual | Historial de avisos |
| `zaltyko.organization_member_invitations.accepted_by_user_id` | NO ACTION | **SET NULL**; el CHECK de «aceptada» exige `accepted_member_id`, no la cuenta | Evidencia de acceso de la academia |
| `zaltyko.organization_team_command_receipts.actor_user_id` | NO ACTION | **CASCADE** | Recibos de reintento: solo sirven a la cuenta |
| `zaltyko.guardians.auth_user_id` | SET NULL | sin cambios | La ficha del tutor es de la academia |
| `zaltyko.organization_bootstrap_commands`, `owner_dashboard_layouts`, `owner_signup_consents` | CASCADE | sin cambios | Solo de la cuenta. La auditoría de consentimientos (`owner_signup_consent_audits`) no tiene clave a la cuenta y se conserva como prueba del consentimiento (art. 17.3.e) |
| `zaltyko.organization_saas_webhook_reconciliation_decisions.actor_user_id` | RESTRICT | **RESTRICT justificado** | Decisiones de conciliación de cobros SaaS de Zaltyko, de solo inserción, firmadas por el equipo interno: evidencia fiscal. La supresión responde 409 con el motivo |
| `public.directory_grants.user_id` | NO ACTION | **CASCADE** | Derecho de la cuenta a gestionar una ficha del directorio |
| `public.directory_grants.approved_by`, `directory_claims.decided_by`, `directory_audit.actor_id` | NO ACTION | **SET NULL** | Historial del directorio |
| `public.directory_claims.user_id` | NO ACTION, NOT NULL | **SET NULL**; las pendientes se retiran antes | La prueba adjunta sigue la purga de 30 días (`src/lib/directory/maintenance.ts`), salvo que se retenga por una disputa |
| `public.directory_revisions.user_id`, `directory_subscriptions.user_id` | NO ACTION | **SET NULL** | La ficha se conserva. Las suscripciones de la persona (por cuenta o por el email de la cuenta) se dan de baja antes (`withdrawn_at`): la fila queda como prueba de la baja y no recibe más correos |
| `public.directory_favorites.user_id` | CASCADE | sin cambios | Solo de la cuenta |

Hacia el perfil legacy (`public.profiles`), que la ruta borra después de la
cuenta:

| Tabla.columna → `public.profiles` | Antes | Después | Por qué |
|---|---|---|---|
| `public.academies.owner_id` | CASCADE (borraba la academia legacy entera, con cobros y facturas) | **RESTRICT justificado** | Una academia nunca se borra como efecto lateral; la supresión responde 409 y hay que transferirla o cerrarla |
| `public.coaches.profile_id` | CASCADE (arrastraba `class_coach_assignments`, `coach_compensation`, `coach_sport_configs`) | **SET NULL** | Ficha de entrenador de la academia, con sus clases y pagos |
| `public.announcements.author_id` | CASCADE, NOT NULL | **SET NULL** | Avisos que leen las familias |
| `public.conversation_messages.sender_id` | CASCADE, NOT NULL | **SET NULL** | Mensajes que otras personas recibieron (y sus recibos de lectura) |
| `public.invitations.invited_by` | CASCADE, NOT NULL | **SET NULL** | Invitaciones de la academia a otras personas |
| `public.event_registrations.profile_id` | CASCADE, NOT NULL (arrastraba `event_payments`) | **SET NULL** | Inscripción con sus pagos: obligación contable |
| `public.ticket_responses.user_id`, `ticket_attachments.uploaded_by` | CASCADE, NOT NULL | **SET NULL** | Respuestas de soporte en tickets de otras personas |
| `memberships`, `notifications`, `user_preferences`, `push_*`, `announcement_read_status`, `message_read_receipts` (propios), `conversation_participants`, `tickets.created_by`, `event_waitlist`, `empleo_applications`, `academy_link_requests`, `owner_consent`, `family_stripe_customers`, `subscriptions` | CASCADE | sin cambios | Solo de la cuenta. Las facturas de Zaltyko viven en FacturaDirecta, no aquí; el cliente de Stripe no se borra desde Zaltyko |
| `marketplace_ratings.reviewer_id` y `seller_id` | CASCADE | sin cambios | Valoraciones que escribió la persona y que hablan de ella: sin obligación de conservarlas |

**Filas nuevas.** Donde la candidata quita NOT NULL (pertenencia,
`insight_actions`, directorio y las columnas de autor legacy de arriba), un
trigger `BEFORE INSERT` (`zaltyko_domain_private.require_column_on_insert`)
sigue exigiendo el valor al insertar. Igual donde relaja un CHECK: un pago
manual nuevo sigue necesitando quién lo anotó
(`payments_manual_recorder_required`) y una invitación que pasa a «aceptada»
sigue necesitando la cuenta que la acepta
(`organization_member_invitations_acceptor_required`). Solo la clave foránea,
al suprimir la cuenta, vacía esas columnas en registros existentes.

**Mensajes.** Un mensaje cuyo remitente suprimió su cuenta (`sender_id`
vacío) sigue contando como no leído para el resto
(`src/app/api/messages/conversations/route.ts`).

**Invitación aceptada.** Se conserva con `accepted_member_id` como evidencia de
acceso de la academia, pero el servidor sustituye antes su email
(`cuenta-suprimida+<id>@zaltyko.invalid`) y, si los tenía, el nombre
(«Cuenta suprimida»).

Las claves de autoría hacia `organization_members` (lista de arriba) **no
cambian**: la pertenencia ya no se borra. Borrar una pertenencia a mano sigue
bloqueado, a propósito.

**Ficha del equipo.** `staff_profiles` (nombre y apellidos en `people`) sigue
enlazada a la pertenencia revocada. Es un dato de la academia como empleadora y
responsable: Zaltyko, como encargado, no lo borra por su cuenta. Si la persona
pide a la academia que lo suprima, la academia decide (archivar la ficha o, en
el futuro, anonimizarla). Elvis puede cambiar esta decisión.

### Procedimiento (`src/modules/data-rights/application/account-erasure.ts`)

Ruta: `DELETE /api/super-admin/users/[profileId]` (motivo obligatorio).

1. En una transacción (`prepareAccountErasure`, con `lock_timeout` de 5 s):
   - sin la candidata instalada, **503** `ACCOUNT_ERASURE_NOT_AVAILABLE`;
   - bloquea el perfil legacy, las pertenencias de la cuenta y las de dueña de
     esas academias;
   - busca en el catálogo toda clave NO ACTION/RESTRICT hacia `auth.users` o
     `public.profiles`, en cualquier esquema salvo `auth` (también `storage`),
     y cuenta las filas de esta persona. Si firmó decisiones de conciliación
     SaaS, **409** `ACCOUNT_ERASURE_RETAINED_BILLING_EVIDENCE`; si su perfil es
     dueño de academias legacy, **409** `ACCOUNT_ERASURE_OWNS_LEGACY_ACADEMIES`;
     cualquier otra, **409** `ACCOUNT_ERASURE_BLOCKED_REFERENCE` con la tabla.
     Así nada se revoca para fallar después en Auth. Antes, borrar el perfil
     de una dueña legacy borraba en silencio su academia;
   - si es la única dueña activa (con cuenta) de una academia, **409**
     `ACCOUNT_ERASURE_LAST_OWNER`: hay que transferir la titularidad o cerrar
     la academia antes;
   - revoca sus pertenencias en todas las academias y deja en el
     `audit_log` de cada una `member.account_erased` (pertenencia, estado
     anterior y motivo; sin datos de la persona);
   - sustituye email y nombre de las invitaciones que aceptó;
   - retira sus reclamaciones pendientes del directorio y da de baja sus
     suscripciones de correo del directorio (por cuenta o por su email).

   Si dos supresiones se bloquean entre sí (por ejemplo, dos co-dueñas a la
   vez: 40P01) o se agota el `lock_timeout` (55P03), **409**
   `ACCOUNT_ERASURE_CONCURRENT` sin cambios: se puede reintentar.
2. Borra la cuenta en Supabase Auth. Las claves hacen el resto (tabla de
   arriba). Si Auth falla, **502** `ACCOUNT_ERASURE_AUTH_FAILED`: el acceso ya
   está retirado y reintentar es seguro (una cuenta ya borrada no es error).
   Antes, el fallo de Auth se registraba y la ruta respondía «ok».
3. Borra el perfil legacy (`public.profiles`). Si entretanto alguien lo
   enlazó como dueño de una academia, la clave RESTRICT lo impide y la ruta
   responde **409** `ACCOUNT_ERASURE_PROFILE_BLOCKED` (la cuenta ya está
   suprimida; el perfil se queda hasta resolverlo).

Un borrado directo de `auth.users` (por ejemplo, desde el panel de Supabase)
sin este procedimiento falla entero si la cuenta sigue activa en alguna
academia: lo impide el CHECK de la pertenencia.

**Alcance.** La supresión de la cuenta afecta a todas sus academias. La baja en
una sola academia es otra operación (revocar la pertenencia sin tocar la
cuenta).

**Pruebas.** `tests/account-erasure-pg.test.ts` (job «Postgres integration»)
instala la candidata y su validación en el PostgreSQL desechable dentro de una
transacción que se deshace: crea autoría en cada tipo de registro (también en
la academia legacy: ficha de entrenador, aviso, mensaje e invitación), suprime
la cuenta y borra el perfil, y comprueba qué se conserva, qué se vacía y qué se
borra; también la verificación, la vuelta atrás idéntica, los triggers de
autor obligatorio y los bloqueos (última dueña, dueña legacy).
`tests/account-erasure.test.ts` cubre el orden, los 409/502/503, 40P01/55P03,
23503 y los errores de Auth sin base de datos.

### Verificar en staging

1. Aplicar la candidata en staging en una sola transacción y verificarla
   (`docs/deployment/candidates/README.md`, «Candidato de supresión de
   cuentas»):

   ```bash
   psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f docs/deployment/candidates/20261114120000_account_erasure_candidate.sql
   psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f docs/deployment/candidates/20261114120000_account_erasure_validate.sql
   PGOPTIONS='-c default_transaction_read_only=on' psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/deployment/candidates/20261114120000_account_erasure_verify.sql
   ```

   La verificación escribe una línea `ok` por comprobación y termina con
   `Account erasure verification passed`.
2. Desplegar en staging el código de esta rama.
3. Con cuentas de prueba de staging: una dueña invita a una entrenadora, la
   entrenadora acepta, pasa lista y anota un cobro manual. Desde
   `/super-admin`, eliminar a la entrenadora con un motivo. Esperado: «Usuario
   eliminado»; la cuenta ya no puede entrar; en la academia, la asistencia y el
   cobro siguen ahí; el equipo ya no la muestra como activa.
4. Comprobar en la base (solo lectura), con el id de la pertenencia:

   ```sql
   select user_id, status from zaltyko.organization_members where id = '<member_id>';
   -- user_id vacío, status = revoked
   select action, before, after from zaltyko.audit_log where target_id = '<member_id>' order by created_at desc limit 1;
   -- member.account_erased, {"status": "active"} -> {"status": "revoked"}
   ```
5. Intentar eliminar a la única dueña de una academia: debe responder 409
   («Esta cuenta es la única dueña activa…») sin cambiar nada. Lo mismo con un
   perfil dueño de una academia legacy («Este perfil es dueño de academias…»).
6. Si la entrenadora tenía ficha de entrenador legacy, avisos o mensajes,
   siguen visibles en la academia sin autor (`public.coaches.profile_id`,
   `public.announcements.author_id` y `public.conversation_messages.sender_id`
   vacíos). Las pantallas que unen esas filas con el perfil por `inner join`
   dejarán de mostrarlas; los datos siguen ahí.

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

- Supresión de cuentas: Elvis autoriza la candidata para staging; se verifica
  como arriba y, después, se pide la autorización de producción.
- Fichas de gimnasta que vinieron de una solicitud (sección 2): PR propia;
  necesita la decisión de Elvis sobre el estado final de una solicitud
  convertida.
