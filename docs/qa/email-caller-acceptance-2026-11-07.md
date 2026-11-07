# Correo: un `false` del emisor ya no se presenta como envío

## Hallazgos

`sendEmailWithLogging` devuelve `true` solo con aceptación explícita del proveedor; `false` cubre preferencia, baja, academia no elegible, duplicado, simulación o resultado sin confirmar. La auditoría `auditorias/2026-11-06/email-caller-next-batch-scope.md` y `shared-email-caller-boundaries.md` señalaban callers que ignoraban ese `false`. Al barrer todo `src` aparecieron dos más con el mismo defecto.

| Caller | Antes | Ahora |
|---|---|---|
| `api/invitations` | `emailSent = true` tras ignorar el booleano | `emailSent` = resultado del emisor |
| `api/notifications/send` | `{ ok: true }` siempre | `{ ok, sent }` = aceptación |
| `api/super-admin/users/[profileId]/send-message` | «Correo enviado correctamente» | 409 `EMAIL_NOT_SENT` si no se acepta |
| `api/public/events/[id]/contact` y `api/public/academies/[id]/contact` | «Tu mensaje ha sido enviado» sin persistir nada | 503 `CONTACT_NOT_DELIVERED` (el formulario ya trata `!ok` como error) |
| `lib/athletes/magic-link-invite-service` (creación inicial) | `sentAt` y `first_athlete_invited` aunque no se enviara | fila pendiente sin `sentAt`, sin evento; error `EMAIL_NOT_SENT` en el lote; el reintento entra por el reenvío existente |
| `api/admin/users` + `InviteUserForm` | toast «Invitación enviada… recibirá un correo» | `emailSent` en la respuesta y aviso «Invitación guardada sin correo» |
| `api/super-admin/athletes/activate-access` + detalle de usuario | acceso activado sin indicar el correo fallido | `emailSent` y mensaje/aviso cuando no se envía |

Se conservan persistencia, enlaces y autorizaciones: ninguna invitación ni acceso se revierte por un fallo del proveedor.

## Garantías

- Sin activar invitaciones, proveedores, credenciales ni envíos; sin SQL ni migraciones.
- Test de contrato `tests/email-caller-acceptance-contract.test.ts`: barre `src` y exige que cada llamada al emisor use su resultado o figure en una lista explícita de avisos accesorios (siete, con motivo), y fija el comportamiento de los callers corregidos.
- Contratos existentes intactos (`notification-preference-enforcement-contract`, `invitation-security-contract`, `api-limits-validation`).

## Pendiente

Aceptación del proveedor ≠ recepción. La recepción real sigue dependiendo del gate G4 (credencial aislada) y no se acredita aquí. Sin ejecución local; CI remota y revisión externa pendientes.
