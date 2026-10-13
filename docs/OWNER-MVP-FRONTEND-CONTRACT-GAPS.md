# Owner MVP: estado de pantallas y contrato pendiente

Revisión local del checkout `codex/mvp-owner-frontend-20261013`, sobre
`23ee94ba76d441cba7a3a0721173cd335c8755c3`. Describe código disponible en esta
rama; no demuestra integración con una base de datos ni despliegue.

## Pantallas con contrato greenfield disponible

- `/owner/setup`: crea organización, primera sede y membership `owner` mediante
  `POST /api/v1/organizations/bootstrap`. Permite especialidad artística o
  rítmica y añadir la otra. Moneda/zona horaria se resuelven en servidor.
- `/owner/groups`: crea grupos y permite añadir una ficha sintética mínima de
  gimnasta o asociar una ficha existente. El servicio comprueba scope y cupo;
  la ficha mínima no pide nacimiento, teléfono, tutor, cuenta ni pago.
- `/owner/classes`: crea una plantilla recurrente y materializa sesiones, con
  sede, actividad, aforo, fechas y uno o más horarios semanales.
- `/owner/enrollments`: busca personas existentes y crea inscripciones
  `pending`; la transacción valida duplicados y sobrecapacidad. No crea cuotas
  ni cargos.
- `/owner/payments`: registra manualmente pagos recibidos sobre cargos abiertos;
  no inicia un cobro.
- `/owner/attendance`: selecciona una sesión programada/completada de la sede,
  lee el pase de lista y registra/corrige estados por inscripción. El listado
  de sesiones se obtiene en servidor después de `resolveOwnerScope`.
- `/owner`: presenta las métricas y agregados de la proyección Owner. Su
  frescura depende del pipeline; no equivale a un listado vivo de pase de lista.

Los IDs de organizaciones, sedes, grupos, personas, sesiones e inscripciones
pertenecen al esquema greenfield `zaltyko`; no se deben pasar a páginas o APIs
legacy basadas en `academyId`.

## Pase de lista Owner greenfield

Verificado en el código actual:

- `src/modules/attendance/application/attendance-service.ts` exporta
  `recordAttendance`, que recibe una sesión greenfield y una inscripción, y
  escribe estado de asistencia con auditoría y outbox.
- El tech lead fijó el contrato de la ruta HTTP Owner mientras el backend
  implementa la ruta y sus pruebas:
  `GET /api/v1/owner/sessions/[sessionId]/attendance?organizationId=...&locationId=...`
  devuelve `{ items: [{ enrollmentId, athleteName, attendanceStatus }] }` en
  el envelope estándar, donde `attendanceStatus` es `null`, `present`,
  `absent`, `excused` o `late`.
- La escritura es `POST` a la misma ruta, con body
  `{ organizationId, locationId, enrollmentId, status }` y header
  `Idempotency-Key`. El servidor deriva el actor; la UI no envía `athleteId` ni
  actor.
- `GET/POST /api/attendance` sí existe, pero usa `tenantId`, `academyId`,
  `classSessions`, `classes` y `athleteId` del modelo legacy. No es compatible
  con `organizationId`, `sessions`, `classTemplates` y `enrollmentId` del
  modelo greenfield.

La página obtiene las opciones de sesión con una consulta de servidor que
reutiliza `resolveOwnerScope` y filtra por organización, sede, estado y ventana
temporal. Al seleccionar una sesión, el componente pide su roster al GET
acordado; presenta estado guardado o “Sin registrar”; y envía cada cambio al
POST con `sessionId`, organización, sede, enrollment, status y clave
idempotente. Si hay resultado incierto, el botón reintenta exactamente el mismo
body/clave. El éxito se muestra tras confirmación del servidor.

La prueba de UI usa mocks explícitos del contrato acordado. La ruta backend aún
no aparece en este checkout; integración HTTP/E2E autenticada queda pendiente.

## Validación de esta revisión

La suite focal de Owner pasó 26/26 tests en setup, grupos, clases,
inscripciones, pagos manuales, asistencia y navegación. Las pruebas nuevas de
asistencia validan lectura, estados vacío/loading/error, feedback, body y
reintento con mocks del contrato. TypeScript, ESLint focal y Prettier pasan. No
se ejecutó E2E autenticado en navegador y el endpoint backend aún no está en
esta rama.
