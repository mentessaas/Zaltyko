# Matriz semántica RLS — Día 2 + Día 3

## Alcance y evidencia

El inventario distingue cuatro niveles que antes se mezclaban:

1. **Tenant**: una fila no cruza `tenant_id`.
2. **Academia**: una membership de academia A no concede academia B.
3. **Sujeto**: parent/athlete solo acceden al menor o perfil vinculado.
4. **Recurso**: coach solo accede a clases, sesiones y atletas asignados.

`pnpm validate:rls` mide únicamente RLS habilitada + policy declarada. La evidencia semántica reproducible es `pnpm test:rls:local`, que levanta PostgreSQL efímero, simula los roles SQL usados por Supabase Data API, aplica las migraciones Día 2 + Día 3, carga fixtures cruzadas y hace `ROLLBACK`. Ambas migraciones se aplicaron mediante el ledger remoto el 2026-07-21; quedan pendientes las comprobaciones PostgREST/Realtime y least-privilege de dominios secundarios.

## Inventario de las 69 tablas tenant-scoped

| Dominio | Tablas | Clasificación de datos |
|---|---|---|
| Identidad y tenancy (8) | `academies`, `profiles`, `academy_link_requests`, `invitations`, `user_preferences`, `onboarding_states`, `onboarding_checklist_items`, `audit_logs` | ownership, memberships indirectas, datos internos y PII |
| Deporte y menores (28) | `academy_sport_configs`, `athlete_sport_configs`, `coach_sport_configs`, `athletes`, `guardians`, `guardian_athletes`, `family_contacts`, `coaches`, `groups`, `group_athletes`, `classes`, `class_sessions`, `class_coach_assignments`, `class_enrollments`, `class_exceptions`, `class_groups`, `class_weekdays`, `class_waiting_list`, `athlete_extra_classes`, `attendance_records`, `skill_catalog`, `assessment_rubrics`, `athlete_assessments`, `assessment_scores`, `athlete_documents`, `coach_notes`, `competition_results`, `federative_licenses` | menores, familia, asignación coach, progreso y operación interna |
| Billing y finanzas (16) | `academy_trials`, `billing_events`, `billing_invoices`, `billing_items`, `charges`, `stripe_accounts`, `family_stripe_customers`, `payment_attempts`, `refunds`, `discounts`, `scholarships`, `receipts`, `discount_campaigns`, `discount_usage_history`, `coach_compensation`, `academy_expenses` | datos financieros, Stripe, compensación y costes internos |
| Comunicación (7) | `conversations`, `message_groups`, `message_history`, `message_templates`, `scheduled_notifications`, `notifications`, `email_logs` | participantes, contenido interno, destinatario y trazabilidad |
| Eventos/público/growth (7) | `events`, `event_categories`, `event_invitations`, `event_payments`, `event_registrations`, `event_waitlist`, `growth_events` | mezcla pública, inscripciones, pagos y analítica |
| Diagnóstico/riesgo (3) | `academy_diagnostics`, `churn_reasons`, `leak_action_history` | datos internos de negocio y riesgo |

Además existen tablas sin `tenant_id` directo cuyo scope se deriva por FK: `memberships` (academia/usuario), `conversation_participants`, `conversation_messages`, `message_read_receipts` y relaciones de roles/permisos. No pueden considerarse públicas solo por no aparecer en la métrica 69/69. Los diez catálogos deportivos globales (`countries`, `sport_disciplines`, `sport_branches`, `sport_locale_configs`, `terminology_dictionary`, `apparatus`, `programs`, `levels`, `categories`, `competition_types`) quedan también con RLS en la migración de Día 2: lectura `authenticated`, sin acceso `anon` y sin escrituras browser.

## Contrato CRUD por dominio

| Dominio | SELECT | INSERT | UPDATE | DELETE | Relación/rol exigido | Helper/estado | Browser/Data API |
|---|---|---|---|---|---|---|
| Academia y memberships | superadmin global; owner/miembro solo su academia; membership propia u owner de academia | owner/superadmin | owner/superadmin | owner/superadmin | `academies.owner_id` o `memberships(academy_id,user_id,role)` | `is_academy_member`, `is_academy_manager` | Realtime de `academies`; Data API filtra por policy |
| Perfil | propio; owner ve miembros de su academia; superadmin global | backend privilegiado únicamente | propio, solo columnas de perfil no autoritativas | backend privilegiado | `profiles.user_id`; membership owner para terceros | `current_profile_id`; grants de columna | Lecturas server/Data API; Realtime de `profiles` |
| Menor/familia | owner; coach asignado; parent por `guardian_athletes`; athlete por `athletes.user_id` | owner | owner o coach asignado; tutor propio solo su ficha de tutor | owner | vínculo familiar, self o clase asignada | `can_access_athlete`, `can_access_guardian` | Dashboard Realtime; mutaciones UI pasan por APIs |
| Clases/sesiones/asistencia | owner; coach asignado; parent/athlete por enrollment/grupo propio | clases owner; sesiones owner/coach asignado | clases owner; sesiones/asistencia owner/coach asignado | mismo scope de gestión | `class_coach_assignments`, sesión coach, enrollment o grupo | `can_access_class`, `is_assigned_coach` | Realtime de clases/sesiones/asignaciones; CRUD por API |
| Evaluaciones/puntuaciones | mismo scope del atleta | owner/coach asignado | owner/coach asignado | owner/coach asignado | atleta accesible y asignación coach | `can_access_athlete` | Realtime de evaluaciones; CRUD por API |
| Billing core | owner/superadmin; parent solo `charges` de hijos; athlete/coach/viewer denegados | owner/backend | owner/backend | owner/backend | academia manager o vínculo familiar para charge read | `is_academy_manager`, `current_profile_id` | Realtime de invoices queda manager-only |
| Notificaciones | destinatario propio | `service_role` | destinatario propio | destinatario propio | `notifications.user_id = auth.uid()` | policy user-scoped existente | Realtime/API |
| Comunicación Día 3 | template global de sistema o academia propia; grupos/programados de academia propia | manager de academia | manager de academia | manager de academia | tenant + `academy_id`; sistema global solo autenticado | `is_academy_member`, `is_academy_manager`; policies SELECT `TO authenticated` | PostgreSQL real verde; PostgREST/Realtime pendiente |
| Catálogos deportivos globales | usuario autenticado | backend privilegiado | backend privilegiado | backend privilegiado | catálogo compartido, no tenant | RLS de lectura `TO authenticated`; grants de escritura revocados | Sin acceso directo browser detectado; `anon` denegado |
| Eventos públicos | evento `is_public` para lectura pública; gestión autenticada pendiente de bajar de tenant a capability/recurso en todas las tablas hijas | tenant-wide histórico | tenant-wide histórico | tenant-wide histórico | evento/academia/registro | helpers públicos compatibilidad | Data API y acciones server públicas |
| Resto comunicación/finanzas/diagnóstico | mayormente tenant-wide histórico, o superadmin/service role en casos concretos | según policy histórica | según policy histórica | según policy histórica | aún no hay least privilege uniforme | wrappers históricos endurecidos, pero policy semántica pendiente | Realtime amplía la superficie |

## Acceso directo desde browser

- Lecturas directas detectadas: `plans` y `academies` dentro de notificaciones Realtime.
- Suscripciones Realtime detectadas: `profiles`, `subscriptions`, `academies`, `classes`, `billing_invoices`, `contact_messages`, `athletes`, `coaches`, `groups`, `group_athletes`, `class_sessions`, `class_coach_assignments`, `athlete_assessments`, `audit_logs` y `plans`.
- Las mutaciones modernas revisadas en componentes pasan por APIs `withTenant`; usar `createClient()` solo para `auth.getUser()` no equivale a acceso de tabla.
- Realtime/Data API ejecutan RLS; por eso un filtro del cliente (`tenant_id=eq...`) nunca se considera autorización.

## Matriz ejecutada

| Caso | Resultado local aislado | Cobertura API server |
|---|---|---|
| Owner A lee/escribe A | PASS | suite Día 1 |
| Owner A no lee B | PASS | suite Día 1 |
| Coach ve clase/sesión/atleta asignados | PASS | suites authz focalizadas |
| Coach no ve clase, tutor, cobro ni asistencia no asignados | PASS | suites authz focalizadas |
| Parent solo ve hijo/vínculo/cobro propios | PASS | family scope + API charges |
| Parent no ve otro menor de la academia | PASS | family scope |
| Athlete solo perfil/progreso propio y no billing | PASS | family scope + API charges |
| Viewer sin tablas administrativas | PASS | permission policy |
| Anónimo sin tablas privadas ni helper privado | PASS | no aplica a API autenticada |
| Superadmin global | PASS | suite Día 1 |
| `tenant_id` falso no amplía scope | PASS | academy context/tenant resolver |
| Catálogo global: authenticated lee, anon no lee ni escribe | PASS | catálogos se consumen por servidor |
| Comunicación: owner A ve A + template sistema, no B; manager escribe A | PASS | suites de scope de comunicación |
| Comunicación: coach/parent/athlete/viewer leen su academia; coach no muta | PASS | capability/resource scope API |
| Comunicación: superadmin ve A/B; anon ve 0 templates/grupos/programados | PASS | no aplica a API autenticada |

La paridad es lógica: las APIs Drizzle tienen su matriz deny-by-default y PostgreSQL/Data API tiene la matriz RLS equivalente. No se ejecutó PostgREST real porque no hay stack Supabase local; sí se ejecutó el rol PostgreSQL `authenticated` con `auth.uid()` y policies reales, que es la capa de autorización que usa Data API.

## Helpers `SECURITY DEFINER`

La migración crea diez helpers escalares en `zaltyko_private`, con objetos cualificados, `search_path=pg_catalog`, `EXECUTE` revocado de `PUBLIC/anon` y grant solo a `authenticated`. No devuelven filas completas. `get_current_profile()` se elimina después de migrar su única policy dependiente.

Cuatro wrappers históricos siguen en `public` porque policies no migradas aún los consumen. Sus cuerpos quedan cualificados, su `EXECUTE` deja de ser implícito y se concede explícitamente a `anon/authenticated`; para anónimo retornan `NULL/false`. `is_admin()` pasa a ser alias compatible de superadmin, eliminando el bypass global cross-tenant del perfil `admin`. Migrar las policies restantes al schema privado sigue abierto.

## Riesgo residual

Las migraciones cierran la matriz P0 local para identidad, menores, clases, asistencia, evaluaciones, billing core y los tres recursos de comunicación migrados, y evitan que los diez catálogos deportivos permanezcan sin RLS. No convierten automáticamente las 69 tablas tenant-scoped a least privilege: conversaciones/historial y otros recursos de comunicación, eventos hijos, módulos financieros secundarios y diagnóstico conservan policies tenant-wide. MT-002/003 y DB-005 solo pueden cerrarse totalmente después de completar esos lotes y ejecutar el fixture también mediante PostgREST/Realtime local o de staging aislado.
