# Portal de familias de solo lectura (P2 #16)

Fecha: 10 de noviembre de 2026. Plan de mejora `auditorias/2026-11-08/plan-mejora-zaltyko.md`, P2 #16.

Objetivo: que una familia consulte el horario, la asistencia y las cuotas de sus gimnastas sobre el modelo canónico `zaltyko.*`, sin pagar nada desde Zaltyko y sin ver datos de otras familias.

Resumen de la decisión: el modelo canónico ya tiene una identidad de tutor (`zaltyko.guardians.auth_user_id`), pero ningún flujo la rellena todavía, y los vínculos que crea `/owner` nacen sin permiso para ver gimnastas. Esta PR entrega la capa de lectura con su autorización doble (en el dominio y dentro de cada consulta SQL), las tres vistas de `/familia` y las pruebas de aislamiento, también contra PostgreSQL. El alta del acceso (invitación de la academia, enlace mágico y vínculo verificado) y quién marca el permiso de ver gimnastas quedan para decidir con Elvis. Hasta entonces, nadie ve datos en `/familia`: cualquier cuenta sin vínculo recibe un aviso neutro.

## Hallazgos

### 1. La familia canónica es una unidad sin cuenta propia

- **Hallazgo:** en `zaltyko.*` la familia (`families`) solo tiene academia, referencia externa y estado. Las personas adultas son `guardians` (cada una con su `people`) y se unen a la familia con `family_guardians` (parentesco, `can_view_athletes`, `can_manage_enrollments`, `is_active`). Las gimnastas se unen con `family_members`, que tiene vigencia (`starts_on`, `ends_on`); una misma gimnasta puede estar en dos familias. La persona pagadora es `family_payers`, siempre una tutela ya vinculada y con vigencia propia. Todas las claves foráneas son compuestas con `organization_id`, así que un vínculo no puede cruzar academias.
- **Fuente:** `src/db/schema/zaltyko-core.ts` (`people`, `athletes`, `families`, `guardians`, `guardian_contacts`, `family_guardians`, `family_members`, `family_payers`); `src/modules/families/application/owner-family-association.ts`, `owner-guardian-contacts.ts` y `owner-guardian-profile.ts`, que son las únicas escrituras y solo las usa `/owner`.
- **Importancia:** alta. La autorización del portal se apoya en esa cadena y no necesita tablas nuevas para leer.
- **Siguiente paso:** ninguno para leer. Usar la misma cadena en el flujo de alta.

### 2. Hay identidad canónica, pero sin alta

- **Hallazgo:** `guardians.auth_user_id` existe, con clave foránea a `auth.users` (`on delete set null`), es única por academia (`guardians_organization_auth_user_uq`) y tiene índice propio. Ningún código de `src/` la escribe. Los módulos de `/owner` crean tutores sin cuenta, y la exportación de datos la omite a propósito (`src/modules/data-rights/application/catalog.ts`).
- **Fuente:** `supabase/migrations/20261006090034_add_trials_waitlists_families.sql`; `git grep authUserId -- src` solo devuelve el esquema, este portal y rutas del modelo antiguo.
- **Importancia:** alta. El portal puede autorizar contra el modelo canónico sin migraciones, pero hoy ninguna familia puede entrar si no se enlaza la cuenta a mano en la base de datos.
- **Siguiente paso:** decidir con Elvis el flujo de alta del hallazgo 5.

### 3. Los vínculos que crea `/owner` no dejan ver gimnastas

- **Hallazgo:** al asociar una familia desde la ficha de una gimnasta, `owner-family-association.ts:714-721` crea el `family_guardians` de la persona pagadora con `canViewAthletes: false` (y `canManageEnrollments: false`). No hay ninguna pantalla ni API que cambie ese campo después. Con la regla de este portal, todas las familias dadas de alta hoy verían sus cuotas (si son pagadoras), pero ninguna vería a sus gimnastas.
- **Fuente:** `src/modules/families/application/owner-family-association.ts:714-721`; `git grep canViewAthletes -- src`.
- **Importancia:** alta. El horario y la asistencia quedan vacíos hasta que exista una forma de marcar el permiso. No es un fallo de seguridad: el valor por defecto es el seguro.
- **Siguiente paso:** decidir con Elvis quién marca `can_view_athletes` y desde dónde (pregunta a). La opción natural es que la invitación del hallazgo 5 lo marque al aceptarse, o que haya una casilla en la ficha del tutor en `/owner`.

### 4. El acceso de familias actual es del modelo antiguo y no sirve de base

- **Hallazgo:** `/api/family/children` y `src/lib/family/scope-service.ts` reconocen a la familia comparando el correo de la sesión con `family_contacts.email` o `guardians.email` del esquema antiguo, y exigen `profiles.role = 'parent'`. `/invite/parent` usa la tabla antigua `invitations`. `scripts/prepare-e2e-family-auth.ts` crea ese perfil `parent` y sus vínculos antiguos solo para la suite E2E, ya retirada del cobro con Stripe Connect. `/api/family/charges/*/pay` y `/api/family/payment-method` siguen cerradas con `FAMILY_AUTOMATIC_COLLECTION_DISABLED`.
- **Fuente:** `src/app/api/family/children/route.ts`, `src/lib/family/scope-service.ts`, `src/app/invite/parent/page.tsx`, `scripts/prepare-e2e-family-auth.ts`, `docs/qa/e2e-legacy-cleanup-2026-11-09.md`.
- **Importancia:** alta. Que coincida un correo no demuestra que esa persona sea la tutora: basta con que la academia escriba mal una dirección para que otra cuenta vea a menores ajenos. Además, son tablas que desaparecen con P2 #18.
- **Siguiente paso:** no reutilizarlo. El portal nuevo no lee ninguna tabla antigua y no toca esas rutas.

### 5. Cómo debería entrar una familia de forma segura

- **Hallazgo:** el patrón ya existe para el equipo. `src/modules/staff/application/canonical-team-access.ts` guarda solo el SHA-256 de un token aleatorio de 32 bytes, con caducidad de 7 días, revisión para reemitir y recibos idempotentes. Propuesta para familias, en este orden:
  1. La dirección de la academia invita desde la ficha del tutor en `/owner`. Se usa el correo principal de `guardian_contacts`, y la invitación queda atada a ese `guardian_id`.
  2. Se crea una fila `guardian_access_invitations` (tabla nueva: `organization_id`, `guardian_id`, `normalized_email`, `token_sha256`, `expires_at`, `revision`, estado), con el mismo diseño que `organization_member_invitations`.
  3. La persona abre el enlace e inicia sesión con un enlace mágico de Supabase enviado a ese mismo correo, de modo que Supabase verifica la posesión del buzón.
  4. Al aceptar, en una transacción: el token coincide y no ha caducado, el correo verificado de la sesión coincide con el de la invitación, el tutor sigue activo y sin cuenta, y se escribe `guardians.auth_user_id`. Queda una entrada en `audit_log`.
  5. La academia puede revocar el acceso: `auth_user_id = null`, vínculo inactivo o tutor inactivo. El portal deja de mostrar datos en la siguiente petición, porque no guarda caché (`Cache-Control: private, no-store`) y resuelve el acceso en cada lectura. La prueba PostgreSQL lo comprueba.
- **Riesgo principal: un correo mal escrito.** Si la academia teclea mal la dirección y ese buzón existe, una persona ajena puede aceptar la invitación y ver datos de menores. El enlace mágico solo prueba que controla ese buzón, no que sea la tutora. Mitigaciones propuestas:
  - **Confirmación al invitar:** la academia ve el correo destacado y lo confirma, con aviso si no coincide con el contacto principal o si se ha cambiado hace poco.
  - **Aviso al aceptar:** la academia recibe una notificación (en `/owner`, y por correo si Elvis lo autoriza) con la cuenta vinculada y la fecha.
  - **Visibilidad:** la ficha del tutor muestra si tiene cuenta vinculada, con qué correo y desde cuándo.
  - **Revocación:** un botón para retirar el acceso en la ficha del tutor, que pone `auth_user_id = null` y deja traza en `audit_log`.
  - **Mínimo por defecto:** la invitación no marca `can_view_athletes` sin que la academia lo confirme en el mismo paso.
- **Fuente:** `src/modules/staff/application/canonical-team-access.ts`, `src/app/api/v1/staff/invitations/accept/route.ts`, `src/lib/athletes/magic-link-invite-service.ts` (uso de `auth.admin.generateLink`).
- **Importancia:** alta. Hacen falta una migración (la tabla de invitaciones), un correo nuevo (la invitación) y pantallas en `/owner`. Las tres cosas están fuera de esta PR: la migración y el envío de correos requieren autorización de Elvis.
- **Siguiente paso:** que Elvis apruebe el flujo, la migración, el texto del correo y las mitigaciones. Después, una PR con la invitación, la aceptación, la revocación y sus pruebas en Postgres desechable.

### 6. Qué ve cada familia, y qué no

- **Hallazgo:** con los datos canónicos basta para las tres vistas.
  - **Gimnastas visibles:** las unidas a la cuenta por tutor activo en una academia `trial` o `active`, vínculo activo con `can_view_athletes`, familia activa, miembro vigente hoy (en la fecha local de la academia) y gimnasta activa.
  - **Ventana de vigencia:** cada gimnasta lleva `visibleSince`, el `starts_on` más antiguo de las membresías vigentes que la unen a la cuenta. No se muestran sesiones ni asistencia anteriores a esa fecha (medianoche local de la academia): una familia no hereda el historial de otra. Si una gimnasta está en dos familias, cada cuenta ve solo desde su propio vínculo.
  - **Horario:** inscripciones `trial`, `active` o `paused` vigentes (`enrollments`), con su clase (`class_templates`), sede (`locations`) y días y horas (`class_template_weekdays`). Además, las sesiones de esas clases en los próximos 14 días (`sessions`), dentro de la vigencia de cada inscripción. Las canceladas aparecen como canceladas. Una inscripción en pausa muestra su clase, pero no sus sesiones.
  - **Asistencia:** las últimas 50 marcas de `attendance_records` de la gimnasta desde `visibleSince`, con fecha, clase y estado (asistió, llegó tarde, falta justificada, faltó).
  - **Cuotas (regla provisional):** solo las ve un tutor con vínculo activo a una familia activa y una fila `family_payers` vigente para él. Si una cuenta no ve gimnastas ni es pagadora en una academia, esa academia no aparece. Se muestran las cuotas `issued`, `partially_paid` o `paid` (nunca `draft` ni `void`) con referencia, periodo, vencimiento, importe, pagado, devuelto y pendiente:
    - **Pagado:** lo asignado (`payment_allocations`) a los cargos no anulados de la cuota, menos los `refunds` con `status = 'succeeded'` de esas asignaciones. Se calcula con subconsultas correlacionadas que no multiplican filas, como el «cobrado neto» de `ledger-service.ts`.
    - **Pendiente:** el importe menos lo asignado, la misma regla que usa `ledger-service.ts` para lo pendiente; un reembolso no reabre la cuota. Una cuota `paid` muestra cero pendiente.
    - **Devuelto:** solo aparece si hay reembolsos completados.
  - **No se muestra:** fecha de nacimiento, contactos, otros tutores, personas pagadoras, notas, quién pasó lista, medio o referencia de pago, ni ninguna gimnasta, sesión o cuota que no cuelgue del vínculo. La gimnasta aparece solo con su nombre (o el nombre preferido) y su primer apellido.
- **Fuente:** `src/db/schema/zaltyko-core.ts`, `src/db/schema/zaltyko-ledger.ts`, `src/modules/billing/application/ledger-service.ts` (cálculo de asignado, reembolsado y pendiente por periodo).
- **Importancia:** alta. Son datos de menores: lo mínimo que responde a «¿cuándo entrena?, ¿ha venido?, ¿qué debemos?».
- **Siguiente paso:** confirmar con Elvis las reglas provisionales (preguntas b, c y e).

## Qué entrega esta PR

- **Autorización doble en el servidor** (`src/modules/family-portal/`):
  - Las lecturas públicas (`getFamilyAthleteOverview`, `getFamilyAthleteSchedule`, `getFamilyAthleteAttendance`, `getFamilyFees`) reciben solo `{ userId, athleteId?, now? }`, con el usuario de la sesión validado por `supabase.auth.getUser()`. Ninguna acepta un objeto de acceso desde fuera: resuelven el acceso dentro.
  - `resolveFamilyPortalAccess` filtra en SQL tutores activos de academias `trial`/`active`, vínculos activos, familias activas, miembros vigentes hoy y pagadores vigentes, con orden estable. Si alguna consulta llega a su límite, lo registra con `logger.error` en vez de truncar en silencio.
  - La función pura `buildFamilyPortalAccess` repite todas las comprobaciones (incluida la de la misma academia en cada salto) y calcula `visibleSince` y las familias de cuotas.
  - Cada consulta de datos lleva además un `exists` con la cadena completa ligada al `userId` de la sesión (`family-portal-sql.ts`). En horario y asistencia exige `can_view_athletes`, membresía vigente y que la sesión empiece después del inicio de esa membresía. En cuotas exige el pagador vigente y `fg.family_id = invoices.family_id`.
  - Un id ajeno, inexistente o mal formado responde 404 antes de leer ninguna tabla de datos.
- **Vistas** (`src/app/familia/`, server components con `noindex` y sin API nueva):
  - `/familia`: gimnastas de la cuenta, agrupadas por academia, con enlace a su ficha y, si es pagadora, a las cuotas.
  - `/familia/gimnastas/[athleteId]`: horario y asistencia de una gimnasta, con la fecha desde la que hay datos.
  - `/familia/cuotas`: cuotas que paga la cuenta, con el aviso «El pago se gestiona directamente con tu academia». No hay botón de pago.
- **Middleware:** `/familia` pasa por el mismo rate limit que `/app` y `/super-admin`, y responde con `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer` y `X-Robots-Tag: noindex, nofollow, noarchive`. También está en `robots.ts`.
- **Pruebas:**
  - `tests/family-portal-access.test.ts`: matriz pura de vínculos, pagadores, vigencias, `visibleSince` y 404.
  - `tests/family-portal-isolation.test.ts`: acceso, lecturas y páginas contra una base sintética que anota el SQL y los parámetros de cada lectura. Los estados activos salen de los datos, y cada consulta debe llevar la cadena ligada al usuario.
  - `tests/family-portal-isolation-pg.test.ts`: las mismas lecturas, y la guarda SQL por sí sola, contra PostgreSQL real con filas exactas. Cubre dos academias, dos familias en una academia, una gimnasta compartida, un tutor en dos academias, accesos revocados (`auth_user_id` nulo, vínculo inactivo, familia inactiva, tutor inactivo), membresías pasadas y futuras, academias `suspended` y `closed`, cuotas `draft` y `void`, un cargo anulado, reembolsos completados y fallidos, y asistencia anterior al vínculo.
  - **Aviso:** esta suite solo corre en el job manual «Disposable local schema replay» de `.github/workflows/ci-isolated.yml` (modo `schema-replay`), no en el CI automático de la PR.
- **Sin migraciones, sin correo nuevo, sin Stripe.** No se tocan `/api/family/*`, ni los archivos de cuotas mensuales en refactor, ni el `/app` antiguo.

## Preguntas abiertas para Elvis

- **a) Permiso de ver gimnastas:** ¿quién marca `can_view_athletes` y desde dónde? Hoy nace siempre en `false` y no hay pantalla para cambiarlo (hallazgo 3).
- **b) Historial:** ¿la familia ve el historial anterior a su `starts_on`? Hoy no lo ve.
- **c) Cuotas:** ¿solo las ven las personas pagadoras vigentes, como ahora, o cualquier tutor con vínculo activo?
- **d) Bandera:** ¿ponemos `/familia` detrás de una bandera hasta que exista el alta? Hoy está publicada, pero sin una cuenta enlazada a mano no muestra datos a nadie.
- **e) Reembolsos:** ¿se descuentan de lo pagado, como ahora, y siguen sin reabrir lo pendiente, como en el libro?
- **f) Alta del acceso:** ¿aprobamos el flujo del hallazgo 5, con una tabla `guardian_access_invitations` (migración), un correo de invitación y sus mitigaciones? Requiere autorización de Elvis.
- **g) Inscripciones pendientes:** el horario no muestra las inscripciones `pending`. ¿Deben verse como «pendiente de confirmar»?
- **h) Ventanas:** 14 días de sesiones, 50 marcas de asistencia y 24 cuotas. ¿Valen para el lanzamiento?
- **i) Academias suspendidas o cerradas:** una academia `suspended` o `closed` no muestra nada a sus familias, ni siquiera sus cuotas. ¿Es correcto?
