# Uso habitual: motivos para volver y medición del uso

Fecha: 14 de noviembre de 2026. Origen: la bandera de producto de Elvis, «los SaaS mueren también porque sus clientes no los usan a menudo». Cada persona del club debe tener un motivo útil para volver cada día o cada semana, y Zaltyko debe medir si vuelve.

**Estado: todo apagado.** Nada se envía ni se registra mientras Elvis no encienda las banderas. La medición necesita además una tabla nueva que está como candidata y **requiere autorización de Elvis** (`docs/deployment/candidates/20261114130000_habitual_use_candidate.sql`). Los avisos por correo funcionan sin tabla nueva.

## Qué hay

### 1. Aviso a quien entrena, cada día

- **Antes de la clase.** Unos 15 minutos antes: «Tu clase de las 18:00 empieza pronto: pasa lista», con un botón que abre la lista de esa sesión en Pasar lista. La hora es la de la sede (una sede en Ciudad de México ve las 11:00 aunque en Madrid sean las 18:00).
- **Si falta la lista.** Si la clase terminó, tenía gimnastas apuntadas y nadie pasó lista, llega **un único** recordatorio (a partir de 10 minutos después del final y hasta 24 horas). De madrugada (22:00 a 07:00 en la sede) no se manda: lo recoge el primer envío de la mañana. Pasadas 24 horas ya no se recuerda; lo sigue mostrando «listas sin pasar» en Resumen.
- **A quién.** A las personas asignadas a esa sesión (titulares o sustitutas, como en «Quién entrena»), con acceso activo y la sede dentro de su alcance. Si la sesión no tiene a nadie asignado, no avisa a nadie.
- **Sin repeticiones.** Cada sesión y persona recibe como mucho un aviso de cada tipo, aunque el envío se repita.
- **Más adelante: avisos en el móvil.** Los avisos ya pasan por un «canal» (`CoachReminderChannel`). Hoy solo está el correo; añadir las notificaciones de la app del móvil es sumar otro canal con el mismo mensaje, sin tocar a quién ni cuándo se avisa.

### 2. Resumen semanal para la dirección

El lunes por la mañana (de 08:00 a 11:59 en la sede) llega un correo con **solo lo que hay que hacer**, cada cosa con su botón a la pantalla de Zaltyko:

| Punto | Aparece cuando | Botón |
|---|---|---|
| Sesiones sin lista | Alguna sesión de la semana terminó sin lista | Completar listas |
| Cuotas vencidas | Hay cuotas vencidas (solo dirección y administración) | Revisar cuotas |
| Solicitudes de prueba sin responder | Hay solicitudes nuevas (si la función está instalada) | Responder |
| Gimnastas sin venir | Gimnastas con inscripción activa sin ninguna asistencia en 14 días, en clases que sí han pasado lista | Ver gimnastas |
| Asistencia | La asistencia bajó 5 puntos o más frente a la semana anterior (con 10 registros o más en cada una), o esta semana no se pasó lista en ninguna sesión | Ver asistencia |

**Si no hay nada que hacer, no se envía.** Cada persona ve lo de sus sedes (una coordinadora con dos sedes, la suma de las dos). El resumen sale una vez por semana y persona.

### 3. Cómo desactivarlos

Cada correo lleva un enlace «Desactívalos aquí». Abre una página con un botón (abrir el enlace no cambia nada; hay que pulsar). Se puede desactivar y volver a activar por separado el aviso de clases y el resumen semanal, sin iniciar sesión. Si no se puede generar ese enlace, el aviso **no se envía**. Además se respeta la baja general de correos que ya existía.

### 4. Medición del uso (para Elvis)

- **Eventos de uso.** Contadores por academia, tipo, rol y día: «el equipo abrió Zaltyko», «una familia entró en el portal». No llevan nombre, correo ni identificador de persona, ni de gimnastas ni de menores. Para contar familias distintas se guarda un código que se renueva cada semana: sirve para contar, no para reconocer ni seguir a nadie.
- **Vista `/super-admin/uso`.** Por semana (lunes a domingo, hora de Madrid): academias activas, **sesiones con lista pasada** (la métrica principal) con su cobertura sobre las sesiones terminadas, familias que entran al portal (cuentas distintas y entradas) y la lista de academias en riesgo.
- **Academia en riesgo.** Lleva 7 días o más sin lista pasada ni visita del equipo (y tiene al menos 7 días de vida). Solo cuentan academias en prueba o activas. Las visitas de familias no cuentan como actividad de la academia.
- **Aviso a Elvis.** Un correo diario como mucho, solo con las academias que **acaban de entrar** en riesgo, una vez por periodo de inactividad. Sin novedades, no hay correo. El destinatario sale del entorno (`ZALTYKO_AT_RISK_ALERT_EMAIL`); no está en el repositorio.

## Banderas (todas apagadas por defecto; solo valen con el texto `true`)

| Variable | Qué enciende |
|---|---|
| `ZALTYKO_HABITUAL_USE_ENABLED` | Interruptor general. Apagado, no se envía ni registra nada, sea cual sea el resto |
| `ZALTYKO_COACH_REMINDERS_ENABLED` | Avisos a quien entrena |
| `ZALTYKO_OWNER_WEEKLY_DIGEST_ENABLED` | Resumen semanal de la dirección |
| `ZALTYKO_USAGE_METRICS_ENABLED` | Registro de eventos y `/super-admin/uso` (necesita la candidata) |
| `ZALTYKO_AT_RISK_ALERTS_ENABLED` | Correo a Elvis de academias en riesgo (necesita la medición y destinatario) |
| `ZALTYKO_AT_RISK_ALERT_EMAIL` | Destinatario del aviso anterior. Solo en el entorno de alojamiento |

## Candidata SQL

`20261114130000_habitual_use_candidate.sql` crea una sola tabla, `public.usage_events`, sin tocar filas existentes. RLS activada y forzada, sin permisos para clientes directos; se borra con la academia. Mientras no exista tal como la define el archivo, no se registra nada y la vista dice que no está disponible. **No está aplicada en ningún entorno.**

## Los avisos no se programan solos

Hay tres rutas de cron, **sin programar** en `vercel.json` (programarlas es decisión de Elvis): `/api/cron/coach-session-reminders` (cada 5 minutos), `/api/cron/owner-weekly-digest` (cada hora; el aviso solo sale el lunes por la mañana de la sede y una vez por semana) y `/api/cron/usage-at-risk` (una vez al día). Las tres exigen el secreto de cron y un solo disparo a la vez.

## Cómo probarlo en staging

1. (Solo la medición) Instalar la candidata en staging con la autorización correspondiente.
2. Encender en staging `ZALTYKO_HABITUAL_USE_ENABLED`, y la función que se quiera probar. Para el aviso a Elvis, poner un correo propio en `ZALTYKO_AT_RISK_ALERT_EMAIL`.
3. **Aviso de clase:** crear una sesión que empiece en 10-15 minutos con una entrenadora asignada y gimnastas apuntadas; lanzar el cron con el secreto (`Authorization: Bearer …`). Comprobar el correo, el botón (abre esa sesión en Pasar lista) y que un segundo lanzamiento no manda otro. Dejar terminar una sesión sin lista y repetir: llega un único recordatorio.
4. **Resumen semanal:** el cron solo envía el lunes de 08:00 a 11:59 en la sede; para probarlo fuera de ese horario, ajustar la hora de la sede a una zona en la que sea lunes por la mañana. Con cuotas vencidas o solicitudes pendientes llega el correo; sin nada, no llega.
5. **Desactivar:** pulsar «Desactívalos aquí», confirmar y comprobar que el siguiente envío se salta a esa persona.
6. **Medición:** abrir Resumen y Pasar lista con una cuenta del equipo y `/familia` con una familia; en `/super-admin/uso` deben subir las academias activas y las entradas al portal.

## Límites conocidos

- Las familias se cuentan como cuentas distintas por semana, no personas ni gimnastas.
- «Academias activas» mira lista pasada o visita del equipo; no distingue entre una visita rápida y un día de trabajo.
- El resumen revisa hasta 2000 personas por envío.
- Las academias con sesiones sin nadie asignado no reciben avisos de clase hasta que asignen entrenadoras (O1).

## Decide Elvis

- Aplicar la candidata (medición) y cuándo.
- Programar los tres envíos en `vercel.json` y encender las banderas.
- A qué correo llega el aviso de academias en riesgo.
