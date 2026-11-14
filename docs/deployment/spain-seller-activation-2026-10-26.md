# Preparación del vendedor y contratación en España

## Hallazgos

Estado del 12-11-2026: Elvis Valdes Inerarte confirma que **ya está dado de alta
como autónomo en España** y que venderá como persona física con ese nombre.
hola@zaltyko.com sigue siendo el correo oficial. Los precios aprobados son base
sin IVA: Starter 19 €/mes o 190 €/año y Growth 49 €/mes o 490 €/año.

Confirmaciones del 13-11-2026 (sesión de finanzas de Elvis con su gestor):

- Alta en Hacienda y en el RETA el **05-11-2026**, verificada con el modelo
  036. Se anota en `registrationVerifiedOn` y `registrationStatus` pasa a
  `"verified"`. Mientras falten las variables de NIF o domicilio, la readiness
  sigue rechazando con `seller_tax_id` / `seller_address` y
  `registration_incomplete`.
- Domicilio profesional en la Península o Baleares (no en Canarias, Ceuta ni
  Melilla), así que aplica el contrato de IVA general del 21 %. El domicilio
  concreto va en una variable de entorno de Vercel (ver «NIF y domicilio por
  variables de entorno») y la readiness lo vuelve a comprobar por código postal
  (`seller_tax_territory_review` si cayera fuera del territorio del IVA).
- Actividad: IAE 844 (sección empresarial), régimen general de IVA al 21 %, sin
  recargo de equivalencia ni criterio de caja y **sin retención de IRPF** en las
  facturas. Los clubes y asociaciones sin ánimo de lucro **no están exentos**:
  también pagan el 21 %. Esto queda en `sellerTaxProfile` como dato informativo
  y `taxTreatmentReviewed` pasa a `true` **solo para España** (ver la tabla).
- Facturación: las facturas **no se emiten en Stripe**. Elvis factura todo en
  FacturaDirecta, serie «ZA», con numeración única que recibe su gestor.

Ese mismo día se corrigió en el PR #300 la prueba de recomprobación del país en
Live (`tests/saas-checkout-service.test.ts`): ahora usa un vendedor listo para
España, con el Tax Rate de IVA configurado, la sede en Península/Baleares y la
casilla de inicio inmediato marcada.

Prueba de punta a punta en staging con Stripe sandbox (13-11-2026): **correcta**.
Starter mensual cobró 22,99 € = 19,00 € de base + 3,99 € de IVA. Los
metadatos `zaltyko_plan` y `zaltyko_academy_id` llegaron a la sesión y a la
suscripción. Stripe recogió NIF, razón social y dirección, y el webhook activó
el plan Starter. No sustituye las comprobaciones que faltan ni marca ninguna
bandera por sí sola.

Lo técnico para cobrar en España queda preparado, pero **nada se abre**: sin
las variables de NIF y domicilio en Vercel y con `supportMailboxVerified`,
`checkoutTaxVerified`, `legalTextsApproved`, `invoicingIntegrationReady` y
`liveReleaseApproved` en `false`, Checkout Live sigue respondiendo 503
`BILLING_CONFIGURATION_UNAVAILABLE`.

Historial: el 26-10-2026 Elvis declaró que preveía darse de alta; ese día se
preparó el perfil único y se bloqueó Live.

## Fuente y lugar de edición

`src/lib/launch/commercial-launch-profile.ts` contiene el perfil único consumido
por Términos, Privacidad (bloque «Identificación de Zaltyko», enlazado en el
pie como «Identificación del titular») y el control de Checkout SaaS
(`getCommercialLaunchProfile()`, evaluado solo en servidor). No guardar
documentos de identidad, contraseñas o claves en ese archivo ni en este informe.

**El repositorio es público**: el NIF y el domicilio **no se escriben en el
código** (quedarían para siempre en el historial de git). Se leen de variables
de entorno del servidor; ver la sección siguiente. Un test de CI
(`tests/seller-identity-environment.test.ts`) falla si alguien vuelve a escribir
un NIF o un código postal literal en el perfil.

| Campo | Estado 13-11 | Quién y cómo se completa |
| --- | --- | --- |
| legalName | Elvis Valdes Inerarte | Contrastar grafía con el documento fiscal |
| countryCode | ES | Sin cambios |
| taxId | Variable `ZALTYKO_SELLER_TAX_ID` en Vercel; hoy sin configurar | Elvis (o finanzas con su visto bueno), en Vercel. Nunca en el repositorio |
| professionalAddress | Variable `ZALTYKO_SELLER_PROFESSIONAL_ADDRESS` en Vercel; hoy sin configurar | Elvis (o finanzas con su visto bueno), en Vercel. Nunca en el repositorio |
| registrationVerifiedOn | 2026-11-05 | Alta en Hacienda y RETA verificada con el modelo 036 |
| registrationStatus | **verified** (13-11) | Confirmado por la sesión de finanzas con el gestor. Sin las dos variables, la readiness sigue en `registration_incomplete` |
| supportEmail | hola@zaltyko.com | Sin cambios |
| supportMailboxVerified | false | Claude envía un correo real a hola@zaltyko.com; Elvis lo responde desde el buzón; se marca `true` en un PR |
| taxTreatmentReviewed | **true** (13-11), solo España | Confirmado por la sesión de finanzas con el gestor: IAE 844, IVA 21 %, sin retención. No abre otros mercados: Live por país lo decide `COMMERCIAL_MARKET_REGISTRY` (solo ES) y el territorio fiscal (solo Península/Baleares). UE (empresa o particular) y México necesitan su propia revisión |
| checkoutTaxVerified | false | Claude, tras la prueba en Stripe test en staging y la revisión de la sesión y el recibo |
| legalTextsApproved | false | Elvis, tras la revisión legal pendiente (ver más abajo) |
| invoicingIntegrationReady | false | Prueba de punta a punta en modo test confirmada por finanzas el 13-11. Se marca cuando la clave restringida y el webhook hacia n8n existan también en la cuenta Live de Stripe |
| liveReleaseApproved | false | Elvis, la última, con Stripe Live y Vercel configurados y CI verde |

Completar NIF y domicilio no basta para abrir cobros: `getCommercialLaunchReadiness`
exige cada comprobación por separado. La readiness valida el formato, no el alta.

## NIF y domicilio por variables de entorno (nunca en el repositorio)

Elvis, o la sesión de finanzas con su visto bueno:

1. Vercel → proyecto `zaltyko` → Settings → Environment Variables. Añadir en
   **Production** (no hace falta en Preview; staging puede quedarse sin ellas o
   usar valores sintéticos):
   - `ZALTYKO_SELLER_TAX_ID`: NIF/NIE en mayúsculas, sin espacios, puntos,
     guiones ni comillas. DNI: 8 cifras + letra de control; NIE: X, Y o Z +
     7 cifras + letra de control.
   - `ZALTYKO_SELLER_PROFESSIONAL_ADDRESS`: domicilio profesional publicable,
     sin comillas, con esta forma: «Vía y número, piso/puerta, CP Localidad
     (Provincia)». Debe llevar al menos una coma y un código postal español de
     5 cifras de la Península o Baleares.
   - No usar el prefijo `NEXT_PUBLIC_`: son variables de servidor.
2. **Redesplegar** Production: las variables nuevas solo llegan a un despliegue
   nuevo, y Términos, Privacidad y /pricing pueden quedar prerenderizadas en
   el build.
3. Comprobar en zaltyko.com/terminos#titular que aparecen NIF y domicilio. Si
   un valor está mal escrito, la página muestra «Pendiente de completar» y la
   readiness lo señala con `seller_tax_id_format`, `seller_address_format` o
   `seller_tax_territory_review`; Live sigue cerrado.

No pegar estos valores en el repositorio, en un PR, en un issue ni en
`.env.example` (allí van vacíos). `.env.local` en la máquina de Elvis está
ignorado por git, pero no hace falta para producción.

## Contrato fiscal de Checkout (implementado, sin activar)

- Diseño: un **Tax Rate de Stripe fijo** (no Stripe Tax ni `automatic_tax`).
  Se añade como `tax_rates` a la única línea de la sesión, y Stripe lo hereda en
  la suscripción. El servidor comprueba el Tax Rate (`active`, `livemode`,
  `percentage = 21`, `inclusive = false`, `country = ES`, `tax_type = vat`) y,
  tras crear la sesión, exige `amount_subtotal = base`, `amount_tax = 21 %` y
  `amount_total = base + IVA`. Si algo no cuadra, no entrega el enlace (503).
- Variables nuevas (id `txr_…`, distinto en test y en Live):
  `STRIPE_SAAS_TEST_TAX_RATE_ES_IVA21` y `STRIPE_SAAS_LIVE_TAX_RATE_ES_IVA21`.
  Un valor mal escrito cuenta como ausente. Sin la variable Live, Checkout Live
  responde 503 y la pantalla del plan no ofrece contratar. Sin la variable de
  test, el recorrido de test sigue como hasta ahora (sin IVA) y no sirve para
  marcar `checkoutTaxVerified`. Elvis decidirá más adelante cuándo crear el Tax
  Rate de test en staging.
- Territorio: la pantalla del plan de una academia de España pide la sede
  fiscal. Solo «Península o Islas Baleares» puede contratar. Canarias, Ceuta y
  Melilla reciben un aviso claro (siguen en Free) y el servidor responde 403
  `SAAS_TAX_TERRITORY_NOT_COVERED`; sin territorio, 422
  `SAAS_TAX_TERRITORY_REQUIRED`. Ambos rechazos ocurren antes de bloquear,
  escribir o llamar a Stripe.
- Importes: Starter 22,99 €/mes y 229,90 €/año; Growth 59,29 €/mes y
  592,90 €/año (base + 21 %).
- El ensayo QA congelado (payload de test exacto) no lleva impuesto y no
  cambia. La ruta heredada `/api/billing/checkout` queda cerrada en Live porque
  no aplica este contrato.

## Facturación fuera de Stripe

- Siempre se emite **factura completa** (RD 1619/2012, art. 6). La razón social
  y el NIF/NIE/CIF los pide Zaltyko **antes** de abrir Checkout y los valida
  con su carácter de control (ver «Validación del NIF/CIF antes de cobrar»);
  Checkout exige la dirección de facturación
  (`billing_address_collection: required`).
- Stripe sigue generando internamente sus documentos de suscripción, pero **no
  deben llegar al cliente como factura**. Una sesión de Checkout no puede
  desactivarlo, así que lo configura Elvis en el Dashboard de Stripe Live (ver
  pasos). El recibo de pago de Stripe sí se mantiene.
- Cada cobro debe generar su factura de la serie «ZA» en FacturaDirecta. La
  bandera `invoicingIntegrationReady` mantiene Live cerrado mientras sea
  `false`. Puede empezar con pasos manuales, pero tiene que existir y estar
  probado **antes del primer cliente real**.

### Integración con n8n (finanzas; Zaltyko no envía nada)

n8n lee los eventos de Stripe y emite la factura ZA en FacturaDirecta. Zaltyko
no llama a n8n ni a FacturaDirecta y no recibe el número ZA (de momento no se
devuelve).

Lo que deja preparado cada Checkout de suscripción con IVA español:

| Dato | Cómo llega a Stripe |
| --- | --- |
| Razón social | Formulario del panel del plan → `name` del Customer antes de la sesión → `customer_name` de la factura |
| NIF/NIE/CIF | Formulario del panel del plan, validado en servidor → un único tax ID `es_cif` (sin prefijo ES) en el Customer antes de la sesión → `customer_tax_ids` de la factura. Checkout ya no lo pide (sin `tax_id_collection` ni `name_collection`) |
| Dirección completa | `billing_address_collection: "required"` y `customer_update.address: auto` (línea 1, código postal, ciudad, provincia, país) |
| Email de facturación | Se usa el Customer existente; si no tiene email, Checkout guarda en él el que escribe el cliente (con `customer` no se puede usar `customer_email`) |
| IVA | `tax_rates` exclusivo del 21 % en la línea: impuesto separado en la factura de Stripe |
| Periodo y modalidad | Stripe pone inicio y fin del periodo en la línea de suscripción; el nombre del producto y el intervalo («/ month», «/ year») indican la modalidad. Elvis puede poner además el apodo del precio («Starter mensual», «Starter anual»…) |
| Moneda | EUR: el servidor rechaza un precio que no sea EUR y desactiva la conversión local de Checkout |
| Metadatos | `zaltyko_plan` (`starter`/`growth`), `zaltyko_academy_id` (id de la organización) e `immediate_start_consent`, en la sesión y en `subscription_data.metadata` |

Lo que Stripe **no garantiza** y debe revisar n8n o la aprobación por Telegram
antes de emitir la ZA:

- **País = ES:** Checkout no permite limitar el país de la dirección de
  facturación. Si llegara otro país, la factura no debe salir como operación
  interior con IVA español.
- **Tipo de NIF:** las contrataciones nuevas llevan `es_cif` validado por
  Zaltyko. Una sesión anterior a este cambio que se recupere conserva su cuerpo
  exacto (con `tax_id_collection`), pero Checkout no muestra el campo porque el
  Customer ya tiene el NIF validado. Finanzas sigue aceptando `eu_vat` con
  prefijo ES por si alguien lo cambia a mano o desde el portal de Stripe.

### Validación del NIF/CIF antes de cobrar

FacturaDirecta rechaza un NIF con el carácter de control incorrecto y Stripe
solo comprueba el formato, así que Zaltyko lo valida antes de cobrar:

1. **Panel del plan (`/owner/subscription`, academias de España).** Junto a la
   sede fiscal y la casilla de inicio inmediato, el owner escribe la razón
   social (o nombre y apellidos) y el NIF, NIE o CIF. El botón «Contratar» no
   se activa hasta que ambos son válidos y el campo explica el error.
2. **Servidor (`POST /api/v1/owner/saas/checkout`, campo `billingDetails`).**
   Con IVA español son obligatorios. Se validan antes de bloquear, escribir o
   llamar a Stripe (`src/lib/launch/spanish-tax-id.ts`, `checkSpanishTaxId`):
   DNI, NIE (X/Y/Z), NIF K/L/M y NIF de entidad (letra + 7 cifras + control;
   P, Q, R, S, W y N exigen letra; A, B, E y H exigen cifra; C, D, F, G, J, U
   y V admiten ambas). Se aceptan espacios, puntos, guiones, minúsculas y el
   prefijo ES. Un rechazo es 422 sin efectos, con un mensaje en español y un
   código: `SAAS_BILLING_DETAILS_REQUIRED`, `SAAS_BILLING_LEGAL_NAME_REQUIRED`,
   `SAAS_BILLING_LEGAL_NAME_INVALID`, `SAAS_BILLING_TAX_ID_REQUIRED` o
   `SAAS_BILLING_TAX_ID_INVALID`.
3. **Customer de Stripe.** Antes de crear la sesión se pone el `name` y se deja
   exactamente un tax ID `es_cif` con el valor canónico (se borra cualquier
   otro). No se guarda en la base de datos de Zaltyko ni en metadatos. Si
   Stripe lo rechaza, no se entrega la sesión (503 reintentable).
4. **Checkout (operaciones v4).** Solo pide la dirección
   (`billing_address_collection: required`, `customer_update.address: auto`).
   No muestra NIF ni razón social, así que no se pueden cambiar por otros sin
   validar.
5. **Webhook `invoice.paid` (defensa adicional).** Si una factura con
   `zaltyko_plan` llega sin NIF, con varios, con uno español con el control
   incorrecto o con uno extranjero, el pago se procesa igual y se registra el
   error «Factura SaaS pagada sin NIF español válido» (consola y Sentry en
   producción; `alert: saas_invoice_customer_tax_id`, sin el valor del NIF)
   para revisarlo antes de aprobar la ZA.

Queda fuera: el portal de Stripe podría permitir editar el NIF si su
configuración lo admite. Conviene no permitir la edición de tax IDs en el
portal; si se cambia, lo detecta la alerta del webhook.

Pasos de Elvis en Stripe (primero en test para la prueba de finanzas y después
en Live):

1. Crear un **endpoint de webhook** hacia la URL de n8n que le dé finanzas, con
   los eventos `invoice.paid`, `charge.refunded` e `invoice.payment_failed`.
   Es distinto del webhook de Zaltyko y no lo sustituye.
2. Crear una **clave restringida de solo lectura** (permisos de lectura de
   Invoices y Customers) y guardarla solo en n8n. No pegarla en el repositorio,
   en el PR ni en el chat.

Flujo de finanzas: la factura ZA se crea como **borrador** en FacturaDirecta y
se aprueba por Telegram.

Prueba de punta a punta en modo test, confirmada por finanzas el 13-11-2026
(Stripe sandbox → n8n → FacturaDirecta), con la factura de test
`in_1UbIdKDA0PFJp7KMxJhQWSx9`:

- se creó el cliente en FacturaDirecta;
- se generó el borrador «ZA PRUEBA» de 22,99 € con el concepto «Zaltyko Starter
  — suscripción mensual, del 13/11/2026 al 12/12/2026»;
- n8n es idempotente: reenviar el evento no duplica el borrador;
- la clave restringida solo lee Invoices y Customers.

**Condición de `invoicingIntegrationReady`:** sigue en `false` en el código.
Esa bandera abre los cobros reales, así que se marca cuando la clave
restringida de solo lectura y el webhook hacia n8n (`invoice.paid`,
`charge.refunded`, `invoice.payment_failed`) existan también en la **cuenta
Live** de Stripe. La prueba en test no basta.

## Consumidores (TRLGDCU)

- Un club o asociación sin ánimo de lucro puede ser consumidor (art. 3
  TRLGDCU). /pricing y la pantalla del plan muestran como cifra principal el
  **precio final con IVA** (22,99 €/mes…) y, debajo, la base («19 € + IVA»).
- Antes de pagar, la pantalla del plan exige una casilla obligatoria: consentimiento
  expreso al inicio inmediato del servicio digital y reconocimiento de la
  pérdida del derecho de desistimiento de 14 días (art. 103.m TRLGDCU). El
  servidor rechaza sin ella (422 `SAAS_IMMEDIATE_START_CONSENT_REQUIRED`) antes
  de escribir nada. La versión del texto (`desistimiento-14d-v1`) queda en los
  metadatos de la sesión y de la suscripción de Stripe.
- Fuera de este PR siguen mostrando la base «sin IVA»: la portada
  (`HomeSections`), la FAQ de planes, `llms.txt`/`llms-full.txt` y la cláusula 3
  de Términos.

## Revisión legal pendiente (no se ha inventado texto jurídico)

- **LSSI art. 27** (información previa): Términos no explican los pasos para
  contratar, si el contrato se archiva y es accesible, el idioma del contrato ni
  los medios para identificar y corregir errores antes de pagar.
- **LSSI art. 28** (confirmación): tras pagar, el cliente vuelve a la pantalla
  del plan, que muestra el estado de la sesión, y puede recibir el recibo de
  Stripe si ese correo está activo. No hay una confirmación propia de Zaltyko
  por correo con el contrato aceptado.
- **Desistimiento**: Términos no informan del derecho de desistimiento ni de su
  pérdida por inicio inmediato. La casilla está en la pantalla del plan, pero el
  texto legal debe recogerlo.
- **Cláusula 3 de Términos**: describe precios base sin IVA; debe alinearse con
  el precio final mostrado a consumidores.

## RGPD: encargo de tratamiento

Requisito previo a clientes reales: un **contrato de encargado del tratamiento**
(art. 28 RGPD) con cada academia. En el repositorio **no existe** el documento:
Términos (cláusula 6) dicen que se puede «firmar un Acuerdo de Encargado de
Tratamiento (DPA) solicitándolo a hola@zaltyko.com»; `docs/privacy/zaltyko-rgpd-assessment.md`
lo lista como pendiente («determinar responsable/encargado y firmar DPA»), igual
que `docs/cutover/prepilot-go-no-go.md`. Forma parte de `legalTextsApproved`.

## Fuera de España (para el futuro; hoy no cambia nada)

Live sigue abierto solo para academias de España con sede en Península o
Baleares. Para abrir otros mercados:

- **UE, cliente empresa (B2B)**: Elvis debe tener aprobado el ROI. Comprobar el
  NIF-IVA del cliente en VIES; factura sin IVA con inversión del sujeto pasivo;
  se declara en los modelos 303 y 349.
- **UE, cliente consumidor (B2C)**: IVA español hasta el umbral de 10.000 €
  anuales de ventas a distancia en la UE; por encima, IVA del país del cliente
  mediante OSS.
- **Fuera de la UE (p. ej. México)**: sin IVA español, con la mención del art.
  69.Uno.1.º de la Ley 37/1992 en la factura. Decisión: no cobrar IVA a esos
  clientes.

## Importancia

- Sin estas piezas, la primera venta real cobraría la base sin IVA, sin factura
  ZA o sin la información que exige la normativa de consumidores. Con ellas,
  Live solo se abre cuando el perfil está completo, el Tax Rate existe, la
  sesión cobra exactamente base + 21 % y la facturación ZA está lista.
- No se crea nada en Stripe ni en Vercel desde este cambio; los ids se
  configuran después por Elvis y no se inventan.

## Siguiente paso

Elvis:
1. En Vercel (Production), añadir `ZALTYKO_SELLER_TAX_ID` y
   `ZALTYKO_SELLER_PROFESSIONAL_ADDRESS` y redesplegar (ver «NIF y domicilio
   por variables de entorno»). Nunca en el repositorio.
2. Confirmar que recibe y responde correos en hola@zaltyko.com.
3. En Stripe **Live** (cuenta propia):
   - Crear el Tax Rate «IVA» 21 %, exclusivo, país España, tipo VAT.
   - Crear los productos Starter y Growth con precios recurrentes en EUR, sin
     impuesto incluido: 19,00 €/mes, 190,00 €/año, 49,00 €/mes y 490,00 €/año.
   - Desactivar el envío de facturas al cliente (correos de facturas
     finalizadas) y el historial de facturas del portal de cliente. Mantener
     activo el recibo de pagos correctos.
   - Endpoint de webhook hacia n8n (`invoice.paid`, `charge.refunded`,
     `invoice.payment_failed`) y clave restringida de solo lectura (Invoices,
     Customers) guardada en n8n. Hacerlo antes en Stripe test para la prueba
     de finanzas.
4. En Vercel (Production): `STRIPE_SAAS_LIVE_TAX_RATE_ES_IVA21` y las variables
   `STRIPE_SAAS_LIVE_*` de clave, webhook, cuenta y los cuatro precios.
5. La prueba en modo test (Stripe test → n8n → borrador ZA) ya está confirmada
   por finanzas (13-11). Cuando el webhook hacia n8n y la clave restringida de
   solo lectura existan también en la cuenta Live, se marca
   `invoicingIntegrationReady`.
6. Cerrar la revisión legal pendiente y el DPA; marcar `legalTextsApproved`;
   `liveReleaseApproved`, la última. (`registrationStatus: "verified"` y
   `taxTreatmentReviewed` para España ya están marcados desde el 13-11.)

Claude (cuando Elvis lo autorice para staging):
1. Crear en Stripe **test** el mismo Tax Rate y poner
   `STRIPE_SAAS_TEST_TAX_RATE_ES_IVA21` en staging.
2. Probar en staging una contratación de Península/Baleares con tarjeta de
   test: casilla obligatoria, razón social, NIF/CIF y dirección exigidos;
   comprobar el rechazo de Canarias/Ceuta/Melilla.
3. Revisar la sesión y el recibo de Stripe test (base, IVA 21 %, total,
   datos del cliente) y que no se envía factura de Stripe. Si cuadra, marcar
   `checkoutTaxVerified: true` en un PR; verificar el buzón y marcar
   `supportMailboxVerified` cuando Elvis responda.

El cambio debe pasar CI remota y revisión antes de cualquier despliegue. Este
documento no aplica SQL ni cambia configuración remota.

Fuentes oficiales consultadas 26-10-2026:
[LSSI art. 10](https://www.boe.es/buscar/act.php?id=BOE-A-2002-13758#a10),
[facturación art. 6](https://www.boe.es/buscar/act.php?id=BOE-A-2012-14696#a6),
[AEAT tipos IVA](https://sede.agenciatributaria.gob.es/Sede/iva/calculo-iva-repercutido-clientes/tipos-impositivos-iva.html).
Otras referencias de este informe, no consultadas en la fuente oficial en esta
sesión: TRLGDCU arts. 3, 20 y 103.m; LSSI arts. 27-28; RGPD art. 28; Ley
37/1992 art. 69.Uno.1.º.
