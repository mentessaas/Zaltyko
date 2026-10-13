# Owner MVP: estado de pantallas y verificación

Revisión local del checkout `codex/mvp-owner-frontend-20261013`, sobre
`23ee94ba76d441cba7a3a0721173cd335c8755c3`. Describe código disponible en esta
rama como frente aislado; no demuestra despliegue ni estado de producción. La
integración local de backend y frontend quedó en `codex/zaltyko-plan-implementation`
en `93826c35`; no se ha publicado.

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
  no inicia un cobro ni crea una cuota/factura.
- `/owner/attendance`: selecciona una sesión programada/completada de la sede,
  lee el pase de lista y registra/corrige estados por inscripción. El listado
  de sesiones se obtiene en servidor después de `resolveOwnerScope`.
- `/owner`: presenta las métricas y agregados de la proyección Owner. Su
  frescura depende del pipeline; no equivale a un listado vivo de pase de lista.

Los IDs de organizaciones, sedes, grupos, personas, sesiones e inscripciones
pertenecen al esquema greenfield `zaltyko`; no se deben pasar a páginas o APIs
legacy basadas en `academyId`.

## Bloqueo P0: cuota manual desde una academia vacía

La pantalla y la API de pagos manuales solo aceptan un `chargeId` ya abierto.
`getManualPaymentOptions()` lista cargos existentes, pero el Owner no tiene una
ruta/pantalla greenfield para emitir una factura y crear ese cargo. `issueInvoice()`
existe como servicio interno sin consumidor HTTP; el alta de inscripción asigna
`pricePlanId: null` y no genera factura. Por tanto, desde una academia vacía no
se puede completar todavía el paso de cuota/pago sin preparar datos aparte.

No se debe enlazar `/api/charges` ni reutilizar tablas `academyId` legacy. Antes
de cerrar este P0 hay que fijar cómo se define el importe/periodo, quién es el
pagador familiar y cuándo vence la cuota. Recomendación para el MVP: emitir la
cuota de forma manual, mantener desactivado el cobro automático familiar y
registrar después el pago recibido contra su cargo; no generar importes ni
familias implícitamente.

## Pase de lista Owner greenfield

Verificado en el código actual:

- `src/modules/attendance/application/attendance-service.ts` exporta
  `recordAttendance`, que recibe una sesión greenfield y una inscripción, y
  escribe estado de asistencia con auditoría y outbox.
- La ruta HTTP Owner está implementada localmente en
  `src/app/api/v1/owner/sessions/[sessionId]/attendance/route.ts`:
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

Las pruebas de UI usan mocks explícitos del contrato. La ruta backend está
integrada en la rama candidata local; sus pruebas HTTP focales pasan 9/9 y el
harness PostgreSQL de operaciones pasa con límites de sede, tenant, vigencia,
idempotencia, auditoría y outbox. No se ha ejecutado un E2E autenticado del
navegador contra un sandbox desde este pase.

## Validación de esta revisión

La suite focal de Owner pasó 28/28 tests en setup, grupos, clases,
inscripciones, pagos manuales, asistencia y navegación. Las pruebas nuevas de
asistencia validan lectura, estados vacío/loading/error, feedback, body y
reintento con mocks del contrato. TypeScript, ESLint focal y Prettier pasan.
La API tiene además 9/9 tests de ruta y el harness PostgreSQL aislado pasa. El
E2E autenticado del navegador sigue NO VERIFICADO; falta la referencia de
proyecto sandbox para ejecutarlo localmente. La emisión de cuota/factura desde
una academia vacía también sigue pendiente: DEMO-READY = NO hasta resolver ese
flujo y demostrarlo en E2E. No se modificaron producción, Stripe Live,
credenciales ni migraciones remotas.
