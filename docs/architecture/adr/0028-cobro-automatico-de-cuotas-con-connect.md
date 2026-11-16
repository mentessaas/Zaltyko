# ADR-0028 — Cobro automático de cuotas con Stripe Connect (tarjeta y SEPA)

- Estado: **aceptada** por Elvis el 16-11-2026 (decisiones D1–D4 y documento
  completo). La Fase 1 (conectar Stripe) está construida en la PR #347,
  detrás de la bandera `ZALTYKO_CONNECT_ONBOARDING_ENABLED` (apagada). La
  migración candidata está aplicada en staging el 16-11-2026 con autorización
  de Elvis y sin aplicar en producción. El cobro sigue cerrado.
- La Fase 2 (la familia guarda tarjeta o domiciliación) está construida en
  esta PR, detrás de la bandera `ZALTYKO_FAMILY_PAYMENT_METHODS_ENABLED`
  (apagada). Su migración candidata
  (`20261116180000_family_payment_methods_candidate.sql`) **no está aplicada
  en ningún entorno**: staging y producción necesitan cada uno otra
  autorización de Elvis (la de la Fase 1 no la cubre). Tampoco se cobra nada.
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
    de idempotencia derivada del cargo y su número de intento;
  - se registra el intento en una tabla nueva de intentos de cobro (migración
    candidata).
- Bloqueo de carreras: un cargo con intento en curso no admite pago manual sin
  cancelar antes el intento, y viceversa.
- Reintentos: número y espaciado limitados, a decidir en esa fase.

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

## Preguntas abiertas para fases posteriores (no bloquean la Fase 1)

- **P1 (Fase 3) — ¿un adeudo por gimnasta o uno por familia y mes?**
  - El encargo dice un PaymentIntent por cargo, y hoy hay un cargo por
    gimnasta (ADR-0026).
  - Con dos hermanas, serían dos adeudos al mes.
  - Uno por factura (familia, sede y mes) es más claro para la familia y
    cuesta menos comisiones SEPA, pero complica las devoluciones parciales.
- **P2 (Fase 3) — Día del cobro.** ¿En la fecha de vencimiento de la cuota, o
  un día fijo que elija la academia?
- **P3 (Fase 3) — Reintentos tras un fallo.** Cuántos, y si avisamos antes a
  la familia.

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

## Fuentes

- Stripe — [Configurar cuentas conectadas con Accounts v2](https://docs.stripe.com/connect/accounts-v2/connected-account-configuration)
- Stripe — [SEPA Direct Debit](https://docs.stripe.com/payments/sepa-debit) (Connect, avisos previos, identificador de acreedor)
- Stripe — [Guardar datos SEPA para pagos futuros](https://docs.stripe.com/payments/sepa-debit/set-up-payment)
- Stripe — [Cargos directos](https://docs.stripe.com/connect/direct-charges)
- Lectura sandbox: `GET /v1/accounts`, `GET /v2/core/accounts` (16-11-2026), sin escrituras.
