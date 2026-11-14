# Familias: acceso al portal y avisos de sesión (privacidad)

Fecha: 14 de noviembre de 2026. Documento técnico de diseño, no dictamen
jurídico. Completa `docs/privacy/zaltyko-rgpd-assessment.md` y el borrador
`docs/legal/borradores/privacidad-cambios-propuestos.md` (P2, cuentas de las
familias invitadas). Producto: `docs/producto/familias-acceso-y-avisos.md`.

Estado: detrás de `ZALTYKO_FAMILY_ACCESS_ENABLED` (apagada) y de una candidata
SQL sin aplicar (`docs/deployment/candidates/20261114120000_family_access_notices_candidate.sql`).

## 1. Qué datos nuevos se tratan

- **Hallazgo:** cuatro tablas nuevas, todas con `organization_id` y borrado en
  cascada con la academia:
  - `guardian_access_invitations`: tutor invitado, correo normalizado al que se
    invitó, SHA-256 del token (nunca el token), caducidad, quién invitó, aceptó
    o revocó y cuándo.
  - `family_notices`: título y texto del aviso, sesión, clase o grupo, sede y
    quién lo envió.
  - `family_notice_recipients`: tutor destinatario, fecha de lectura y
    resultado del correo (enviado, fallido, desactivado por la familia, sin
    acceso). Sin direcciones de correo.
  - `guardian_notification_preferences`: dos casillas de correo por tutor.
  Además se rellenan dos columnas que ya existían: `guardians.auth_user_id`
  (cuenta vinculada) y `family_guardians.can_view_athletes` (si la academia lo
  confirmó al invitar).
- **Fuente:** el candidato SQL; `src/modules/family-access/`.
- **Importancia:** alta. Son datos de tutores de menores y comunicaciones sobre
  la actividad de los menores.
- **Siguiente paso:** incluir estas finalidades en el registro de actividades
  de la academia (responsable) y en el contrato de encargo.

## 2. Minimización

- **Hallazgo:**
  - Los avisos no nombran a ninguna gimnasta: dicen la clase, la sede y la
    hora. El aviso de sustitución no nombra a la entrenadora ni copia el motivo
    interno (que puede ser de salud).
  - El asunto de los correos (que queda en `email_logs`) solo lleva la
    academia y el título del aviso.
  - El correo de invitación no lleva datos de la familia ni de las gimnastas.
  - El aviso manual avisa a la academia en pantalla de que no escriba datos de
    salud ni de otras familias, porque lo leen todas las familias del grupo.
  - Los avisos solo llegan a tutores con un vínculo activo y permiso de ver a
    la gimnasta (`can_view_athletes`), el mismo permiso que el portal exige para
    mostrar horario y asistencia.
- **Fuente:** `sessionNoticeText`, `familyInvitationEmail` y `familyNoticeEmail`
  en `src/modules/family-access/domain/family-access-contract.ts`;
  `tests/family-access-domain.test.ts`.
- **Importancia:** alta (art. 25 RGPD, protección desde el diseño).
- **Siguiente paso:** ninguno técnico.

## 3. Vinculación segura de la cuenta

- **Hallazgo:** el riesgo principal es un correo mal escrito por la academia.
  Mitigaciones:
  - La academia ve el correo destacado y confirma en el mismo paso, junto con
    el permiso de ver gimnastas.
  - El token es de 32 bytes aleatorios; se guarda solo su SHA-256; va en el
    fragmento `#token=…` (no llega al servidor, a los registros ni al
    Referer), se limpia de la dirección antes de la telemetría y Sentry no se
    inicia en `/familia/aceptar`.
  - Caduca a los 7 días, sirve una vez y reenviar rota el token.
  - Solo acepta una cuenta cuyo correo verificado en Supabase Auth (identidad
    de correo, o Google con `email_verified`) coincide con el de la invitación.
    Si la academia cambia después el correo principal del tutor, el enlace deja
    de valer.
  - Todos los fallos responden lo mismo: nadie distingue un enlace caducado,
    usado, revocado o de otra cuenta.
  - Límite de peticiones por cuenta y por red al abrir o aceptar enlaces, y
    espera de 10 minutos entre reenvíos.
  - Auditoría (`audit_log`) de invitar, reenviar, revocar, aceptar y retirar
    acceso, sin token ni correo.
  - La academia puede retirar el acceso: el portal deja de mostrar datos en la
    siguiente petición (sin caché).
- **Fuente:** `src/modules/family-access/application/guardian-invitations.ts`,
  `src/lib/auth/family-invitation-fragment.ts`, `instrumentation-client.ts`,
  `tests/family-access-pg.test.ts`.
- **Importancia:** alta (art. 32 RGPD).
- **Siguiente paso:** confirmar con Elvis si la academia recibe un aviso
  cuando una familia acepta (hoy lo ve en «Familias y avisos»).

## 4. Correos y preferencias

- **Hallazgo:** los avisos se guardan siempre en el portal. El correo es una
  copia que la familia puede desactivar por tipo (cambios de sesión, mensajes de
  la academia). Va a la dirección verificada de la cuenta que aceptó la
  invitación, nunca a una escrita a mano; un tutor sin cuenta no recibe correo
  (la academia lo ve como «sin acceso al portal»). El envío usa Brevo, el
  proveedor de correo transaccional que Zaltyko ya usa.
- **Fuente:** `deliverNoticeEmails` en
  `src/modules/family-access/application/family-notices.ts`.
- **Importancia:** media. Son comunicaciones de servicio, no comerciales.
- **Siguiente paso:** Elvis decide si un aviso urgente (cancelación del mismo
  día) debe ignorar la preferencia.

## 5. Derechos y conservación

- **Hallazgo:** la exportación de la academia incluye solo recuentos de las
  cuatro tablas (`OPTIONAL_FAMILY_ACCESS_EXPORT_TABLES`), como el acceso de
  equipo. Al borrar un tutor se borran en cascada sus invitaciones, lecturas y
  preferencias; al borrar una academia, todo. Borrar una cuenta de Auth deja
  `accepted_by_user_id` en nulo y conserva la evidencia de la invitación.
  No hay plazo automático de conservación de avisos.
- **Fuente:** `src/modules/data-rights/application/catalog.ts`, el candidato.
- **Importancia:** media.
- **Siguiente paso:** fijar con asesoría el plazo de conservación de avisos y
  lecturas (propuesta: el curso más uno) y si la exportación debe incluir sus
  valores.
