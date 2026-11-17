# ADR-0028 — Cobro automático de cuotas con Stripe Connect (tarjeta y SEPA)

- Estado: **aceptada** por Elvis el 16-11-2026 (decisiones D1–D4 y documento
  completo). La Fase 1 (conectar Stripe) está construida en la PR #347,
  detrás de la bandera `ZALTYKO_CONNECT_ONBOARDING_ENABLED` (apagada). La
  migración candidata está aplicada en staging el 16-11-2026 con autorización
  de Elvis y sin aplicar en producción. El cobro sigue cerrado.
- La Fase 2 (la familia guarda tarjeta o domiciliación) está construida en
  la PR #348 (fusionada y publicada con la bandera
  `ZALTYKO_FAMILY_PAYMENT_METHODS_ENABLED` apagada en producción). Su
  migración candidata (`20261116180000_family_payment_methods_candidate.sql`)
  está **aplicada en staging** el 17-11-2026, con la bandera encendida allí,
  según la sesión coordinadora; en producción **no está aplicada** y necesita
  otra autorización de Elvis. Tampoco se cobra nada.
- La Fase 3 (proceso de cobro automático) está construida en la PR #349,
  detrás de la bandera `ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_ENABLED`
  (apagada). Su migración candidata
  (`20261117120000_family_collection_candidate.sql`) **no está aplicada en
  ningún entorno** y el trabajo de pg_cron `zaltyko-collect-family-fees`
  **no está programado** en ningún entorno: cada paso, en staging y en
  producción, necesita otra autorización de Elvis (las de las Fases 1 y 2 no
  la cubren). Aunque se encendiera, cobra solo con clave de prueba de Stripe y
  nunca contra la base de producción.
- El 17-11-2026 Elvis decidió cinco cosas más de la Fase 3 (día fijo,
  reintentos de tarjeta, «Primero solo tarjeta», aviso a la familia en el
  primer fallo y texto de costes): ver «Decisiones de Elvis del 17-11-2026».
  La domiciliación tiene su propia bandera,
  `ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_SEPA_ENABLED` (apagada).
- Autorizado por Elvis para la Fase 1, solo en staging:
  - destino de eventos en Stripe sandbox;
  - secreto y bandera en Vercel staging;
  - migración candidata en Supabase staging.
- Fecha: 2026-11-16.
- Relacionados: ADR-0020 (preferencia y entitlement), ADR-0022 (cuenta
  conectada por academia), ADR-0025 (cobros separados de la inscripción),
  ADR-0026 (cuota mensual), ADR-0016 (planificador).
- Sustituye en parte: la «línea roja» de lanzamiento descrita en
  `src/lib/launch/essential-routes.ts` y en
  `docs/qa/legacy-surface-closure-2026-11-09.md` (ver D1).

## Contexto

Hoy ninguna academia puede cobrar de forma automática (auditoría del 16-11-2026):

- El código de Stripe para familias (`src/lib/stripe/*`, rutas
  `/api/payments/connect/*`, `/api/family/payment-method*`,
  `/api/charges/[id]/collect`, `/api/cron/collect-charges`) está cerrado con
  410 `FAMILY_AUTOMATIC_COLLECTION_DISABLED`.
- Ese código es **Connect Standard (Accounts v1)**, solo acepta tarjeta, no
  aplica `application_fee` y escribe en el modelo antiguo (`public.charges`,
  `stripe_accounts`). No escribe en el libro de cuotas canónico
  (`zaltyko.invoices` / `zaltyko.charges`, ADR-0025/0026), que es el que está
  en producción.
- El webhook Connect (`/api/stripe/connect/webhook`) sigue activo, pero también
  escribe en el modelo antiguo.
- `/familia/cuotas` es de solo lectura.
- En producción ya funcionan las cuotas manuales, los pagos manuales y los
  recordatorios de impago.

Lo que ya está preparado en el modelo canónico:

- `zaltyko.organization_payment_provider_accounts`: una cuenta por academia,
  procesador y entorno. Las restricciones solo admiten Accounts v2, cargo
  directo, panel completo, comisiones cobradas por Stripe y pérdidas a cargo
  de Stripe (ADR-0022).
- `zaltyko.family_payment_authorizations`: autorización por pagador y cuenta
  conectada, con `mandate_reference`, versión de consentimiento, evidencia
  (`consent_evidence_reference` + SHA-256), tutor que consiente, caducidad y
  revocación. Admite una sola autorización activa por pagador y cuenta.
- `evaluateCollectionEligibility`
  (`src/modules/billing/domain/collection-eligibility.ts`) es la puerta
  fail-closed. Exige academia activa, plan de pago vigente, preferencia
  automática de la revisión de plan actual, cargo marcado automático, cuenta
  `active` con `card_payments` `active`, autorización activa con
  consentimiento completo y `runtimeEnabled`.

**Comprobado en Stripe sandbox (solo lectura, 16-11-2026).** En el «Entorno
de prueba de Zaltyko», `GET /v2/core/accounts` responde y ya existe una cuenta
v2 con configuración `merchant`, `dashboard: full` y
`fees_collector`/`losses_collector` = `stripe`. Connect está activo y hay
cuentas de prueba en España. **En Live no está verificado.**

## Decisiones de Elvis (16-11-2026)

### D1. Se levanta la línea roja, solo para cuotas

Se permite cobrar a familias a través de Zaltyko **solo** para pagar cuotas del
libro de cuotas canónico. El dinero va a la cuenta Stripe de la propia academia.

Siguen cerradas con 410:

- marketplace, checkout público y productos;
- publicidad, `/api/docs` y subdominios;
- el resto de prefijos de `RETIRED_LAUNCH_API_PREFIXES`.

El prefijo `/api/academy/stripe-connect` sigue retirado: el flujo nuevo usa
rutas nuevas (ver Fase 1).

Cada fase va detrás de su propio interruptor por entorno, apagado por defecto:

- `ZALTYKO_CONNECT_ONBOARDING_ENABLED` (Fase 1);
- `ZALTYKO_FAMILY_PAYMENT_METHODS_ENABLED` (Fase 2);
- `ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_ENABLED` (Fases 3–4). Es el
  `runtimeEnabled` de la puerta de elegibilidad.

Orden de activación: primero staging con Stripe sandbox. Producción y Stripe
Live solo con autorización expresa de Elvis en cada paso.

### D2. Accounts v2, cargo directo, panel completo

Es el modelo de ADR-0022, sin cambios:

- La academia tiene su Stripe completo y es el comercio que cobra (*merchant of
  record*).
- La academia paga las comisiones de Stripe.
- Stripe asume los saldos negativos.
- Las devoluciones y disputas las gestiona la cuenta de la academia.
- Zaltyko no custodia fondos ni guarda tarjetas ni IBAN. Solo guarda
  referencias opacas (`acct_…`, `seti_…`, `pm_…`, `mandate_…`, `pi_…`).

El código Standard v1 antiguo no se reutiliza para el flujo nuevo. Queda
cerrado y se retirará cuando el nuevo lo sustituya (Fase 4).

### D3. Sin comisión de Zaltyko

No hay `application_fee_amount`. Zaltyko gana con los planes Starter y Growth.

Consecuencias:

- no cambia ningún precio;
- no hay facturas ZA por comisiones;
- el dinero de las familias nunca pasa por la cuenta de Zaltyko.

Si algún día se quisiera comisión, sería otro ADR, con decisión de precio y
revisión fiscal.

Cómo se dice en pantalla (decisión de Elvis del 17-11-2026, ver «(e)» más
abajo): «Stripe cobra su tarifa por cada pago a la academia; Zaltyko no cobra
comisión.», sin cifras.

### D4. Tarjeta y domiciliación SEPA

La familia puede guardar una tarjeta o firmar una orden de domiciliación SEPA
(IBAN). En ambos casos se hace con un SetupIntent **en la cuenta conectada de la
academia**. La orden SEPA se firma con la academia como acreedora.

Para SEPA:

- La confirmación es asíncrona: unos días en `processing`.
- El banco puede devolver el adeudo después de cobrado. Se trata en la Fase 4
  como impago revertido.
- Se usa el aviso previo al adeudo que envía Stripe por defecto, salvo que el
  abogado pida otra cosa (pregunta L4).

## Alcance y exclusiones

- **País:** España primero. SEPA solo existe en la zona euro.
  - México podría llegar después, solo con tarjeta, cuando se compruebe que una
    cuenta conectada mexicana funciona con esta plataforma española.
  - El registro sigue abierto a cualquier país: una academia sin cobro
    automático disponible sigue en manual y ve un aviso claro.
- **Plan:** el cobro automático es una función de Starter y Growth (ya decidido
  en ADR-0020; la puerta exige plan de pago). Free cobra en manual.
- **Fuera de este ADR:**
  - la suscripción SaaS de la academia (Starter/Growth) y su IVA y facturas ZA,
    que es otra línea de trabajo;
  - las facturas fiscales de las academias a sus familias;
  - VeriFactu;
  - las comisiones.

## Diseño por fases

Cada fase es una PR revisada por la sesión coordinadora y probada en
staging.zaltyko.com con Stripe sandbox. No hay builds, tests ni instalaciones
en el Mac: la verificación es en CI y en staging. Las migraciones van primero
como candidatas, con autorización por entorno.

### Fase 1 — Conectar Stripe (onboarding de la academia)

**Quién:**

- Owner, o admin con acceso a todas las sedes, como en ADR-0020.
- Academia con plan de pago vigente (*mi propuesta*; ver «Decisiones mías»).

**Pantalla.** Bloque «Cobro automático de cuotas» en `/owner/settings` (o
`/owner/payments`; ver «Decisiones mías»). Estados en lenguaje de academia:

1. **Sin conectar:**
   - Texto: «Conecta tu cuenta de Stripe para que las cuotas se cobren solas.
     El dinero llega directo a tu cuenta.»
   - Botón «Conectar Stripe».
2. **Pendiente de datos:**
   - Texto: «Stripe necesita más datos de tu academia».
   - Botón «Seguir en Stripe».
3. **En revisión:**
   - Texto: «Stripe está revisando tus datos».
4. **Lista para cobrar:**
   - Tarjeta y domiciliación, cada una activa o no.
   - Enlace a tu panel de Stripe.
5. **Con problemas:**
   - Qué falta, en palabras sencillas, y botón para resolverlo en Stripe.

**Servidor.** Módulo nuevo `src/modules/payments-connect/`. No vive en
`src/lib/stripe/*` legacy.

1. `POST` de conexión:
   - Crea, de forma idempotente por organización y entorno, una cuenta
     `v2/core/accounts` con:
     - configuración `merchant`;
     - capacidades `card_payments` y `sepa_debit_payments` solicitadas;
     - `dashboard: full`;
     - responsabilidades `stripe`/`stripe`;
     - país de la academia y moneda por defecto `eur`.
   - Guarda la fila en `organization_payment_provider_accounts` con estado
     `onboarding`.
   - Si la fila ya existe, la reutiliza.
   - Crea un enlace de onboarding alojado por Stripe (Account Links v2) y
     devuelve su URL.
   - La llamada a Stripe nunca se hace dentro de una transacción abierta.
2. Retorno y refresco:
   - Al volver de Stripe y al abrir la pantalla, el servidor lee la cuenta v2
     (requisitos y estado de capacidades), con límite de frecuencia.
   - Proyecta el estado y aumenta `revision`.
   - Escribe auditoría y outbox.
3. Eventos de cuenta:
   - Endpoint nuevo para eventos *thin* v2 de cuenta: requisitos y capacidades
     de `merchant` actualizados.
   - Verifica la firma y vuelve a leer la cuenta antes de proyectar.
   - Valida que el `acct_…` y el entorno correspondan a una fila existente.
   - Es idempotente por id de evento.
   - Así se cumple la frescura que exige ADR-0022 (`last_synced_at` +
     `last_provider_event_reference`).
4. Mapa de estados. El estado de la cuenta depende solo de la tarjeta; SEPA
   se sigue en su propia columna.
   - `pending` (valor del enum de base): no se usa. La fila nace en
     `onboarding` al crear la cuenta, antes de usar el enlace.
   - `onboarding`: hay requisitos exigibles (*currently due*) o vencidos
     (*past due*). Los de la academia (`user_action`, o `past_due` si están
     vencidos) se ven como «Stripe necesita más datos de tu academia» con
     «Seguir en Stripe»; los que esperan a Stripe (`stripe_review`), como «En
     revisión». Una cuenta v2 recién creada trae todos sus requisitos vencidos
     y la tarjeta `restricted`: es «Pendiente de datos», no un problema
     (regla R10, comprobado en el sandbox).
   - `restricted`: sin requisitos exigibles ni vencidos (nada que la academia
     pueda rellenar), la tarjeta está `restricted` o `unsupported`. Es el
     único caso «Con problemas».
   - `active`: no hay requisitos vencidos ni pendientes y `card_payments` está
     `active`, aunque SEPA siga pendiente. Así la tarjeta no queda bloqueada
     esperando a la domiciliación.
   - `disabled`: cuenta cerrada o rechazada.
   - `sepa_debit_payments_capability_status`: es informativa en la Fase 1. En
     la Fase 2 condiciona que se pueda firmar una domiciliación: hace falta
     que esté `active`. La pantalla muestra «Tarjeta: activa · Domiciliación:
     pendiente».
5. País:
   - En la Fase 1 solo pueden conectar las academias con país España (`ES`).
   - El país de una cuenta Stripe no se puede cambiar después. Crear cuentas
     de otros países con SEPA y moneda `eur` dejaría cuentas que habría que
     cerrar.
   - Las demás academias ven «El cobro automático llegará más adelante a tu
     país; mientras tanto, registra los pagos a mano».
6. Cuentas Standard v1 antiguas (`stripe_accounts`):
   - Se ignoran. Connect nunca se abrió a academias reales (línea roja), así
     que no hay ninguna conectada de verdad.
   - El webhook antiguo no escribe nada para cuentas que no conoce, así que
     no choca con las nuevas.

**Migración candidata de Fase 1.** Añadir a
`organization_payment_provider_accounts`:

- `sepa_debit_payments_capability_status`;
- un resumen mínimo de requisitos pendientes (códigos, no datos personales).

Se aplica en staging y luego en producción, cada una con autorización.

**Preparación de staging (escrituras en proveedores, cada una con autorización
de Elvis):**

- En Stripe sandbox, un destino de eventos v2 para las cuentas conectadas que
  apunte a staging.
- En Vercel staging:
  - el secreto de firma `STRIPE_CONNECT_ACCOUNTS_WEBHOOK_SECRET`;
  - `ZALTYKO_CONNECT_ONBOARDING_ENABLED=true`.
- Comprobar que `STRIPE_SECRET_KEY` de staging pertenece al «Entorno de prueba
  de Zaltyko».
- Aplicar la migración candidata en Supabase staging.

**Salida de Fase 1:**

- En staging, una academia de prueba conecta una cuenta sandbox nueva, vuelve
  y ve «Lista para cobrar».
- Los eventos de cuenta actualizan el estado.
- Sigue sin existir ningún cobro.

### Fase 2 — La familia guarda tarjeta o firma la domiciliación

- En `/familia`, el tutor pagador elige tarjeta o domiciliación.
  - Payment Element con `stripeAccount` = cuenta de la academia y SetupIntent
    creado en el servidor para esa cuenta.
  - Customer en la cuenta conectada, uno por `family_payer`.
  - Solo puede hacerlo el tutor vinculado como pagador.
- Antes de confirmar, la familia ve:
  - el texto de autorización versionado (`consent_version`);
  - para SEPA, el texto de orden de Stripe con la academia como acreedora.
- La evidencia se guarda resumida, sin IBAN ni tarjeta: versión, fecha, tutor,
  IP/agente truncados y SHA-256 del texto aceptado.
- `family_payment_authorizations`:
  - pasa a `active` solo cuando el SetupIntent ha terminado bien;
  - para SEPA guarda `mandate_reference`.
- Revocar:
  - botón «Dejar de pagar automáticamente» en `/familia`, y también desde
    `/owner/familias`;
  - desliga el método en Stripe y marca `revoked`;
  - los cargos ya enviados siguen su curso.
- Cambiar de método crea una autorización nueva y revoca la anterior en la
  misma operación.

### Fase 3 — Proceso de cobro automático

- Se permite `collection_mode=automatic`:
  - se quitan los 410 de `ledger-service.ts` y
    `family-collection-preferences.ts`;
  - se mantiene la puerta de plan, revisión y preferencia de ADR-0020.
- Una ruta cron nueva (`/api/cron/collect-family-fees`), lanzada por pg_cron
  como el resto (`docs/deployment/scheduler/`), con lease para no solaparse.
- Para cada cargo automático vencido:
  - se vuelve a cargar todo y se pasa por `evaluateCollectionEligibility`
    justo antes de cobrar;
  - se crea un PaymentIntent *off-session* en la cuenta conectada, con clave
    de idempotencia derivada de la factura y su número de intento (un cobro
    por familia, sede y mes; ver P1);
  - se registra el intento en una tabla nueva de intentos de cobro (migración
    candidata).
- Bloqueo de carreras: un cargo con intento en curso no admite pago manual sin
  cancelar antes el intento, y viceversa.
- Día de cobro y reintentos: según las respuestas P2 y P3 (abajo) y las
  decisiones de Elvis del 17-11-2026 (P3 nueva: hasta 3 reintentos de
  tarjeta; la domiciliación no se cobra sola hasta la Fase 4).
- Plan detallado: `docs/superpowers/plans/2026-11-16-cobro-automatico-fase3-cobro-de-cuotas.md`.
- Cómo quedó construida (rutas, pantallas, estados, cerrojos y deuda):
  `docs/COBROS_Y_CUOTAS.md`, «Cobro automático de cuotas (Fase 3)», y
  «Decisiones mías», 15–27.

### Fase 4 — Webhook Connect sobre el libro de cuotas

- El webhook Connect deja de escribir en el modelo antiguo y aplica efectos
  idempotentes en `zaltyko.charges`/pagos.
- Estados que trata:
  - `processing` (SEPA);
  - `succeeded`;
  - `payment_failed`;
  - `requires_action` (SCA);
  - devoluciones (`charge.refunded`);
  - disputas y devoluciones SEPA.
- Recuperación SCA en `/familia`: la familia completa el 3DS desde un enlace.
- Recibo interno «no es factura» para la familia.
- Retirada del código Standard v1 y de las rutas antiguas.

### Fase 5 — QA y piloto

- Lista de `docs/COBROS_Y_CUOTAS.md` (pendiente antes de academia piloto).
- Vuelven los E2E de Connect y 3DS.
- Piloto con una academia informada:
  - plan de vuelta atrás: apagar el interruptor y pasar a manual;
  - Stripe Live solo con autorización expresa.

## Decisiones mías (Claude), corregibles

1. **Onboarding alojado por Stripe** (enlace a Stripe y vuelta), no
   componentes embebidos. Es menos código, Stripe lo mantiene, está en español
   y cumple igual. Los embebidos se pueden añadir después.
2. **Conectar Stripe requiere plan de pago vigente, sin contar la prueba.**
   - Usa la misma regla de plan que la puerta de cobro (ADR-0020).
   - Evita cuentas Stripe que nunca podrán cobrar.
   - Deja una sola regla para la academia: «el cobro automático es de Starter
     y Growth».
3. **Ubicación:** bloque en `/owner/settings`, con un acceso desde
   `/owner/payments` cuando no hay cuenta conectada.
4. **Interruptores separados por fase**, para poder probar el onboarding en
   staging sin abrir nada más.
5. **«Lista para cobrar» depende solo de la tarjeta.** SEPA pendiente no
   bloquea la tarjeta; firmar una domiciliación exige SEPA activa (Fase 2).
6. **Fase 1 solo para academias de España**, porque el país de una cuenta
   Stripe no se puede cambiar.
7. **Se ignoran las cuentas Standard v1 antiguas**: nunca hubo academias reales
   conectadas.
8. **El entorno lo decide la clave de Stripe del despliegue** (test en staging,
   live en producción). Nunca se cruza una cuenta de un entorno con otro: ya lo
   impiden las FK y la puerta.
9. **R11, segundo cerrojo independiente de la clave.** Aunque la clave sea de
   prueba, la Fase 1 queda cerrada (`live_not_released`) si la base del
   despliegue es la Supabase de producción (su ref está en
   `src/lib/launch/production-supabase.ts`, compartida con el middleware), y
   el webhook ignora los eventos. No se usa `VERCEL_ENV`: staging es un
   despliegue «production» del proyecto zaltyko-staging. En la Fase 1 no
   existe ninguna bandera para abrir Live ni producción.

### Fase 2

10. **Tabla nueva de intentos como evidencia, y Customer reutilizado.**
    - `family_payment_authorizations` exige `payment_method_reference`
      (`pm_…`) desde que nace la fila, y no tiene sitio para el Customer ni
      para la evidencia del consentimiento. Por eso cada intento de guardar
      un método va a `zaltyko.family_payment_setup_attempts`: Customer
      (`cus_…`), preparación (`seti_…`), pagador, tutor, tipo y evidencia
      recortada (versión, fecha, IP `/24` o `/48`, agente de 120 caracteres
      como máximo y SHA-256 del texto exacto).
    - La autorización `active` solo se crea cuando Stripe confirma que la
      preparación ha terminado bien. Apunta a su intento con
      `consent_evidence_reference = "family_payment_setup_attempts:<id>"`.
    - El Customer es uno por pagador y cuenta conectada. Se reutiliza el del
      último intento de ese pagador en esa cuenta; si no hay ninguno, se crea
      sin correo ni nombre, con una clave de idempotencia por cuenta y
      pagador.
    - Si este esquema resultara incorrecto, se corrige con otra candidata.
11. **Texto de consentimiento en borrador**, versión `borrador-2026-11-16`,
    sin valor legal hasta que el abogado responda L3. Staging necesita un
    texto para probar; en producción la función sigue cerrada por la bandera
    y por R11. Cambiar el texto exige cambiar la versión. Para la
    domiciliación, el texto de la orden lo muestra el propio formulario de
    Stripe, con la academia como acreedora: Zaltyko no lo redacta.
12. **Sin respaldo por evento hasta la Fase 4.** La autorización se activa
    cuando la página de la familia avisa al servidor (también al volver de la
    verificación del banco). Si la familia cierra el navegador justo después,
    el método queda guardado en Stripe pero no activo en Zaltyko, y tiene que
    repetir el proceso. Menos superficie ahora; la Fase 4 lo cubrirá con el
    evento `setup_intent.succeeded`.
13. **Revocar marca primero y desliga después.** La marca `revoked` es lo que
    impedirá cobrar en la Fase 3, así que se guarda antes, en su
    transacción. Después se desliga el método en Stripe. Si Stripe falla,
    queda un `logger.error` con ids opacos y la revocación se mantiene: el
    método sigue vivo en Stripe hasta un reintento manual. Revocar **no**
    exige la bandera de esta fase, ni que la academia siga lista, ni que tenga
    plan: dejar de pagar siempre debe poder hacerse. Sí exige la clave de
    prueba, la base que no es la de producción (R11) y el almacenamiento de
    las Fases 1 y 2. Con la bandera apagada, la familia solo ve el método que
    ya tenía (sin poder cambiarlo) y la academia ve y retira los activos;
    guardar o cambiar un método sigue cerrado.
14. **Una sola autorización activa por pagador y cuenta conectada.** Ya lo
    garantiza `family_payment_authorizations_active_method_uq`. Cambiar de
    método revoca la anterior en la misma transacción que activa la nueva, y
    el método anterior se desliga en Stripe después del commit.

### Fase 3

15. **Tabla propia de intentos de cobro, sin reutilizar `payment_attempts`.**
    `zaltyko.family_collection_attempts` guarda cada intento de cobrar una
    factura mensual, con su reparto entre cuotas
    (`family_collection_attempt_charges`). La tabla canónica
    `payment_attempts` exige la referencia de Stripe antes de llamar, no
    enlaza cuotas y usa `sandbox|live` en vez del `test|live` de la cuenta
    conectada. La base garantiza un solo intento abierto por factura (índice
    único parcial), como mucho cinco intentos por factura y tres
    reanudaciones por intento. Desde la ronda de revisión de la PR #349
    (17-11-2026) también garantiza **un solo cobro registrado por factura**
    (índice único parcial `(organization_id, invoice_id) where status =
    'succeeded'`) y que **solo una tarjeta en los intentos 1 a 3 puede tener
    reintento pendiente** (CHECK `family_collection_attempts_next_retry_card_only`).
    La candidata queda con SHA-256 `cee3e0aa…`
    (`docs/deployment/candidates/README.md`). El día de cobro vive en
    `organization_collection_settings`.
16. **Crear y confirmar el cobro por separado.** Primero se reclama el
    intento en la base; luego se crea el cobro en Stripe sin confirmar, se
    guarda su `pi_…` y después se confirma. Cada paso tiene su clave de
    idempotencia (factura y número de intento). Al reanudar se usa el `pi_…`
    guardado o se busca el cobro por la metadata del intento antes de crear
    otro, porque las claves de Stripe caducan a las 24 h y el proceso es
    diario. `off_session` y la orden SEPA van en la confirmación: Stripe no
    los admite al crear sin confirmar.
17. **Nunca un intento «fallido» sin leer Stripe.** Un error sin cobro en
    Stripe se trata como pasajero y se vuelve a mirar al día siguiente. Si
    aparecen varios cobros para un mismo intento, o un conflicto de
    idempotencia, se avisa a la academia para revisarlo y el intento queda
    abierto: nunca se marca como fallido ni se crea otro.
18. **Todo cobro hecho queda registrado.** El pago (`payments`, origen
    `provider`) se graba en una transacción que no puede fallar por saldos.
    El reparto entre cuotas va después y lo que no quepa (cuota ya pagada a
    mano, anulada, importe distinto) queda sin repartir, con un aviso de
    revisión a la academia.
19. **La puerta se repite el día del cobro, con todo recargado.** Además de
    `evaluateCollectionEligibility`, cada cuota del cobro debe tener el
    pagador de la factura, ese pagador debe estar vigente hoy (fila de
    `family_payers` abierta en la fecha local de la sede, tutor y vínculo
    activos) y la cuenta conectada debe haberse releído en Stripe en la
    última hora (si no, se relee antes). Los motivos se dividen en pasajeros
    (bandera, cerrojos, plan, cuenta sin releer: se espera) y finales
    (familia en manual, método revocado, pagador que ya no es el vigente,
    moneda que no es euro, etc.): un motivo final escribe un intento
    `canceled` con su código y la cuota vuelve al cobro manual con
    recordatorios. Así ninguna cuota queda «en el limbo». Y una **ventana
    máxima de cobro**: pasada la espera de los recordatorios (3 días después
    de la fecha de cobro, o de la del reintento) ya no se cobra nunca, aunque
    la puerta deje pasar; se escribe un intento `canceled`
    (`collection_window_expired`). La cuota ya volvió a los recordatorios y
    la familia pudo pagarla a mano: cobrarla después sería un doble pago.
20. **Con la bandera apagada, solo puesta al día.** El proceso diario
    siempre relee y registra lo que ya se envió a Stripe (con los cerrojos
    de entorno), pero solo cobra cuotas nuevas con la bandera encendida.
    Apagarla nunca deja un cobro hecho sin registrar.
21. **Orden de bloqueo único:** academia → cuotas por id → factura →
    intento, en el proceso diario, en el pago manual y en las acciones de la
    academia. Las llamadas a Stripe nunca van dentro de una transacción.
22. **Pago manual y cobro automático.** Con un intento en curso (reclamado,
    creado o en proceso) el pago manual responde 409 «Esta cuota se está
    cobrando automáticamente. Espera al resultado.». Si solo queda un
    reintento pendiente, el pago manual lo cancela en la misma transacción.
    Esto vale también con la bandera apagada.
23. **Dos acciones de la academia en `/owner/payments`:** «Cancelar el cobro
    automático» (reintento pendiente, o cobro creado y aún no cobrado, tras
    cancelarlo en Stripe) y «Marcar como revisado» (intento abierto con aviso
    de revisión, con las reanudaciones agotadas o reclamado o creado sin
    cambios desde hace más de 24 h, la salida si el proceso diario deja de
    pasar; con la casilla «He comprobado el cobro en Stripe»). Ninguna cierra un intento cuyo dinero se
    movió: si Stripe ya lo cobró, se registra el pago; si hay varios cobros y
    alguno movió dinero, se pide resolverlo con el soporte de Stripe (salvo
    los dos casos `reviewed_unverifiable` de la re-revisión del 17-11). No
    exigen la bandera: con la función apagada se tiene que poder cerrar lo
    abierto. Si el cobro pendiente ya no puede llegar (sin plan de pago,
    familia en manual, método revocado o cambio de plan), la academia ve «Se
    cobrará a mano» con el motivo y la familia no ve ninguna promesa de
    cobro.
24. **Recordatorios.** Una cuota automática no recibe recordatorios mientras
    su cobro está en curso o tiene un reintento pendiente; vuelve a
    recibirlos si el cobro falla sin reintento o se cancela, y también 3 días
    después de la fecha prevista si no llegó a haber ningún intento (ver
    «Reglas añadidas al construir»). Con la bandera apagada se trata como
    manual, **salvo** que tenga un cobro en marcha (reclamado, creado o en
    proceso): ese retiene los recordatorios siempre, con la bandera apagada o
    con los cerrojos cerrados (ver «Añadidos de la ronda de revisión»).
25. **Solo euros.** El libro guarda `EUR` y Stripe recibe `eur`. Una factura
    mensual en otra moneda se cierra con un intento `canceled`
    (`unsupported_currency`) y sigue en manual.
26. **Pantallas.** El interruptor «Cobrar automáticamente» por familia vive
    en el panel de la Fase 2 de `/owner/familias` (solo tiene sentido con un
    método activo); el día de cobro, dentro de la tarjeta de la Fase 1 en
    `/owner/settings`; la lista «Cobros automáticos de este mes», en
    `/owner/payments` (con la bandera apagada solo enseña los cobros que ya
    estaban en marcha y se titula «Cobros automáticos en curso»). Se retiró
    la tarjeta `FamilyCollectionModeCard`, que
    no estaba montada y era un segundo control para la misma preferencia.
27. **Descripción del cobro en Stripe** «Cuota {mes} {año}» (por ejemplo,
    «Cuota noviembre 2026»), sin referencias internas. La metadata solo lleva
    ids de Zaltyko (`zaltyko_organization_id`, `zaltyko_invoice_id`,
    `zaltyko_collection_attempt_id`).

## Respuestas de Elvis para la Fase 3 (16-11-2026)

Antes eran las preguntas abiertas P1–P3.

- **P1 — Un cobro por familia, sede y mes** («Uno por familia»). Se cobra la
  factura mensual de la familia en la sede, no cada cuota por separado.
  - El importe es el saldo pendiente de sus cuotas automáticas.
  - Una devolución del banco afecta a todas las cuotas de ese cobro.
- **P2 — Día de cobro a elegir por la academia** («las dos opciones a
  elegir»):
  - el día de vencimiento de cada cuota (por defecto);
  - o un día fijo del mes, del 1 al 31. En los meses que no tienen ese día
    (29–31) se cobra el último día del mes.
  - Las fechas se calculan en la hora local de la sede.
  - Nunca se cobra antes del vencimiento: si el día fijo cae antes, se cobra
    el día del vencimiento. Era una propuesta mía; **la confirmó Elvis el
    17-11-2026** (ver «Decisiones de Elvis del 17-11-2026», (a)).
- **P3 — Reintentos** («1 reintento tarjeta») — **sustituida el
  17-11-2026** por la P3 nueva (ver «Decisiones de Elvis del 17-11-2026»,
  (b)). Se deja como historial:
  - ~~tarjeta rechazada: un reintento a los 3 días;~~ ahora hasta 3
    reintentos, a 1, 3 y 7 días;
  - domiciliación SEPA: ninguno (sin cambios);
  - después, la cuota vuelve al cobro manual con sus recordatorios (sin
    cambios).
  - *Mi propuesta de entonces:* no se reintenta una tarjeta perdida, robada
    o marcada como fraude, ni cuando el banco pide no repetir o retener la
    tarjeta, ni cuando pide autenticación. La P3 nueva la incluye y añade
    los métodos no válidos.
- **Aviso previo a la familia** (sin respuesta; propuesta): no en la Fase 3.
  El portal muestra la fecha de cobro y, en SEPA, Stripe envía su aviso
  previo. Un correo de Zaltyko encaja en la Fase 4, con el recibo. (Distinto
  del **aviso cuando el primer cobro falla**, que Elvis sí decidió el
  17-11-2026: ver (d).)

### Reglas añadidas al construir la Fase 3 (a confirmar por Elvis)

Decisiones de la sesión coordinadora, necesarias para construir y
corregibles:

- ~~**«Rechazo genérico» y «no aceptar» (`generic_decline`, `do_not_honor`) se
  reintentan una vez.**~~ **Sustituida el 17-11-2026** por la P3 nueva: son
  rechazos recuperables y entran en los 3 reintentos a 1, 3 y 7 días,
  contados desde el día local del primer intento (ya no «hoy + 3»). Se deja
  como historial: Elvis había dicho «1 reintento tarjeta» sin distinguir.
- **Una renovación del plan no invalida el cobro automático.** La revisión
  del plan sube en cada renovación de Stripe, y compararla tal cual habría
  hecho que el cobro solo funcionara el primer mes. La preferencia
  automática sigue valiendo mientras no haya un cambio real de plan (otro
  código de plan, otro tipo de origen, otra suscripción u otro contrato)
  posterior a la revisión con la que se guardó; ante un cambio real hay que
  volver a encenderla (ADR-0020). Coste si es incorrecto: una academia que
  cambia de plan sin cambiar de código seguiría cobrando con la preferencia
  antigua.
- **3 días de margen para los recordatorios.** Una cuota automática sin
  ningún intento vuelve a recibir recordatorios 3 días después de su fecha
  de cobro prevista; lo mismo 3 días después de la fecha de un reintento
  pendiente o de un cobro hecho que dejó saldo. Coste: un recordatorio
  innecesario si el proceso diario se retrasa más de 3 días.
- **Ventana máxima de cobro, la misma de los recordatorios.** Pasados esos 3
  días ya no se cobra nunca: el proceso escribe un intento `canceled`
  (`collection_window_expired`) y la cuota se cobra a mano. Evita el doble
  pago (a mano y con la tarjeta) de una cuota que ya volvió a los
  recordatorios. Coste: si el proceso diario se para más de 3 días, esas
  cuotas no se cobran solas.
- **Salida de 24 h para la academia.** Un intento reclamado o creado que
  nadie toca en 24 h se puede «Marcar como revisado» aunque no tenga aviso
  (la acción lee y para el cobro en Stripe antes de cerrar). Es la salida si
  se quita el trabajo de pg_cron con intentos abiertos.

## Decisiones de Elvis del 17-11-2026 (Fase 3)

Las tomó Elvis tras leer el estudio de cómo cobra la competencia
(`documentacion/Zaltyko/auditoria-2026-11-17/cobros-competencia.md`, fuera de
este repositorio; sus datos no se copian aquí). Sus palabras las citó la
sesión coordinadora. Van en la PR #349.

- **(a) Día fijo: nunca antes del vencimiento.** Elvis: «Sí, así», en
  respuesta a «¿Te vale nunca cobrar antes del vencimiento?». Si una cuota
  vence más tarde que el día fijo elegido, se cobra el día que vence. La
  lógica ya estaba así; la pantalla del día de cobro lo explica con «Si una
  cuota vence más tarde que el día elegido, se cobrará el día que vence,
  nunca antes.».
- **(b) P3 nueva: hasta 3 reintentos de tarjeta, a 1, 3 y 7 días.** Elvis:
  «3 reintentos: 1, 3 y 7 días». Sustituye a «1 reintento tarjeta».
  - Solo fallos recuperables: límite de gasto o de operaciones, fondos
    insuficientes, rechazo genérico o temporal
    (`retry-policy.ts`, `SOFT_DECLINE_CODES`).
  - Nunca: tarjeta perdida o robada, fraude, el banco pide no repetir o
    retener la tarjeta, pide autenticación (3DS) o el método no es válido
    (caducada, número incorrecto, no admitida). Esta lista manda aunque el
    otro código del rechazo sea recuperable (`NEVER_RETRY_DECLINE_CODES`).
  - Las fechas son días de calendario de la sede, contados desde el día local
    del primer intento (no desde hoy ni desde el intento anterior). Si ese
    día ya pasó cuando falla el intento, el reintento sale al día siguiente:
    nunca dos cargos a la misma tarjeta el mismo día.
  - Cada reintento tiene su propia ventana de cobro de 3 días; la del primer
    cobro no corta la cadena.
  - Tras el cuarto fallo, la cuota pasa a cobro manual con recordatorios.
  - Domiciliación: sin reintentos (sin cambios).
- **(c) «Primero solo tarjeta».** La domiciliación tiene su propia bandera,
  `ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_SEPA_ENABLED`, apagada por defecto
  (`.env.example`) hasta la Fase 4. Con ella apagada:
  - una cuota de quien domicilia nace en manual y recibe recordatorios;
  - no se crea ningún cobro de domiciliación nuevo: la puerta cierra con
    `sepa_not_enabled` las cuotas automáticas ya emitidas;
  - las familias pueden seguir guardando su domiciliación (Fase 2), pero ni
    el portal ni la academia prometen que se cobrará sola, y quitarla se
    dice «Quitar la domiciliación guardada», no «dejar de pagar
    automáticamente»;
  - una domiciliación que ya estaba en el banco se sigue releyendo y
    registrando.
- **(d) Aviso a la familia en el primer fallo.** Cuando el primer cobro de
  tarjeta falla (rechazo del banco o autenticación), la persona que paga
  recibe un correo con un solo enlace a `/familia/cuotas` para revisar o
  cambiar la tarjeta; solo promete un reintento si de verdad va a salir. La
  academia ve en `/owner/payments` si se avisó a la familia o si debe
  avisarla ella. Los cierres de la puerta (domiciliación apagada, método
  revocado, ventana pasada…) no avisan.
- **(e) Texto de costes**, sin cifras, en «Conectar Stripe» y en el ajuste
  del día de cobro: «Stripe cobra su tarifa por cada pago a la academia;
  Zaltyko no cobra comisión.».

### Añadidos de la ronda de revisión de la PR #349 (17-11-2026)

Correcciones de la revisión independiente de la sesión coordinadora. Ninguna
cambia precios ni la regla del día fijo.

- **Nuevos motivos finales: la cuota pasa a manual.** Se cierran con un
  intento `canceled` y su código, y la cuota vuelve al cobro manual con
  recordatorios:
  - `amount_below_minimum`: queda menos de 0,50 €, el mínimo de Stripe;
  - `reminder_sent`: ya salió un recordatorio de pago para alguna cuota
    abierta de la factura; desde entonces no se cobra nunca automáticamente
    (ni primer intento ni reintento), porque la familia pudo pagar por fuera;
  - `sepa_not_enabled`: ver (c);
  - rechazos deterministas de Stripe al crear el cobro (`amount_too_small`,
    `resource_missing`, `account_invalid`, `payment_method_unactivated`,
    `capability_not_active`): Stripe no creó nada, así que se cierra sin
    esperar.
- **Domiciliación «en curso» que no se puede leer.** Si Stripe no deja
  releer un cobro en proceso, se registra el nombre y el código del error
  (nunca el mensaje) y, a los 15 días desde que se reclamó, la academia
  recibe el aviso `processing_unreadable`. Con un error permanente
  (`resource_missing`, `permission_error`, `account_invalid`) comprobado en
  Stripe en ese mismo momento, «Marcar como revisado» cierra el intento con
  el motivo `reviewed_unverifiable`, deja a la persona en la auditoría y la
  academia ve «Comprueba en tu panel de Stripe si se cobró; si se cobró, regístralo como pago manual.» La cuota vuelve al cobro manual con recordatorios
  (re-revisión del 17-11, ver abajo).
- **Importe y moneda comprobados.** Antes de registrar un cobro hecho se
  compara lo cobrado con el importe del intento y con `EUR`. Si no cuadra
  (`amount_mismatch`), no se registra y la academia recibe un aviso; «Marcar
  como revisado» cierra el intento como `reviewed_unverifiable` sin
  registrar ese pago, con el mismo texto (re-revisión del 17-11).
- **Base:** un solo cobro registrado por factura y reintento solo de tarjeta
  (decisión 15; candidata `cee3e0aa…`).
- **Re-revisión del coordinador (17-11-2026, tarea C).**
  - «Marcar como revisado» puede cerrar un cobro sin saber si se cobró
    (`reviewed_unverifiable`) solo en dos casos: un error de Stripe que no se
    arregla reintentando, comprobado en esa misma acción (cobro inexistente,
    cuenta sin permiso o ya no válida, por ejemplo porque la academia
    desconectó su cuenta), o un importe cobrado distinto (ese pago no se
    registra). Un error pasajero o un cobro legible en curso nunca cierran
    nada. Sustituye, solo para esos dos casos, la regla de no cerrar nunca un
    intento cuyo dinero pudo moverse. Coste aceptado: si Stripe acabara
    cobrando después y la familia pagara a mano, la academia debe detectarlo
    en su panel de Stripe (el texto se lo pide). Otro coste: un 403 de
    permiso por una clave de la plataforma mal configurada cuenta como
    permanente, así que «Marcar como revisado» cerraría también una
    domiciliación en curso de más de 15 días (con la domiciliación apagada,
    D2, el alcance es pequeño).
  - El aviso del primer fallo a la familia se envía de página en página hasta
    el plazo y también antes de cobrar; un reintento ya reclamado no lo anula
    (se envía sin fecha o con la del reintento siguiente; solo se anula si un
    intento posterior ya cobró la cuota).
  - Un cobro cancelado en Stripe sin ningún error de pago se cierra como
    `canceled_in_stripe`, sin aviso de rechazo a la familia y sin reintento.
  - Al crear el cobro, cualquier petición rechazada (400
    `invalid_request_error`) sin cobro creado que no sea de idempotencia ni un
    bloqueo cierra el intento y la cuota pasa a cobrarse a mano. Coste
    aceptado: un cambio de la plataforma que provoque 400 deterministas pasa a
    mano las cuotas de ese día, sin mover dinero.
- **Bandera apagada con cobros en marcha.** Los recordatorios se retienen
  mientras haya un intento reclamado, creado o en proceso, aunque la bandera
  esté apagada (la misma regla que el pago manual). El portal enseña «Cobro
  en curso» y la academia ve la lista («Cobros automáticos en curso») con
  «Marcar como revisado» si procede.
- **Aviso del primer fallo (d), cómo se envía.** El fallo escribe en el
  outbox `family_collection.family_failure_notice` (en la misma transacción)
  y la ruta cron `collect-family-fees`, al terminar de cobrar, lo envía por
  el mismo camino que los recordatorios de pago (mismo emisor y misma
  persona destinataria) y guarda `family_collection.family_failure_notice_result`:
  dos eventos, uno por intento, sin duplicar correos. El trabajador del
  outbox no está programado, por eso no se usa. También se avisa cuando la
  tarjeta ya no está en Stripe (`resource_missing` al crear el primer
  cobro), para que la familia la vuelva a guardar.
- **Caso de soporte: cerrojos de entorno cerrados con intentos en marcha.**
  Si un entorno pasa de prueba a Live o a la base de producción con intentos
  abiertos, el proceso diario no los relee y siguen reteniendo recordatorios
  y bloqueando el pago manual. Solo lo resuelve soporte.
- **Recomendación operativa: no reencender la bandera con reintentos
  pendientes sin revisarlos.** Apagar y volver a encender la bandera dentro
  de la ventana de un reintento puede cobrarlo después de que la familia
  leyera «ya no se cobrará sola», si aún no salió ningún recordatorio.

## Preguntas legales y fiscales (para Elvis, el abogado y la sesión «Elvis Finanzas»)

Ninguna se responde aquí. Este documento no contiene texto legal.

- **L1. Papel de Zaltyko.**
  - Situación: con cargo directo la academia es quien cobra y Stripe es la
    entidad de pago. Zaltyko no toca el dinero.
  - Pregunta: ¿confirma el abogado que Zaltyko no necesita licencia de
    servicios de pago ni registro como agente?
- **L2. Términos con las academias.**
  - El §1 actual dice «Los pagos familiares no se cobran automáticamente»
    (`docs/legal/borradores/terminos-cambios-propuestos.md`, «Otros puntos
    menores»). Hay que cambiarlo.
  - ¿Qué debe añadir la cláusula nueva?
    - que la academia acepta el acuerdo de cuenta conectada de Stripe;
    - que responde de sus cobros, devoluciones, disputas e impuestos de sus
      cuotas;
    - que Zaltyko solo ofrece la herramienta.
- **L3. Autorización de la familia para tarjeta guardada.**
  - Texto del consentimiento para cargos sin presencia (importe variable,
    periodicidad mensual, cómo revocarlo).
  - ¿Lo redacta el abogado? ¿Con qué versión empezamos?
- **L4. Orden de domiciliación SEPA.**
  - ¿Basta el texto de orden estándar de Stripe, con la academia como
    acreedora?
  - ¿Dejamos que Stripe envíe el aviso previo de cada adeudo, o debe enviarlo
    Zaltyko o la academia?
  - ¿Recomendamos a la academia usar su propio identificador de acreedor?
- **L5. Privacidad (RGPD).**
  - La academia es responsable y Zaltyko encargado. Stripe recibe datos del
    tutor pagador.
  - Hay que actualizar la política de privacidad, el DPA con academias (T9 del
    borrador) y el registro de actividades.
  - ¿Hace falta información específica para la familia en `/familia`?
- **L6. Fiscal (sesión «Elvis Finanzas» y gestor).**
  - Sin comisión, ¿confirma el gestor que el cobro automático no cambia nada
    en la facturación ZA ni en el IVA de Zaltyko?
  - ¿El recibo interno que verá la familia («no es factura») es suficiente,
    dado que facturar a las familias es cosa de la academia?
  - ¿Afecta el dictamen fiscal pendiente (VeriFactu en la matriz competitiva)
    a este flujo?
- **L7. Menores.** Quien paga y consiente es siempre un tutor adulto vinculado
  como pagador, nunca la gimnasta. ¿Algún requisito adicional?

Las preguntas L1–L5 y L7 bloquean la **activación** con familias reales
(Fase 5 y Live). No bloquean construir y probar en staging. L2 debe estar
resuelta antes de que una academia real conecte su Stripe en producción.

## Consecuencias

- Al aprobar este ADR se actualizarán:
  - el comentario de `RETIRED_LAUNCH_API_PREFIXES`
    (`src/lib/launch/essential-routes.ts`);
  - la nota de `docs/qa/legacy-surface-closure-2026-11-09.md`, que pasa a
    remitir aquí.
  - Ninguna ruta retirada se reabre.
- ADR-0020 y ADR-0022 siguen vigentes. Este ADR los completa con el flujo real.
- Riesgos:
  - Accounts v2 en Live no está verificado;
  - la frescura de la proyección de cuenta depende de los eventos v2;
  - SEPA introduce impagos tardíos que el libro de cuotas debe poder revertir;
  - **deuda: cuenta huérfana por un reintento tardío.** Si Stripe crea la
    cuenta y falla la escritura en la base, un reintento dentro de las 24 h de
    la clave de idempotencia recibe la misma cuenta, pero uno posterior crea
    otra. El `logger.error` «cuenta creada en Stripe sin guardar» deja el
    `acct_…` para reconciliarla a mano. En la Fase 2 se buscará la cuenta por
    `metadata.zaltyko_organization_id` antes de crear una nueva; en la Fase 1
    no se implementa esa búsqueda.
  - **deuda (Fase 2): la persona deja de ser la pagadora.** Si se cierra su
    fila de `family_payers` o el tutor se desactiva, su autorización sigue
    `active`: ese tutor ya no la ve en `/familia`, y puede haber dos
    autorizaciones activas para la misma familia con pagadores distintos (el
    índice único es por pagador y cuenta). La academia sí puede revocarla
    desde `/owner/familias`. **Requisito para la Fase 3:** solo se cobra la
    autorización del pagador vigente con tutor activo. Pendiente decidir si
    quien consintió conserva una vía para revocarla.
  - **deuda (Fase 2): método huérfano en Stripe si «completar» se rechaza.**
    Si la preparación ya terminó bien en Stripe pero Zaltyko no la activa
    (la academia dejó de estar lista, el método ya no se ofrece o la
    comprobación no cuadra), el `pm_…` queda unido al Customer en Stripe sin
    autorización en Zaltyko. No se puede cobrar (la Fase 3 solo cobra
    autorizaciones `active`); se limpiará con la Fase 4 o a mano.
  - **Resuelto en la Fase 3: la persona deja de ser la pagadora.** El cobro
    solo usa la autorización del pagador vigente hoy, con tutor y vínculo
    activos; si no, el intento se cierra como `canceled` y la cuota vuelve a
    manual. Sigue pendiente decidir si quien consintió conserva una vía para
    revocarla.
  - **deuda (Fase 3): lo que llega con la Fase 4.** Domiciliaciones en
    «procesando» que se cierran solo con la relectura diaria (sin eventos),
    recuperación del 3DS cuando el banco pide autenticación (hoy el cobro
    falla sin reintento, se avisa a la familia y pasa a manual), devoluciones,
    disputas, devoluciones del banco en SEPA y el recibo «no es factura» para
    la familia. La domiciliación se enciende con la Fase 4 (decisión (c) del
    17-11-2026).
  - **deuda (Fase 3): tarjeta que ya no está en Stripe, cada mes.** Hasta
    que la familia vuelva a guardar su tarjeta, cada mes queda un intento
    `canceled` (`resource_missing`) y la familia recibe otra vez el aviso.
    Sin dinero movido ni cuota en el limbo.
  - **deuda (Fase 3): la tabla canónica `payment_attempts` sigue sin uso.**
    El cobro usa su propia tabla (decisión 15).
  - **deuda (Fase 3): aviso previo de cada adeudo SEPA.** Lo envía Stripe por
    defecto; depende de la respuesta del abogado a L4.
  - **deuda (Fase 3): la búsqueda de Stripe tarda en ver un cobro recién
    creado.** En el peor caso puede quedar en Stripe un cobro creado y nunca
    confirmado, sin dinero movido. Es inofensivo, pero queda en el panel de
    Stripe de la academia.
  - **deuda (Fase 3): éxito tardío del primer intento.** Antes del reintento
    se cancela en Stripe el cobro del primer intento; si esa cancelación
    falla y aun así ese cobro acabara cobrándose, Zaltyko no lo vería hasta
    tener los eventos de la Fase 4.
  - **deuda (Fase 3): academias de prueba en la base desechable de la CI.**
    Las pruebas de PostgreSQL borran sus filas, salvo las academias y sus
    sedes: la auditoría y el historial de plan son solo de añadir. Solo
    afecta al PostgreSQL desechable de GitHub.
  - **Hecho, no es deuda:** las tres tablas nuevas están clasificadas en
    derechos de datos (grupo opcional `OPTIONAL_FAMILY_COLLECTION_EXPORT_TABLES`;
    solo se exporta el recuento).

## Fuentes

- Stripe — [Configurar cuentas conectadas con Accounts v2](https://docs.stripe.com/connect/accounts-v2/connected-account-configuration)
- Stripe — [SEPA Direct Debit](https://docs.stripe.com/payments/sepa-debit) (Connect, avisos previos, identificador de acreedor)
- Stripe — [Guardar datos SEPA para pagos futuros](https://docs.stripe.com/payments/sepa-debit/set-up-payment)
- Stripe — [Cargos directos](https://docs.stripe.com/connect/direct-charges)
- Lectura sandbox: `GET /v1/accounts`, `GET /v2/core/accounts` (16-11-2026), sin escrituras.
