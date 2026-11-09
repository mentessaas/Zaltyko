# Portal de familias de solo lectura (P2 #16)

Fecha: 10 de noviembre de 2026. Plan de mejora `auditorias/2026-11-08/plan-mejora-zaltyko.md`, P2 #16.

Objetivo: que una familia consulte el horario, la asistencia y las cuotas de sus gimnastas sobre el modelo canónico `zaltyko.*`, sin pagar nada desde Zaltyko y sin ver datos de otras familias.

Resumen de la decisión: el modelo canónico ya tiene una identidad de tutor (`zaltyko.guardians.auth_user_id`), pero ningún flujo la rellena todavía. Esta PR entrega la capa de lectura con su autorización, las tres vistas de `/familia` y las pruebas de aislamiento. El alta del acceso (invitación de la academia, enlace mágico y vínculo verificado) queda como siguiente paso para decidir con Elvis. Hasta entonces, nadie ve datos en `/familia`: cualquier cuenta sin vínculo recibe un aviso neutro.

## Hallazgos

### 1. La familia canónica es una unidad sin cuenta propia

- **Hallazgo:** en `zaltyko.*` la familia (`families`) solo tiene academia, referencia externa y estado. Las personas adultas son `guardians` (cada una con su `people`), y se unen a la familia con `family_guardians` (parentesco, `can_view_athletes`, `can_manage_enrollments`, `is_active`). Las gimnastas se unen con `family_members`, que tiene vigencia (`starts_on`, `ends_on`). La persona pagadora es `family_payers`, siempre una tutela ya vinculada. Todas las claves foráneas son compuestas con `organization_id`, de modo que un vínculo no puede cruzar academias.
- **Fuente:** `src/db/schema/zaltyko-core.ts` (`people`, `athletes`, `families`, `guardians`, `guardian_contacts`, `family_guardians`, `family_members`, `family_payers`); `src/modules/families/application/owner-family-association.ts`, `owner-guardian-contacts.ts` y `owner-guardian-profile.ts`, que son las únicas escrituras y solo las usa `/owner`.
- **Importancia:** alta. La autorización del portal se apoya en esa cadena: cuenta → tutor activo → vínculo activo con la familia → miembro vigente → gimnasta activa. No hace falta ninguna tabla nueva para leer.
- **Siguiente paso:** ninguno para leer. Usar la misma cadena en el flujo de alta.

### 2. Hay identidad canónica, pero sin alta

- **Hallazgo:** `guardians.auth_user_id` existe, con clave foránea a `auth.users` (`on delete set null`), es única por academia (`guardians_organization_auth_user_uq`) y tiene índice propio. Ningún código de `src/` la escribe. Los módulos de `/owner` crean tutores sin cuenta y la exportación de datos la omite a propósito (`src/modules/data-rights/application/catalog.ts`).
- **Fuente:** `supabase/migrations/20261006090034_add_trials_waitlists_families.sql`; `git grep authUserId -- src` solo devuelve el esquema y rutas del modelo antiguo.
- **Importancia:** alta. El portal puede autorizar contra el modelo canónico sin migraciones, pero hoy ninguna familia puede entrar, salvo que se enlace la cuenta a mano en la base de datos.
- **Siguiente paso:** decidir con Elvis el flujo de alta del punto 4.

### 3. El acceso de familias actual es del modelo antiguo y no sirve de base

- **Hallazgo:** `/api/family/children` y `src/lib/family/scope-service.ts` reconocen a la familia comparando el correo de la sesión con `family_contacts.email` o `guardians.email` del esquema antiguo, y exigen un `profiles.role = 'parent'`. `/invite/parent` usa la tabla antigua `invitations`. `scripts/prepare-e2e-family-auth.ts` crea ese perfil `parent` y sus vínculos antiguos solo para la suite E2E, que ya se retiró del cobro con Stripe Connect. `/api/family/charges/*/pay` y `/api/family/payment-method` siguen cerradas con `FAMILY_AUTOMATIC_COLLECTION_DISABLED`.
- **Fuente:** `src/app/api/family/children/route.ts`, `src/lib/family/scope-service.ts`, `src/app/invite/parent/page.tsx`, `scripts/prepare-e2e-family-auth.ts`, `docs/qa/e2e-legacy-cleanup-2026-11-09.md`.
- **Importancia:** alta. Que coincida un correo no demuestra que esa persona sea la tutora: basta con que la academia escriba mal una dirección para que otra cuenta vea a menores ajenos. Además, son tablas que desaparecen con P2 #18.
- **Siguiente paso:** no reutilizarlo. El portal nuevo no lee ninguna tabla antigua y no toca esas rutas.

### 4. Cómo debería entrar una familia de forma segura

- **Hallazgo:** el patrón ya existe para el equipo. `src/modules/staff/application/canonical-team-access.ts` guarda solo el SHA-256 de un token aleatorio de 32 bytes, con caducidad de 7 días, revisión para reemitir y recibos idempotentes. Propuesta para familias, en este orden:
  1. La dirección de la academia invita desde la ficha del tutor en `/owner`. Se usa el correo principal de `guardian_contacts`, y la invitación queda atada a ese `guardian_id`.
  2. Se crea una fila `guardian_access_invitations` (tabla nueva: `organization_id`, `guardian_id`, `normalized_email`, `token_sha256`, `expires_at`, `revision`, estado), con el mismo diseño que `organization_member_invitations`.
  3. La persona abre el enlace e inicia sesión con un enlace mágico de Supabase enviado a ese mismo correo. Así, la posesión del buzón queda verificada por Supabase.
  4. Al aceptar, en una transacción: el token coincide y no ha caducado, el correo verificado de la sesión coincide con el de la invitación, el tutor sigue activo y sin cuenta, y se escribe `guardians.auth_user_id`. Queda una entrada en `audit_log`.
  5. La academia puede revocar el acceso: `auth_user_id = null` o `is_active = false`. El portal deja de mostrar datos en la siguiente petición, porque no guarda caché.
- **Fuente:** `src/modules/staff/application/canonical-team-access.ts`, `src/app/api/v1/staff/invitations/accept/route.ts`, `src/lib/athletes/magic-link-invite-service.ts` (uso de `auth.admin.generateLink`).
- **Importancia:** alta. Hace falta una migración (la tabla de invitaciones), un correo nuevo (la invitación) y una pantalla en `/owner`. Las tres cosas están fuera de esta PR: la migración y el envío de correos requieren autorización de Elvis.
- **Siguiente paso:** que Elvis apruebe el flujo, la migración y el texto del correo. Después, una PR con la invitación, la aceptación y sus pruebas en Postgres desechable.

### 5. Qué ve cada familia, y qué no

- **Hallazgo:** con los datos canónicos basta para las tres vistas.
  - **Horario:** inscripciones `trial`, `active` o `paused` vigentes (`enrollments`), con su clase (`class_templates`), sede (`locations`) y días y horas (`class_template_weekdays`). Además, las sesiones de esas clases en los próximos 14 días (`sessions`), dentro de la vigencia de cada inscripción. Las canceladas aparecen como canceladas.
  - **Asistencia:** las últimas 50 marcas de `attendance_records` de la gimnasta, con la fecha, la clase y el estado (asistió, llegó tarde, falta justificada, faltó).
  - **Cuotas:** las cuotas emitidas de sus familias (`invoices` en estado `issued`, `partially_paid` o `paid`), con referencia, periodo, vencimiento, importe, pagado y pendiente. Lo pagado se suma de `payment_allocations` sobre los cargos no anulados de la cuota, igual que `manual-payments.ts`. Las cuotas en borrador y las anuladas no se muestran.
  - **No se muestra:** fecha de nacimiento, contactos, otros tutores, personas pagadoras, notas, personal que pasó lista, medio o referencia de pago, ni ninguna gimnasta, sesión o cuota que no cuelgue del vínculo. La gimnasta solo aparece con su nombre (o el nombre preferido) y su primer apellido.
- **Fuente:** `src/db/schema/zaltyko-core.ts`, `src/db/schema/zaltyko-ledger.ts`, `src/modules/billing/application/manual-payments.ts`.
- **Importancia:** alta. Son datos de menores: lo mínimo que responde a «¿cuándo entrena?, ¿ha venido?, ¿qué debemos?».
- **Siguiente paso:** ninguno en esta PR.

## Qué entrega esta PR

- **Autorización en el servidor** (`src/modules/family-portal/`):
  - `resolveFamilyPortalAccess(userId)` lee los tutores activos de la cuenta en academias `trial` o `active`. Después, sus vínculos con la familia y los miembros de esa familia, siempre por claves compuestas con `organization_id`.
  - La función pura `buildFamilyPortalAccess` decide qué gimnastas y qué familias quedan visibles. Exige tutor activo, vínculo activo, familia activa, la misma academia en toda la cadena, `can_view_athletes` (solo para gimnastas), miembro vigente hoy en la zona horaria de la academia y gimnasta activa.
  - Cada lectura (`getFamilyAthleteSchedule`, `getFamilyAthleteAttendance`, `getFamilyFees`) recibe el acceso ya resuelto. Si la gimnasta no está en el conjunto visible, lanza `NOT_FOUND` (404) antes de tocar ninguna tabla de datos. Las consultas filtran siempre por la academia y la gimnasta (o la familia) que vienen del acceso, nunca de la URL.
- **Vistas** (`src/app/familia/`, server components con `noindex` y sin API nueva):
  - `/familia`: las gimnastas de la cuenta, agrupadas por academia, con enlace a su ficha y a las cuotas.
  - `/familia/gimnastas/[athleteId]`: horario y asistencia de una gimnasta. Un id ajeno, inexistente o mal formado responde 404.
  - `/familia/cuotas`: cuotas de sus familias, con el aviso «El pago se gestiona directamente con tu academia». No hay botón de pago.
- **Pruebas** (`tests/family-portal-*.test.ts`): matriz pura de vínculos y aislamiento con una base de datos sintética. Una familia no ve gimnastas de otra familia de su academia, ni de otra sede, ni de otra academia, ni con un vínculo inactivo, caducado o sin permiso. Un id ajeno da 404 sin leer datos. Las consultas solo enlazan los ids del acceso. Las páginas responden 404 con ids ajenos o mal formados.
- **Sin migraciones, sin correo nuevo, sin Stripe.** No se tocan `/api/family/*`, ni los archivos de cuotas mensuales en refactor, ni el `/app` antiguo.

## Preguntas abiertas para Elvis

1. **Alta del acceso:** ¿aprobamos el flujo del hallazgo 4, con una tabla `guardian_access_invitations` (migración) y un correo de invitación?
2. **Quién ve las cuotas:** hoy, cualquier tutor con vínculo activo ve las cuotas de su familia, aunque `can_view_athletes` sea falso (las cuotas no muestran gimnastas). ¿Lo limitamos a las personas pagadoras (`family_payers`)?
3. **Inscripciones pendientes:** el horario no muestra las inscripciones `pending`, porque la academia aún no las ha confirmado. ¿Deben verse como «pendiente de confirmar»?
4. **Ventanas:** 14 días de sesiones, 50 marcas de asistencia y 24 cuotas. ¿Valen para el lanzamiento?
5. **Academias suspendidas:** una academia `suspended` o `closed` no muestra nada a sus familias. ¿Es correcto, o deben seguir viendo sus cuotas?
