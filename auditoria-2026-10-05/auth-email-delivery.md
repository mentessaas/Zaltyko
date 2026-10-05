# Correo de autenticación y Brevo: verificación de producción — 2026-10-05

## Hallazgos clave

- SMTP personalizado está activado en Supabase Auth y apunta al relay SMTP de Brevo por el puerto 587; la contraseña aparece guardada y oculta.
- Los logs de Brevo muestran mensajes de prueba anteriores con eventos **Enviado**, **Entregado** y **Abierto** entre el 3 y el 4 de octubre. El proveedor transaccional ya está validado.
- Una solicitud de recuperación desde `zaltyko.com` devolvió HTTP 200 y el estado genérico esperado; no se modificó contraseña.
- No apareció un evento Brevo nuevo para esa solicitud del 5 de octubre. No sabemos si la dirección de prueba corresponde a un usuario de Supabase; la API puede responder correctamente sin enviar correo cuando no encuentra usuario.

## Fuentes y evidencia

- Dashboard de Supabase Auth / Emails / SMTP Settings, solo lectura: SMTP toggle activo; `smtp-relay.brevo.com`, puerto `587`, nombre de remitente `Zaltyko`; remitente y usuario SMTP enmascarados y contraseña guardada. No se accedió a valores secretos.
- Dashboard Brevo / Transaccional / Email / Logs, filtrado únicamente por la dirección de prueba ya facilitada: 12 eventos históricos entre el 30/09 y el 04/10; los mensajes de prueba del 03/10 tienen eventos de envío, entrega y apertura, con una apertura adicional el 04/10.
- Playwright CLI en producción: `POST https://jegxfahsvugilbthbked.supabase.co/auth/v1/recover` respondió HTTP 200; la interfaz mostró la respuesta genérica de recuperación.
- [Supabase — Password-based Auth](https://supabase.com/docs/guides/auth/passwords): si no hay usuario asociado, Supabase no envía correo aunque el método no devuelva error.
- [Brevo — registros transaccionales](https://help.brevo.com/hc/en-us/articles/360021533839-Manage-your-transactional-logs-and-email-previews): los logs registran eventos de emails enviados por API, SMTP y automatizaciones.

## Por qué importa

El canal Brevo ya tiene evidencia real de entrega, así que no hace falta repetir una prueba directa ni extraer claves del entorno. Eso no demuestra que cada dirección introducida en recuperación tenga cuenta en Supabase ni que un enlace concreto llegue a su buzón.

## Accionable y siguiente paso

- **Brevo transaccional:** validado con entrega y apertura anteriores.
- **SMTP de Supabase:** configurado y activo.
- **Recuperación de contraseña:** la solicitud y la respuesta genérica funcionan; para probar el correo de recuperación hace falta usar una dirección de prueba que pertenezca a una cuenta existente y confirmar en el log de Brevo, sin abrir el enlace ni cambiar la contraseña. La existencia de la cuenta no se comprobó.
- **Seguridad:** no se leyeron, rotaron ni modificaron claves; no se consultó el contenido de mensajes ni se abrió enlace de recuperación.
