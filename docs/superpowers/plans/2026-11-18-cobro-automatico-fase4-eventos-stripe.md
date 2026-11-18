# Cobro automático — Fase 4 «Eventos de Stripe, devoluciones, 3DS y recibo»: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Estado:** decisiones respondidas el 18-11-2026 (ver «Respuestas»); en construcción. Plan escrito el 18-11-2026 desde `main` 070b3c1 (rama `cobros/fase4-eventos-stripe`). No hay código. Las tareas marcadas «espera la decisión Dn» no se empiezan hasta que Elvis la conteste. Nada se aplica ni se configura en staging ni en producción con este plan. Revisado en frío el 18-11-2026 (0 bloqueos, 6 importantes): esta versión los incorpora (webhook antiguo que guarda eventos completos → Tarea 2b y D13; todas las copias de «estados abiertos»; cobro tardío con hermanos abiertos; claves y casos que no caben en devoluciones y disputas; bandera de justificantes; plazo del 3DS anclado a la ventana de cobro).

**Goal:** Que lo que pase en Stripe con los cobros automáticos (cobrado, en el banco, rechazado, el banco pide confirmar, devuelto, disputado) se refleje en Zaltyko en minutos y no solo al día siguiente; que la familia pueda confirmar con su banco desde `/familia/cuotas`; que reciba un justificante cuando se cobra; y que la domiciliación quede lista (apagada) para encenderse.

**Architecture:** Un destino de eventos nuevo de Stripe para las **cuentas conectadas** (no el `@self` de la Fase 1) llama a una ruta nueva con su propio secreto. El evento solo avisa: la ruta lo guarda una vez por id en el buzón canónico `zaltyko.payment_provider_events` y llama al **mismo camino de la relectura diaria** (`settleOutcome` / `applyOutcome` del módulo `family-collection`), que vuelve a leer en Stripe el cobro, la devolución o la disputa por su id. Las devoluciones y las disputas perdidas se escriben con la función de devoluciones del libro (`zaltyko.refunds`), sacada de `ledger-service.ts`, nunca borrando pagos. Una candidata añade el estado `requires_action` (la familia tiene que confirmar) y la tabla de disputas.

**Tech Stack:** Next.js App Router, Drizzle + `drizzle-orm/sql`, `stripe@^22.6.2` (apiVersion `2026-08-26.dahlia`), `@stripe/stripe-js/pure`, Zod, Vitest, PostgreSQL de la CI.

**Spec:** `docs/architecture/adr/0028-cobro-automatico-de-cuotas-con-connect.md` («Fase 4», D2, D4, decisiones 12, 16–24, deudas de las Fases 2 y 3, L4 y L6). Base construida: `docs/COBROS_Y_CUOTAS.md` («Cobro automático de cuotas (Fase 3)») y el plan de la Fase 3 (`docs/superpowers/plans/2026-11-16-cobro-automatico-fase3-cobro-de-cuotas.md`).

## Encaje con el ADR

**Lo que la petición pide y el ADR ya prevé para la Fase 4**

- Eventos de pago (`processing`, `succeeded`, `payment_failed`, autenticación), devoluciones (`charge.refunded`), disputas y devoluciones del banco en SEPA, sin escribir en el modelo antiguo.
- La familia completa el 3DS desde `/familia`.
- Recibo «no es factura» para la familia.
- La domiciliación «se enciende con la Fase 4» (decisión (c) del 17-11): aquí queda **lista y apagada**; encenderla es otra autorización.
- Deudas que el ADR manda a la Fase 4 y este plan cubre: domiciliaciones que solo se cerraban con la relectura diaria, éxito tardío del primer intento (Fase 3), `setup_intent.succeeded` como respaldo de la Fase 2 (decisión 12) y el método que queda en Stripe sin autorización (deuda de la Fase 2, vía `payment_method.detached`).

**Lo que el ADR pide y la petición no menciona**

- **Retirada del código Standard v1 y de las rutas antiguas** (D2 y «Fase 4»): más de quince rutas de `/api/charges/*`, `/api/family/*`, `/api/payments/connect/*`, `/api/cron/collect-charges`, `/api/stripe/connect/webhook`, nueve archivos de `src/lib/stripe/` y sus pruebas. **Ojo: el webhook antiguo sí escribe.** `processConnectEvent` llama primero a `recordBillingEvent` (`src/lib/stripe/connect-webhook-handler.ts:37`), que guarda **el evento completo de Stripe** en `billing_events.payload` (`src/lib/stripe/billing-events-service.ts:45`), con los datos de facturación de la familia que trae el cobro, antes de buscar nada en `public.charges`. La ruta está viva (no está en `RETIRED_LAUNCH_API_PREFIXES`, `src/lib/launch/essential-routes.ts:19-28`) y `docs/COBROS_Y_CUOTAS.md:930` deja constancia de un destino antiguo registrado en `https://zaltyko.com/api/stripe/connect/webhook` (producción). Si ese destino escucha las cuentas conectadas, cada cobro automático nuevo dejaría su evento completo en la base de **producción**, aunque el cobro sea de staging. Lo que sí es cierto: no escribe en `public.charges` para los cobros nuevos (no los encuentra). **Propuesta:** en esta PR, el webhook antiguo deja de guardar el evento completo (Tarea 2b); antes del primer cobro automático, revisar y apagar o filtrar ese destino antiguo (D13); la retirada completa del código, en una PR aparte justo después (D8).
- **Aviso a la familia el día antes del cobro**: el ADR dijo que «encaja en la Fase 4, con el recibo». **Propuesta: no por ahora (D12).**

**Lo que no encaja o choca, y cómo lo trato**

- **Bandera nueva.** El ADR dice que `ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_ENABLED` cubre las Fases 3 y 4; la petición pide además `ZALTYKO_FAMILY_COLLECTION_EVENTS_ENABLED`. Es compatible (una bandera por fase, D1) y se anota en el ADR (Tarea 12).
- **Devolución del banco en SEPA = «impago revertido» (D4) frente a la regla actual del libro «una devolución no reabre la cuota»** (`family-portal-reads.ts:109`, fórmula de `financial_reconciliation_runs`). Reabrir la misma cuota obligaría a cambiar esa regla en el pago manual, el portal, los recordatorios y la analítica. Propongo un camino que cumple D4 sin reescribir el libro (D2).
- **`customer.updated`**: Zaltyko no guarda nada del Customer (ni correo ni nombre), así que no se suscribe.
- **`payment_intent.requires_action`**: en un cobro fuera de sesión, la petición de autenticación suele llegar como `payment_intent.payment_failed` con `authentication_required` y el cobro en `requires_payment_method` (por confirmar en el sandbox). Se tratan los dos.
- **Cortacircuitos y retoques del panel** (puntos 6 y 7) no están en el ADR; son mejoras de la Fase 3 sin conflicto.
- **Estado de la candidata de la Fase 3:** `docs/deployment/candidates/README.md:893` dice «No aplicada» en staging; según el coordinador está aplicada desde el 17-11. Se corrige en la Tarea 12 con la confirmación del coordinador.

## Respuestas (18-11-2026)

Elvis respondió D2, D3, D6 y D12 (texto de la opción que eligió, citado por el coordinador); el resto lo decidió el coordinador aceptando las recomendaciones. Vinculan todas las tareas.

- **D1** (coordinador): la cuota sigue pagada, marcada «Devuelta».
- **D2** (Elvis: «Nueva cuota pendiente»): la cuota original queda «devuelta por el banco» y se crea una nueva pendiente por el importe, a cobrar a mano con recordatorios.
- **D3** (Elvis: «Marcar y avisar»): la cuota se marca y se avisa a la academia, sin deuda automática.
- **D4** (coordinador): sigue pagada; la academia ve el plazo.
- **D5** (coordinador): solo la academia devuelve, desde su panel de Stripe.
- **D6** (Elvis: «Sí, apagado hasta abogado»): justificante de pago por correo y en página imprimible, «no es factura», detrás de `ZALTYKO_FAMILY_COLLECTION_RECEIPTS_ENABLED` hasta L6.
- **D7** (coordinador): la ventana de 3 días que ya existe y un correo cada vez que el banco pida confirmar.
- **D8** (coordinador): Standard v1 se retira en una PR aparte justo después. En esta PR, la Tarea 2b deja de guardar el evento entero. **La Tarea 13 no se hace en esta PR.**
- **D9** (coordinador): 3 errores seguidos, o el 20 % a partir de 10 intentos, contando solo los 400 de toda la plataforma.
- **D10** (coordinador): se avisa a la academia.
- **D11** (coordinador): el mismo correo que con tarjeta, sin prometer reintento.
- **D12** (Elvis: «De momento no»): sin correo el día antes.
- **D13** (coordinador): revisar y apagar o filtrar el destino antiguo antes del primer cobro real. Vaciar `billing_events.payload` queda pendiente de la autorización de Elvis: no se toca.
- Los datos de Stripe sin confirmar se verifican en la Tarea 14 (staging), que necesita la autorización de Elvis.

## Decisiones abiertas para Elvis (texto original de la propuesta)

Cada una es una pregunta cerrada. Entre corchetes, las tareas que esperan la respuesta. Lo que no depende de ninguna decisión se puede construir ya.

**D1. La academia devuelve un cobro automático desde Stripe. ¿Qué pasa con la cuota?** [Tarea 6]
- A) La cuota sigue pagada y lleva la marca «Devuelta: 35 € el 3 de marzo». La academia lo decidió; si quiere volver a cobrar, lo habla con la familia. Es la regla que ya usa el libro.
- B) La cuota vuelve a quedar pendiente y recibe recordatorios.
- **Recomiendo A.** Quien devuelve es la academia, a propósito (una baja, un error); volver a pedir el dinero sería contradictorio.

**D2. El banco devuelve una domiciliación ya cobrada (la familia tiene 8 semanas para pedirlo sin dar motivos). ¿Qué pasa con la cuota?** [Tareas 7 y 13; solo con SEPA encendida]
- A) La cuota original queda «Pagada · devuelta por el banco» y Zaltyko crea **una cuota nueva pendiente** por ese importe («Cuota de febrero de 2027 · devuelta por el banco»), que se cobra a mano con recordatorios. Cumple el «impago revertido» de D4 sin tocar lo ya registrado.
- B) La misma cuota vuelve a «pendiente». Más natural de ver, pero cambia cómo el libro calcula lo pendiente en cinco sitios; iría en otra PR.
- C) Solo se marca «devuelta por el banco» y se avisa a la academia; ella decide si la reclama.
- **Recomiendo A.** Es lo que ya aprobaste en D4, la familia sabe que debe esa cuota y los recordatorios hacen el trabajo.

**D3. Disputa de tarjeta perdida (el banco da la razón a la familia y retira el dinero). ¿Qué pasa con la cuota?** [Tarea 7]
- A) Como D2-A: cuota nueva pendiente.
- B) La cuota queda «Pagada · el banco devolvió el dinero» y la academia recibe el aviso; no se crea deuda nueva.
- **Recomiendo B.** Una disputa de tarjeta suele ser «no reconozco este cargo» o fraude: crear deuda sola podría reclamar a quien no debe. La academia conoce a la familia y decide.

**D4. Disputa abierta y disputa ganada. ¿Qué ven la academia y la familia?** [Tarea 7]
- A) Mientras dura: la cuota sigue pagada; la academia ve «En disputa: responde desde tu panel de Stripe antes del {fecha}»; la familia no ve nada (la disputa la abrió ella con su banco). Ganada: desaparece la marca. Avisos: solo en el panel de Zaltyko; Stripe ya envía su propio correo a la academia.
- B) Lo mismo y además un correo de Zaltyko a la academia.
- **Recomiendo A.** Stripe ya avisa por correo con el plazo; un segundo correo duplica.

**D5. ¿Quién puede devolver un cobro?** [Tarea 6]
- A) Solo la academia, desde su panel de Stripe; Zaltyko lo refleja.
- B) Además, un botón «Devolver» en Zaltyko.
- **Recomiendo A** en esta fase. La academia es quien cobra (D2) y Stripe ya tiene ese botón con sus avisos; un botón propio añade permisos, confirmaciones y riesgo de devolver dos veces. Se puede añadir después.

**D6. El justificante de pago para la familia. ¿Qué lleva y es suficiente?** [Tarea 9]
- A) Correo y página imprimible en `/familia/cuotas` titulados «Justificante de pago», con: academia, persona que paga, cada cuota («Cuota de febrero de 2027 · {gimnasta}»), importe, fecha del cobro, forma de pago («Tarjeta» o «Domiciliación») y la frase «Este justificante no es una factura. Si necesitas factura, pídesela a {academia}.». Sin número correlativo.
- B) Lo mismo con un número de recibo correlativo por academia.
- C) Solo en la página, sin correo.
- **Recomiendo A.** Un número correlativo se parece a una serie de facturas y sería una pregunta fiscal más. **Sigue abierta L6** (gestor): se construye y se prueba en staging detrás de su propia bandera, `ZALTYKO_FAMILY_COLLECTION_RECEIPTS_ENABLED` (apagada), que no se enciende con familias reales sin su respuesta.

**D7. El banco pide que la familia confirme el pago (3DS). ¿Hasta cuándo puede hacerlo?** [Tareas 4 y 5]
- A) Hasta que acaba la ventana de cobro que ya existe: 3 días después de la fecha de cobro prevista (o de la fecha del reintento, si es un reintento), el mismo plazo tras el que vuelven los recordatorios. Mientras tanto la cuota no recibe recordatorios ni admite pago a mano. Pasado el plazo, Zaltyko cancela el cobro en Stripe y la cuota se cobra a mano con recordatorios. La familia recibe un correo cada vez que el banco pide confirmar (también en un reintento), con el plazo.
- B) 7 días (los recordatorios esperan más).
- **Recomiendo A.** Mantiene la regla que evita el doble pago (la del 17-11) y los mismos plazos que ya conoce la academia.

**D8. Retirar el código antiguo (Standard v1 y sus rutas).** [Tareas 2b y 13]
- A) En esta PR solo se corta lo que hoy guarda datos personales: el webhook antiguo deja de guardar el evento completo (Tarea 2b). La retirada completa va en una PR aparte, justo después de esta y antes del piloto (Fase 5).
- B) Toda la retirada dentro de esta PR.
- C) Todo en una PR aparte, sin tocar el webhook antiguo ahora.
- **Recomiendo A.** Hoy ese webhook guarda eventos completos de Stripe, con datos de facturación de familias, en `billing_events`; eso hay que cortarlo ya. El resto son decenas de archivos que solo se borran: revisarlos junto al dinero nuevo alarga y complica la revisión, y lo nuevo no los necesita.

**D13. El destino de eventos antiguo de Stripe y lo que ya guardó.** [Tarea 2b; pasos de staging y de producción]
- A) Antes del primer cobro automático en cada entorno, mirar en Stripe (sandbox y Live) si existe un destino que apunta a `/api/stripe/connect/webhook` y escucha cuentas conectadas, y **apagarlo** (o dejarle solo `account.updated` si algo lo necesitara). Revisar después si `billing_events` tiene eventos de cuentas conectadas con cuerpo completo y, con tu autorización aparte, vaciar ese cuerpo (no borrar las filas).
- B) Dejar el destino como está y confiar en la Tarea 2b.
- **Recomiendo A.** La Tarea 2b corta el problema en el código, pero el destino antiguo seguiría llamando a una ruta que se va a retirar. Mirar y apagar es solo leer y pulsar un interruptor en Stripe; tocar datos guardados en producción es otra autorización.

**D9. Cortacircuitos: ¿cuándo se para el proceso diario?** [Tarea 10]
- A) Si Stripe rechaza la petición de crear un cobro («petición no válida», no un problema de una tarjeta concreta) **3 veces seguidas**, o en **el 20 % o más** de los cobros creados ese día (mirado a partir de 10), se deja de cobrar en esa pasada. Los ya cerrados se quedan como están (se cobran a mano); los demás esperan al día siguiente. Aviso operativo a Zaltyko (Sentry) y en la respuesta del proceso. Al día siguiente lo vuelve a intentar.
- B) Igual, con 5 seguidos o el 30 %.
- C) Igual que A, pero queda parado hasta que alguien de Zaltyko lo reabra (necesita guardar el estado).
- **Recomiendo A.** Un error de la plataforma afecta a todos a la vez: con 3 ya está claro. Volver a intentarlo al día siguiente evita que nadie tenga que acordarse de reabrirlo.

**D10. Stripe acaba cobrando dos veces la misma cuota (un cobro antiguo que se completa tarde cuando otro ya cobró).** [Tarea 3]
- A) Zaltyko registra el primero, no registra el segundo y avisa a la academia: «Esta cuota se cobró dos veces. Devuelve uno desde tu panel de Stripe.».
- B) Zaltyko lo devuelve solo.
- **Recomiendo A**, coherente con D5. Es muy raro (la Fase 3 ya cancela el cobro anterior antes de reintentar).

**D11. Falla una domiciliación (el banco la rechaza días después). ¿Se avisa a la familia?** [Tarea 3; solo con SEPA encendida]
- A) Sí, con el mismo correo que el fallo de tarjeta, sin prometer reintento (la domiciliación no se reintenta).
- B) No; solo lo ve la academia.
- **Recomiendo A**, como decidiste para la tarjeta el 17-11.

**D12. ¿Correo a la familia el día antes de cada cobro?** [ninguna tarea]
- A) No por ahora; el portal ya dice «Se cobrará el {fecha}» y, en domiciliación, Stripe envía su aviso previo (pendiente de L4).
- B) Sí, en esta fase.
- **Recomiendo A.** Más correos sin pedirlos; se puede añadir con datos de uso del piloto.

### Pasos de staging que necesitarán tu autorización (no se hacen con este plan)

1. En Stripe sandbox («Entorno de prueba de Zaltyko»): crear un destino de eventos **de cuentas conectadas** (eventos completos, no ligeros) con la URL `https://staging.zaltyko.com/api/stripe/connect/payments-webhook` y la lista de la Tarea 2.
2. En Vercel staging: `STRIPE_CONNECT_PAYMENTS_WEBHOOK_SECRET` (el secreto de ese destino) y `ZALTYKO_FAMILY_COLLECTION_EVENTS_ENABLED=true`.
3. En Supabase staging: aplicar la candidata de la Tarea 1.
4. Según D13, en Stripe sandbox: revisar el destino antiguo que apunta a `/api/stripe/connect/webhook` y apagarlo (o dejarle solo `account.updated`) **antes del primer cobro automático**.
5. Recorrido de prueba (Tarea 14). Encender `ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_SEPA_ENABLED` o `ZALTYKO_FAMILY_COLLECTION_RECEIPTS_ENABLED` en staging son pasos aparte.

En producción y Stripe Live no se hace nada de lo anterior, **salvo** lo que pide D13 si lo autorizas: mirar en Stripe Live el destino antiguo `https://zaltyko.com/api/stripe/connect/webhook`, apagarlo o filtrarlo, y (otra autorización) vaciar el cuerpo de los eventos de cuentas conectadas que ya guardó `billing_events`.

## Global Constraints

**Entornos y verificación**

- Nada se compila, prueba ni instala en el Mac. «Verificar» = push a la PR en borrador y mirar en GitHub Actions los runs del SHA de cabeza ya terminados. `gh pr checks` vacío no es verde. Agrupar commits (cada push cancela la CI en curso).
- No tocar `scripts/ci/verify-sandbox-schema-replay.sh`, `supabase/schema-snapshot-manifest.json` ni `.github/workflows/ci-isolated.yml`.
- Nada contra Stripe Live ni contra Vercel o Supabase de producción.
- **Cerrojos:** la ruta y todo lo nuevo solo actúan con `ZALTYKO_FAMILY_COLLECTION_EVENTS_ENABLED === "true"`, `resolveConnectEnvironment() === "test"`, `!isProductionDatabase()`, eventos con `livemode === false` y el almacenamiento de las Fases 1–4 presente. Si falta algo, la ruta responde 200 `{ ignored: true }` sin escribir.
- `ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_SEPA_ENABLED` sigue apagada por defecto; nada de este plan la enciende.
- Bandera nueva `ZALTYKO_FAMILY_COLLECTION_RECEIPTS_ENABLED`, apagada por defecto (solo el texto exacto `"true"`): sin ella no se escribe ni se envía ningún justificante. Es el cierre técnico de L6: no se enciende con familias reales sin la respuesta del gestor.

**Dinero (reglas que no se pueden romper; las de la Fase 3 siguen vigentes)**

- **El evento es un aviso, nunca la verdad.** De su cuerpo solo se leen `id`, `type`, `account`, `livemode`, `created`, `data.object.id` y `data.object.object`. Todo lo demás se vuelve a leer en Stripe por id, en la cuenta conectada.
- **Un solo camino que escribe en el libro:** los eventos de cobro pasan por `settleOutcome` → `applyOutcome` (los mismos de la relectura diaria). Las devoluciones y disputas perdidas, por `recordProviderRefund` (sacada de `ledger-service.ts`), que también usa `processLocalSandboxProviderEvent`.
- **Idempotencia por id de evento** en `zaltyko.payment_provider_events` (`processor = 'stripe'`, `environment = 'sandbox'`), y además cada efecto es idempotente por sí mismo (`payments_provider_uq`, `refunds_provider_uq`, estado del intento, disputa única por `dp_…`). El orden de llegada no importa.
- **Stripe nunca dentro de una transacción.** Orden de bloqueo único: `organizations` → cuotas por id → factura → intento (→ disputa).
- **Nunca dos cobros**, **nunca cerrar un intento cuyo dinero pudo moverse** sin leer Stripe, **ninguna cuota en el limbo** (todo intento `requires_action` tiene plazo y lo cierra el proceso diario).
- **Nunca se borra un pago ni un reparto.** Devolver = filas en `zaltyko.refunds`; disputa perdida = filas en `zaltyko.refunds` con motivo `dispute_lost` o `sepa_returned`. Una fila por reparto, con clave `refund:{re_|dp_}:{allocationId}`. Lo que no cabe en lo repartido no escribe ninguna fila: avisa a la academia y el evento queda procesado (nunca un 500 en bucle).
- **Un cobro tardío nunca convive con otro cobro de la misma factura:** antes de registrarlo se anula el reintento pendiente y se cancela en Stripe cualquier intento hermano abierto (Tarea 3).
- La cuenta del evento (`event.account`) debe ser la del intento (`payment_provider_account_id` → `provider_account_reference`) y del entorno `test`. Si no, se ignora y se registra (solo ids).

**Datos y secretos**

- Solo referencias opacas (`pi_`, `ch_`, `py_`, `re_`, `dp_`, `du_`, `pm_`, `seti_`, `mandate_`, `acct_`, `evt_`) y códigos. Nunca mensajes de Stripe, IBAN, tarjeta ni nombres en registros, en el buzón ni en respuestas. El `client_secret` del 3DS solo viaja en la respuesta a la persona pagadora y nunca se registra.
- Migración solo como candidata, nunca aplicada, clasificada en derechos de datos, con espejo Drizzle dentro del módulo (no en `src/db/schema/`) y su SHA-256 en el README de candidatas.

**Textos**

- Español sencillo: «la familia tiene que confirmar el pago con su banco», «devuelta», «en disputa», «justificante de pago». Nunca «PaymentIntent», «webhook», «3DS», «SCA», «Connect» en pantalla.
- Rutas nuevas con `no-store` y anotación `@route-auth` (`scripts/lib/route-auth-classifier.ts`).

## Review Focus

1. **El evento llega antes de que la base sepa del cobro, o en otro orden** (`succeeded` antes que `processing`; evento de un cobro creado justo antes de una caída, con el intento aún `claimed`). Lo esperable: estado final correcto y ningún segundo cobro. Tests en la Tarea 3: «succeeded y luego processing tardío → sigue succeeded» y «evento de un pi_ de un intento claimed → se guarda el pi_ y se registra el cobro».
2. **Evento y proceso diario a la vez sobre el mismo intento.** Un solo pago registrado y el otro camino cuenta `concurrent`. Test pg en la Tarea 3.
3. **Devolución parcial que toca varias cuotas, sobre un cobro sin repartir (`needs_review`) o repartido en parte, o disputa encima de devoluciones anteriores.** Nunca más devuelto que repartido; lo que no cabe, aviso, ninguna fila y evento procesado. Tests en las Tareas 6 y 7.
4. **La familia confirma con su banco justo cuando se cierra el plazo.** Si Stripe ya lo cobró, se registra (nunca se da por fallido); si se canceló, el portal ya no ofrece el botón. Tests en las Tareas 4 y 5.
5. **Evento de otra cuenta, de Live, firmado con otro secreto o con la bandera apagada.** 200 sin escribir nada (o 400 si la firma falla). Con la bandera apagada, las devoluciones y disputas de ese tiempo no se ven en Zaltyko (deuda documentada; Stripe permite reenviar eventos de los últimos 30 días). Tests en la Tarea 2.

---

### Task 1: Candidata, espejo, almacenamiento y derechos de datos

**Files:**
- Create: `docs/deployment/candidates/20261118120000_family_collection_events_candidate.sql`
- Modify: `docs/deployment/candidates/README.md` (entrada y SHA-256)
- Modify: `src/modules/family-collection/infrastructure/family-collection-schema.ts`
- Modify: `src/modules/family-collection/application/storage.ts`
- Modify: `src/modules/data-rights/application/catalog.ts` (+ `canonical-disposition-policy.ts` si la tabla nueva lo exige)
- Test: `tests/family-collection-events-pg.test.ts` (nuevo), `tests/family-collection-contract.test.ts`, `tests/data-rights-activated-modules-contract.test.ts`

**Interfaces:**
- Produces: estado `"requires_action"` en `FAMILY_COLLECTION_ATTEMPT_STATUSES` y en `FAMILY_COLLECTION_OPEN_STATUSES`; columna `actionDeadlineAt` (`action_deadline_at timestamptz null`); tabla `familyCollectionDisputes`; `FAMILY_COLLECTION_DISPUTE_STATUSES`; `familyCollectionStorageShape(client?): Promise<"none" | "phase3" | "phase4">`; `isFamilyCollectionEventsStorageAvailable(client?): Promise<boolean>` (= forma `"phase4"`). `isFamilyCollectionStorageAvailable` sigue existiendo y es `true` con `"phase3"` o `"phase4"`.

Candidata (requiere en su preflight las tablas de la Fase 3 con su forma exacta, `zaltyko.payment_provider_events` y `zaltyko.refunds`; aborta si no):

- `family_collection_attempts`:
  - `add column action_deadline_at timestamptz`;
  - `status_check` admite `requires_action`;
  - `intent_reference_by_status`: `requires_action` exige `pi_…`;
  - check nuevo `family_collection_attempts_action_deadline_check`: `status <> 'requires_action' or (action_deadline_at is not null and payment_method_kind = 'card')`;
  - se rehace `family_collection_attempts_open_uq` con `status in ('claimed', 'created', 'processing', 'requires_action')`.
- Tabla nueva `zaltyko.family_collection_disputes`: `id`; `organization_id` (FK cascade); `attempt_id` (FK compuesta a intentos, restrict); `payment_id` (FK compuesta a `payments`, restrict); `provider_dispute_reference` (`^(dp|du)_[A-Za-z0-9_]+$`, ≤ 255, único por academia); `provider_charge_reference` (`^(ch|py)_…`); `amount_cents > 0`; `currency = 'EUR'`; `status` en `warning_needs_response, warning_under_review, warning_closed, needs_response, under_review, won, lost, prevented`; `reason_code` (código ≤ 64); `evidence_due_at`; `funds_withdrawn boolean not null default false`; `reversed_at` (cuando se escribieron las filas de devolución); `opened_at`, `closed_at` (no nulo ⇔ `won, lost, warning_closed, prevented`); `last_provider_event_id` (FK compuesta a `payment_provider_events`, set null); `created_at`, `updated_at`. RLS `enable` + `force`, sin permisos para `anon`/`authenticated`, `service_role` con select/insert/update. Índice `(organization_id, status, updated_at)`.
- Sin tabla de eventos ni de devoluciones nuevas: se usan `payment_provider_events` y `refunds`, ya en producción.
- Sección de vuelta atrás comentada, como la de la Fase 3.

- [ ] **Step 1: Tests (pg y contrato)**

```ts
it("admite requires_action solo con pi_, plazo y tarjeta", …) // insert sin action_deadline_at → 23514; con sepa_debit → 23514
it("un solo intento abierto por factura, contando requires_action", …) // segundo claimed con uno requires_action → 23505
it("disputa: dp_ único por academia y closed_at solo en estados cerrados", …)
it("la candidata deja la base igual al deshacerla", …) // limpieza de la propia prueba
it("almacenamiento: none / phase3 / phase4 según el catálogo", …) // forma de la Fase 3 → "phase3"; tras la candidata → "phase4"; el gate de la Fase 3 sigue true en ambos
it("derechos de datos: family_collection_disputes en el grupo opcional, solo recuento", …)
it("espejo Drizzle y candidata describen las mismas columnas y checks", …) // family-collection-contract
```

- [ ] **Step 2: Implementar** candidata, espejo, `familyCollectionStorageShape` (lee `information_schema` y `pg_indexes`; acepta el predicado del índice de la Fase 3 o el de la Fase 4), clasificación. Calcular el SHA-256 y anotarlo en el README como «No aplicada / No aplicada».
- [ ] **Step 3: CI:** `tests/family-collection-events-pg.test.ts`, `tests/family-collection-contract.test.ts` y `tests/data-rights-activated-modules-contract.test.ts` en verde en el run del SHA de cabeza.
- [ ] **Step 4: Commit** (`Cobros familia: candidata de la Fase 4 (requires_action y disputas)`).

### Task 2: Bandera, ruta de eventos, buzón e idempotencia

**Files:**
- Modify: `src/modules/family-collection/application/config.ts`
- Create: `src/modules/family-collection/domain/provider-event.ts`
- Create: `src/modules/family-collection/infrastructure/stripe-event-gateway.ts`
- Create: `src/modules/family-collection/infrastructure/provider-event-inbox.ts`
- Create: `src/modules/family-collection/application/family-collection-events.ts`
- Create: `src/app/api/stripe/connect/payments-webhook/route.ts`
- Test: `tests/api-family-collection-events-webhook.test.ts`, `tests/family-collection-provider-event.test.ts`, `tests/family-collection-events-pg.test.ts`

**Interfaces:**
- Produces:
  - `FAMILY_COLLECTION_EVENTS_FLAG_ENV = "ZALTYKO_FAMILY_COLLECTION_EVENTS_ENABLED"`, `isFamilyCollectionEventsFlagEnabled(): boolean` (solo el texto exacto `"true"`).
  - `interface ConnectedAccountEvent { eventId: string; type: string; accountId: string | null; livemode: boolean; created: number; objectId: string | null; objectType: string | null }`.
  - `parseConnectedAccountEvent(rawBody: string, signature: string, secret: string): ConnectedAccountEvent` (usa `stripe.webhooks.constructEvent` con tolerancia 300 s; eventos completos v1, no `parseEventNotification`).
  - `FAMILY_COLLECTION_EVENT_TYPES: ReadonlySet<string>` = `payment_intent.processing`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.requires_action`, `payment_intent.canceled`, `charge.refunded`, `refund.created`, `refund.updated`, `refund.failed`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`, `charge.dispute.funds_withdrawn`, `charge.dispute.funds_reinstated`, `mandate.updated`, `payment_method.detached`, `setup_intent.succeeded`.
  - `type ProviderEventRoute = { kind: "payment_intent"; paymentIntentId: string } | { kind: "charge"; chargeId: string } | { kind: "refund"; refundId: string } | { kind: "dispute"; disputeId: string } | { kind: "mandate"; mandateId: string } | { kind: "payment_method"; paymentMethodId: string } | { kind: "setup_intent"; setupIntentId: string } | { kind: "ignored"; reason: "type" | "object" }`; `routeProviderEvent(event: ConnectedAccountEvent): ProviderEventRoute` (decide por `type` y comprueba que `objectId` tenga el prefijo esperado).
  - `claimProviderEvent(input: { organizationId: string; event: ConnectedAccountEvent; now: Date }): Promise<{ claim: "process" | "duplicate"; inboxId: string }>` — inserta en `payment_provider_events` (`processor 'stripe'`, `environment 'sandbox'`, `event_type`, `payload` = `{ type, account, objectType, objectId, created }`, su SHA-256, `signature_verified true`); vuelve a dar `process` si estaba `failed` o `processing` desde hace más de 5 min; `duplicate` si `processed` o en curso.
  - `finishProviderEvent(input: { inboxId: string; status: "processed" | "failed"; effectType: string | null; effectId: string | null; errorCode: string | null }): Promise<void>` (`last_error` solo con el código).
  - `interface ProviderEventHandlers { paymentIntent; charge; refund; dispute; mandate; paymentMethod; setupIntent }`, cada uno `(input: { organizationId: string; account: StoredConnectAccount; objectId: string; now: Date }) => Promise<{ effectType: string | null; effectId: string | null }>`; en esta tarea todos devuelven `{ effectType: null, effectId: null }`.
  - `handleFamilyCollectionEvent(event: ConnectedAccountEvent, deps?: { handlers?: Partial<ProviderEventHandlers>; now?: Date }): Promise<"processed" | "duplicate" | "ignored">`.

Orden en la ruta (`POST`, `dynamic = "force-dynamic"`, cuerpo crudo):
1. bandera apagada, clave que no es de test o base de producción → 200 `{ ignored: true }` sin leer el cuerpo;
2. sin `STRIPE_CONNECT_PAYMENTS_WEBHOOK_SECRET` → 503 `WEBHOOK_NOT_CONFIGURED`;
3. sin firma o firma no válida → 400 `SIGNATURE_VERIFICATION_FAILED`;
4. `livemode !== false`, tipo fuera de la lista, sin `account` o ruta `ignored` → 200 `{ ignored: true }`;
5. almacenamiento distinto de `"phase4"` → 200 `{ ignored: true }`;
6. `findConnectAccountByReference(db, "test", account)` sin fila → 200 `{ ignored: true }`;
7. buzón: `duplicate` → 200 `{ duplicate: true }`; `process` → manejador → `processed` → 200 `{ received: true }`;
8. el manejador lanza → `finishProviderEvent(failed, código)` → 500 `PROCESSING_FAILED` (Stripe reintenta).
En el registro solo `eventId`, `type`, `accountId` y nombre/código del error.

- [ ] **Step 1: Tests**

```ts
it("bandera apagada → 200 ignored sin verificar firma ni tocar la base", …)
it("clave live o base de producción → 200 ignored", …)
it("sin secreto → 503; sin firma o firma de otro secreto → 400", …)
it("evento livemode true → 200 ignored y sin fila en el buzón", …)
it("cuenta acct_ desconocida o de otro entorno → 200 ignored", …)
it("mismo evt_ dos veces → un solo procesado; la segunda responde duplicate", …) // pg: una fila en payment_provider_events
it("manejador que lanza → fila failed con solo el código y 500; el reenvío lo procesa", …)
it("el buzón guarda solo type, account, objectType, objectId y created", …) // expect(Object.keys(payload).sort()).toEqual([...])
it("routeProviderEvent: cada tipo de la lista a su ruta; prefijo inesperado → ignored", …)
```

- [ ] **Step 2: Implementar** las firmas de arriba. Anotar la ruta con `// @route-auth POST webhook` y su motivo (firma sobre el cuerpo crudo con `STRIPE_CONNECT_PAYMENTS_WEBHOOK_SECRET`), como `accounts-webhook/route.ts`.
- [ ] **Step 3: CI:** los tres archivos de test y el job que clasifica la autorización de las rutas (`scripts/lib/route-auth-classifier.ts`) en verde.
- [ ] **Step 4: Commit.**

### Task 2b: El webhook antiguo deja de guardar eventos completos

**Espera la decisión D8** (con D8-A o D8-B; con D8-C no se hace). No retira nada: solo corta el guardado de datos personales.

**Files:**
- Modify: `src/lib/stripe/billing-events-service.ts`, `src/lib/stripe/connect-webhook-handler.ts`
- Test: `tests/connect-webhook-minimal-payload.test.ts` (nuevo); los tests existentes del webhook antiguo (`tests/connect-webhook-payment-failed-notification.test.ts` y los de `webhook-handler.ts`) sin cambios

**Interfaces:**
- Produces: `minimalBillingEventPayload(event: Stripe.Event): Record<string, unknown>` = `{ id, type, account, livemode, created, data: { object: { id, object } } }`; `recordBillingEvent(event: Stripe.Event, options?: { payload: "full" | "minimal" }): Promise<BillingEventClaim>` (por defecto `"full"`, así el webhook de la suscripción de la plataforma, `src/lib/stripe/webhook-handler.ts:68`, no cambia). `processConnectEvent` pasa `{ payload: "minimal" }`. Nadie lee hoy `billing_events.payload` (columna que admite nulos), así que no cambia ningún comportamiento.

- [ ] **Step 1: Tests**

```ts
it("evento de cuenta conectada → billing_events.payload solo con id, type, account, livemode, created y data.object.{id,object}", …)
it("payment_intent.succeeded con billing_details → ningún nombre, correo ni dirección en la fila", …)
it("webhook de la plataforma (suscripción) sigue guardando el evento completo", …)
it("idempotencia del webhook antiguo igual que antes", …)
```

- [ ] **Step 2: Implementar.**
- [ ] **Step 3: CI:** tests nombrados y los del webhook antiguo en verde.
- [ ] **Step 4: Commit.**

### Task 3: Eventos de cobro por el camino de la relectura (SEPA asíncrona y cobro tardío)

Las reglas 4 y 5 de abajo siguen D10-A y D11-A; si Elvis elige otra opción, solo cambian esas dos reglas y sus tests.

**Files:**
- Modify: `src/modules/family-collection/application/family-collection-service.ts` (sacar `createRunState`)
- Modify: `src/modules/family-collection/application/family-collection-reconcile.ts`
- Modify: `src/modules/family-collection/application/family-collection-steps.ts`
- Modify: `src/modules/family-collection/infrastructure/family-collection-store.ts`
- Modify: `src/modules/family-collection/infrastructure/stripe-collection-gateway.ts`
- Modify: `src/modules/family-collection/application/family-collection-events.ts`
- Modify: `src/modules/family-collection/domain/family-failure-notice.ts` (D11)
- Test: `tests/family-collection-events.test.ts` (nuevo), `tests/family-collection-events-pg.test.ts`, `tests/family-collection-service.test.ts`

**Interfaces:**
- Consumes: `ProviderEventHandlers.paymentIntent` (Tarea 2), `settleOutcome`, `applyOutcome`, `mapPaymentIntent`.
- Produces:
  - `createRunState(options: FamilyCollectionRunOptions, deps: FamilyCollectionDeps, mode: "daily" | "event"): Promise<RunState | null>` (null con los cerrojos cerrados o sin almacenamiento; `runFamilyCollection` lo usa).
  - `reconcileAttemptWithStripe(state: RunState, attempt: CollectionAttempt): Promise<FamilyCollectionAttemptStatus | null>` en `family-collection-reconcile.ts`: relee el cobro y llama a `settleOutcome` con `{ lastChance: false, allowCancel: true }`. `rereadProcessing` pasa a usarla (sin cambiar su comportamiento ni sus avisos).
  - Almacén: `findAttemptByPaymentIntent(input: { organizationId: string; paymentIntentId: string }): Promise<CollectionAttempt | null>`; `findClaimedAttemptById(input: { organizationId: string; attemptId: string }): Promise<CollectionAttempt | null>`.
  - `AttemptOutcome` gana `{ kind: "late_succeeded"; paymentIntentId: string; received: ReceivedAmount }` y `ApplyOutcomeResult` el motivo de revisión `"duplicate_collection"`.
  - Almacén: `listInvoiceSiblings(input: { organizationId: string; invoiceId: string; excludeAttemptId: string }): Promise<CollectionAttempt[]>`; `LATE_SUCCESS_ELSEWHERE_CODE = "late_success_elsewhere"`; error `LATE_SUCCESS_SIBLING_IN_FLIGHT`.
  - Pasarela: `PaymentIntentSnapshot` gana `attemptIdFromMetadata: string | null` (solo el valor de `zaltyko_collection_attempt_id`).

Reglas del manejador `paymentIntent`:
1. Busca el intento por `pi_…` en esa academia. Si no está, relee el cobro en Stripe; si su metadata apunta a un intento `claimed` de esa academia con la misma cuenta, `markCreated` y se sigue; si no, sin efecto.
2. La cuenta del evento debe ser la del intento; si no, sin efecto y `logger.warn` (ids).
3. Intento abierto (`claimed`, `created`, `processing`, `requires_action`) → `reconcileAttemptWithStripe`. `transient` o `requires_confirmation` no escriben nada.
4. Intento terminal (`failed`/`canceled`) y Stripe dice `succeeded` → **cobro tardío**. Nunca dos cobros, en este orden:
   1. Si la factura ya tiene otro intento `succeeded` → no se registra; aviso `duplicate_collection` (D10). Fin.
   2. Si hay un intento hermano **abierto con su propio `pi_…`** (`created`, `processing`, `requires_action`) → fuera de toda transacción, `cancelThenClose` sobre él con `{ kind: "canceled", reason: "late_success_elsewhere" }`. Si Stripe ya no deja cancelarlo y lo cobró, se registra ese (camino normal) y el tardío pasa al paso 1 (`duplicate_collection`).
   3. Si hay un intento hermano `claimed` **sin** `pi_…` (el proceso diario lo está creando ahora mismo) → no se registra todavía: el manejador lanza `LATE_SUCCESS_SIBLING_IN_FLIGHT`, el evento queda `failed` y Stripe lo reenvía; en el reenvío ese hermano ya tiene `pi_…` y se aplica el paso 2.
   4. Solo entonces, en una transacción con el orden único: `late_succeeded` (el intento pasa a `succeeded` con `recordProviderCollectionPayment` + `allocateProviderCollectionPayment`; lo que no quepa, `needs_review`) **y** se pone a `null` el `next_retry_at` de cualquier intento `failed` de la factura con reintento pendiente (es lo que lee la reclamación, `family-collection-store.ts:1005-1006`; lo escribe `:1333`), para que el reintento no salga nunca.
5. Domiciliación: `processing` → `processing`; `succeeded` → registro; fallo → `failed` sin reintento y, según D11, el aviso a la familia (`sepa_failed`, sin promesa).

- [ ] **Step 1: Tests**

```ts
it("payment_intent.succeeded de un intento created → pago registrado por applyOutcome", …)
it("succeeded y después un processing tardío → sigue succeeded y nada nuevo", …)
it("evento de un pi_ de un intento claimed sin pi_ guardado → markCreated y registro", …)
it("evento con account distinta a la del intento → sin efecto", …)
it("éxito tardío de un intento failed sin otro cobro → succeeded y pago registrado", …)
it("éxito tardío con otro intento ya succeeded → aviso duplicate_collection y un solo pago", …)
it("éxito tardío con un failed con reintento pendiente → next_retry_at a null y listDueInvoices ya no lo reclama", …)
it("éxito tardío con un reintento created con su pi_ → cancelPayment fuera de transacción, hermano canceled late_success_elsewhere, un solo pago", …)
it("éxito tardío y el hermano ya cobrado al intentar cancelarlo → se registra el hermano y el tardío queda duplicate_collection", …)
it("éxito tardío con un hermano claimed sin pi_ → LATE_SUCCESS_SIBLING_IN_FLIGHT, evento failed y nada registrado", …)
it("domiciliación: processing → succeeded por eventos, sin esperar al proceso diario", …)
it("evento y proceso diario a la vez (pg) → un pago; el otro camino cuenta concurrent", …)
it("ninguna llamada a Stripe dentro de una transacción", …) // espía: gateway nunca llamado con tx abierta
it("rereadProcessing sigue igual (tests de la Fase 3 sin cambios)", …)
```

- [ ] **Step 2: Implementar.** `applyOutcome` acepta `late_succeeded` solo desde `failed`/`canceled` y con el mismo `pi_…`; mismo orden de bloqueo.
- [ ] **Step 3: CI:** los tests nuevos y toda la batería `tests/family-collection-*` en verde.
- [ ] **Step 4: Commit.**

### Task 4: El banco pide confirmar — el cobro espera a la familia (dominio y almacén)

**Espera la decisión D7** (plazo; con A, el valor de abajo).

**Files:**
- Create: `src/modules/family-collection/domain/authentication-window.ts`
- Modify: `family-collection-steps.ts` (`settleOutcome`, `RunState.authenticationRecovery`), `family-collection-reconcile.ts` (relectura de `requires_action`), `family-collection-collect.ts` (sacar el ancla de `collectionWindowExpired`), `family-collection-schema.ts` (`academyCanMarkReviewed`), `family-failure-notice.ts`
- Modify, **todas las copias de «estados abiertos»** (hoy `["claimed", "created", "processing"]` escrito a mano), que pasan a usar `FAMILY_COLLECTION_OPEN_STATUSES` (en SQL, con `sql.join` de esa lista) o, donde no se pueda importar, quedan cubiertas por el test de contrato:
  - `src/modules/family-collection/infrastructure/family-collection-schema.ts:66` (la fuente) y `:189` (predicado del índice del espejo);
  - `src/modules/family-collection/infrastructure/family-collection-store.ts:75` (`OPEN_STATUSES`);
  - `src/modules/family-collection/application/family-collection-reads.ts:1097`, `:1100`, `:1115`, `:1121` (SQL del panel de la academia; `:89` ya usa la constante);
  - `src/modules/family-collection/application/family-collection-academy-actions.ts:107` (cancelar y «Marcar como revisado»);
  - `src/modules/family-collection/application/family-failure-notice-delivery.ts:103` (`OPEN_ATTEMPT_STATUSES`);
  - `src/modules/billing/application/ledger-service.ts:1635` (bloqueo del pago a mano);
  - `src/modules/payment-reminders/domain/reminder-policy.ts:111` (retención de recordatorios);
  - `src/modules/family-collection/application/storage.ts:75` (comentario y predicado aceptado del índice; lo cambia la Tarea 1).
  Las listas `('claimed', 'created')` de la reanudación (`family-collection-store.ts:1419-1485`) **no** cambian: `requires_action` no se reanuda.
- Test: `tests/family-collection-open-statuses-contract.test.ts` (nuevo), `tests/family-collection-domain.test.ts`, `tests/family-collection-service.test.ts`, `tests/family-collection-events-pg.test.ts`, `tests/family-collection-failure-notice.test.ts`, `tests/family-collection-manual-payment-guard.test.ts`, `tests/family-collection-reminders.test.ts`, `tests/family-collection-academy-actions.test.ts`, `tests/family-collection-reads.test.ts`

**Interfaces:**
- Produces:
  - `collectionWindowAnchor(input: { previousAttempt: { status: string; nextRetryAt: Date | null } | null; charges: readonly CollectionChargeRow[]; allocations: readonly CollectionAllocationRow[]; timezone: string; collectionDayOfMonth: number | null }): string | null` en `family-collection-collect.ts`: la fecha local que ya usa `collectionWindowExpired` (`:99-122`) — la del reintento (`next_retry_at` del intento anterior) si el intento es un reintento; si no, la fecha de cobro prevista más antigua de sus cuotas (`collectionDate`). `collectionWindowExpired` pasa a usarla, sin cambiar su resultado.
  - `authenticationDeadline(input: { anchorLocalDate: string; timezone: string }): Date` = fin del día local `anchorLocalDate + AUTOMATIC_COLLECTION_REMINDER_GRACE_DAYS` (3) en la zona de la sede; es el último día en que `withinGrace` (`reminder-policy.ts:85-102`) sigue reteniendo los recordatorios. Nunca se ancla a `claimed_at`: si el proceso diario reclama tarde, la familia no gana días frente a los recordatorios.
  - `RunState.authenticationRecovery: boolean` = bandera de eventos **y** bandera de cobro **y** almacenamiento `"phase4"`.
  - `AttemptOutcome` gana `{ kind: "requires_action"; paymentIntentId: string; actionDeadlineAt: Date }`.
  - `AUTHENTICATION_EXPIRED_CODE = "authentication_required"` (el intento caducado se cierra `failed` con ese código, como hoy).
  - `FamilyFailureNoticeKind` `"authentication_required"` lleva `deadlineLocalDate: string`.

Reglas:
- En `settleOutcome`, un fallo de autenticación (`isAuthenticationRequiredFailure` o estado `requires_action`) de **tarjeta**, con `authenticationRecovery` y antes del plazo (`authenticationDeadline` sobre `collectionWindowAnchor`, que `loadAttemptRefs` devuelve como `AttemptStripeRefs.windowAnchorLocalDate: string | null`; sin ancla → comportamiento de la Fase 3) → `requires_action` **sin cancelar el cobro** en Stripe. Sin `authenticationRecovery` → comportamiento de la Fase 3 (cancelar y `failed`).
- Mientras está `requires_action`, un cobro de Stripe en `requires_payment_method` o `requires_action` no cambia nada (la familia puede volver a intentarlo); `succeeded`/`processing` se aplican; `canceled` sin error → `canceled_in_stripe`.
- La relectura diaria lista `processing` **y** `requires_action`; pasado el plazo → `cancelThenClose` con `failed` `authentication_required` (si Stripe ya lo cobró, se registra). Sin segundo correo: vuelven los recordatorios.
- Al entrar en `requires_action` se escribe el aviso a la familia en el outbox (misma transacción), **en cualquier número de intento**, con el plazo. Texto: «Tu banco pide que confirmes el pago de la {cuota de febrero de 2027}. Entra en Zaltyko y pulsa «Confirmar el pago» antes del {5 de marzo}. Si no, tu academia te dirá cómo pagarla.».
- `requires_action` es un estado abierto en todas las listas: retiene recordatorios y el pago a mano responde 409 (`AUTOMATIC_COLLECTION_IN_PROGRESS`). La academia puede «Cancelar el cobro automático» (cancela en Stripe y luego cierra, como un cobro creado).

- [ ] **Step 1: Tests**

```ts
it("todas las copias de estados abiertos son FAMILY_COLLECTION_OPEN_STATUSES", …) // contrato: importa ledger-service, reminder-policy, store, academy-actions, notice-delivery; para el SQL de reads, lee el archivo y no admite ninguna lista literal de estados abiertos
it("collectionWindowAnchor: intento 1 → fecha de cobro prevista; reintento → fecha del reintento", …)
it("authenticationDeadline: fin del día local ancla+3 en Madrid y en Ciudad de México", …)
it("reclamado un día tarde → el plazo no se alarga (mismo día que deja de retener withinGrace)", …)
it("panel de la academia lista un intento requires_action como en curso", …)
it("authentication_required con recuperación → requires_action, plazo guardado y sin cancelPayment", …)
it("sin recuperación (bandera de eventos apagada) → cancelPayment y failed, como en la Fase 3", …)
it("requires_action y Stripe sigue requires_payment_method antes del plazo → nada cambia", …)
it("requires_action pasado el plazo → cancelado en Stripe y failed authentication_required", …)
it("requires_action pasado el plazo pero Stripe ya cobró → succeeded y pago registrado", …)
it("pago a mano con requires_action → 409; recordatorios retenidos", …)
it("aviso a la familia al entrar en requires_action, también en el intento 3, con el plazo", …)
it("la academia cancela un requires_action → cancelado en Stripe antes de cerrar", …)
```

- [ ] **Step 2: Implementar.**
- [ ] **Step 3: CI:** tests nombrados y la batería `tests/family-collection-*`, `tests/payment-reminders-*` en verde.
- [ ] **Step 4: Commit.**

### Task 5: Confirmar el pago desde `/familia/cuotas`

**Espera la decisión D7.**

**Files:**
- Create: `src/modules/family-collection/application/family-authentication-service.ts`
- Create: `src/app/api/v1/family/automatic-payment/authentication/route.ts`
- Create: `src/components/family-portal/FamilyConfirmPaymentButton.tsx`
- Modify: `stripe-collection-gateway.ts` (`retrievePaymentClientSecret`), `src/modules/family-portal/domain/family-portal-presentation.ts`, `src/components/family-portal/FamilyFeesView.tsx`, `family-collection-reads.ts` (estado de la familia y de la academia), `src/components/owner-dashboard/OwnerAutomaticCollectionsPanel.tsx` (texto del estado)
- Test: `tests/family-authentication-route.test.ts`, `tests/family-collection-screens.test.tsx`, `tests/family-collection-reads.test.ts`

**Interfaces:**
- Consumes: `reconcileAttemptWithStripe`, `createRunState` (Tarea 3), `requires_action` (Tarea 4).
- Produces:
  - `startFamilyAuthentication(input: { userId: string; organizationId: string; invoiceId: string; now?: Date }): Promise<{ clientSecret: string; connectedAccount: string; paymentMethodId: string }>` — exige que la persona sea la pagadora vigente de esa factura, intento `requires_action` antes de su plazo y los cerrojos; si no, 404/409 con texto. El `client_secret` se lee de Stripe en ese momento y no se guarda.
  - `checkFamilyAuthentication(input: same): Promise<{ state: "collected" | "processing" | "action_required" | "closed" }>` — relee por `reconcileAttemptWithStripe` (mismo camino).
  - Ruta `POST` con `{ action: "start" | "check", organizationId, invoiceId }` (Zod, `.strict()`), sesión de familia, límite de frecuencia, `no-store`.
  - `FamilyAutomaticFeeStatus` gana `{ kind: "action_required"; deadline: string }`; `OwnerAutomaticCollectionState` gana `"action_required"`.
  - Botón: `loadStripe(publishableKey, { stripeAccount: connectedAccount })` y `stripe.confirmCardPayment(clientSecret, { payment_method: paymentMethodId })` sobre **el mismo cobro**; después `check` y `router.refresh()`.

Textos: familia «Tu banco pide que confirmes este pago. Puedes hacerlo hasta el {fecha}.» y botón «Confirmar el pago»; al terminar, «Pago confirmado» o «No se pudo confirmar. Puedes intentarlo otra vez hasta el {fecha}.». Academia: «Esperando a que la familia confirme el pago con su banco (hasta el {fecha})».

- [ ] **Step 1: Tests**

```ts
it("start: solo la persona pagadora vigente; otra cuenta de la familia → 404", …)
it("start: plazo pasado o intento cerrado → 409 sin client_secret", …)
it("start: la respuesta no se registra ni lleva más que clientSecret, connectedAccount y paymentMethodId", …)
it("check tras confirmar → collected y cuota pagada (mismo camino que el evento)", …)
it("portal: action_required muestra el botón y el plazo; sin publishable key no se muestra", …)
it("panel de la academia: texto de espera con la fecha", …)
```

- [ ] **Step 2: Implementar.** La pantalla no muestra el botón si falta `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
- [ ] **Step 3: CI:** tests nombrados en verde.
- [ ] **Step 4: Commit.**

### Task 6: Devoluciones hechas desde Stripe

**Espera las decisiones D1 y D5** (con D1-A y D5-A, lo de abajo; con D1-B haría falta reabrir la cuota, que cambia la regla del libro y se plantearía aparte).

**Files:**
- Modify: `src/modules/billing/application/ledger-service.ts` (sacar `recordProviderRefund` de `processLocalSandboxProviderEvent`)
- Create: `src/modules/family-collection/domain/refund-split.ts`
- Modify: `stripe-collection-gateway.ts` (`retrieveChargeRefunds`), `family-collection-store.ts` (`recordAttemptRefunds`), `family-collection-events.ts` (manejadores `charge` y `refund`), `family-collection-reads.ts` y `OwnerAutomaticCollectionsPanel.tsx` (marca «Devuelta»), `family-portal-presentation.ts` / `FamilyFeesView.tsx` (texto con `refundedCents`)
- Test: `tests/family-collection-refunds.test.ts`, `tests/family-collection-events-pg.test.ts`, `tests/family-collection-ledger.test.ts` (los de `processLocalSandboxProviderEvent` sin cambios)

**Interfaces:**
- Produces:
  - `recordProviderRefund(tx: TransactionClient, input: { organizationId: string; paymentId: string; paymentAllocationId: string; amountCents: number; currency: string; processor: string; environment: "sandbox" | "live"; providerRefundId: string; reasonCode: string; refundedAt: Date; providerEventId: string | null; idempotencyKey: string }): Promise<{ refundId: string; created: boolean; paymentStatus: "partially_refunded" | "refunded" }>` — idempotente por `refunds_provider_uq`; nunca supera lo repartido (`REFUND_EXCEEDS_ALLOCATION`); actualiza el estado del pago; outbox `payment.refunded` y auditoría.
  - `splitRefund(input: { allocations: { allocationId: string; servicePeriodStart: string; chargeId: string; allocatedCents: number; refundedCents: number }[]; amountCents: number }): { allocationId: string; amountCents: number }[] | null` — reparte de la cuota más antigua a la más nueva (periodo, luego id); `null` si no cabe.
  - `providerRefundReference(refundId: string, allocationId: string): string` = `${refundId}:${allocationId}` (un `re_…` puede tocar varias cuotas y `refunds_provider_uq` es único).
  - `providerRefundIdempotencyKey(reference: string, allocationId: string): string` = `refund:${reference}:${allocationId}`, con `reference` el `re_…` o el `dp_…`/`du_…`. `refunds_idempotency_uq` es único por academia (`supabase/migrations/20261006093047_add_internal_billing_ledger.sql:299`) y hoy la clave es una por evento (`ledger-service.ts:1230` y `~1425`): con varias filas por evento saltaría 23505. `processLocalSandboxProviderEvent` conserva su clave actual (una fila por evento).
  - `class RefundDoesNotFitError extends Error` (código `REFUND_DOES_NOT_FIT`), que lanza `recordProviderRefund` en lugar de `REFUND_EXCEEDS_ALLOCATION` (`ledger-service.ts:1409`) cuando la llama este módulo.
  - `retrieveChargeRefunds(input: { connectedAccount: string; chargeId: string }): Promise<{ chargeId: string; paymentIntentId: string | null; refunds: { id: string; status: string; amountCents: number; currency: string | null; reasonCode: string | null; createdAt: Date }[] }>`.
  - Avisos a la academia (outbox `family_collection.needs_review`): `refunded` (informativo), `refund_unallocated`, `refund_reversed`.

Reglas: `charge.refunded` y `refund.*` → se relee el cargo con sus devoluciones (el `refund.*` da el `charge`) → intento `succeeded` de ese `pi_…` → por cada devolución `succeeded` sin registrar, `splitRefund` y `recordProviderRefund` (motivo = `reason` de Stripe o `requested_by_academy`). `pending` → nada todavía. Una ya registrada que pasa a `failed`/`canceled` → aviso `refund_reversed`, sin tocar el libro. La cuota sigue pagada (D1-A).

**Devolución que no cabe** (pago sin repartir o repartido solo en parte, o devoluciones anteriores que ya agotan lo repartido): `splitRefund` devuelve `null` o `recordProviderRefund` lanza `RefundDoesNotFitError` → se deshace la transacción, **no se escribe ninguna fila**, queda el aviso `refund_unallocated` a la academia («Stripe devolvió {importe} de un cobro que Zaltyko no pudo repartir entre cuotas; revísalo») una sola vez por `re_…`, y el evento se marca **procesado** (`effectType: "refund_review"`): nunca un 500 que Stripe reenviaría durante 3 días. Todas las filas de un mismo `re_…` van en una sola transacción: o todas o ninguna.

Textos: academia «Devuelta: {importe} el {fecha} (desde tu panel de Stripe)»; familia «Devuelto: {importe}».

- [ ] **Step 1: Tests**

```ts
it("splitRefund: 35 € de un cobro de 70 € con dos cuotas → toda la devolución en la más antigua", …)
it("splitRefund: más que lo repartido → null", …)
it("devolución total por evento → dos filas en refunds y pago refunded; cuotas siguen pagadas", …)
it("mismo evento o charge.refunded repetido → ninguna fila nueva", …)
it("devolución pending → nada; luego refund.updated succeeded → filas", …)
it("cobro sin repartir → aviso refund_unallocated, ninguna fila y evento processed (200)", …)
it("pago repartido solo en parte y devolución mayor que lo repartido → ninguna fila, aviso una vez, evento processed", …)
it("un re_ en dos cuotas → dos filas con claves refund:re_…:{allocationId} distintas, sin 23505", …)
it("mismo re_ reenviado → ninguna fila nueva (idempotencia por clave y por referencia)", …)
it("processLocalSandboxProviderEvent refund.succeeded sigue igual", …)
```

- [ ] **Step 2: Implementar.**
- [ ] **Step 3: CI:** tests nombrados y `tests/family-collection-ledger.test.ts` en verde.
- [ ] **Step 4: Commit.**

### Task 7: Disputas y devoluciones del banco en domiciliación

**Espera las decisiones D2, D3 y D4.**

**Files:**
- Create: `src/modules/family-collection/domain/dispute-effect.ts`
- Create: `src/modules/family-collection/infrastructure/family-collection-dispute-store.ts`
- Modify: `stripe-collection-gateway.ts` (`retrieveDispute`), `family-collection-events.ts` (manejador `dispute`), `family-collection-reads.ts`, `OwnerAutomaticCollectionsPanel.tsx`, `FamilyFeesView.tsx`
- Test: `tests/family-collection-disputes.test.ts`, `tests/family-collection-events-pg.test.ts`

**Interfaces:**
- Consumes: `recordProviderRefund`, `splitRefund`, `providerRefundReference` (Tarea 6); tabla de disputas (Tarea 1).
- Produces:
  - `retrieveDispute(input: { connectedAccount: string; disputeId: string }): Promise<{ id: string; chargeId: string; paymentIntentId: string | null; status: string; reasonCode: string | null; amountCents: number; currency: string | null; evidenceDueAt: Date | null; fundsWithdrawn: boolean; paymentMethodKind: "card" | "sepa_debit" | null }>`.
  - `disputeEffect(input: { status: string; paymentMethodKind: "card" | "sepa_debit" | null; alreadyReversed: boolean }): "track" | "reverse" | "close"` — `lost` → `reverse`; domiciliación en cualquier estado no ganado → `reverse` (las disputas SEPA no se pueden recurrir); `won`, `warning_closed`, `prevented` → `close`; lo demás → `track`; ya revertida → nunca `reverse` otra vez.
  - `upsertDisputeAndApply(input: { organizationId: string; attemptId: string; dispute: …; effect: "track" | "reverse" | "close"; providerEventInboxId: string | null; now: Date }): Promise<{ disputeId: string; reversed: boolean; review: "dispute_unallocated" | null }>` — transacción con el orden único (+ disputa `for update`); en `reverse`, `splitRefund` y `recordProviderRefund` por reparto con motivo `sepa_returned` (domiciliación) o `dispute_lost` (tarjeta), referencia `providerRefundReference(dp_…, allocationId)`, clave `providerRefundIdempotencyKey(dp_…, allocationId)` y `reversed_at`.
  - **Disputa que no cabe** (pago sin repartir o en parte, o devoluciones anteriores del mismo cobro que dejan menos de lo disputado): la fila de la disputa se guarda (estado y plazo), **sin** filas en `refunds` ni `reversed_at`; aviso `dispute_unallocated` a la academia una sola vez; el evento se marca procesado (nunca 500 en bucle). Lo mismo para D2-A: sin reversión no se crea la cuota nueva.
  - Avisos: `dispute_opened` (con `evidenceDueAt`), `dispute_won`, `dispute_lost`, `sepa_returned`.
  - **Solo con D2-A (o D3-A):** `issueReturnedFeeInvoice(tx, input: { organizationId: string; disputeId: string; amountCents: number; servicePeriodStart: string; now: Date }): Promise<{ invoiceId: string; created: boolean }>` — factura manual nueva con una cuota «Cuota de {mes} · devuelta por el banco», clave de idempotencia `family-collection-return:{dp_…}`, en modo manual (recordatorios normales).

Textos: academia «En disputa: responde desde tu panel de Stripe antes del {fecha}», «Disputa ganada», «El banco devolvió el dinero a la familia ({importe})»; con D2-A, «Se ha creado una cuota pendiente por el importe devuelto». Familia: con D2-A ve la cuota nueva; nada durante una disputa (D4-A).

- [ ] **Step 1: Tests**

```ts
it("disputeEffect: tabla de estados por tarjeta y domiciliación", …)
it("disputa de tarjeta abierta → fila track, cuota pagada, aviso con fecha", …)
it("disputa ganada → close y sin filas en refunds", …)
it("disputa perdida → filas dispute_lost por reparto y reversed_at; repetir el evento no duplica", …)
it("domiciliación disputada → sepa_returned al crearse", …)
it("disputa perdida tras una devolución parcial previa → disputa guardada, ninguna fila en refunds, aviso dispute_unallocated, evento processed", …)
it("disputa perdida en dos cuotas → claves refund:dp_…:{allocationId} distintas, sin 23505", …)
it("D2-A: devolución SEPA crea una cuota manual pendiente una sola vez", …)
it("funds_withdrawn y funds_reinstated releen la disputa y no escriben de más", …)
```

- [ ] **Step 2: Implementar.**
- [ ] **Step 3: CI:** tests nombrados en verde.
- [ ] **Step 4: Commit.**

### Task 8: Cambios del método de pago en Stripe

**Files:**
- Modify: `src/modules/family-payment-methods/application/family-payment-methods-service.ts`, `family-payment-store.ts`, `stripe-family-gateway.ts`
- Modify: `family-collection-events.ts` (manejadores `mandate`, `paymentMethod`, `setupIntent`)
- Test: `tests/family-payment-methods-provider-events.test.ts`, `tests/family-collection-events-pg.test.ts`

**Interfaces:**
- Produces:
  - `revokeAuthorizationFromProvider(input: { organizationId: string; accountRowId: string; paymentMethodId?: string; mandateId?: string; reason: "detached_in_stripe" | "mandate_inactive"; now: Date }): Promise<{ outcome: "revoked" | "none" }>` — relee en Stripe el método (`customer === null` → desligado) o la orden (`status === "inactive"`); si se confirma, marca `revoked` sin volver a desligar; auditoría con actor de sistema `jobKey: "zaltyko-family-collection"`.
  - `completeFamilyPaymentSetupFromProvider(input: { organizationId: string; accountRowId: string; setupIntentId: string; now: Date }): Promise<{ outcome: "active" | "pending" | "none" }>` — relee el `seti_…`, busca el intento de preparación abierto con esa referencia y usa la misma activación que `completeFamilyPaymentSetup` (se saca a una función interna común). Cubre la decisión 12 del ADR.

- [ ] **Step 1: Tests**

```ts
it("payment_method.detached de un pm_ activo → revoked; el siguiente cobro no sale", …)
it("payment_method.detached de un pm_ que Stripe aún tiene ligado → none", …)
it("mandate.updated inactive → domiciliación revocada; active → none", …)
it("setup_intent.succeeded con el navegador cerrado → autorización activa una sola vez", …)
it("setup_intent.succeeded de una preparación ya completada → none", …)
```

- [ ] **Step 2: Implementar.**
- [ ] **Step 3: CI:** tests nombrados y `tests/family-payment-methods-*` en verde.
- [ ] **Step 4: Commit.**

### Task 9: Justificante de pago para la familia

**Espera la decisión D6** (con A, lo de abajo). La activación con familias reales espera L6, y la bandera de esta tarea es lo que lo impide en el código.

**Files:**
- Modify: `src/modules/family-collection/application/config.ts` (bandera)
- Create: `src/modules/family-collection/domain/family-receipt.ts`
- Create: `src/modules/family-collection/application/family-receipt-delivery.ts`
- Create: `src/modules/family-collection/application/family-receipt-reads.ts`
- Create: `src/app/familia/cuotas/justificante/[attemptId]/page.tsx`
- Modify: `family-collection-store.ts` (outbox en `applyOutcome` `succeeded` y `late_succeeded`), `src/app/api/cron/collect-family-fees/route.ts`, `FamilyFeesView.tsx` (enlace «Ver justificante»)
- Test: `tests/family-collection-receipt.test.ts`, `tests/api-cron-collect-family-fees.test.ts`

**Interfaces:**
- Produces:
  - `FAMILY_COLLECTION_RECEIPTS_FLAG_ENV = "ZALTYKO_FAMILY_COLLECTION_RECEIPTS_ENABLED"`, `isFamilyCollectionReceiptsFlagEnabled(): boolean` (solo el texto exacto `"true"`; apagada por defecto). Apagada: `applyOutcome` **no** escribe el evento de justificante, `deliverFamilyReceipts` no envía nada (devuelve ceros sin leer la base), la página responde 404 y el portal no enseña el enlace. Encenderla no envía justificantes de cobros anteriores (el evento solo se escribe al registrar el cobro).
  - `FAMILY_RECEIPT_EVENT = "family_collection.receipt"`, `FAMILY_RECEIPT_RESULT_EVENT = "family_collection.receipt_result"`, `familyReceiptKey(attemptId: string): string`.
  - `renderFamilyReceipt(input: { academyName: string; payerName: string; fees: { label: string; athleteName: string | null; amountCents: number }[]; totalCents: number; currency: "EUR"; collectedOnLocal: string; method: "card" | "sepa_debit"; reference: string; receiptUrl: string }): { subject: string; text: string; html: string }` — asunto «Justificante de pago de {academia}»; incluye «Este justificante no es una factura. Si necesitas factura, pídesela a {academia}.».
  - `deliverFamilyReceipts(options?: { deadlineMs?: number; now?: Date }, deps?): Promise<{ sent: number; notSent: number; pending: number }>` — mismo emisor, destinatario y clave de envío por intento que los avisos (`sendEmailWithLogging`); resultado en el outbox una sola vez.
  - `getFamilyReceipt(input: { userId: string; organizationId: string; attemptId: string }): Promise<FamilyReceiptView | null>` — solo la persona pagadora de esa factura; lee del libro (pago, reparto, cuotas).

La ruta cron lo llama al final, después de los avisos, con el tiempo que quede; la respuesta suma `receipts: { sent, notSent, pending }`. Un cobro de domiciliación cobrado por evento recibe el justificante en la siguiente pasada diaria.

- [ ] **Step 1: Tests**

```ts
it("bandera de justificantes apagada → cobro registrado sin evento de justificante, ningún correo, página 404 y sin enlace en el portal", …)
it("bandera con otro valor que \"true\" (\"1\", \"TRUE\") → apagada", …)
it("bandera encendida: cobro registrado → un evento de justificante en el outbox; repetir applyOutcome no duplica", …)
it("renderFamilyReceipt: texto exacto «no es una factura» y sin datos de tarjeta", …)
it("sin correo de la persona pagadora → notSent y la página sigue disponible", …)
it("la página solo la ve la persona pagadora; otra cuenta → 404", …)
it("ruta cron: contadores de justificantes en la respuesta, sin ids", …)
```

- [ ] **Step 2: Implementar.**
- [ ] **Step 3: CI:** tests nombrados en verde.
- [ ] **Step 4: Commit.**

### Task 10: Cortacircuitos del proceso diario

**Espera la decisión D9** (con A, estos valores).

**Files:**
- Create: `src/modules/family-collection/domain/circuit-breaker.ts`
- Modify: `payment-outcome.ts` (`isPlatformInvalidRequest`), `family-collection-steps.ts` (`RunState.breaker`, resultado), `family-collection-collect.ts`, `src/app/api/cron/collect-family-fees/route.ts`
- Test: `tests/family-collection-domain.test.ts`, `tests/family-collection-service.test.ts`, `tests/api-cron-collect-family-fees.test.ts`

**Interfaces:**
- Produces:
  - `CIRCUIT_BREAKER_CONSECUTIVE = 3`, `CIRCUIT_BREAKER_RATIO = 0.2`, `CIRCUIT_BREAKER_MIN_SAMPLE = 10`.
  - `interface BreakerState { consecutive: number; created: number; invalid: number; open: boolean }`; `recordCreateResult(state: BreakerState, result: "created" | "platform_invalid_request" | "other"): BreakerState` (abre con 3 seguidos o `invalid / (created + invalid) >= 0.2` cuando `created + invalid >= 10`).
  - `isPlatformInvalidRequest(error: unknown): boolean` — `finalCreateErrorCode(error)` no nulo **y** fuera de `FINAL_CREATE_CODES` (no cuenta `resource_missing`, `amount_too_small`… que son de una familia o una academia).
  - `FamilyCollectionRunResult.circuitOpen: boolean`.

Reglas: con el cortacircuitos abierto, la Fase B no reclama ninguna factura más; lo ya reclamado sigue su paso actual. La Fase A sigue. Un solo `logger.error("Cobro automático: parado por errores de Stripe al crear cobros", { created, invalid })` por pasada (va a Sentry). La ruta devuelve `circuitOpen`.

- [ ] **Step 1: Tests**

```ts
it("tres 400 genéricos seguidos → abierto", …)
it("resource_missing no cuenta", …)
it("2 de 10 → abierto; 1 de 9 → cerrado", …)
it("abierto → no se reclama ninguna factura más y circuitOpen: true", …)
it("un logger.error por pasada", …)
```

- [ ] **Step 2: Implementar.**
- [ ] **Step 3: CI:** tests nombrados en verde.
- [ ] **Step 4: Commit.**

### Task 11: Retoques del panel «Cobros automáticos»

**Files:**
- Create: `src/components/owner-dashboard/fee-period-label.ts`
- Modify: `family-collection-reads.ts` (`servicePeriodStart` en la fila y el elemento), `OwnerAutomaticCollectionsPanel.tsx`, `src/components/owner-dashboard/PaymentRemindersPanel.tsx` (usa la función común)
- Test: `tests/family-collection-screens.test.tsx`, `tests/family-collection-reads.test.ts`, test del panel de recordatorios existente

**Interfaces:**
- Produces: `feePeriodLabel(servicePeriodStart: string | null, fallbackReference: string): string` → «Cuota de febrero de 2027» (`Intl` `es-ES`, `month: "long", year: "numeric"`, UTC, igual que `PaymentRemindersPanel`); sin periodo válido, «Cuota {referencia}». `OwnerAutomaticCollectionItem.servicePeriodStart: string | null` (el primer día del periodo más antiguo de las cuotas automáticas de la factura).

Cambios:
- **7a:** cada fila y sus `aria-label` dicen «Cuota de febrero de 2027», no «Cuota MENSUAL-202702-…».
- **7b:** el título pasa a «Cobros automáticos de {noviembre de 2026}» (el mes en que se cobran) y la ayuda a «Cuotas que se cobran solas este mes; cada una dice de qué mes es. Las que no se pueden cobrar pasan a cobrarse a mano.». Las filas se ordenan por mes de la cuota. Con la bandera apagada, el título sigue «Cobros automáticos en curso».

- [ ] **Step 1: Tests**

```ts
it("fila con periodo 2027-02-01 → «Cuota de febrero de 2027»", …)
it("sin periodo → «Cuota MENSUAL-…» como respaldo", …)
it("título con el mes de cobro y ayuda nueva; nunca «Cuotas de noviembre» con cuotas de otros meses", …)
it("recordatorios: mismo texto que antes con la función común", …)
```

- [ ] **Step 2: Implementar.**
- [ ] **Step 3: CI:** tests nombrados en verde.
- [ ] **Step 4: Commit.**

### Task 12: Documentación y entorno

**Files:** `.env.example` (`ZALTYKO_FAMILY_COLLECTION_EVENTS_ENABLED=false`, `ZALTYKO_FAMILY_COLLECTION_RECEIPTS_ENABLED=false`, `STRIPE_CONNECT_PAYMENTS_WEBHOOK_SECRET=`), `docs/architecture/adr/0028-cobro-automatico-de-cuotas-con-connect.md` (estado de la Fase 4, respuestas D1–D12, bandera nueva, deuda), `docs/COBROS_Y_CUOTAS.md` (sección «Eventos de Stripe, devoluciones, 3DS y justificante (Fase 4)»: rutas, estados, textos, cerrojos, deuda), `docs/deployment/candidates/README.md` (Fase 4 y, con la confirmación del coordinador, el estado real de la Fase 3 en staging), `vault/06-Roadmap-y-Tareas/Changelog interno.md` y `Decisiones.md`.

Deuda que se documenta: eventos completos de cuentas conectadas que `billing_events` ya guardó antes de la Tarea 2b (vaciarlos necesita la autorización de D13); destino antiguo `/api/stripe/connect/webhook` en Stripe hasta que se apague (D13); eventos perdidos con la bandera apagada (reenviables desde Stripe 30 días); justificante de domiciliación al día siguiente; L4 y L6 pendientes; código Standard v1 hasta la PR de D8; reparto de una devolución parcial de la cuota más antigua a la más nueva.

- [ ] **Step 1: Escribir.**
- [ ] **Step 2: CI:** `audit:env` y el job de documentación en verde.
- [ ] **Step 3: Commit.**

### Task 13: Retirada del código Standard v1 (solo si D8 = B)

Con D8-A esta tarea es la PR siguiente. Contenido: borrar `src/lib/stripe/{charge-collection-service,charge-reconcile-service,connect-service,connect-webhook-handler,refund-service,confirm-sca-client,family-customers-service,connect-event-context}.ts`, las rutas `/api/charges/[chargeId]/{collect,refund}`, `/api/family/charges/*`, `/api/family/payment-method*`, `/api/payments/connect/*`, `/api/cron/collect-charges`, `/api/stripe/connect/webhook`, `/api/academy/stripe-connect/onboard` y sus pruebas; actualizar `RETIRED_LAUNCH_API_PREFIXES`, el clasificador de rutas y `docs/COBROS_Y_CUOTAS.md`. Las tablas `public.*` no se tocan (otra candidata, otra decisión). CI completa en verde.

### Task 14: Staging (necesita autorización de Elvis; no se hace con este plan)

Tras los pasos 1–4 de «Pasos de staging» (el 4 es apagar o filtrar el destino antiguo antes del primer cobro): tarjeta `4242…` cobrada y registrada por evento en minutos; `4000 0027 6000 3184` → «Confirmar el pago» en `/familia/cuotas` y cobro registrado; plazo vencido → cuota a mano; devolución parcial y total desde el panel de Stripe de la academia; disputa con la tarjeta de prueba de disputas de Stripe; desligar el método desde Stripe; justificante en el correo de una familia con correo. La domiciliación (IBAN de prueba de éxito, fallo y disputa) solo con su bandera encendida y autorización aparte.
