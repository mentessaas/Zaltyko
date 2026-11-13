# Preparación del vendedor y contratación en España

## Hallazgos

Estado del 12-11-2026: Elvis Valdes Inerarte confirma que **ya está dado de alta
como autónomo en España** y que venderá como persona física con ese nombre
(declaración humana; no se ha visto el documento de alta). hola@zaltyko.com
sigue siendo el correo oficial. Los precios aprobados son base sin IVA:
Starter 19 €/mes o 190 €/año y Growth 49 €/mes o 490 €/año.

Confirmación del 13-11-2026: Elvis declara que su domicilio profesional está en
la Península o Baleares (no en Canarias, Ceuta ni Melilla), así que aplica el
contrato de IVA general del 21 %. Es una declaración humana: el domicilio
concreto lo escribe él en el perfil y CI lo vuelve a comprobar por código
postal (`seller_tax_territory_review` si cayera fuera del territorio del IVA).
Ese mismo día se corrigió en el PR #300 la prueba de recomprobación del país en
Live (`tests/saas-checkout-service.test.ts`): ahora usa un vendedor listo para
España, con el Tax Rate de IVA configurado y la sede en Península/Baleares.

Lo técnico para cobrar en España queda preparado, pero **nada se abre**: el
perfil conserva NIF y domicilio vacíos y todas las comprobaciones en `false`,
así que Checkout Live sigue respondiendo 503 `BILLING_CONFIGURATION_UNAVAILABLE`.

Historial: el 26-10-2026 Elvis declaró que preveía darse de alta; ese día se
preparó el perfil único y se bloqueó Live.

## Fuente y lugar de edición

`src/lib/launch/commercial-launch-profile.ts` contiene el perfil único consumido
por Términos, Privacidad (bloque «Identificación de Zaltyko», enlazado en el
pie como «Identificación del titular») y el control de Checkout SaaS. No guardar
documentos de identidad, contraseñas o claves en ese archivo ni en este informe.

| Campo | Estado 12-11 | Quién y cómo se completa |
| --- | --- | --- |
| legalName | Elvis Valdes Inerarte | Contrastar grafía con el documento fiscal |
| countryCode | ES | Sin cambios |
| taxId | null, marcado «ELVIS: escribe aquí tu NIF» | Elvis, en el PR: NIF/NIE en mayúsculas sin espacios. CI comprueba la letra de control |
| professionalAddress | null, marcado «ELVIS: domicilio profesional publicable» | Elvis, en el PR: «Vía y número, piso/puerta, CP Localidad (Provincia)». CI exige coma y CP español; un CP de Canarias, Ceuta o Melilla deja Live cerrado (`seller_tax_territory_review`) |
| registrationStatus / registrationVerifiedOn | pending / null | Elvis, en el mismo cambio: `"verified"` y la fecha de alta censal del 036/037 (`AAAA-MM-DD`) |
| supportEmail | hola@zaltyko.com | Sin cambios |
| supportMailboxVerified | false | Claude envía un correo real a hola@zaltyko.com; Elvis lo responde desde el buzón; se marca `true` con la fecha en el PR que lo cambie |
| taxTreatmentReviewed | false | Elvis (o su asesoría) confirma IVA general 21 % para academias de Península y Baleares, sin IVA para Canarias/Ceuta/Melilla y las reglas de factura; lo marca Elvis |
| checkoutTaxVerified | false | Claude, tras la prueba en Stripe test en staging y la revisión de la factura (ver más abajo) |
| legalTextsApproved | false | Elvis, tras aprobar Términos, Privacidad y encargo de tratamiento |
| liveReleaseApproved | false | Elvis, el último, con Stripe Live y Vercel configurados y CI verde |

Completar NIF y domicilio no basta para abrir cobros: `getCommercialLaunchReadiness`
exige cada comprobación por separado. CI valida el formato, no el alta.

## Contrato fiscal de Checkout (implementado, sin activar)

- Diseño: un **Tax Rate de Stripe fijo** (no Stripe Tax ni `automatic_tax`).
  Se añade como `tax_rates` a la única línea de la sesión, y Stripe lo hereda
  en la suscripción y en sus facturas. Es lo más simple y comprobable: el
  servidor recupera el Tax Rate (`active`, `livemode`, `percentage = 21`,
  `inclusive = false`, `country = ES`, `tax_type = vat`) y, tras crear la
  sesión, exige `amount_subtotal = base`, `amount_tax = 21 %` y
  `amount_total = base + IVA`. Si algo no cuadra, no entrega el enlace (503).
- Variables nuevas (id `txr_…`, distinto en test y en Live):
  `STRIPE_SAAS_TEST_TAX_RATE_ES_IVA21` y `STRIPE_SAAS_LIVE_TAX_RATE_ES_IVA21`.
  Un valor mal escrito cuenta como ausente. Sin la variable Live, Checkout Live
  responde 503 y la pantalla del plan no ofrece contratar. Sin la variable de
  test, el recorrido de test sigue como hasta ahora (sin IVA) y no sirve para
  marcar `checkoutTaxVerified`.
- Territorio: la pantalla del plan de una academia de España pide la sede
  fiscal. Solo «Península o Islas Baleares» puede contratar; Canarias, Ceuta y
  Melilla reciben un aviso claro (siguen en Free) y el servidor responde 403
  `SAAS_TAX_TERRITORY_NOT_COVERED`; sin territorio, 422
  `SAAS_TAX_TERRITORY_REQUIRED`. Ambos rechazos ocurren antes de bloquear,
  escribir o llamar a Stripe. Otros países siguen cerrados en Live por el
  registro de mercados (`commercial-market-capabilities`).
- Checkout pide dirección de facturación y, opcionalmente, el NIF/VAT del
  cliente (`billing_address_collection`, `tax_id_collection`) para que la
  factura pueda ser completa (RD 1619/2012, art. 6).
- Importes: Starter 22,99 €/mes y 229,90 €/año; Growth 59,29 €/mes y
  592,90 €/año (base + 21 %). Se muestran como «+ IVA» y total con IVA en
  /pricing y en la pantalla del plan.
- El ensayo QA congelado (payload de test exacto) no lleva impuesto y no
  cambia. La ruta heredada `/api/billing/checkout` queda cerrada en Live porque
  no aplica este contrato.

## Importancia

- Sin estas piezas, la primera venta real cobraría la base sin IVA o con un
  importe no revisado. Con ellas, Live solo se abre cuando el perfil está
  completo, el Tax Rate existe y la sesión cobra exactamente base + 21 %.
- No se crea nada en Stripe ni en Vercel desde este cambio; los ids se
  configuran después por Elvis y no se inventan.

## Siguiente paso

Elvis:
1. En el PR, desde el editor web de GitHub, escribir NIF y domicilio en
   `src/lib/launch/commercial-launch-profile.ts` y, en el mismo commit,
   `registrationStatus: "verified"` con `registrationVerifiedOn`.
2. Confirmar que recibe y responde correos en hola@zaltyko.com.
3. En Stripe **Live** (cuenta propia): crear el Tax Rate «IVA» 21 %, exclusivo,
   país España, tipo VAT; y los productos Starter y Growth con precios
   recurrentes en EUR: 19,00 €/mes, 190,00 €/año, 49,00 €/mes, 490,00 €/año
   (sin impuesto incluido).
4. En Vercel (Production): `STRIPE_SAAS_LIVE_TAX_RATE_ES_IVA21` y las variables
   `STRIPE_SAAS_LIVE_*` de clave, webhook, cuenta y los cuatro precios.
5. Marcar `taxTreatmentReviewed` y `legalTextsApproved` cuando estén revisados;
   `liveReleaseApproved`, el último.

Claude (con autorización expresa para staging):
1. Crear en Stripe **test** el mismo Tax Rate y poner
   `STRIPE_SAAS_TEST_TAX_RATE_ES_IVA21` en staging.
2. Probar en staging una contratación de Península/Baleares con tarjeta de
   test y comprobar el rechazo de Canarias/Ceuta/Melilla.
3. Revisar la factura de Stripe test: base, IVA 21 %, total, datos del
   vendedor y del cliente. Si cuadra, marcar `checkoutTaxVerified: true` en un
   PR; verificar el buzón y marcar `supportMailboxVerified` cuando Elvis
   responda.

El cambio debe pasar CI remota y revisión antes de cualquier despliegue. Este
documento no aplica SQL ni cambia configuración remota.

Fuentes oficiales consultadas 26-10-2026:
[LSSI art. 10](https://www.boe.es/buscar/act.php?id=BOE-A-2002-13758#a10),
[facturación art. 6](https://www.boe.es/buscar/act.php?id=BOE-A-2012-14696#a6),
[AEAT tipos IVA](https://sede.agenciatributaria.gob.es/Sede/iva/calculo-iva-repercutido-clientes/tipos-impositivos-iva.html).
