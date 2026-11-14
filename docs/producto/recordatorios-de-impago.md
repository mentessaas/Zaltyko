# Recordatorios de impago de cuotas (A3)

Fecha: 14 de noviembre de 2026. Origen: punto A3 del análisis de competencia (`documentacion/Zaltyko/auditoria-2026-11-14/brechas-competencia.md`): recordatorios de impago dentro del registro manual de pagos. Las remesas SEPA quedan fuera hasta que Elvis decida.

**Estado: dormida.** Va detrás de `ZALTYKO_PAYMENT_REMINDERS_ENABLED` (apagada por defecto) y necesita el candidato `docs/deployment/candidates/20261114120500_payment_reminders_candidate.sql`, **sin aplicar en ningún entorno**. Mientras falte cualquiera de los dos, la sección no aparece y la API responde 503 `FEATURE_NOT_AVAILABLE`.

Zaltyko no cobra a las familias: la academia emite cuotas y anota los pagos a mano (`/owner/payments`). Esto añade el aviso amable cuando una cuota sigue abierta; no cobra ni mueve dinero.

## Flujo (propiedad o administración)

En `/owner/payments`, bajo «Registrar un pago recibido», aparece «Recordatorios de cuotas» con la lista de cuotas abiertas (pendientes o vencidas) de las sedes visibles.

1. Cada cuota muestra concepto (periodo), saldo pendiente tras los pagos parciales, vencimiento, tutor pagador con el correo enmascarado, cuándo se recordó por última vez y, si no se puede recordar, el motivo.
2. **Recordar** (una cuota), **Recordar a las seleccionadas** o **Recordar a todas las vencidas**.
3. **Vista previa antes de enviar**: el texto exacto con importe, concepto, vencimiento y datos de pago, el número de correos y de cuotas, y los destinatarios enmascarados (`m***@dominio.com`). Nada se reserva ni se envía hasta confirmar.
4. Al confirmar se envía un correo por tutor pagador y moneda (dos cuotas del mismo tutor van en un solo mensaje, con el importe total) y se registra cada cuota recordada.
5. «Plantilla, datos de pago y límites» (plegable): asunto, mensaje, datos de pago en texto libre (IBAN, Bizum, efectivo), correo de la academia para las respuestas (**obligatorio**: sin él no se envía nada y la pantalla lo avisa; la primera vez se propone el correo de la cuenta de quien administra), días mínimos entre recordatorios (por defecto 7, de 1 a 90) y el recordatorio automático. «Ver ejemplo con estos cambios» renderiza el borrador sin guardarlo.

## Reglas

- **Límite:** como máximo un recordatorio por cuota cada N días (`min_interval_days`, por defecto 7). Cuentan los envíos aceptados, las reservas de menos de 15 minutos (envío en curso) y las reservas que caducaron sin resolverse, que se tratan como enviadas porque el correo pudo salir; solo un envío marcado como fallido **no** cuenta y se puede reintentar. El servidor bloquea las filas de las cuotas (`FOR UPDATE`) y reserva antes de enviar: dos pestañas o un doble clic mandan un solo correo.
- **Tope por envío:** 100 cuotas. Lo que queda se informa y se repite después.
- **Dedupe del correo:** `dedupeKey` estable `payment-reminder:<huella de las cuotas>:<periodo del límite>:<intentos fallidos>` en el emisor común (la misma cuota en el mismo periodo nunca produce dos correos; tras un fallo confirmado la clave se renueva para poder reintentar) (`sendEmailWithLogging`), que además respeta bajas y preferencias. El emisor liga `academyId` a la tabla antigua `academies`; aquí se pasa la organización como `tenantId` y la elegibilidad se comprueba en el servicio (una academia `suspended` o `closed` no envía).
- **Automático (opcional, apagado):** un único recordatorio por cuota, N días tras el vencimiento (`auto_after_days`, por defecto 3), solo si la cuota nunca recibió otro aviso. Recorre todas las academias con el automático activado, de 200 en 200 por orden de id, con un margen de tiempo bajo el límite de la ruta (si se agota, la siguiente pasada continúa y las ya avisadas no se repiten); salta las que no tienen correo de respuesta. Necesita `ZALTYKO_PAYMENT_REMINDERS_AUTO_ENABLED`, que la academia lo active y que alguien programe `/api/cron/family-payment-reminders` (con `CRON_SECRET`); `vercel.json` no lo programa. No confundir con `/api/cron/payment-reminders`, que es el cron antiguo del modelo `academies`.
- **Tono:** la plantilla por defecto es un aviso cercano («si ya lo has pagado, ignora este mensaje… responde a este correo y lo vemos con calma»). Al guardar o previsualizar se rechazan variables desconocidas y expresiones de recobro agresivo («moroso», «embargo», «acciones legales», «última advertencia», «recargo», «abogado», «ASNEF»…).
- **Variables:** `{{nombre}}`, `{{importe}}`, `{{concepto}}`, `{{vencimiento}}`, `{{academia}}`, `{{datos_de_pago}}`. Importe y fecha salen con el formato de España o México según el país de la academia. En la pantalla se llaman «Datos que se rellenan solos» y se insertan con botones donde está el cursor.

## RGPD

- Solo se escribe a la persona que figura como **pagadora** de la cuota (`family_payer_id` de la cuota o de su factura) y a su correo de `guardian_contacts`. Nunca a otro tutor, a otro familiar ni a la gimnasta; sin tutor pagador o sin correo no se envía a nadie y la lista dice por qué.
- El correo no lleva el nombre de la gimnasta. Lleva un pie fijo que explica por qué se recibe y que responder llega a la academia.
- El registro (`payment_reminders`) guarda ids, estado, origen e importe del momento; **no** guarda correo, nombre ni texto. La auditoría (`payment_reminder.sent|failed`, `payment_reminder_settings.updated`) tampoco. La exportación de academia incluye ambas tablas y la política de supresión las clasifica (`src/modules/data-rights`).
- La academia es la responsable del tratamiento; los datos de pago son texto libre suyo y no deben incluir datos de terceros.

## Autorización y seguridad

Solo `owner` y `admin`, **por decisión de coordinación** (la misma frontera que registrar un pago): coordinación (`manager`) y entrenadoras no ven la sección y la API responde 403; `tests/payment-reminders-service.test.ts`, `tests/payment-reminders-pg.test.ts` y la matriz de rutas lo comprueban. Con alcance de sedes; la plantilla y los límites exigen acceso a todas las sedes. Las rutas (`/api/v1/owner/billing/payment-reminders`, `/preview`, `/settings`) autentican antes de validar, comprueban mismo origen en las mutaciones y aplican el límite de peticiones por academia. Una cuota de otra academia responde `not_found` en el resultado, sin enviar nada.

## Cómo probarlo en staging

1. Con autorización, aplicar la candidata en staging y poner `ZALTYKO_PAYMENT_REMINDERS_ENABLED=true` (y, para el automático, `…_AUTO_ENABLED=true`). El envío real necesita Brevo configurado; sin él el emisor registra el intento como `failed` («simulated») y la cuota sigue disponible.
2. Con una cuenta de propiedad con cuotas emitidas y tutores pagadores con correo de prueba, abrir `/owner/payments`: debe aparecer la sección.
3. Editar plantilla y datos de pago, probar «Ver ejemplo»; escribir «embargo» debe rechazarse.
4. «Recordar» una cuota → vista previa → enviar. Repetir: la cuota queda bloqueada hasta pasados N días («Podrás volver a recordarla el…»).
5. Cuota sin tutor pagador o sin correo: aparece bloqueada con su motivo. Con rol manager, la API responde 403.

## Pruebas

`tests/payment-reminders-template.test.ts` (plantilla y tono), `…-policy.test.ts` (límites, dedupe, agrupación, automático), `…-service.test.ts` (autorización, envío, fallos, auditoría), `…-contract.test.ts` (candidato, Drizzle, RLS, rutas) y `…-pg.test.ts` (SQL real en PostgreSQL desechable, incluida la carrera de envíos simultáneos).
