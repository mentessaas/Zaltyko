# Invitaciones al equipo (O3)

Fecha: 11 de noviembre de 2026. Plan de mejora `auditorias/2026-11-08/plan-mejora-zaltyko.md`, P1 #8 («correo aislado G4 → invitaciones de equipo → rol entrenador»), y oportunidad O3 de `docs/research/competencia/matriz-competitiva.md` («Activar acceso real de entrenadoras»).

Objetivo: que la dirección de una academia dé acceso a su equipo sin depender del correo transaccional (G4, apagado), y que cada cuenta que entra quede vinculada a su ficha del equipo (`staff_profiles.member_id`). Ese vínculo es el que necesita la asignación de entrenadoras por clase (PR 276, su «Decide Elvis» n.º 1).

**Enlace con O1 (PR 276, ya en main).** La asignación de titulares y sustituciones solo ofrece como asignables las fichas activas con `member_id` cuyo acceso esté activo, tenga el rol Entrenador/a y la sede en su alcance (`eligibleCoaches` en `coach-assignment`). Al aceptar una invitación de Entrenador/a con sus sedes, la ficha queda vinculada y la persona pasa a ser asignable en esas sedes, sin ningún paso más. Esta PR no cambia la elegibilidad de O1.

Hay una diferencia de criterio con O1. O1 deja que se borren fichas sin bloqueos (cascada en `session_staff` y en titulares). En cambio, la FK de una invitación a su ficha es NO ACTION: borrar una ficha con una invitación que la referencia se bloquea. Hoy ningún flujo borra fichas; si llega uno, decidirá entre cascada o `set null`, como queda en «Decide Elvis».

## Qué había y qué cambia

Ya existía una **fase 1** (5 de noviembre, `docs/qa/team-access-release-candidate-2026-11-05.md`) detrás de `ZALTYKO_TEAM_ACCESS_ENABLED=false`:
- invitación con un token de 256 bits del que en la base solo se guarda el SHA-256;
- caducidad de 7 días y aceptación expresa con el correo confirmado de Supabase Auth;
- un solo uso, con revocación y reemisión que cambia el token;
- recibos idempotentes, auditoría y comprobación exacta del esquema.

Esa fase no vinculaba la ficha, solo dejaba invitar al Owner con todas las sedes y respondía distinto a un enlace caducado. Esta PR la completa:

| Tema | Antes | Ahora |
|---|---|---|
| Ficha del equipo | No se vinculaba | La invitación nombra la ficha: una existente de Equipo o el nombre de una nueva. Al aceptar se enlaza o se crea, con `member_id` |
| Quién invita | Owner con todas las sedes | Dirección (propietario) y administración con todas las sedes: entrenador/a o coordinador/a en cualquier sede. Coordinación: solo entrenador/a y solo en sus sedes |
| Enlace caducado | 410 con mensaje propio | La misma respuesta genérica (404) que un enlace desconocido, usado, revocado o de otra cuenta |
| Plan en solo lectura | Sin efecto | Invitar, reemitir y aceptar quedan bloqueados (409). Revocar sigue permitido |
| Límite de intentos | El general (100/min), un solo contador por cuenta | Contadores separados por ruta. Abrir o aceptar un enlace: 10/min por cuenta y 30/min por origen de red |
| Identidad | Solo `email_confirmed_at` | Además, una identidad de Auth para ese mismo correo: email/contraseña, o un proveedor OAuth permitido (Google) con `email_verified=true` |
| Equipo en `/owner` | Solo propietario | También administración y coordinación, cuando la función está activa y el candidato instalado |
| Página de aceptación | Solo «Iniciar sesión» | También «Crear una cuenta con ese correo». Al aceptar ofrece «Ir a mi panel» |
| Correo | No se envía | Sigue sin enviarse. `teamInvitationDelivery()` es el único punto que cambiará cuando G4 esté activo |

## Flujo

1. **Invitar.** En `/owner/staff`, la dirección escribe el correo, el rol y las sedes, y elige la persona: «Nueva ficha» (nombre y apellidos) o «Ficha que ya está en Equipo» (fichas activas sin cuenta y sin otra invitación pendiente).
2. **Compartir.** El enlace `…/staff/accept#token=…` aparece una sola vez en pantalla. La dirección lo copia y lo envía por WhatsApp u otro canal. No se vuelve a mostrar: si se pierde, «Reemitir enlace» crea uno nuevo e invalida el anterior.
3. **Aceptar.** La persona abre el enlace e inicia sesión o se registra con el correo invitado, que debe estar confirmado. Revisa la academia, el rol y las sedes, y pulsa «Aceptar invitación». En una sola transacción se crean:
   - el miembro activo, con alcance seleccionado y exactamente esas sedes;
   - el vínculo con la ficha;
   - el consumo del token;
   - el recibo y la auditoría.
4. **Después.** El entrenador o entrenadora entra en `/owner` y llega a «Hoy» y Pasar lista de sus sedes (PR 255). La dirección ve la ficha vinculada en la lista de miembros.

## Criterio del vínculo con la ficha

- Las fichas del equipo (`staff_profiles` + `people`) **no tienen correo**, así que no se puede enlazar «cuando coincidan email y academia». El vínculo es **explícito**: quien invita elige la ficha existente, o escribe el nombre y la ficha se crea al aceptar.
- Tampoco se buscan coincidencias por nombre: dos personas con el mismo nombre acabarían vinculadas por error.
- **La coordinación solo invita con ficha nueva.** Las fichas no tienen sede: si una coordinadora pudiera vincular cualquier ficha, vería todos los nombres del equipo y la cuenta invitada heredaría las asignaciones de clases de esa ficha (PR 276). Vincular una ficha existente queda para la dirección y la administración. La coordinación no ve el listado de fichas, y no puede reemitir ni revocar invitaciones que nombren una.
- Una ficha solo puede tener **una invitación pendiente**. Lo garantizan la aplicación y el índice único parcial `organization_member_invitations_pending_profile_uq`. y solo se enlaza si sigue **activa y sin cuenta** al aceptar. Si cambió, la aceptación se deshace entera con un 409 y la dirección debe reemitir.
- Un miembro queda con **una sola ficha**: la aceptación crea siempre un miembro nuevo, y la fila de la ficha se bloquea antes de enlazarla. Falta el índice único `staff_profiles(organization_id, member_id)` (ver «Decide Elvis»).

## Matriz de permisos

| Rol | Ver invitaciones | Invitar | Reemitir o revocar | Roles que puede dar | Sedes |
|---|---|---|---|---|---|
| Propietario con todas las sedes | Todas | Sí | Todas | Entrenador/a, Coordinador/a | Cualquiera activa |
| Administración con todas las sedes | Todas | Sí | Todas | Entrenador/a, Coordinador/a | Cualquiera activa |
| Coordinación (todas o algunas sedes) | Las de entrenadores dentro de sus sedes y con ficha nueva | Sí, **solo con ficha nueva** | Las que podría crear | Solo Entrenador/a | Solo las suyas |
| Propietario o administración con sedes seleccionadas | — | No | No | — | — |
| Entrenador/a | — | No | No | — | — |
| Persona invitada | Solo su invitación, con su sesión | — | — | — | — |

Todo se comprueba en el servidor:
1. `withTeamManager` resuelve el alcance.
2. El servicio vuelve a autorizar dentro de la transacción, después del bloqueo de comando.
3. Al aceptar se exige que **quien invitó o reemitió** siga pudiendo dar ese acceso. Si una coordinadora pierde la sede, su enlace deja de valer.

## Modelo de amenazas del token

| Amenaza | Defensa |
|---|---|
| Adivinar un token | 32 bytes aleatorios (`randomBytes`, base64url de 43 caracteres). Se exige sesión. Abrir o aceptar enlaces está limitado a 10 intentos por minuto y cuenta y a 30 por minuto y origen de red |
| Correo «confirmado» sin verificar | Además de `email_confirmed_at`, una identidad de Auth para ese correo: email/contraseña o Google con `email_verified=true`. Cualquier otro proveedor se rechaza. El autoconfirmado de email/contraseña no se ve desde la base: ver la casilla de activación |
| Robo de la base de datos | Solo se guarda `token_sha256`. Las exportaciones de la academia no incluyen correos, hashes ni nombres de invitados |
| Fuga por URL, Referer o registros | El token va en el fragmento `#token=…`, que no llega al servidor ni al Referer. La página lo limpia antes de la telemetría (`team-invitation-fragment.ts`). Las respuestas llevan `no-store` y `no-referrer` |
| Enlace reenviado a otra persona | Solo lo acepta la cuenta con el **correo confirmado** invitado. Otra cuenta recibe la respuesta genérica y la invitación sigue pendiente |
| Reutilizar un enlace | Un solo uso: al aceptar pasa a `accepted`. La segunda aceptación, incluso simultánea, recibe la respuesta genérica. Hay una prueba determinista con dos peticiones en cola sobre el bloqueo de la fila |
| Enlace viejo tras reemitir o revocar | Reemitir cambia el hash y revocar cierra la invitación. El enlace anterior responde lo mismo que uno desconocido |
| Enumerar invitaciones, correos o academias | Desconocido, usado, revocado, caducado, de otra cuenta o con quien invitó ya sin permiso dan **la misma respuesta (404)**, sin reflejar el token ni el correo |
| Escalada de privilegios | No se puede invitar como propietario ni administración. El rol y las sedes salen de la invitación, nunca del cuerpo de la aceptación. Una membresía previa, incluso revocada, nunca se reactiva |
| Carreras y fallos a medias | Una sola transacción: miembro, sedes, ficha, token, recibo y auditoría. Si falla la auditoría final o vence el plazo mientras se esperaba un bloqueo, se deshace todo |

## Funcionalidad dormida

La función necesita dos cosas: `ZALTYKO_TEAM_ACCESS_ENABLED=true` y el candidato `docs/deployment/candidates/20261105120000_canonical_team_access_candidate.sql` instalado exactamente como se revisó. El candidato **requiere autorización de Elvis**. Si falta cualquiera de las dos:
- `/owner/staff` muestra solo Personal al propietario y da 404 al resto;
- la navegación no ofrece Equipo a administración ni a coordinación;
- las API responden 503 «no disponible», nunca 500.

Esta PR amplía el candidato (aún sin aplicar en ningún entorno) con `staff_profile_id`, `invitee_given_name` e `invitee_family_name`, su clave foránea compuesta y tres CHECK. El comprobador de esquema y la exportación se han actualizado en la misma PR.

## Casilla de activación (antes de encender el flag)

- [ ] **Elvis:** en el Supabase de producción, confirmar que la confirmación de email es **obligatoria** (sin «autoconfirm») y revisar los proveedores OAuth activos. Solo Google (con `email_verified`) está en la lista permitida; añadir otro exige revisar si garantiza un correo verificado.
- [ ] Comprobar que el rol con el que conecta la app puede leer `auth.identities` (`SELECT`). Sin ese permiso, la función queda «no disponible»: no se ofrece y no bloquea a nadie a medias.
- [ ] Autorizar y aplicar `20261105120000_canonical_team_access_candidate.sql` en el destino revisado.
- [ ] Activar `ZALTYKO_TEAM_ACCESS_ENABLED=true` solo después de lo anterior.

## Datos personales

- **Borrado de fichas.** Ningún flujo borra fichas del equipo: se archivan con `is_active=false` y data-rights solo las exporta. Por eso la FK de la invitación a la ficha es NO ACTION. Un `set null` compuesto anularía también `organization_id`. Si algún día se borran fichas, habrá que decidirlo entonces.
- **Conservación.** Las invitaciones cerradas (aceptadas o revocadas) conservan el correo y los nombres como evidencia del control de acceso: a quién se invitó, quién lo hizo y cuándo. No se pueden anonimizar sin borrar la fila, porque el correo es NOT NULL y hay un CHECK de destino. Un borrado eliminaría la invitación (sus sedes van en cascada) cuando ya no hagan falta los recibos. Falta fijar el plazo.

## Decide Elvis

1. **Coordinación invitando.** El encargo pedía que invite también la coordinación. Lo hace solo a entrenadores, solo en sus sedes y **solo con ficha nueva**: no ve ni vincula fichas existentes. ¿Debe poder invitar a otra coordinadora? ¿Damos sede a las fichas para que pueda vincularlas?
2. **Bloqueo por plan en solo lectura.** Se bloquea también la aceptación, con un mensaje neutro que no habla del plan. Revocar sigue permitido.
3. **Vínculo con la ficha sin correo.** Es explícito (se elige la ficha o se escribe el nombre), nunca por correo ni por nombre. ¿Añadimos correo a las fichas del equipo?
4. **Índice único `staff_profiles(organization_id, member_id)`.** Garantizaría en base de datos una ficha por miembro. Hoy lo garantiza la aplicación con bloqueos. Es una migración sobre una tabla ya aplicada, aparte de este candidato.
5. **Sin baja de miembros.** Revocar una invitación no da de baja a quien ya aceptó. La baja y la suspensión de miembros son otra pieza.
6. **Correo (G4).** Mientras siga apagado, el enlace se comparte a mano. Al activarlo, ¿se envía siempre por correo o se mantiene la opción de copiar el enlace?
7. **Caducidad.** Se mantienen los 7 días del precedente de la fase 1.
8. **Aplicar el candidato** y activar `ZALTYKO_TEAM_ACCESS_ENABLED`: solo con autorización expresa y después de la casilla de activación.
9. **Conservación de invitaciones cerradas.** ¿Qué plazo, y quién puede borrarlas?
10. **Proveedores OAuth permitidos.** Hoy solo Google con `email_verified`.

## Pruebas

- `tests/canonical-team-access-contract.test.ts`: Zod (persona exacta, nulos como ausentes, nombres saneados), autoridad de quien invita y canal de entrega.
- `tests/team-access-security-contract.test.ts`: rutas reales con sesión y servicio simulados (flag, 401, 429, roles permitidos y denegados, cuerpos inválidos, sin reflejar secretos).
- `tests/team-invitation-limits.test.ts`, `tests/owner-staff-navigation.test.tsx` y `tests/owner-staff-page.test.tsx`: límite de intentos y entrada a Equipo según rol y disponibilidad.
- `tests/owner-team-access.test.tsx` y `tests/team-invitation-acceptance.test.tsx`: interfaz (persona, roles de coordinación, ficha vinculada, registro y «Ir a mi panel»).
- `tests/team-access-candidate-contract.test.ts`: RLS, REVOKE e índice pendiente por ficha en la candidata y el manifiesto; FK y conservación documentadas; guardas del servicio (consumo solo de pendientes no caducadas, hash de 256 bits, identidad verificada).
- `tests/canonical-team-access-pg.test.ts` (job «Postgres integration»):
  - lo de la fase 1;
  - vínculo de ficha nueva y existente;
  - autoridad de admin y coordinación;
  - aislamiento entre academias;
  - otra cuenta rechazada;
  - caducidad genérica;
  - plan en solo lectura;
  - doble aceptación determinista;
  - coordinación sin fichas existentes;
  - identidades OAuth no verificadas rechazadas;
  - correo con mayúsculas y espacios;
  - índice único de la ficha;
  - aviso de plan antes de aceptar.
