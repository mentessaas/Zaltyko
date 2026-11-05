# Bandeja operativa de solicitudes de contacto

## Hallazgos

Entrega preparada en `codex/assisted-access-inbox-20261105`, base `bd022b63499749ff0dce7e8338b53b0d57f54c77`. La bandeja SuperAdmin lee interacciones persistidas con su mensaje original, sin depender de que llegue el aviso auxiliar por correo. No modifica esquemas ni registra una respuesta como enviada o atendida. El enlace `mailto:` solo abre un borrador manual.

La API comprueba el perfil SuperAdmin activo antes de validar parámetros o consultar solicitudes; responde con `private, no-store`. La paginación por fecha/UUID conserva microsegundos PostgreSQL y limita cada página a 50 filas. La interfaz presenta texto escapado, estados de carga/error/vacío y navegación entre páginas. No se han concedido permisos a ningún usuario.

## Comprobaciones preparadas

- Regresiones de ruta con el wrapper real: falta de sesión, Owner/admin/manager/coach y SuperAdmin suspendido no leen solicitudes; SuperAdmin permitido; validación, límites, cursor y errores sin PII.
- Regresiones de componente: texto, enlace escapado, error/reintento y vacío.
- Caso PostgreSQL desechable en la suite de contacto existente: tres solicitudes con diferencias de un microsegundo y empate de timestamp, páginas de una fila, sin omisiones/duplicados ni escrituras o avisos adicionales. En esta suite la autorización está simulada expresamente; no sustituye las regresiones con el wrapper real ni una sesión alojada.

No se han ejecutado pruebas, builds, typecheck o servicios en el Mac. Pendientes: revisión QA independiente, CI remota y aceptación alojada con acceso SuperAdmin ya autorizado. No se afirma geometría real a 375/768/1280 ni entrega de respuestas a partir de estilos o tests jsdom.

## Fuente, importancia y siguiente paso

Fuente: endpoint `src/app/api/super-admin/contact-requests/route.ts`, helpers de cursor/tipos, componente `SuperAdminContactInbox`, registro de navegación y tres suites citadas en el diff. Importancia: evita que una solicitud guardada dependa exclusivamente de una notificación de correo no comprobada. Siguiente paso: revisar e integrar en el candidato; después comprobar el flujo de atención con una sesión existente, sin autoenviar correos ni crear roles.
