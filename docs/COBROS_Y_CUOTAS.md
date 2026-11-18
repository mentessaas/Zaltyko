# Cobros y cuotas — Stripe Connect Standard

Zaltyko permite que cada academia cobre a sus familias con su propia cuenta de Stripe. La academia es merchant of record y recibe el dinero directamente. Zaltyko no custodia fondos, no almacena datos completos de tarjeta y no actúa como software fiscal.

El ledger `charges` es la fuente operativa de verdad. Stripe procesa tarjetas y devuelve eventos que reconcilian el estado.

> **Aviso (16-11-2026).** El cobro automático de cuotas se rehace con
> Stripe Connect y cuentas Accounts v2, según ADR-0028
> (`docs/architecture/adr/0028-cobro-automatico-de-cuotas-con-connect.md`). Lo
> nuevo está en «Conectar Stripe (Fase 1)», «Pago automático de la
> familia (Fase 2)», «Cobro automático de cuotas (Fase 3)» y «Eventos de
> Stripe, devoluciones, 3DS y justificante (Fase 4)». El resto de esta
> guía describe el
> modelo Stripe Connect Standard v1 (`stripe_accounts`), que nunca se abrió a
> academias reales y ya no es la dirección del producto.

## Conectar Stripe (Fase 1)

La academia conecta su propia cuenta de Stripe desde Ajustes. **En esta fase no
se cobra nada**: solo se crea la cuenta conectada y se sigue su estado. Los
cobros a familias llegan en fases posteriores del ADR-0028.

### Quién puede usarlo

Todas estas condiciones a la vez (el primer motivo que falla es el que se
devuelve):

- Bandera `ZALTYKO_CONNECT_ONBOARDING_ENABLED=true` (texto exacto). **Apagada
  por defecto.**
- Clave `STRIPE_SECRET_KEY` de prueba (`sk_test_`/`rk_test_`). **Live cerrado
  por código** en esta fase, aunque la bandera esté encendida.
- Base de datos con las dos columnas del candidato (ver «Estado»). Sin ellas la
  función responde «no disponible» en vez de fallar.
- Persona con rol de dueña, o administración con acceso a todas las sedes.
- Academia de España (`ES`). Las demás ven que el cobro automático llegará más
  adelante a su país.
- Plan de pago vigente (Starter o Growth). La prueba gratuita no cuenta.

Si la academia ya tiene cuenta conectada, el país y el plan no ocultan su
estado: lo sigue viendo.

### Pantalla

- Tarjeta «Cobro automático de cuotas» en `/owner/settings`, con el ancla
  `#cobro-automatico`. Solo aparece con la bandera encendida.
- `/owner/payments` enlaza a esa tarjeta cuando la bandera está encendida y la
  academia aún no ha conectado su cuenta (o le falta el plan de pago). Solo lo
  ve la dueña con todas las sedes, y sin llamar a Stripe.
- Estados: sin conectar, pendiente de datos, en revisión, lista para cobrar y
  con problemas. «Lista para cobrar» depende solo de la tarjeta; la
  domiciliación SEPA se muestra aparte.
- Sin conectar, bajo «Conectar Stripe»: «Stripe te pedirá los datos de tu
  academia y tu cuenta bancaria.» y el texto de costes (decisión de Elvis del
  17-11-2026, sin cifras): «Stripe cobra su tarifa por cada pago a la
  academia; Zaltyko no cobra comisión.».

### Rutas

| Ruta | Uso |
|---|---|
| `GET /api/v1/owner/payments/connect?organizationId=…` | Estado para la tarjeta de Ajustes. Con `&refresh=1` vuelve a leer la cuenta en Stripe, como mucho una vez por minuto. |
| `POST /api/v1/owner/payments/connect` | Crea la cuenta conectada si no existe (una por academia y entorno) y devuelve el enlace de alta de Stripe. |
| `GET /api/v1/owner/payments/connect/link?organizationId=…` | Enlace caducado o ya usado: pide uno nuevo y redirige a Stripe. **Solo renueva el enlace de una cuenta que ya existe; nunca la crea.** |
| `POST /api/stripe/connect/accounts-webhook` | Eventos *thin* v2 de las cuentas conectadas. Verifica la firma, vuelve a leer la cuenta en Stripe y guarda el estado. Con la bandera apagada no procesa nada. |

La vuelta desde Stripe llega a `/owner/settings?…&stripe=vuelta#cobro-automatico`.
Código en `src/modules/payments-connect/`, separado de `src/lib/stripe/*`.

### Variables

| Variable | Uso |
|---|---|
| `ZALTYKO_CONNECT_ONBOARDING_ENABLED` | Enciende la función. Apagada por defecto. |
| `STRIPE_CONNECT_ACCOUNTS_WEBHOOK_SECRET` | Firma del webhook de eventos v2 de cuentas conectadas. Distinto de `STRIPE_CONNECT_WEBHOOK_SECRET` (webhook v1 antiguo). |

**Destino de eventos en Stripe.** Comprobado en el sandbox el 16-11-2026.
- Los eventos v2 de cuentas conectadas (`v2.core.account…`) se emiten en la **propia plataforma**: su `context` es la cuenta de Zaltyko.
- Por eso el destino se crea con `events_from: ["@self"]`, no con `@accounts`.
- Configuración: carga *thin*. Tipos: `v2.core.account[requirements].updated`, `v2.core.account[configuration.merchant].capability_status_updated`, `v2.core.account.updated` y `v2.core.account.closed`.
- Stripe no permite cambiar el origen de los eventos de un destino ya creado: si está mal, hay que crear otro y cambiar el secreto.

### Datos

Zaltyko guarda solo códigos de estado en
`organization_payment_provider_accounts`: estado de la cuenta, de la tarjeta y
de la domiciliación, y un resumen cerrado de requisitos pendientes (`none`,
`user_action`, `stripe_review`, `past_due`). Nunca nombres, documentos ni datos
bancarios: esos los recoge y guarda Stripe en su propio formulario. Cada cambio
de estado sube `revision` y deja auditoría y evento. El estado `pending` del
enum no se usa: la fila nace en `onboarding`.

### Estado

- Candidata `docs/deployment/candidates/20261116120000_connect_onboarding_candidate.sql`:
  **aplicada en staging el 16-11-2026 con autorización de Elvis; sin aplicar
  en producción**, que necesita otra autorización expresa (detalle en
  `docs/deployment/candidates/README.md`).
- Pruebas automáticas (`tests/payments-connect-*`, `tests/api-payments-connect-routes.test.ts`,
  `tests/api-connect-accounts-webhook.test.ts`, `tests/owner-stripe-connect-card.test.tsx`):
  ninguna en local; las ejecuta la CI remota de la PR. El recorrido completo en
  staging (conectar una cuenta sandbox y recibir sus eventos v2) necesita
  además el destino de eventos en Stripe sandbox y las variables en Vercel
  staging (ver ADR-0028, «Preparación de staging»).
- En producción no cambia nada: la bandera está apagada y, aunque se
  encendiera, la función queda cerrada contra la base de producción (R11,
  abajo).

### Cerrojos y límites

- **R11, dos cerrojos para Live y producción.** Conectar Stripe responde «no
  disponible» (`live_not_released`) con una clave de Stripe que no sea de
  prueba **o** si la base del despliegue es la Supabase de producción
  (`NEXT_PUBLIC_SUPABASE_URL`, `DATABASE_URL`, `DATABASE_URL_POOL` o
  `DATABASE_URL_DIRECT` contienen su ref, en
  `src/lib/launch/production-supabase.ts`). El webhook ignora los
  eventos en ese caso. No se mira `VERCEL_ENV`: staging es un despliegue
  «production» de su propio proyecto. En la Fase 1 no hay ninguna vía para
  abrir Live ni producción.
- **Límite de frecuencia.** 10 peticiones por minuto en
  `/api/v1/owner/payments/connect` (y `/link`), por academia verificada,
  también en los GET que llaman a Stripe. La clave de Stripe se comparte con
  la facturación SaaS.
- **Lecturas desordenadas.** Cada lectura de la cuenta anota cuándo se pidió a
  Stripe; si la fila ya guarda una lectura posterior, la más vieja se descarta
  sin escribir.

### Deuda conocida

- **Cuenta huérfana por un reintento tardío.** Si Stripe crea la cuenta y
  falla la escritura en la base, un reintento antes de 24 horas recibe la
  misma cuenta (clave de idempotencia), pero uno posterior crea otra. El
  `logger.error` «cuenta creada en Stripe sin guardar» deja el `acct_…` para
  reconciliarla a mano. En la Fase 2 se buscará la cuenta por
  `metadata.zaltyko_organization_id` antes de crear una nueva.

## Pago automático de la familia (Fase 2)

La persona que paga las cuotas de una familia guarda una tarjeta o domicilia
el pago en la cuenta Stripe conectada de su academia, y puede dejar de pagar
automáticamente. La academia ve esos métodos y también puede retirarlos.
**En esta fase no se cobra nada**: el cobro llega en la Fase 3 del ADR-0028.

### Quién puede usarlo

Todas estas condiciones a la vez (el primer motivo que falla es el que se
devuelve, en este orden):

- Bandera `ZALTYKO_FAMILY_PAYMENT_METHODS_ENABLED=true` (texto exacto).
  **Apagada por defecto.** Las rutas de la familia exigen además
  `ZALTYKO_FAMILY_ACCESS_ENABLED` (acceso de familias).
- Clave `STRIPE_SECRET_KEY` de prueba y base que no sea la de producción (los
  mismos dos cerrojos que la Fase 1, abajo).
- Base de datos con la tabla y la columna del candidato de la Fase 2 **y**
  las dos columnas del de la Fase 1. Sin ellas la función responde «no
  disponible» en vez de fallar.
- Solo la persona pagadora: la cuenta con sesión es un tutor activo,
  vinculado de forma activa a una familia activa, y es la persona pagadora de
  esa familia hoy (según el calendario de la academia). La misma cadena que
  usa `/familia` para enseñar las cuotas. Otro tutor de la misma familia no ve
  nada.
- Academia lista para cobrar: cuenta conectada del entorno `active`, con la
  tarjeta `active`, y plan de pago vigente (Starter o Growth; la prueba no
  cuenta). La domiciliación solo se ofrece si la de la cuenta también está
  `active`.

Si la academia deja de estar lista y la familia ya tenía un método guardado,
la familia lo sigue viendo y puede dejar de pagar automáticamente, pero no
cambiarlo.

**Revocar no necesita la bandera.** Con la bandera apagada, quien ya tenía un
método lo sigue viendo y puede dejar de pagar automáticamente (sin poder
cambiarlo), y la academia sigue viendo y retirando los métodos activos.
Guardar o cambiar un método sigue cerrado. Revocar sí exige la clave de
prueba, la base que no es la de producción y los almacenes de las Fases 1 y 2.

En la academia, ver y retirar métodos: dueña, o administración con acceso a
todas las sedes.

### Pantalla

- **Familia:** tarjeta «Pago automático» dentro de la sección de cada
  academia en `/familia/cuotas` (`FamilyAutomaticPaymentCard.tsx`; la demo
  pública no la recibe):
  - Sin método: con el cobro automático de cuotas cerrado, «Guarda una tarjeta
    o domicilia el pago para que las cuotas se cobren solas. Todavía no se
    cobrará nada.»; con el cobro abierto (Fase 3) nunca dice «Todavía no se
    cobrará nada»: si las cuotas de la familia están en automático, «Guarda una
    tarjeta o domicilia el pago para que las próximas cuotas se cobren solas.»,
    y si la academia las tiene a mano, «… para que las cuotas se cobren solas.
    Tu academia te dirá desde cuándo.». Elige «Tarjeta» o
    «Domiciliación bancaria» (solo las que ofrece la academia), lee el texto
    de autorización y marca «Acepto». «Continuar» abre el formulario de Stripe
    (en español, en la cuenta de la academia) y «Guardar» lo confirma. Para la
    domiciliación, el texto de la orden lo pone el propio formulario de
    Stripe, con la academia como acreedora.
  - Con método: «Pagas automáticamente con tarjeta» o «… con domiciliación
    bancaria», «desde el {fecha}», y los botones «Cambiar método» y «Dejar de
    pagar automáticamente» (con confirmación en la misma tarjeta). Solo si de
    verdad se cobra solo: cobro automático abierto (bandera, cerrojos y
    tablas), cuotas de la familia en automático (preferencia vigente con plan
    de pago) y, si es domiciliación, la domiciliación activada. Si no: «Tienes
    tu tarjeta guardada desde el {fecha}» (o «Tienes la domiciliación bancaria
    guardada…») y «Quitar la tarjeta guardada» / «Quitar la domiciliación
    guardada», sin prometer ningún cobro.
  - Al guardar: «Tarjeta guardada» o «Domiciliación guardada».
  - Vuelta de la verificación del banco: la página termina sola el proceso. Si
    el banco aún no ha respondido: «Tu banco todavía lo está confirmando. Si
    en unos minutos no aparece como guardado, vuelve a guardarlo.» Si el banco
    rechazó la verificación: «Tu banco no ha aceptado este método de pago.
    Prueba con otro o habla con tu banco.» (no se comprueba nada más).
  - Con la función cerrada la tarjeta no aparece, salvo que la familia ya
    tuviera un método: entonces lo ve y solo puede quitarlo («Quitar la
    tarjeta guardada» o la domiciliación guardada). «El pago automático no está disponible ahora mismo» solo
    sale si falta la clave publicable de Stripe o si el formulario de Stripe
    no carga. Para quien no es la persona pagadora no aparece nada.
- **Academia:** panel «Pago automático de las familias» en `/owner/familias`
  (`OwnerFamilyPaymentMethodsPanel.tsx`). Una fila por método activo: nombre
  del tutor pagador (nombre y primer apellido), «Tarjeta» o «Domiciliación
  bancaria», «desde el {fecha}» y el botón «Dejar de cobrar automáticamente»,
  con confirmación en línea. Ayuda: «Revocar no anula los cobros ya
  enviados.» Sin métodos: «Ninguna familia ha guardado todavía un método de
  pago.» Muestra como mucho 200. Con métodos activos el panel aparece
  siempre, también con la bandera apagada, para poder retirarlos. Vacío solo
  aparece si la academia puede ofrecer el pago automático ahora (bandera
  encendida, cuenta lista y plan de pago). No aparece con clave Live, contra
  la base de producción, sin candidato ni para quien no tiene todas las
  sedes; nunca rompe la página.

### Rutas

| Ruta | Uso |
|---|---|
| `POST /api/v1/family/payment-methods` con `action: "setup"` | La persona pagadora elige método y acepta el texto (`consentVersion`, `consentAccepted: true`). Crea o reutiliza el Customer del pagador y prepara el método en la cuenta de la academia. Devuelve solo lo que necesita el formulario de Stripe. |
| `POST /api/v1/family/payment-methods` con `action: "complete"` | Tras el formulario (o al volver del banco). Vuelve a leer en Stripe la preparación **guardada** en el intento y la comprueba contra la familia, la persona y la academia; si ha terminado bien, activa el método. Responde `active` o `pending`. Una referencia ajena responde 404 sin escribir nada. |
| `POST /api/v1/family/payment-methods` con `action: "revoke"` | La familia deja de pagar automáticamente. |
| `POST /api/v1/owner/payments/family-methods` | La academia retira el método de una familia (`organizationId`, `authorizationId`). |

- Las dos rutas comprueban el mismo origen y responden con
  `cache-control: private, no-store`. Con la bandera de esta fase apagada, la
  ruta de la familia solo acepta `revoke` (`setup` y `complete` responden 503
  sin tocar la base ni Stripe) y la de la academia revoca igual. Los cerrojos
  de clave, base y almacén los aplica el servicio.
- Límites: 10 peticiones por minuto y cuenta en la ruta de la familia, y 20
  por minuto y academia verificada en la de la academia.
- Un error inesperado nunca se refleja tal cual: la familia ve «No se pudo
  guardar el método de pago. Vuelve a intentarlo.» (502) o «No se pudo dejar
  de pagar automáticamente…» (503, código `FAMILY_PAYMENT_REVOKE_FAILED`; en
  la ruta de la academia, problema `family-payment-revoke-failed`).
- Las rutas antiguas `/api/family/payment-method*` siguen en 410.
- Código en `src/modules/family-payment-methods/` (dominio, aplicación e
  infraestructura), separado de `src/lib/stripe/*`.

### Variables

| Variable | Uso |
|---|---|
| `ZALTYKO_FAMILY_PAYMENT_METHODS_ENABLED` | Enciende guardar y cambiar métodos. Apagada por defecto. Revocar no la necesita. |
| `ZALTYKO_FAMILY_ACCESS_ENABLED` | Acceso de familias; ya existía. Sin ella, la ruta de la familia no responde. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Clave publicable para el formulario de Stripe; ya existía. Debe ser de prueba (`pk_test_`) del mismo entorno que `STRIPE_SECRET_KEY`. |

No hay secreto nuevo ni webhook nuevo en esta fase.

### Datos

- **Tabla nueva `zaltyko.family_payment_setup_attempts`.** Cada intento de
  guardar un método: Customer (`cus_…`), preparación (`seti_…`), tipo
  (`card` o `sepa_debit`), pagador y tutor, y la evidencia recortada del
  consentimiento: versión, fecha, IP recortada (IPv4 a `/24`, IPv6 a `/48`),
  agente de navegador de 120 caracteres como máximo y sin caracteres de
  control, y SHA-256 del texto exacto aceptado. Estados `open`, `completed`
  (con su autorización) y `abandoned`.
- **Columna nueva `family_payment_authorizations.payment_method_kind`.** La
  autorización `active` guarda el método (`pm_…`), su tipo y, si es
  domiciliación, la orden (`mandate_…`). Apunta a su intento con
  `consent_evidence_reference = "family_payment_setup_attempts:<id>"`.
- **Nunca** número de tarjeta, IBAN, marca, últimos dígitos, nombre del
  titular ni correo: esos los pide y los guarda Stripe en su formulario. El
  Customer se crea sin correo ni nombre, y la metadata en Stripe solo lleva
  ids de Zaltyko (`zaltyko_organization_id`, `zaltyko_family_payer_id`,
  `zaltyko_setup_attempt_id`).
- Cada paso deja auditoría y evento (`family_payment_methods.setup_started`,
  `.authorization_activated`, `.authorization_revoked`) solo con ids, tipo,
  versión y quién lo hizo (`family` u `owner`). Ni IP ni agente.
- **Derechos de datos: hecho.** La tabla nueva está en el catálogo
  (`src/modules/data-rights/application/catalog.ts`) como grupo opcional
  excluido `OPTIONAL_FAMILY_PAYMENT_SETUP_EXPORT_TABLES`, categoría
  `payment_authorizations`. La exportación de la academia solo incluye su
  recuento, nunca los valores; sin la tabla, el paquete no cambia.

### Estado

- Candidata `docs/deployment/candidates/20261116180000_family_payment_methods_candidate.sql`:
  **aplicada en staging el 17-11-2026** (bandera encendida allí; guardar y
  revocar una tarjeta comprobado, según la sesión coordinadora). **Sin aplicar
  en producción**, que necesita otra autorización expresa de Elvis. Requiere
  antes la candidata de la Fase 1 (detalle y rollback en
  `docs/deployment/candidates/README.md`).
- Pruebas automáticas (`tests/family-payment-methods-*`, incluida la de
  PostgreSQL desechable, `tests/api-family-payment-methods-routes.test.ts`,
  `tests/owner-family-payment-methods-panel.test.tsx` y
  `tests/family-automatic-payment-card.test.tsx`): ninguna en local; las
  ejecuta la CI remota de la PR.
- Sin probar en staging. Antes hacen falta, con autorización de Elvis:
  aplicar la candidata en Supabase staging, encender la bandera en Vercel
  staging, comprobar la clave publicable de prueba y tener la cuenta sandbox
  de la academia en «Lista para cobrar» (pendiente desde la Fase 1).
- En producción no cambia nada: la bandera está apagada y, aunque se
  encendiera, la función queda cerrada contra Live y contra la base de
  producción.

### Cerrojos y límites

- **Los dos cerrojos de la Fase 1 (R11).** Responde «no disponible»
  (`live_not_released`) si la clave de Stripe no es de prueba **o** si la
  base del despliegue es la Supabase de producción. No hay ninguna vía para
  abrir Live ni producción en esta fase.
- **Solo la persona pagadora.** Todo lo que no lo es (otro tutor de la
  familia, otra familia, otra academia) recibe 404 en las escrituras, sin
  decir si la familia existe; en la lectura no se muestra nada.
- **Una sola autorización activa por pagador y cuenta conectada** (índice
  único). Cambiar de método revoca la anterior en la misma transacción que
  activa la nueva; el método anterior se desliga en Stripe después.
- **Doble clic o dos pestañas.** El intento se bloquea al completarlo: queda
  una sola autorización activa y la segunda petición recibe la misma.
- **La academia deja de estar lista entre los dos pasos** (plan caducado,
  cuenta restringida, domiciliación ya no activa): completar vuelve a
  comprobarlo todo y no activa nada.
- **Revocar** marca primero `revoked` (eso es lo que impedirá cobrar) y
  después desliga en Stripe. Si Stripe falla, queda un `logger.error` con ids
  opacos y la revocación se mantiene. Revocar no exige la bandera de esta
  fase, ni que la academia siga lista, ni que tenga plan; sí la clave de
  prueba, la base que no es la de producción y el almacén. Los cobros ya
  enviados siguen su curso.
- **Verificación del banco rechazada.** Si Stripe vuelve a pedir el método
  con un error del último intento (por ejemplo, 3DS fallido), completar no lo
  trata como pendiente: marca el intento como abandonado y la familia tiene
  que volver a guardarlo. Zaltyko solo guarda que hubo error, nunca su
  contenido.
- **Las llamadas a Stripe nunca van dentro de una transacción abierta.** Sin
  `application_fee`: no cambia ningún precio.

### Deuda conocida

- **Sin respaldo por evento hasta la Fase 4.** Si la familia cierra el
  navegador justo después de la verificación del banco, el método queda
  guardado en Stripe pero no activo en Zaltyko, y la familia tiene que
  repetirlo. La Fase 4 lo cubrirá con el evento `setup_intent.succeeded`.
- **Texto de autorización en borrador** (`borrador-2026-11-16`), sin valor
  legal hasta que el abogado responda L3 del ADR-0028. Cambiarlo exige otra
  versión.
- **Customer v1 sobre una cuenta conectada v2, por verificar en staging.** El
  Customer y la preparación se crean con la API v1 en una cuenta creada con
  Accounts v2; no se ha comprobado todavía en el sandbox.
- **Método vivo en Stripe tras un fallo al desligar.** La revocación se
  mantiene en Zaltyko, pero el método sigue en Stripe hasta reintentarlo a
  mano con los ids del `logger.error`.
- **Fecha del panel de la academia en hora de Madrid.** Si se abre México,
  usar la zona de la academia.
- **Borrar una academia con intentos podría fallar** por las claves
  `restrict` (como ya pasa con `family_payment_authorizations`). Hoy ninguna
  academia se borra: se archivan.
- **Sigue pendiente la búsqueda de la cuenta huérfana** de la Fase 1 por
  `metadata.zaltyko_organization_id`: esta fase no la implementa.
- **La persona deja de ser la pagadora.** Si se cierra su fila de
  `family_payers` o el tutor se desactiva, su autorización sigue activa: ese
  tutor ya no la ve en `/familia` y puede haber dos activas para la misma
  familia con pagadores distintos. La academia sí puede revocarla desde
  Familias. Requisito para la Fase 3: solo se cobra la autorización del
  pagador vigente con tutor activo. Pendiente decidir si quien consintió
  conserva la vía de revocación.
- **Método huérfano en Stripe si «completar» se rechaza.** Si la preparación
  ya terminó bien en Stripe pero Zaltyko no la activa (la academia dejó de
  estar lista, el método ya no se ofrece o la comprobación no cuadra), el
  método queda unido al Customer en Stripe sin autorización en Zaltyko. No se
  puede cobrar; se limpiará con la Fase 4 o a mano.
- **Retirar la candidata con autorizaciones activas.** Antes de deshacerla
  hay que revocar y desligar en Stripe las autorizaciones activas (detalle en
  `docs/deployment/candidates/README.md`).

## Cobro automático de cuotas (Fase 3)

Cada día, un proceso cobra las cuotas mensuales de las familias que tienen el
cobro automático encendido, con la tarjeta o la domiciliación que guardó la
persona pagadora (Fase 2), en la cuenta Stripe conectada de la academia
(Fase 1). Se hace **un cobro por familia, sede y mes**: el saldo pendiente de
las cuotas automáticas de su factura mensual (P1 del ADR-0028). Si no se puede
cobrar, la cuota vuelve al cobro manual con sus recordatorios.

### Quién puede usarlo

Todas estas condiciones a la vez:

- Bandera `ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_ENABLED=true` (texto exacto).
  **Apagada por defecto.** Ver «Estado» para lo que hace el proceso con la
  bandera apagada.
- Clave `STRIPE_SECRET_KEY` de prueba y base que no sea la de producción (los
  mismos dos cerrojos de las Fases 1 y 2). No hay ninguna vía para abrir Live
  ni producción en esta fase.
- Base de datos con las tablas del candidato de la Fase 3 **y** los de las
  Fases 1 y 2. Sin ellas no se cobra nada y las pantallas no cambian.
- Academia operativa: en prueba o activa, no suspendida ni cerrada (nota del
  17-11-2026: toda academia nace «en prueba» y nada la pasa a «activa», así
  que exigir «activa» dejaba sin cobro a todas; una suspendida o cerrada no
  cobra, `organization_not_active`, y la cuota vuelve a manual con
  recordatorios). Lo que exige pagar sigue siendo solo el plan.
- Academia con plan de pago vigente (Starter o Growth) y cuenta conectada
  `active` con la tarjeta `active`; para cobrar una domiciliación, también la
  domiciliación `active` **y** la bandera aparte
  `ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_SEPA_ENABLED=true` («Primero solo
  tarjeta», decisión de Elvis del 17-11-2026: apagada hasta la Fase 4).
- Familia con el interruptor «Cobrar automáticamente» encendido por la
  academia (la preferencia de ADR-0020) y con un método de pago activo de su
  persona pagadora.
- **Solo facturas mensuales** (las que emite la cuota mensual). Las facturas
  manuales se cobran siempre a mano.

Cuándo una cuota es automática:

- **Al emitirse la factura mensual.** La cuota nace automática solo si en ese
  momento se cumple todo lo anterior: bandera y cerrojos abiertos, tablas de
  las tres fases, academia operativa (en prueba o activa), plan de pago,
  preferencia automática, cuenta conectada de
  prueba y autorización activa del pagador de la factura. Si no, nace manual,
  como hasta ahora, y se queda manual. Con la bandera de la domiciliación
  apagada, la cuota de quien domicilia nace manual.
- **El día del cobro** se vuelve a comprobar todo (ver «Cerrojos y límites»).
  Si algo ha cambiado de forma definitiva (la familia dejó de pagar
  automáticamente, la academia apagó el interruptor, cambió la persona
  pagadora…), no se cobra y la cuota vuelve a manual con recordatorios.

El interruptor por familia, el día de cobro, la lista del mes y sus acciones:
dueña, o administración con acceso a todas las sedes. La familia ve el estado
de cada cuota en `/familia/cuotas` si es la persona pagadora (exige además
`ZALTYKO_FAMILY_ACCESS_ENABLED`).

### Pantalla

- **Día de cobro** (P2), en la tarjeta «Cobro automático de cuotas» de
  `/owner/settings` (`OwnerCollectionDaySettings.tsx`, dentro de la de la
  Fase 1). Dos opciones: «El día que vence cada cuota» (por defecto) o «Un día
  fijo del mes» (del 1 al 31), con las notas «En los meses que no tienen ese
  día, se cobra el último día del mes.» y «Si una cuota vence más tarde que el
  día elegido, se cobrará el día que vence, nunca antes.» (regla confirmada
  por Elvis el 17-11-2026). Debajo, el texto de costes: «Stripe cobra su
  tarifa por cada pago a la academia; Zaltyko no cobra comisión.». Botón
  «Guardar día de cobro». Cambiar el día afecta a los cobros que aún no se han empezado. Si
  otra sesión lo cambió antes (409 `VERSION_CONFLICT`), sale su texto y la
  página se relee sola con el día guardado.
- **Interruptor «Cobrar automáticamente»**, uno por familia, en el panel «Pago
  automático de las familias» de `/owner/familias`
  (`OwnerFamilyPaymentMethodsPanel.tsx`): «Con «Cobrar automáticamente»
  encendido, las próximas cuotas de la familia se cobran solas. Al apagarlo,
  no se cobra ninguna cuota más de forma automática. Los cobros ya enviados
  al banco siguen su curso.». Al apagarlo, el aviso también lo recuerda. Si
  otra sesión cambió la preferencia (409 `VERSION_CONFLICT`), sale su texto y
  la página se relee sola. Sin plan de pago sale
  desactivado con «El cobro automático de cuotas está incluido en Starter y
  Growth.». Tras un cambio real de plan sale apagado con «Cambió el plan de la
  academia: vuelve a encenderlo si quieres seguir cobrando automáticamente a
  esta familia.».
- **Domiciliación con su bandera apagada** (por defecto): en el panel de
  `/owner/familias` cada domiciliación dice «Por ahora la domiciliación no se
  cobra sola: esta familia paga como siempre.»; el interruptor de una familia
  que solo domicilia no se puede encender (sí apagar); su botón es «Quitar la
  domiciliación guardada» (no «Dejar de cobrar automáticamente»), con la
  confirmación «¿Quitar la domiciliación guardada de {nombre}? Tendrá que
  volver a guardarla si quiere usarla más adelante. Sus cuotas se siguen
  pagando como siempre.». En `/familia/cuotas`, «Tienes la domiciliación
  bancaria guardada desde el {fecha}.», «Por ahora la domiciliación no se
  cobra sola; paga como siempre.» y el botón «Quitar la domiciliación
  guardada». La familia puede seguir guardando su domiciliación.
- **«Cobros automáticos de este mes»**, en `/owner/payments`
  (`OwnerAutomaticCollectionsPanel.tsx`), debajo del pago manual. Una fila por
  factura (como mucho 100): «Se cobrará el {día}», «Cobro en curso», «Cobrada
  el {día}», «No se pudo cobrar; se volverá a intentar el {día}», «Se cobrará
  a mano», «No se pudo cobrar», «Cobro automático cancelado» o «No se cobró
  automáticamente», con el motivo en palabras sencillas (nunca códigos) y la
  marca «Necesita revisión» si hay un aviso. «Se cobrará a mano» sale cuando
  el cobro pendiente (o su reintento) ya no puede llegar: sin plan de pago,
  familia en manual, método revocado o cambio de plan; la familia, en ese
  caso, no ve ninguna promesa de cobro. «No se cobró automáticamente» sale
  cuando pasó la ventana de cobro sin poder cobrar (intento cerrado con
  `collection_window_expired`, o todavía sin intento). Un cierre cancelado
  enseña su propio motivo (la academia, un pago a mano, la ventana…), no el
  del rechazo anterior. Una factura sin más intentos (aviso
  `attempts_exhausted`) sale con «Necesita revisión» y «Esta cuota ya no
  admite más intentos automáticos. Se cobra a mano.». Si el primer cobro de
  tarjeta falló, la fila dice «Hemos avisado a la familia por correo de que no
  se pudo cobrar.» o «No hemos podido avisar a la familia por correo.
  Avísala tú.». Con la bandera general apagada la lista solo enseña los
  cobros que ya estaban en marcha y se titula **«Cobros automáticos en
  curso»**, con «El cobro automático está parado: ya no se cobra ninguna
  cuota nueva. Estos cobros ya estaban en marcha y siguen su curso.».
  Acciones:
  - «Cancelar el cobro automático», con confirmación: para un reintento
    pendiente o un cobro creado que aún no se ha cobrado. La cuota pasa a
    cobrarse a mano.
  - «Marcar como revisado», con la casilla obligatoria «He comprobado el cobro
    en Stripe»: para un cobro que se quedó abierto con un aviso de revisión,
    sin poder terminar (reanudaciones agotadas) o reclamado o creado sin
    cambios desde hace más de 24 h («El cobro lleva más de un día sin
    avanzar.»), la salida si el proceso diario deja de pasar. Antes de
    cerrar siempre lee el cobro en Stripe y lo para; si el dinero ya salió,
    lo registra, y si está en el banco, responde 409.
  - Si Stripe ya lo había cobrado, ninguna de las dos lo cancela: se registra
    el pago y queda como cobrado («El cobro de la cuota … ya se había hecho y
    ha quedado registrado.»).
- **Pago manual:** al elegir una cuota con un cobro en curso aparece un aviso,
  y si se registra igual, el servidor responde «Esta cuota se está cobrando
  automáticamente. Espera al resultado.». Si el cobro no sale, se puede
  registrar a mano.
- **Familia**, bajo cada cuota automática en `/familia/cuotas`: «Se cobrará
  automáticamente el {fecha}» (también cuando hay un reintento pendiente),
  «Cobro en curso», «Cobrada automáticamente el {fecha}» o «No se pudo cobrar
  automáticamente; tu academia te dirá cómo pagarla» (también cuando pasó la
  ventana de cobro). Si el cobro pendiente ya no puede llegar (sin plan de
  pago, familia en manual, método revocado o cambio de plan), la familia no
  ve nada bajo la cuota: ni fecha ni promesa de cobro. Las cuotas manuales y
  la demo pública no cambian.
- Con la función cerrada (bandera, cerrojos o tablas) ninguna de estas piezas
  aparece y las páginas no leen nada nuevo; un fallo de lectura nunca rompe la
  página.

### Rutas

| Ruta | Uso |
|---|---|
| `GET`/`POST /api/cron/collect-family-fees` | Proceso diario. Exige `CRON_SECRET` (`requireCronAuth`) y el lease `cron:collect-family-fees`; si ya está corriendo responde `ALREADY_RUNNING`. Devuelve solo contadores (`enabled`, `complete`, `reconciled`, `collected`, `processing`, `failed`, `canceled`, `skipped`, `retried`, `resumed`, `needsReview` y `familyNotices: { sent, notSent, pending }`, o `null` si falló el envío de avisos). Lo lanza pg_cron (`docs/deployment/scheduler/`, sin programar). |
| `GET /api/v1/owner/payments/collection-settings?organizationId=…` | Día de cobro de la academia. |
| `PUT /api/v1/owner/payments/collection-settings` | Lo cambia: `{ organizationId, collectionDayOfMonth, expectedVersion }`; `null` = el día que vence cada cuota, `1`–`31` = ese día. Versión optimista (409 `VERSION_CONFLICT`). |
| `GET`/`PUT /api/v1/owner/billing/family-collection-preference` | El interruptor «Cobrar automáticamente» de una familia (ya existía; ahora admite `automatic`). Versión y `idempotency-key`. |
| `POST /api/v1/owner/payments/automatic-collection` | Acciones de la academia: `{ action: "cancel", organizationId, invoiceId }` o `{ action: "mark_reviewed", organizationId, invoiceId, checkedInStripe: true }`. Responde `{ outcome: "canceled" \| "reviewed" \| "collected" }`. |

- Las rutas de la academia comprueban el mismo origen en las escrituras,
  responden con `cache-control: private, no-store` y tienen límite por
  academia verificada: 20 por minuto en el día de cobro y en la preferencia,
  10 en las acciones (pueden llamar a Stripe).
- Con la bandera apagada, el día de cobro responde 409
  `FAMILY_AUTOMATIC_COLLECTION_DISABLED` y la preferencia no admite
  `automatic`. Las acciones de la academia **no** exigen la bandera: con la
  función apagada se tiene que poder cerrar lo que quedó abierto.
- Errores de las acciones con su texto: `automatic-collection-processing`
  («ya se envió al banco y no se puede cancelar»),
  `automatic-collection-in-progress`, `automatic-collection-needs-support`
  (varios cobros en Stripe con dinero movido, o un cobro sin datos para
  leerlo en Zaltyko: hay que resolverlo con el soporte),
  `automatic-collection-review-required` (el cobro ya figura con otro intento:
  usar «Marcar como revisado») y `concurrency-retry` (el cobro cambió o acaba
  de empezar: recargar). Un error inesperado responde 503 sin detalles.
- Las rutas antiguas (`/api/family/*`, `/api/charges/[id]/collect`,
  `/api/cron/collect-charges`) siguen en 410.
- Código en `src/modules/family-collection/` (dominio, aplicación e
  infraestructura), separado de `src/lib/stripe/*`; cambios en el libro de
  cuotas (`src/modules/billing/application/ledger-service.ts`,
  `charge-collection-mode.ts`, `plan-state.ts`) y en los recordatorios
  (`src/modules/payment-reminders/`).

### Variables

| Variable | Uso |
|---|---|
| `ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_ENABLED` | Enciende el cobro de cuotas nuevas. Apagada por defecto. Es el `runtimeEnabled` de la puerta de elegibilidad. |
| `ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_SEPA_ENABLED` | Bandera aparte para cobrar domiciliaciones («Primero solo tarjeta», Elvis, 17-11-2026). Apagada por defecto (`.env.example`) hasta la Fase 4; sola no cobra nada. Con ella apagada no se crea ningún cobro de domiciliación nuevo. |
| `CRON_SECRET` | Secreto del proceso diario; ya existía (el mismo que los demás avisos de pg_cron). |

No hay secreto nuevo ni webhook nuevo en esta fase.

### Datos

- **Tabla nueva `zaltyko.family_collection_attempts`.** Un intento de cobrar
  una factura mensual: sede, factura, familia, pagador, autorización, cuenta
  conectada, número de intento, tipo de método, importe y moneda, estado,
  `pi_…`, códigos de Stripe (`failure_code`, `decline_code`), fecha del
  reintento, reanudaciones, pago registrado y estado del reparto.
- **Tabla nueva `zaltyko.family_collection_attempt_charges`.** Qué parte del
  intento corresponde a cada cuota.
- **Tabla nueva `zaltyko.organization_collection_settings`.** El día de cobro
  de la academia (sin fila = el día que vence cada cuota), con versión y quién
  lo cambió.
- **Pagos:** cada cobro hecho se registra en `zaltyko.payments` con origen
  `provider`, procesador `stripe` y entorno `sandbox`, con la familia y el
  pagador de la factura. Se reparte entre cuotas con el mismo cálculo que el
  pago manual.
- **Estados de un intento, en palabras sencillas:**
  - **reclamado** (`claimed`): Zaltyko ha apartado la factura para cobrarla;
    todavía no hay cobro en Stripe;
  - **creado** (`created`): el cobro existe en Stripe (su `pi_…` está
    guardado) pero aún no se ha confirmado;
  - **en proceso** (`processing`): el banco lo está tramitando, sobre todo en
    las domiciliaciones, que tardan días; el proceso diario lo relee;
  - **cobrado** (`succeeded`): el pago está registrado; el reparto quedó
    completo (`allocated`) o necesita revisión (`needs_review`);
  - **fallido** (`failed`): Stripe lo rechazó; puede llevar un reintento
    programado o ser definitivo;
  - **cancelado** (`canceled`): se cerró sin cobrar, con su motivo (la puerta
    del día del cobro, la academia, un pago manual, la revisión o la ventana
    de cobro pasada, `collection_window_expired`).
  Solo puede haber un intento abierto (reclamado, creado o en proceso) por
  factura, **un solo intento cobrado por factura** (índice único parcial
  `family_collection_attempts_succeeded_uq`), como mucho cinco intentos por
  factura y tres reanudaciones por intento, y solo una tarjeta en los
  intentos 1 a 3 puede tener reintento pendiente (CHECK
  `family_collection_attempts_next_retry_card_only`). Candidata con SHA-256
  `cee3e0aac1673b87e75bb492de60f8b88a7b9e1f4ac2a61caec80db2d7fecbd8`.
- **Nunca** mensajes de Stripe, número de tarjeta, IBAN, nombre ni correo.
  Solo referencias opacas y códigos. La metadata en Stripe solo lleva
  `zaltyko_organization_id`, `zaltyko_invoice_id` y
  `zaltyko_collection_attempt_id`; la descripción es «Cuota {mes} {año}» (por
  ejemplo, «Cuota noviembre 2026»).
- Auditoría y eventos solo con ids y códigos:
  `family_collection.attempt_claimed`, `.attempt_canceled`,
  `.attempt_processing`, `.attempt_succeeded`, `.attempt_failed`,
  `.attempt_reviewed` y `.settings_changed`; avisos `family_collection.final_failure`
  (fallo sin reintento) y `family_collection.needs_review` (revisión de la
  academia, con motivos como `amount_mismatch` o `processing_unreadable`);
  el aviso a la familia, `family_collection.family_failure_notice` y su
  resultado `family_collection.family_failure_notice_result` (uno de cada por
  intento, payload solo con ids y el resultado); el pago,
  `payment.provider_recorded`.
- **Derechos de datos: hecho.** Las tres tablas son el grupo opcional
  excluido `OPTIONAL_FAMILY_COLLECTION_EXPORT_TABLES`
  (`src/modules/data-rights/application/catalog.ts`): intentos y reparto en
  `payment_provider_attempts`, el día de cobro en
  `payment_provider_configuration`. La exportación solo incluye el recuento de
  la academia; todo o nada, como en la Fase 2.

### Estado

- Construida en la PR #349 (en borrador), detrás de la bandera, que está
  apagada.
- Candidata `docs/deployment/candidates/20261117120000_family_collection_candidate.sql`:
  **aplicada en staging el 17-11-2026** y la Fase 3 probada de punta a punta
  allí (17 y 18-11-2026), según la sesión coordinadora. **No aplicada en
  producción**: necesita una autorización expresa de Elvis; las de las Fases 1
  y 2 no la cubren.
  Requiere antes las candidatas de las Fases 1 y 2 (detalle y rollback en
  `docs/deployment/candidates/README.md`).
- Trabajo de pg_cron `zaltyko-collect-family-fees` (`0 6 * * *` UTC, antes de
  los recordatorios): **sin programar en producción** (en staging, ver la
  sesión coordinadora)
  (`docs/deployment/scheduler/candidates/collect-family-fees.sql` y, para
  staging, la función propia del README del planificador).
- **El proceso diario tiene dos partes:**
  1. **Puesta al día** (siempre que la clave sea de prueba, la base no sea la
     de producción y existan las tablas, **también con la bandera apagada**):
     retoma los intentos que se quedaron a medias, relee en Stripe los que
     están en proceso y avisa de los que no pudieron terminar. Así, lo que ya
     salió en Stripe siempre queda registrado. Con la bandera apagada nunca
     crea ni confirma un cobro nuevo.
  2. **Cobro** (solo con la bandera encendida): busca las facturas cuya fecha
     de cobro es hoy o ya pasó (en la hora local de la sede), pasa la puerta,
     reclama el intento y crea y confirma el cobro en Stripe. Los reintentos
     se cobran el día local que les toca.
  El proceso se corta a los 240 segundos; lo que falte sigue al día
  siguiente.
- **Reintentos (P3 nueva, decisión de Elvis del 17-11-2026, «3 reintentos:
  1, 3 y 7 días»; sustituye a «1 reintento tarjeta» a los 3 días):** tarjeta
  rechazada por un motivo recuperable (límite de gasto o de operaciones,
  fondos insuficientes, rechazo genérico o temporal), hasta 3 reintentos, los
  días locales de la sede +1, +3 y +7 contados desde el día del primer
  intento; si ese día ya pasó, al día siguiente (nunca dos cargos el mismo
  día). Antes de cada reintento se cancela en Stripe el cobro del intento
  anterior. Cada reintento tiene su propia ventana de 3 días. Nunca se
  reintenta una tarjeta perdida, robada o de fraude, ni cuando el banco pide
  no repetir, retener la tarjeta o autenticación, ni con un método no válido
  (caducada, número incorrecto, no admitida). Tras el último fallo, la cuota
  pasa a manual con recordatorios. Domiciliación: ningún reintento.
- **Domiciliación apagada («Primero solo tarjeta»).** Con
  `ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_SEPA_ENABLED` apagada, la cuota de
  quien domicilia nace manual; una ya emitida en automático se cierra el día
  del cobro con `sepa_not_enabled`, sin llamar a Stripe, y no retiene
  recordatorios mientras espera. Una domiciliación que ya estaba en el banco
  se sigue releyendo y registrando.
- **Aviso a la familia en el primer fallo (decisión de Elvis del
  17-11-2026).** Cuando el primer cobro de tarjeta falla (rechazo del banco o
  autenticación) o la tarjeta ya no está en Stripe al crear el primer cobro,
  se guarda el aviso en el outbox en la misma transacción, y la ruta
  `collect-family-fees`, al terminar de cobrar, envía el correo por el mismo
  camino que los recordatorios de pago (mismo emisor, la persona que paga,
  clave para no duplicar). Un solo enlace, a `/familia/cuotas`; solo promete
  un reintento si va a salir (con la bandera apagada, nunca). Los cierres de
  la puerta y los fallos sin respuesta de Stripe no avisan. La academia ve en
  la lista si se avisó o si debe avisar ella.
- **Motivos finales nuevos (la cuota pasa a manual):** `amount_below_minimum`
  (queda menos de 0,50 €), `reminder_sent` (ya salió un recordatorio de pago
  de una cuota abierta de la factura: desde entonces no se cobra nunca sola,
  ni primer intento ni reintento), `sepa_not_enabled` y los rechazos
  deterministas de Stripe al crear el cobro (`amount_too_small`,
  `resource_missing`, `account_invalid`, `payment_method_unactivated`,
  `capability_not_active`). Todos cierran con un intento `canceled`.
- **Importe comprobado.** Antes de registrar un cobro se compara lo cobrado
  con el importe del intento y con `EUR`. Si no cuadra, no se registra, la
  academia recibe el aviso `amount_mismatch`. «Marcar como revisado» cierra
  el intento como `reviewed_unverifiable` sin registrar ese pago y la
  academia ve «Comprueba en tu panel de Stripe si se cobró; si se cobró, regístralo como pago manual.»
- **Domiciliación «en curso» que no se puede leer.** Si Stripe no deja
  releerla, se registra el nombre y el código del error y, a los 15 días
  desde que se reclamó, la academia recibe el aviso `processing_unreadable`
  («El cobro lleva más de 15 días en curso y no podemos ver su resultado.
  Compruébalo en Stripe.»). Con un error permanente comprobado en Stripe en
  ese momento, «Marcar como revisado» cierra el intento como
  `reviewed_unverifiable` (con la persona en la auditoría) y la academia ve
  «Comprueba en tu panel de Stripe si se cobró; si se cobró, regístralo como pago manual.» La cuota vuelve al cobro manual con recordatorios. Un error
  pasajero o un cobro legible en curso no cierran nada.
- **Cancelado en Stripe.** Un cobro cancelado en Stripe sin error de pago se
  cierra como `canceled_in_stripe` («El cobro se canceló en Stripe. Se cobra
  a mano.»), sin aviso de rechazo a la familia y sin reintento.
- **Petición rechazada al crear.** Un 400 `invalid_request_error` sin cobro
  creado, que no sea de idempotencia ni un bloqueo, cierra el intento solo si
  su código es de la familia o de la academia (`amount_too_small`,
  `resource_missing`, `account_invalid`, `payment_method_unactivated`,
  `capability_not_active`). Desde la Fase 4 (revisión de la PR #354, punto 1)
  cualquier otro 400 es de toda la plataforma: el intento se queda reclamado
  sin cobro y se reanuda otro día (ver «Cortacircuitos (D9)»). Las filas
  antiguas cerradas con `invalid_request` o su código siguen mostrando
  «Stripe no aceptó crear el cobro. Se cobra a mano.».
- **Aviso del primer fallo.** Se envía de página en página hasta el plazo y
  también antes de cobrar; un reintento ya reclamado no lo anula.
- **Recordatorios.** Mientras el cobro de una cuota automática está en
  curso, o hay un reintento pendiente, la cuota no recibe recordatorios. Los
  vuelve a recibir:
  - si el cobro falla sin reintento o se cancela;
  - 3 días después de la fecha de cobro prevista si no llegó a haber ningún
    intento;
  - 3 días después de la fecha de un reintento que no se hizo, o de un cobro
    hecho que dejó saldo pendiente.
  Con la bandera apagada, las cuotas automáticas se tratan como manuales para
  pagos y recordatorios, **salvo** las que tienen un cobro en marcha
  (reclamado, creado o en proceso): esas siguen sin recordatorios, aunque la
  bandera esté apagada o los cerrojos cerrados, y el portal dice «Cobro en
  curso». Un reintento pendiente con la bandera apagada no retiene.
- **Ventana máxima de cobro.** Esos mismos 3 días son el límite para cobrar:
  pasada la espera (desde la fecha de cobro sin ningún intento, o desde la
  fecha del reintento), la cuota ya volvió a los recordatorios y nunca se
  cobra sola, aunque el motivo pasajero que lo impedía haya desaparecido. El
  proceso escribe un intento `canceled` (`collection_window_expired`), sin
  llamar a Stripe, y la cuota se cobra a mano. Así nunca hay doble pago (a
  mano y con la tarjeta).
- Pruebas automáticas (`tests/family-collection-*`, incluidas las de
  PostgreSQL desechable `family-collection-pg`, `-worker-pg`,
  `-academy-actions-pg` y `-plan-revision-pg`, y
  `tests/api-cron-collect-family-fees.test.ts`): ninguna en local; las ejecuta
  la CI remota de la PR.
- Sin probar en staging. Antes hacen falta, con autorización de Elvis:
  aplicar la candidata en Supabase staging, encender la bandera en Vercel
  staging y crear la función y el trabajo de staging del planificador. La
  tarjeta se puede probar en un día; las domiciliaciones tardan días en
  cerrarse con la relectura diaria.
- En producción no cambia nada: la bandera está apagada y, aunque se
  encendiera, el proceso no hace nada contra Live ni contra la base de
  producción.
- **Vuelta atrás.** Para parar los cobros nuevos basta con apagar la bandera;
  la puesta al día sigue registrando lo que ya salió. **Antes de quitar el
  trabajo de pg_cron, comprobar que no queda ningún intento abierto** con
  esta consulta de solo lectura (debe devolver cero filas):

  ```sql
  -- Solo lectura. Intentos abiertos (reclamados, creados o en el banco).
  select organization_id, invoice_id, id, status, resume_count, claimed_at, updated_at
    from zaltyko.family_collection_attempts
   where status in ('claimed', 'created', 'processing')
   order by updated_at;
  ```

  Si queda alguno, esperar a que la puesta al día lo cierre o pedir a la
  academia que use «Marcar como revisado» (sin aviso, posible pasadas 24 h
  sin cambios; para una domiciliación en el banco, esperar a su resultado).
- **No reencender la bandera con reintentos pendientes sin revisarlos.** Si
  se apaga y se vuelve a encender dentro de la ventana de un reintento, y
  todavía no salió ningún recordatorio, ese reintento puede cobrarse después
  de que la familia leyera «ya no se cobrará sola». Antes de reencender,
  revisar los intentos `failed` con `next_retry_at` pendiente.
- **Caso de soporte: cerrojos cerrados con intentos en marcha.** Si un
  entorno pasa de clave de prueba a Live, o a la base de producción, con
  intentos abiertos, el proceso diario deja de releerlos y siguen reteniendo
  recordatorios y bloqueando el pago manual. Lo resuelve soporte.

### Cerrojos y límites

- **Los dos cerrojos de las fases anteriores (R11).** Con una clave de Stripe
  que no es de prueba, o contra la base de producción, el proceso no hace
  nada y no se emite ninguna cuota automática.
- **Nunca dos cobros de la misma factura e intento.** Un solo intento abierto
  por factura (en la base). El cobro se crea y se confirma por separado, cada
  paso con su clave de idempotencia; al reanudar se usa el `pi_…` guardado o
  se busca en Stripe por la metadata del intento antes de crear (las claves de
  Stripe caducan a las 24 h y el proceso es diario). Varios cobros para un
  mismo intento o un conflicto de idempotencia: aviso a la academia, nunca un
  cobro nuevo.
- **Nunca «fallido» sin leer Stripe.** Un error sin respuesta de Stripe se
  vuelve a mirar al día siguiente. Tras tres reanudaciones sin resultado: si
  no hay cobro en Stripe, el intento falla (`transient_exhausted`); si lo hay,
  se cancela en Stripe y solo se cierra si Stripe lo confirma; si no se puede
  ni cancelar ni leer, aviso de revisión.
- **Todo cobro hecho queda registrado**, aunque la cuota ya se hubiera pagado
  a mano o anulado: el pago se graba primero y lo que no se pueda repartir
  queda sin repartir, con aviso «Necesita revisión» a la academia. El intento
  nunca queda fallido.
- **Nunca se cobra a quien ya no paga.** El día del cobro se vuelve a cargar
  todo y se pasa por la puerta: la de ADR-0020 (academia operativa, es decir
  en prueba o activa y no suspendida ni cerrada; plan, preferencia, cuenta,
  autorización, consentimiento), más que cada cuota tenga el pagador de la
  factura, que ese pagador esté vigente hoy en la fecha local de la sede
  (fila de `family_payers` abierta, tutor y vínculo activos), que la cuenta se
  haya releído en Stripe en la última hora (si no, se relee antes) y que la
  factura sea en euros. Se repite antes de crear o confirmar al reanudar.
- **Ninguna cuota en el limbo.** Los motivos pasajeros (bandera, cerrojos,
  plan que todavía no rige o suscripción no al día, cuenta sin releer)
  esperan al día siguiente, como mucho hasta el final de la ventana de cobro; los definitivos (familia en manual, método
  revocado o caducado, pagador que ya no es el vigente, cuenta que ya no
  sirve, moneda que no es euro…) cierran la cuota con un intento cancelado y
  vuelve a manual con recordatorios.
- **Una renovación del plan no apaga el cobro automático;** un cambio real
  de plan sí (otro plan, otra suscripción u otro contrato): hay que volver a
  encender el interruptor.
- **Pago manual.** Con un cobro en curso, 409 «Esta cuota se está cobrando
  automáticamente. Espera al resultado.», también con la bandera apagada. Si
  solo queda un reintento pendiente, el pago manual lo cancela.
- **Orden de bloqueo único** (fila de `organizations` → cuotas por id →
  factura → intento (→ disputa) → pago) en el proceso, los eventos, el pago
  manual, las devoluciones y disputas y las acciones: sin bloqueos mutuos.
  Las autorizaciones de la Fase 2 también bloquean primero la academia: la
  activación y todas las revocaciones (familia, academia o aviso de Stripe).
  Las llamadas a Stripe nunca van dentro de una transacción abierta.
- **Cargo directo** en la cuenta de la academia, sin `application_fee`: no
  cambia ningún precio. Solo euros.

### Deuda conocida

- **Lo que llega con la Fase 4** (construido el 18-11-2026, salvo encender la
  domiciliación y retirar Standard v1; ver «Eventos de Stripe, devoluciones,
  3DS y justificante (Fase 4)»): encender la domiciliación; las
  domiciliaciones «en proceso» solo se cierran con la relectura diaria (sin
  eventos de Stripe); cuando el banco pide autenticación (3DS) el cobro falla,
  se avisa a la familia y pasa a manual, sin forma de que la familia complete
  ese pago; devoluciones, disputas y devoluciones del banco en SEPA no se
  reflejan; no hay recibo «no es factura»; el código Standard v1 y sus rutas
  siguen sin retirar.
- **Tarjeta que ya no está en Stripe, cada mes.** Hasta que la familia
  vuelva a guardar su tarjeta, cada mes queda un intento `canceled`
  (`resource_missing`) y la familia recibe otra vez el aviso para
  actualizarla. Sin dinero movido.
- **Aviso «no enviado» falso en casos raros.** Si el correo sale pero falla
  el guardado del resultado, o en entornos con el correo simulado (staging),
  la academia puede ver «Avísala tú». No mueve dinero.
- **La tabla canónica `payment_attempts` sigue sin uso:** el cobro usa su
  propia tabla.
- **Aviso previo de cada adeudo SEPA:** lo envía Stripe por defecto; depende
  de la respuesta del abogado a L4 del ADR-0028.
- **La búsqueda de Stripe tarda en ver un cobro recién creado.** En el peor
  caso puede quedar en Stripe un cobro creado y nunca confirmado, sin dinero
  movido. Es inofensivo, pero se ve en el panel de Stripe de la academia.
- **Éxito tardío del primer intento.** Si antes del reintento no se pudo
  cancelar en Stripe el cobro del primer intento y aun así acabara cobrándose,
  Zaltyko no lo vería hasta tener los eventos de la Fase 4.
- **Academias de prueba en la base desechable de la CI.** Las pruebas de
  PostgreSQL borran sus filas salvo las academias y sus sedes (la auditoría y
  el historial de plan son solo de añadir). Solo afecta al PostgreSQL
  desechable de GitHub.
- **Pagador vigente en la zona de la sede.** El portal de la familia usa la
  zona de la academia: cerca de medianoche pueden diferir un día.
- **Por confirmar con Elvis** (ADR-0028, «Reglas añadidas al construir»):
  la regla del cambio real de plan y los 3 días de margen de los
  recordatorios. Ya confirmadas el 17-11-2026: nunca cobrar antes del
  vencimiento, y qué rechazos se reintentan (la P3 nueva, que incluye «rechazo
  genérico» y «no aceptar»).

## Eventos de Stripe, devoluciones, 3DS y justificante (Fase 4)

Lo que pasa en Stripe con los cobros automáticos llega a Zaltyko por eventos
de las cuentas conectadas: cobros que terminan tarde, domiciliaciones que el
banco confirma o devuelve, devoluciones que hace la academia, disputas y
cambios del método de pago. Además, la familia puede confirmar el pago con su
banco cuando este lo pide, y puede recibir un justificante de pago («no es
factura»). Decisiones: ADR-0028, «Fase 4: respuestas D1–D13 y cómo quedó
construida (18-11-2026)». Plan:
`docs/superpowers/plans/2026-11-18-cobro-automatico-fase4-eventos-stripe.md`.

### Quién puede usarlo

- Bandera `ZALTYKO_FAMILY_COLLECTION_EVENTS_ENABLED=true` (texto exacto).
  **Apagada por defecto.**
- Clave de prueba de Stripe, base que no sea la de producción, eventos con
  `livemode` `false` y las tablas de las candidatas de las Fases 1 a 4.
- Confirmar el pago con el banco: además, la bandera del cobro de la Fase 3
  (`ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_ENABLED`) y la persona pagadora
  vigente de la cuota.
- Justificante: la bandera aparte `ZALTYKO_FAMILY_COLLECTION_RECEIPTS_ENABLED=true`,
  **apagada hasta la respuesta del abogado/gestor (L6 del ADR-0028)**.
- La domiciliación sigue sin cobrarse sola
  (`ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_SEPA_ENABLED` apagada); los eventos de
  una domiciliación que ya estaba en el banco se atienden igual.

### Pantalla

- **Familia, `/familia/cuotas`.**
  - Cuando el banco pide confirmar: «Tu banco pide que confirmes este pago.
    Puedes hacerlo hasta el {fecha}.» y el botón «Confirmar el pago». Tras
    pulsarlo, «Procesando…» y después «Pago confirmado», «No se pudo
    confirmar. Puedes intentarlo otra vez hasta el {fecha}.» o «No se pudo
    confirmar. Tu academia te dirá cómo pagarla.». Nunca reintenta solo.
  - Sin la clave publicable de Stripe: «Tu banco pide que confirmes este pago,
    pero ahora no se puede hacer desde aquí. Tu academia te dirá cómo
    pagarla.», sin botón.
  - Cuota devuelta o con disputa perdida: «Devuelto» con el importe. La
    familia no ve las disputas abiertas ni ganadas (D4).
  - Cuota nueva de una domiciliación devuelta (D2): «Cuota de {mes} · devuelta
    por el banco», pendiente y con recordatorios.
  - Con la bandera del justificante: «Ver justificante» en las cuotas cobradas
    que lo tienen.
- **Justificante, `/familia/cuotas/justificante/[attemptId]`.** Solo la
  persona pagadora; academia, quién paga, fecha del cobro, forma de pago
  («Tarjeta» o «Domiciliación bancaria», sin números), cuotas y referencia.
  Dice «Este justificante no es una factura. Si necesitas factura, pídesela a
  {academia}.». Botón «Imprimir o guardar como PDF»; al imprimir no salen la
  cabecera ni la navegación del portal. Si el pago se devolvió, una línea
  «Este pago se devolvió el {día}»; con una disputa abierta, «Este pago está
  en revisión con el banco». El justificante no se oculta: el cobro existió.
  Con la bandera apagada, o si la cuota no es suya, 404.
- **Academia, `/owner/payments`, «Cobros automáticos de {mes}».**
  - Cada fila dice de qué mes es la cuota («Cuota de febrero de 2027»); el
    título dice el mes en que se cobran. Los botones de cada fila llevan en
    su nombre accesible la persona pagadora (o, sin ella, la referencia):
    dos cuotas del mismo mes se distinguen.
  - «Esperando a que la familia confirme el pago con su banco (hasta el
    {fecha})».
  - «Devuelta: {importe} el {fecha} (desde tu panel de Stripe)».
  - Disputas: «En disputa: responde desde tu panel de Stripe antes del
    {fecha}», «Disputa ganada», «Disputa perdida. El banco devolvió el dinero a
    la familia ({importe})», «El banco devolvió el dinero a la familia
    ({importe}). Se ha creado una cuota pendiente por el importe devuelto».
  - Domiciliación devuelta y después ganada (el banco reintegra los fondos):
    «El banco reintegró el dinero que había devuelto ({importe}). Anula la
    cuota pendiente que se creó si ya no se debe», más «: todavía no tiene
    ningún pago» si esa cuota nueva no tiene pagos, o «; ya tiene algún pago,
    revísalo antes» si los tiene. Zaltyko nunca la anula sola. Una disputa
    ganada después de escribir la reversión (filas `sepa_returned` o
    `dispute_lost`) solo crea este aviso: las filas se quedan en el libro y
    la academia lo restituye a mano.
  - Pasado el plazo de la familia, si Stripe no deja leer ni cancelar el
    cobro (p. ej. la academia desconectó su cuenta): «Pasó el plazo para que
    la familia confirmara el pago y no podemos ver su resultado. Compruébalo
    en Stripe.» y «Marcar como revisado», que vuelve a leer Stripe y solo con
    un error permanente comprobado lo cierra sin saber si se cobró.
  - Cobro doble (D10): «Esta cuota se cobró dos veces. Devuelve uno desde tu
    panel de Stripe.».
- **Correos a la familia.**
  - El banco pide confirmar (D7, cada vez): «Tu banco pide que confirmes el
    pago de la cuota de {mes}. Entra en Zaltyko y pulsa «Confirmar el pago»
    antes del {fecha}. Si no, tu academia te dirá cómo pagarla.».
  - Domiciliación rechazada (D11): el mismo correo que la tarjeta rechazada,
    sin prometer reintento.
  - Justificante: asunto «Justificante de pago de {academia}».
  - Sin correo el día antes del cobro (D12).

### Rutas

| Ruta | Uso |
|---|---|
| `POST /api/stripe/connect/payments-webhook` | Eventos de las cuentas conectadas (firma con `STRIPE_CONNECT_PAYMENTS_WEBHOOK_SECRET`). Antes de leer el cuerpo solo se miran la bandera, la clave de prueba y que la base no sea la de producción: si falla alguno, 200 `{ ignored: true }` sin leerlo. Sin secreto: 503. Firma mala: 400. Sin `STRIPE_SECRET_KEY` en el entorno la clave no es de prueba: 200 `{ ignored: true }` en el primer paso (el evento se puede reenviar desde Stripe durante 30 días). Si la clave de prueba está en el entorno pero no se puede crear el cliente de Stripe: 503 `STRIPE_NOT_CONFIGURED`, nunca 400, y sin registrar la clave. Después de comprobar la firma: evento Live, sin cuenta o de un tipo u objeto que no se atiende → 200 `{ ignored: true }`; con una cuenta que no es de ninguna academia en pruebas, también 200 `{ ignored: true }` sin escribir. Sin las tablas de las Fases 1–4 (con la bandera encendida): 503 `EVENTS_STORAGE_UNAVAILABLE` sin escribir, para que Stripe lo reenvíe y el evento no se pierda. Evento repetido: 200 `{ duplicate: true }`. Evento a medio procesar: 503 `EVENT_IN_PROGRESS` con `retry-after: 60` (Stripe lo reenvía). `no-store`. |
| `POST /api/v1/family/automatic-payment/authentication` | La familia confirma el pago con su banco: `{ action: "start" \| "check", organizationId, invoiceId }`. `start` da solo lo que necesita el navegador; `check` relee Stripe por el mismo camino que el evento. 503 con los cerrojos cerrados, 404 si no es la persona pagadora vigente, 409 `FAMILY_PAYMENT_CONFIRMATION_EXPIRED` o `…_CLOSED`, 502 si Stripe falla. 10 por minuto por cuenta, `private, no-store`. |
| `GET /familia/cuotas/justificante/[attemptId]` | Página del justificante (`no-store`). |
| `GET`/`POST /api/cron/collect-family-fees` | La de la Fase 3. Añade `circuitOpen` (sí/no) y `receipts: { sent, notSent, pending }` (o `null` si falló el envío). Envía los justificantes al final, después de los avisos. |

Eventos que se atienden (17): `payment_intent.processing`, `.succeeded`,
`.payment_failed`, `.requires_action`, `.canceled`; `charge.refunded`,
`refund.created`, `.updated`, `.failed`; `charge.dispute.created`,
`.updated`, `.closed`, `.funds_withdrawn`, `.funds_reinstated`;
`mandate.updated`; `payment_method.detached`; `setup_intent.succeeded`.

### Variables

| Variable | Uso |
|---|---|
| `ZALTYKO_FAMILY_COLLECTION_EVENTS_ENABLED` | Enciende la ruta de eventos y la confirmación con el banco. Apagada por defecto. |
| `ZALTYKO_FAMILY_COLLECTION_RECEIPTS_ENABLED` | Enciende el justificante. Apagada por defecto, hasta L6 (abogado/gestor). Sin ella no se escribe ni se envía ningún justificante, y encenderla no los crea para cobros anteriores. |
| `STRIPE_CONNECT_PAYMENTS_WEBHOOK_SECRET` | Secreto de firma del destino de eventos nuevo; distinto de `STRIPE_WEBHOOK_SECRET` y de `STRIPE_CONNECT_WEBHOOK_SECRET`. |

### Datos

- Candidata `docs/deployment/candidates/20261118120000_family_collection_events_candidate.sql`
  (SHA-256 en el README de candidatas). **No aplicada en ningún entorno.**
- `zaltyko.family_collection_attempts`: estado `requires_action` (solo
  tarjeta, con `pi_…`) y columna `action_deadline_at` (último día para
  confirmar). Cuenta como intento abierto.
- Tabla nueva `zaltyko.family_collection_disputes`: una fila por disputa
  (`dp_…`/`du_…`) y academia, con estado, importe, plazo y si ya se anotó en
  el libro. Derechos de datos: grupo opcional propio, solo recuento.
- Buzón de eventos: `zaltyko.payment_provider_events` (`processor 'stripe'`,
  `environment 'sandbox'`), una fila por `evt_…`, con un resumen de 5 claves
  y su huella; nunca el evento entero.
- Devoluciones y disputas perdidas: filas en `zaltyko.refunds`, una por
  reparto, con motivo (el de Stripe o `requested_by_academy`, `dispute_lost`,
  `sepa_returned`) y `provider_refund_id` = `{re_|pyr_|dp_|du_}:{id del reparto}`.
- Justificante: eventos `family_collection.receipt` y
  `family_collection.receipt_result` en el outbox, solo con ids.

### Estado

- Construida en la rama `cobros/fase4-eventos-stripe` (18-11-2026), con las
  dos banderas apagadas. Nada aplicado ni configurado en staging ni en
  producción.
- **Pasos de staging para la Tarea 14** (cada uno necesita la autorización de
  Elvis; no se han hecho):
  1. Stripe sandbox: crear un destino de eventos de cuentas conectadas
     (`@accounts`, eventos completos) hacia
     `https://staging.zaltyko.com/api/stripe/connect/payments-webhook` con los
     17 tipos de arriba.
  2. Vercel staging: `STRIPE_CONNECT_PAYMENTS_WEBHOOK_SECRET` (el secreto de
     ese destino) y `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` con la clave
     publicable de prueba (`pk_test_…`). Sin la clave publicable el portal no
     ofrece el botón «Confirmar el pago», aunque el correo a la familia y el
     panel de la academia lo esperen.
  3. Vercel staging: las dos banderas,
     `ZALTYKO_FAMILY_COLLECTION_EVENTS_ENABLED=true` y, solo para probar,
     `ZALTYKO_FAMILY_COLLECTION_RECEIPTS_ENABLED=true` (nunca con familias
     reales antes de L6).
  4. Supabase staging: aplicar la candidata de la Fase 4.
  5. Stripe sandbox (D13): revisar el destino antiguo que apunta a
     `/api/stripe/connect/webhook` y apagarlo o dejarle solo `account.updated`.
  6. Recorrido de prueba y comprobación de los datos de Stripe sin confirmar
     (ver «Deuda conocida»).
- En producción y Stripe Live no se hace nada, salvo lo que pide D13 si Elvis
  lo autoriza.

### Cerrojos y límites

- **El evento es un aviso, nunca la verdad.** Del cuerpo solo se leen `id`,
  `type`, `account`, `livemode`, `created` y el id y tipo del objeto. Todo lo
  demás se vuelve a leer en Stripe por id, en la cuenta conectada y fuera de
  toda transacción.
- **La cuenta del evento** tiene que ser la del intento y del entorno de
  prueba. Si no, se ignora (en el registro, solo ids).
- **Un solo camino que escribe en el libro:** los cobros pasan por el mismo
  camino que la relectura diaria; las devoluciones y disputas perdidas, por
  `recordProviderRefund`.
- **El orden de llegada no importa (ola final).**
  - Una devolución que llega antes de que el libro registre el cobro (intento
    aún abierto) registra primero el cobro por el camino de los cobros, como
    las disputas. Si aun así el intento sigue abierto y Stripe ya devolvió,
    el evento falla con `FAMILY_COLLECTION_REFUND_BEFORE_COLLECTION_RECORDED`
    y Stripe lo reenvía. Deuda: si el cobro nunca llega a registrarse (por
    ejemplo, el importe no cuadra y queda para revisar), Stripe deja de
    reenviar a los 3 días y esa devolución solo queda en el registro (solo
    ids) y en el panel de Stripe de la academia.
  - Una disputa cuyo `pi_…` no tiene ningún intento (uno `claimed` que se
    cayó antes de guardarlo) pasa antes por el camino de los cobros. Si aun
    así no aparece y la metadata del cobro apunta a un intento que sigue
    `claimed` en esa academia y esa cuenta conectada, el evento falla con
    `FAMILY_COLLECTION_DISPUTE_BEFORE_COLLECTION_RECORDED` y Stripe lo
    reenvía: la academia ve la disputa y su plazo para responder sin esperar
    a otro evento de la misma disputa. Si no, sin efecto (aviso en el
    registro, solo ids). El mismo criterio que las devoluciones.
  - Un cobro tardío que choca desde un evento con un reintento a medio crear
    deja antes el aviso `late_success_pending` (marca duradera) y después pide
    el reenvío.
  - Las cuotas con un cobro tardío en espera no reciben recordatorios.
  - La familia no puede confirmar con su banco si la autorización del intento
    ya no está activa, y solo la persona pagadora del intento ve el botón.
- **Idempotente por `evt_…`** y además cada efecto por sí mismo. El orden de
  llegada no importa.
- **Nunca dos cobros.** Un cobro tardío solo se registra después de anular
  el reintento pendiente y cancelar en Stripe cualquier hermano abierto. Si
  otro ya cobró, aviso de cobro doble (D10).
- **Nunca se borra un pago.** Lo que no cabe en lo repartido no escribe
  ninguna fila: aviso a la academia y evento procesado (nunca un 500 en
  bucle). La pasada diaria vuelve a leer en Stripe, durante 30 días desde el
  aviso, los cobros con una devolución que no cabía: si la academia repartió
  después el pago, la anota por el mismo camino; deja de leerlos en cuanto
  todas sus devoluciones quedan anotadas. Solo con la bandera de eventos
  (como el resto de devoluciones; también las de un cobro registrado tarde).
  Un cargo con más de 1000 devoluciones no se lee (error permanente: sin
  efecto y en el registro, nunca un 500 que Stripe reenviaría sin fin).
- **Ninguna cuota en el limbo:** todo intento `requires_action` tiene plazo
  y lo cierra el proceso diario. La única excepción es que, pasado el plazo,
  Stripe no deje leer ni cancelar el cobro de forma permanente (cuenta
  desconectada): el intento sigue abierto (su dinero pudo moverse) y la
  academia recibe el aviso `requires_action_unreadable`, que le abre «Marcar
  como revisado».
- **Cortacircuitos (D9):** con 3 rechazos 400 de la plataforma seguidos al
  crear cobros, o el 20 % a partir de 10, la pasada para de crear cobros y
  deja el resto para el día siguiente, sin cerrar más intentos. Un solo
  `logger.error` con dos contadores. Con el cortacircuitos abierto, la puesta
  al día deja de tomar intentos reanudables y devuelve su reanudación a los
  ya tomados sin procesar: un despliegue roto varios días no los agota.
  Ningún 400 de la plataforma cierra el intento, tampoco los de antes de que
  salte (revisión de la PR #354, punto 1): se queda reclamado sin cobro
  (`platform_invalid_request`) y la puesta al día lo reanuda otro día. Si el
  rechazo sigue, al agotar sus reanudaciones se cierra `failed`
  `transient_exhausted` y la cuota vuelve al cobro manual (o la academia
  recibe el aviso `resume_exhausted`); mientras tanto la cuota no recibe
  recordatorios.
- **Buzón de eventos:** el cierre de un evento lleva un testigo (el número de
  entrega): una entrega vieja que termina tarde no pisa el cierre de otra más
  nueva. Un efecto con un id que no se puede guardar se cierra sin él (nunca
  un 500 tras aplicarlo). El mismo `evt_…` guardado en otra academia
  responde 200 duplicado y queda en el registro, solo con ids.
- **Método de pago guardado con el navegador cerrado:** el aviso
  `setup_intent.succeeded` solo lo activa si quien empezó la preparación
  sigue siendo la persona pagadora vigente de la familia.
- **Revocar un método** (tarjeta quitada en Stripe u orden SEPA inactiva)
  siempre se puede, aunque la bandera de la Fase 2 esté apagada.
- Solo referencias opacas en registros y respuestas: nunca mensajes de
  Stripe, IBAN, tarjeta ni nombres. El secreto del cobro para confirmar con el
  banco solo viaja a la persona pagadora y nunca se registra.

### Deuda conocida

- **Eventos completos ya guardados (D13).** Las filas antiguas de
  `billing_events` del webhook Standard v1 conservan el evento entero, también
  al reintentarse, hasta que Elvis autorice vaciarlas. Las nuevas guardan
  solo un resumen.
- **Destino antiguo (D13).** Antes del primer cobro real hay que revisar y
  apagar o filtrar el destino que apunta a `/api/stripe/connect/webhook`, en
  sandbox y en Live.
- **`src/app/api/marketplace/webhook/route.ts`** también guarda eventos
  enteros de Stripe en `billing_events.payload`. Fuera de alcance; va con la
  PR aparte de D8, igual que la retirada del código Standard v1.
- **Eventos perdidos con la bandera apagada:** no se ven en Zaltyko; Stripe
  permite reenviar los de los últimos 30 días.
- **Devolución anulada después en Stripe:** no toca el libro. La academia
  recibe el aviso `refund_reversed`; la familia sigue viendo «Devuelto».
- **Búsqueda por id de devolución:** `provider_refund_id` lleva el sufijo del
  reparto (`{re_|pyr_|dp_|du_}:{id del reparto}`); hay que buscar por prefijo.
- **Devolución parcial de varias cuotas:** se reparte de la más antigua a la
  más nueva.
- **Cortacircuitos:** estado en memoria por pasada (un relanzamiento manual
  el mismo día empieza cerrado); un despliegue roto que haga responder
  `resource_missing` a todas las cuentas no lo dispara (esos los cierra la
  regla de siempre y las cuotas pasan a manual).
- **Justificante:** «sin correo» y «academia inactiva» son definitivos para
  ese justificante (para L6); el de una domiciliación confirmada por evento
  sale en la pasada diaria siguiente; bandera apagada hasta L6. Si falla la
  preparación del correo, queda «no entregado» sin reintentar (la página
  sigue disponible). El correo no menciona devoluciones ni disputas: solo la
  página.
- **Pendientes legales:** L4 (aviso previo de cada adeudo SEPA) y L6
  (abogado/gestor).
- **Datos de Stripe sin confirmar** (Tarea 14, staging): resultado de un
  cobro sin presencia cuando el banco pide confirmar; confirmar el mismo cobro
  desde el navegador sobre la cuenta conectada; estado inicial y prefijo de
  la devolución del banco en SEPA; ids de devolución `pyr_`; lista de
  devoluciones de un cargo SEPA; `payment_method.detached` cuando la academia
  quita una tarjeta; `account` en los eventos de cuentas conectadas.

## Alcance

- Stripe Connect Standard por academia.
- SetupIntent + Stripe Elements para tarjeta familiar.
- Cobro familiar automático con PaymentIntent off-session: previsto, no
  liberado en este lanzamiento.
- Cobro manual desde el panel.
- Recordatorios `-3`, `0`, `+3` y `+7` días.
- Reembolsos parciales y totales.
- Recibos internos.
- Dashboard de recaudación.
- Bizum, efectivo y transferencia como pagos manuales.

No incluye facturación fiscal, VeriFactu ni custodia de fondos.

## Arquitectura

- Direct charges sobre la cuenta conectada mediante `Stripe-Account`.
- Zaltyko guarda identificadores Stripe, marca y últimos cuatro dígitos; nunca PAN ni CVC.
- Webhooks firmados actualizan el ledger.
- `billing_events` evita procesar dos veces el mismo evento.
- `pg_advisory_xact_lock` e idempotency keys protegen contra cobros duplicados.
- `verifyAcademyAccess` y RLS aíslan academias.

## Variables

| Variable | Uso |
|---|---|
| `STRIPE_SECRET_KEY` | Plataforma y operaciones sobre cuentas conectadas |
| `STRIPE_WEBHOOK_SECRET` | Webhook de suscripción SaaS |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Webhook de cuentas conectadas |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe.js y Elements |

Los webhooks de plataforma y Connect deben tener secretos distintos.

## Datos

| Tabla | Propósito |
|---|---|
| `stripe_accounts` | Estado de la cuenta Connect por academia |
| `family_stripe_customers` | Customer y método familiar por academia |
| `payment_attempts` | Trazabilidad de intentos |
| `refunds` | Reembolsos |
| `charges` | Ledger de cargos y estado reconciliado |

## Endpoints principales

### Academia

- `POST /api/payments/connect/onboard`
- `GET /api/payments/connect/status`
- `POST /api/payments/connect/refresh`
- `POST /api/charges/[id]/collect`
- `POST /api/charges/[id]/refund`
- `GET /api/billing/collection-stats`

### Familia

- `POST /api/family/payment-method/setup-intent`
- `GET|POST|DELETE /api/family/payment-method`
- `POST /api/family/charges/[id]/pay`
- `GET /api/family/charges/[id]/receipt`

### Webhook y cron

- `POST /api/stripe/connect/webhook`
- `GET /api/cron/collect-charges`
- `GET /api/cron/payment-reminders`

## Estado verificado (modelo Standard v1 retirado)

> Este bloque y la lista «Pendiente antes de academia piloto» son del modelo
> Stripe Connect Standard v1 (`stripe_accounts`, webhook v1). Se conservan como
> registro histórico; no describen «Conectar Stripe (Fase 1)».

- Migraciones del módulo aplicadas a producción.
- Webhook Connect registrado en `https://zaltyko.com/api/stripe/connect/webhook`.
- Onboarding Connect probado end-to-end en Stripe test mode.
- Corregido el retorno de onboarding a Ajustes → Cobros.
- Tests unitarios e integración cubren éxito, rechazo, SCA, reembolso, idempotencia y protección lógica contra doble cobro.

## Pendiente antes de academia piloto

- [ ] Confirmar variables Connect correctas en el deployment activo.
- [ ] Guardar tarjeta real de prueba mediante Elements.
- [ ] Ejecutar cobro inmediato.
- [ ] Ejecutar cobro off-session.
- [ ] Verificar SCA/3DS y recuperación de `requires_action`.
- [ ] Verificar tarjeta rechazada y notificación.
- [ ] Verificar reembolso parcial y total.
- [ ] Confirmar reconciliación de todos los webhooks.
- [ ] Confirmar que reintentos y eventos repetidos no duplican efectos.
- [ ] Verificar recibo interno y copy no fiscal.
- [ ] Revisar logs sin secretos ni datos sensibles.

No usar claves live ni cobrar a una familia real para completar QA. El paso a producción real requiere una academia piloto informada y un flujo de rollback.
