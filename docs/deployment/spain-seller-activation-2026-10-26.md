# Preparación del vendedor y contratación en España

## Hallazgos

Declaración humana del26oct2026: Elvis Valdes Inerarte prevé vender como autónomo
en España, todavía no ha formalizado el alta. Confirma hola@zaltyko.com como
correo oficial. Los precios aprobados son base sin IVA. No se ha recibido NIF,
domicilio profesional ni confirmación del tratamiento fiscal aplicable.

Esto prepara el producto para completar esos datos; no afirma un alta existente,
la entrega efectiva del buzón ni habilita compras reales. La identificación
visible se presenta como información legal en preparación y futuro titular.

## Fuente y lugar de edición

`src/lib/launch/commercial-launch-profile.ts` contiene el perfil único consumido
por Términos, Privacidad y el control de Checkout SaaS. No guardar documentos de
identidad, contraseñas o claves en ese archivo ni en este informe.

| Campo | Estado actual | Acción al formalizar el alta |
| --- | --- | --- |
| legalName | Elvis Valdes Inerarte, declaración humana | Contrastar grafía con el documento fiscal |
| countryCode | ES, declaración humana | Confirmar establecimiento y territorio fiscal |
| taxId | null | Completar el NIF fiscal que corresponda |
| professionalAddress | null | Completar el domicilio profesional/legal publicable |
| supportEmail | hola@zaltyko.com, oficial por declaración | Conservar o cambiar el correo confirmado |
| registrationStatus | pending | verified solo tras confirmar alta efectiva y fecha |
| supportMailboxVerified | false | Verificar recepción y respuesta reales |
| taxTreatmentReviewed | false | Confirmar tipo, territorio, destinatarios y reglas de factura |
| checkoutTaxVerified | false | Implementar y probar el cálculo y total en Checkout/factura |
| legalTextsApproved | false | Cerrar textos, privacidad y encargo de tratamiento |
| liveReleaseApproved | false | Abrir solo tras configuración Live y gates de publicación |

Completar NIF y domicilio no basta para abrir cobros: las comprobaciones
independientes deben estar acreditadas. La declaración no equivale a una
validación automática del NIF ni a un alta verificada.

## Importancia

- El servidor rechaza Checkout Live con503 BILLING_CONFIGURATION_UNAVAILABLE
  **antes** de reservar operaciones en DB, crear clientes o llamar a Stripe.
  La lectura de acciones tampoco ofrece contratar mientras el perfil no está listo.
- Stripe test conserva su recorrido. El control no afecta Portal, cancelaciones,
  lectura de acceso ni procesamiento de eventos firmados. No se cambia el ensayo.
- El Checkout actual no añade impuestos al precio reservado. No marcar
  checkoutTaxVerified hasta implementar y comprobar un contrato fiscal específico.
  No se activa Stripe Tax, Connect ni ningún impuesto automáticamente.
- Si se confirma una operación sujeta al tipo general21%, los totales de referencia
  serían22,99€/mes y229,90€/año para Starter;59,29€/mes y592,90€/año para Growth.
  Es un ejemplo aritmético, no un tipo configurado ni una conclusión para Canarias,
  Ceuta/Melilla, operaciones exentas o clientes de otros territorios.
- Se retiran plazos heredados no acreditados de reembolso de siete días,
  exportación durante treinta días y borrado automático a treinta días;
  no se sustituyen por otros.

## Siguiente paso

Tras el alta, completar el perfil y cerrar fiscalidad/textos con la información
real; después preparar el cambio fiscal de Checkout, probarlo en test y revisar
los importes de factura. Configurar Stripe Live propio con acceso vigente,
catálogo y firma separados, manteniendo precios base aprobados. La prueba será
la primera contratación auténtica; no una compra real del usuario para simularla.

El nuevo commit debe pasar CI remota y revisión externa antes de cualquier build
con secretos. Este documento no aplica SQL ni cambia configuración remota.

Fuentes oficiales consultadas26oct2026:
[LSSI art10](https://www.boe.es/buscar/act.php?id=BOE-A-2002-13758#a10),
[facturación art6](https://www.boe.es/buscar/act.php?id=BOE-A-2012-14696#a6),
[AEAT tipos IVA](https://sede.agenciatributaria.gob.es/Sede/iva/calculo-iva-repercutido-clientes/tipos-impositivos-iva.html).
