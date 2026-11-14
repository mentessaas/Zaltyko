# Términos y condiciones — cambios propuestos

> **Borrador generado por IA, no es asesoramiento jurídico; requiere revisión por abogado o servicio jurídico antes de publicarse.**
>
> - Estado: BORRADOR PARA VALIDACIÓN. No cambia la página publicada.
> - Texto de partida: `src/app/terminos/page.tsx` («Última actualización: 26 de
>   octubre de 2026») y el bloque `src/components/legal/SellerIdentification.tsx`.
> - Formato de cada cambio: **Texto actual → Texto propuesto → Motivo**.
> - Datos del titular como marcadores: `[NOMBRE Y APELLIDOS DEL TITULAR]`,
>   `[NIF DEL TITULAR]`, `[DOMICILIO PROFESIONAL]`.
> - «PROPUESTA» marca decisiones que debe tomar el abogado o Elvis.

## Resumen de diferencias con la versión publicada

| # | Tema | Situación actual | Cambio |
| --- | --- | --- | --- |
| T1 | Identificación del prestador (LSSI art. 10) | Bloque con NIF y domicilio «Pendiente de completar»; titular «Promotor y futuro titular» | Sección 0 con todos los datos de LSSI art. 10 |
| T2 | Objeto y partes | Habla de «Zaltyko» como si fuera una sociedad | El titular es una persona física; Zaltyko es el nombre comercial |
| T3 | Registro y roles | Roles «owner, coach, staff, súper admin» | Roles reales: owner, manager, admin, coach; súper admin es del titular |
| T4 | Información previa a la contratación (LSSI art. 27) | No existe | Nueva sección: pasos, archivo, idioma y corrección de errores |
| T5 | Confirmación (LSSI art. 28; TRLGDCU art. 98.7) | No existe; **hoy Zaltyko no envía un correo propio de confirmación** | Nueva sección y recomendación técnica |
| T6 | Precios e IVA | Precios base; «el impuesto aplicable deberá mostrarse» | Precios con IVA, territorio, renovación y facturación |
| T7 | Desistimiento (14 días) | No existe en Términos; solo la casilla del Checkout | Nueva sección; **revisar el texto de la casilla** |
| T8 | Cancelación y paso a Free | Una frase en §3 | Sección propia con efectos sobre los datos |
| T9 | Datos personales y DPA | DPA «solicitándolo» | DPA incorporado como anexo y aceptado en línea |
| T10 | Integraciones de terceros | Stripe y Supabase como «integraciones opcionales» | Distinguir proveedores esenciales de integraciones opcionales |
| T11 | Garantías y responsabilidad | «Tal cual», límite de 12 meses | Salvedades para consumidores y para datos personales |
| T12 | Cambios en los términos | «Antelación razonable» | Plazo concreto y derecho a cancelar |
| T13 | Ley y jurisdicción | Legislación española | Fuero del consumidor; sin plataforma ODR |
| T14 | Versión y fecha | Solo fecha | Identificador de versión |

---

## T1. Identificación del prestador (LSSI art. 10)

**Texto actual** (bloque `SellerIdentification`, encima de la sección 1):

> Identificación de Zaltyko — Promotor y futuro titular: {legalName} · País:
> España · NIF: Pendiente de completar · Domicilio profesional: Pendiente de
> completar · Contacto oficial: hola@zaltyko.com

(Mientras falten datos, aparece además: «Información legal en preparación. La
contratación de pago todavía no está abierta.»)

**Texto propuesto** (nueva sección «0. Quién presta el servicio», que puede
seguir alimentándose del perfil único):

> **0. Quién presta el servicio**
>
> Zaltyko es el nombre comercial con el que presta este servicio
> [NOMBRE Y APELLIDOS DEL TITULAR], empresario individual (autónomo) con NIF
> [NIF DEL TITULAR] y domicilio profesional en [DOMICILIO PROFESIONAL], España
> («el titular» o «nosotros»).
>
> - Correo electrónico de contacto: hola@zaltyko.com
> - Sitio web: https://zaltyko.com
> - Inscripción registral: el titular no está inscrito en el Registro Mercantil.
>   [PROPUESTA: confirmar que no hay inscripción voluntaria.]
> - La actividad no requiere autorización administrativa previa ni se ejerce
>   como profesión regulada.
> - Códigos de conducta: el titular no está adherido a ningún código de conducta.

**Motivo**: LSSI art. 10.1 exige nombre, NIF, domicilio, correo, datos de
inscripción registral si los hay, autorización administrativa y profesión
regulada si aplican, códigos de conducta y precios con impuestos (este último
se cubre en T6). Hoy faltan NIF, domicilio y las menciones negativas. La
etiqueta «Promotor y futuro titular» debe pasar a «Titular» al marcar
`registrationStatus: "verified"`.

---

## T2. Objeto y partes (sección 1 y sección 5)

**Texto actual** (§1, segundo párrafo):

> Al registrarte, acceder o utilizar el servicio confirmas que tienes autoridad
> para hacerlo en nombre de una organización y aceptas estos términos.

**Texto actual** (§5, primer párrafo):

> El software, la marca Zaltyko y sus componentes son propiedad de Zaltyko. […]

**Texto propuesto** (§1, segundo párrafo, nuevo):

> Estas condiciones forman un contrato entre el titular y la academia, club,
> asociación o persona que crea la cuenta («la academia» o «tú»). Al registrarte
> confirmas que tienes autoridad para contratar en su nombre. Si la academia es
> una asociación o entidad sin ánimo de lucro que contrata fuera de una
> actividad comercial o empresarial, o una persona física que no actúa como
> empresario, puede tener la condición de consumidora y le son aplicables,
> además, los derechos de la sección 7 (desistimiento) y las demás normas de
> protección de consumidores, que prevalecen sobre estas condiciones.

**Texto propuesto** (§5, primer párrafo):

> El software, la marca Zaltyko y sus componentes pertenecen al titular. […]

**Motivo**: «Zaltyko» no tiene personalidad jurídica propia; el contratante es
el titular persona física. El art. 3 TRLGDCU considera consumidoras a las
entidades sin ánimo de lucro que actúan en un ámbito ajeno a una actividad
comercial o empresarial; el propio código ya lo asume
(`src/modules/saas-billing/domain/immediate-start-consent.ts`). [PROPUESTA:
confirmar si la titularidad de la marca está registrada a nombre del titular.]

---

## T3. Registro y roles (sección 2)

**Texto actual**:

> El usuario administrador es responsable de la veracidad de los datos
> proporcionados, así como de configurar los roles (owner, coach, staff, súper
> admin) dentro de cada academia.

**Texto propuesto**:

> La persona que crea la cuenta es la propietaria («owner») de la academia en
> Zaltyko. Es responsable de la veracidad de los datos y de asignar a su
> equipo los roles disponibles (propietaria, dirección, administración y
> entrenadora) con el acceso mínimo necesario, y de retirarlo cuando deje de
> ser necesario.

**Motivo**: los roles del código son `owner`, `manager`, `admin` y `coach`
(`src/db/schema/zaltyko-core.ts`). «Súper admin» es un acceso del titular para
soporte y no lo configura la academia; se menciona en el contrato de encargo
(cláusula 6.2).

---

## T4. Información previa a la contratación electrónica (LSSI art. 27)

**Texto actual**: no existe.

**Texto propuesto** (nueva sección «Cómo se contrata un plan de pago»):

> **Cómo se contrata un plan de pago**
>
> 1. Crea tu cuenta y la de tu academia. Al registrarte aceptas estas
>    condiciones y declaras haber leído la Política de privacidad.
> 2. Entra en **Plan**. Elige Starter o Growth y el pago mensual o anual.
> 3. Si tu academia está en España, indica su sede fiscal. Verás el precio base,
>    el IVA y el total antes de continuar.
> 4. Marca la casilla de inicio inmediato del servicio (ver sección 7). Sin ella
>    no se puede continuar.
> 5. Te llevamos a la página de pago segura de Stripe. Allí indicas la razón
>    social o el nombre, el NIF y la dirección de facturación, y el medio de pago.
>    Antes de pagar ves un resumen con el plan, la periodicidad y el importe total.
> 6. Al confirmar el pago, vuelves a Zaltyko, donde se muestra el plan activado.
>
> **Corregir errores**: hasta el paso 6 puedes volver atrás, cambiar el plan,
> la periodicidad o la sede fiscal, y corregir los datos de la página de pago.
> Si sales de la página de pago sin pagar, no se cobra nada. Si detectas un
> error en tus datos de facturación después de pagar, escríbenos a
> hola@zaltyko.com y emitiremos la factura rectificativa que proceda.
>
> **Archivo del contrato**: guardamos la constancia de tu contratación (plan,
> periodicidad, fecha, versión de estas condiciones y versión de la casilla de
> inicio inmediato que marcaste). Puedes pedirnos una copia en hola@zaltyko.com.
> Estas condiciones están siempre disponibles en https://zaltyko.com/terminos y
> puedes guardarlas o imprimirlas.
>
> **Idioma**: el contrato se celebra en español.
>
> **Prueba gratuita**: puedes activar una prueba de Starter de 7 días, sin
> tarjeta y sin cobro automático al terminar.

**Motivo**: LSSI art. 27.1 obliga a informar antes del inicio del procedimiento
de los trámites, de si se archivará el documento electrónico y si será
accesible, de los medios para identificar y corregir errores y de la lengua; el
art. 27.4 exige poner las condiciones a disposición para su almacenamiento y
reproducción. Los pasos se han tomado de
`src/components/owner-dashboard/OwnerSaasBillingManager.tsx` y de la creación de
la sesión de Stripe en `src/modules/saas-billing/application/saas-billing-service.ts`.

**Hallazgos a resolver antes de publicar**:

- La sesión de Stripe guarda la versión de la casilla (`immediate_start_consent:
  "desistimiento-14d-v1"`), pero **no la versión de los Términos aceptada**. Esa
  versión solo se guarda en el registro (`owner_signup_consents.policy_version`).
  Para cumplir lo que dice el texto propuesto («guardamos la versión de estas
  condiciones») hay que añadirla a los metadatos del Checkout o enlazar ambos
  registros.
- No hay enlace a los Términos dentro del paso de contratación del Plan; se
  recomienda añadirlo junto a la casilla.
- Antes de publicar hay que comprobar en staging que la página de Stripe
  muestra el resumen y que «cancelar» devuelve a Zaltyko sin cobro (la URL de
  cancelación existe en el código: `checkoutReturnUrl(…, "cancelled")`).

---

## T5. Confirmación de la contratación (LSSI art. 28; TRLGDCU art. 98.7)

**Texto actual**: no existe.

**Situación técnica actual**: al pagar, Stripe devuelve a Zaltyko con
`checkout=confirming` y la pantalla muestra el plan cuando llega el webhook.
**Zaltyko no envía hoy ningún correo propio de confirmación** de la
contratación (no hay envío en `src/modules/saas-billing/application/webhook-service.ts`).
Stripe puede enviar recibos si están activados en su panel (NO VERIFICADO) y la
factura completa se emite aparte en FacturaDirecta (no se ha verificado si se
envía automáticamente al cliente ni cuándo).

**Texto propuesto** (nueva sección «Confirmación»):

> **Confirmación**
>
> Cuando se complete el pago, te enviaremos en un plazo máximo de 24 horas un
> correo electrónico a la dirección de la cuenta con la confirmación de la
> contratación: plan, periodicidad, precio base, IVA y total, fecha de inicio,
> fecha de la siguiente renovación, estas condiciones (o un enlace a su versión
> fechada) y el texto de la casilla de inicio inmediato que marcaste. La factura
> completa se emite y se envía por separado.

**Motivo**: LSSI art. 28.1 exige confirmar la aceptación por correo en 24 horas
o por un medio equivalente al usado en la contratación, siempre que el
destinatario pueda archivarla. Para consumidores, el art. 98.7 TRLGDCU exige
además entregar la confirmación del contrato en un **soporte duradero** (una
pantalla no lo es) antes de que empiece la ejecución, o en un plazo razonable,
incluyendo, cuando proceda, la constancia del consentimiento al inicio
inmediato.

**Recomendación técnica (fuera de este PR)**: enviar el correo de confirmación
desde el webhook que activa el plan, con Brevo, e incluir la versión de los
Términos y de la casilla. Hasta que exista, no publicar el texto propuesto.

---

## T6. Precios, IVA y facturación (sección 3, primer párrafo)

**Texto actual**:

> El catálogo incluye Free, Starter y Growth. Starter tiene un precio base de
> 19 €/mes o 190 €/año; Growth, de 49 €/mes o 490 €/año. Estos precios no
> incluyen IVA. El impuesto aplicable y el importe final deberán mostrarse antes
> de confirmar la contratación. Network requiere contratación acompañada.

**Texto propuesto**:

> **Planes y precios**
>
> | Plan | Precio base (sin IVA) | IVA 21 % | Total para academias de Península y Baleares |
> | --- | --- | --- | --- |
> | Free | 0 € | — | 0 € |
> | Starter mensual | 19,00 €/mes | 3,99 € | **22,99 €/mes** |
> | Starter anual | 190,00 €/año | 39,90 € | **229,90 €/año** |
> | Growth mensual | 49,00 €/mes | 10,29 € | **59,29 €/mes** |
> | Growth anual | 490,00 €/año | 102,90 € | **592,90 €/año** |
> | Network | Presupuesto a medida | — | Se informa antes de contratar |
>
> El IVA aplicable es el general del 21 % para academias con sede fiscal en la
> Península o Baleares. Por ahora la contratación de pago no está disponible
> para academias con sede en Canarias, Ceuta o Melilla ni fuera de España; esas
> academias pueden seguir usando el plan Free.
>
> La suscripción se renueva automáticamente al final de cada periodo (mes o año)
> por el mismo importe, salvo que la canceles antes (sección 8). Si cambian los
> precios, te avisaremos con al menos [PROPUESTA: 30 días] de antelación y
> podrás cancelar antes de que se aplique el nuevo precio.
>
> El cobro lo gestiona Stripe. El titular emite una factura completa por cada
> cobro, con los datos de facturación que indiques en el pago.

**Motivo**: LSSI art. 10.1.f y TRLGDCU art. 97.1.e exigen informar del precio
total con impuestos. Los importes salen de `src/lib/plans/catalog.ts` y del
cálculo de `src/modules/saas-billing/domain/spanish-vat.ts` (IVA redondeado al
céntimo); la prueba en staging del 13-11-2026 cobró 22,99 € por Starter mensual
(`docs/deployment/spain-seller-activation-2026-10-26.md`). El territorio sale de
`src/modules/organizations/domain/commercial-market-capabilities.ts`.

**A validar**: el catálogo del código tiene Network a 99 €/mes
(`src/lib/plans/catalog.ts`), mientras que el contexto comercial dice «por
contacto». Hay que alinear el texto con lo que se ofrezca de verdad.

---

## T7. Derecho de desistimiento (nueva sección)

**Texto actual en Términos**: no existe.

**Texto actual de la casilla del Checkout** (versión `desistimiento-14d-v1`,
`src/modules/saas-billing/domain/immediate-start-consent.ts`), que se muestra a
todas las academias de España y es obligatoria para pagar:

> Solicito que el servicio empiece de inmediato al contratar y reconozco que,
> una vez iniciado, pierdo el derecho de desistimiento de 14 días.

**Riesgo principal a validar por el abogado**: el comentario del código
fundamenta la casilla en el art. 103.m TRLGDCU, que se refiere al **contenido
digital** sin soporte material. Una suscripción SaaS se parece más a un
**servicio digital** (permite crear, tratar y almacenar datos), al que se
aplicaría la excepción de servicios del art. 103.a TRLGDCU: el derecho de
desistimiento solo se pierde cuando el servicio se ha **ejecutado por
completo**, y si el consumidor pidió el inicio inmediato y desiste dentro de los
14 días, debe pagar la parte proporcional de lo prestado (art. 108.3 TRLGDCU).
Si esta interpretación es correcta, la frase «una vez iniciado, pierdo el
derecho» podría no ser válida para consumidores y debería cambiarse. Además, el
art. 98.7 TRLGDCU pide que la confirmación en soporte duradero (T5) recoja ese
consentimiento.

**Texto propuesto para la casilla** (sería la versión `desistimiento-14d-v2`;
cambiar el texto obliga a cambiar la versión, según el propio archivo):

> Solicito que el servicio empiece de inmediato, durante el plazo de
> desistimiento. Entiendo que, si soy consumidor y desisto en los 14 días
> siguientes, pagaré la parte proporcional del servicio prestado hasta que
> comunique el desistimiento, y que perderé ese derecho cuando el servicio se
> haya prestado por completo.

**Texto propuesto para los Términos** (nueva sección «7. Derecho de
desistimiento»):

> **7. Derecho de desistimiento (solo consumidores)**
>
> Si la academia contrata como consumidora (por ejemplo, una asociación o club
> sin ánimo de lucro que actúa fuera de una actividad comercial o empresarial),
> puede desistir del contrato en un plazo de 14 días naturales desde la
> contratación, sin indicar el motivo.
>
> Para ejercerlo, envía antes de que termine el plazo una declaración clara a
> hola@zaltyko.com o por correo postal a [DOMICILIO PROFESIONAL]. Puedes usar el
> modelo de formulario que aparece al final, aunque no es obligatorio.
>
> **Inicio inmediato**: para contratar, nos pides expresamente que el servicio
> empiece en el momento del pago, durante el plazo de desistimiento. Si después
> desistes, te devolveremos lo pagado descontando la parte proporcional del
> servicio prestado hasta que nos comuniques el desistimiento. Perderás el
> derecho cuando el servicio se haya prestado por completo.
>
> **Devolución**: reembolsaremos el importe que corresponda sin demora y, como
> máximo, en 14 días naturales desde que recibamos tu desistimiento, con el
> mismo medio de pago que usaste, sin ningún coste para ti. Tras el
> desistimiento la academia pasa al plan Free y conserva sus datos.
>
> Las academias que contratan como empresa o profesional no tienen derecho de
> desistimiento, pero pueden cancelar en cualquier momento (sección 8).
>
> **Modelo de formulario de desistimiento**
>
> A la atención de [NOMBRE Y APELLIDOS DEL TITULAR] (Zaltyko), [DOMICILIO
> PROFESIONAL], hola@zaltyko.com:
>
> Por la presente le comunico que desisto del contrato de prestación del
> siguiente servicio: plan [Starter/Growth], [mensual/anual].
>
> - Contratado el: [fecha]
> - Nombre de la academia y de quien firma: [ ]
> - Correo de la cuenta: [ ]
> - Firma (solo si se envía en papel) y fecha: [ ]

**Motivo**: TRLGDCU arts. 97.1.i, 102 a 108 y Anexo B (modelo de formulario).
La casilla y la renuncia ya existen en el código; los Términos no informan del
derecho ni de su ejercicio. [PROPUESTA: decidir si el desistimiento se ofrece
también a todas las academias por política comercial, lo que simplificaría la
casilla.] [PROPUESTA: confirmar si debe distinguirse el plan anual, en el que
la parte proporcional de 14 días es pequeña frente al total.]

---

## T8. Cancelación y paso a Free (sección 3, tercer párrafo, y sección 9)

**Texto actual** (§3, tercer párrafo):

> Puedes cancelar o cambiar de plan en cualquier momento desde el portal de
> suscripción. Si solicitas la baja, el plan continuará activo hasta el final
> del periodo en curso.

**Texto actual** (§9):

> Puedes dejar de usar el servicio en cualquier momento. También podremos
> suspender o cancelar tu acceso si incumples estos términos o si lo exige una
> autoridad competente.
>
> La conservación y eliminación de los datos se rigen por la Política de
> Privacidad y las obligaciones legales aplicables.

**Texto propuesto** (nueva sección «8. Cancelación, paso a Free y cierre de la
cuenta»):

> **8. Cancelación, paso a Free y cierre de la cuenta**
>
> Puedes cancelar tu plan de pago en cualquier momento desde **Plan → Gestionar
> suscripción** (portal de Stripe). La cancelación se aplica al final del periodo ya pagado, hasta
> el que conservas el plan. No se devuelve la parte no consumida del periodo,
> salvo en caso de desistimiento (sección 7) o cuando la ley lo exija.
>
> Al terminar el periodo, la academia pasa al plan **Free**. Sus datos se
> conservan. Si la academia supera los límites de Free (hoy, 30 gimnastas y 10
> clases), la cuenta queda en **modo solo lectura**: puedes consultar y
> exportar los datos, pero no añadir más hasta que archives lo que sobra o
> contrates un plan suficiente.
>
> Puedes cerrar la cuenta de la academia escribiéndonos a hola@zaltyko.com.
> Antes, descarga tus datos desde **Plan → Descargar datos operativos**. El
> cierre, la devolución y la supresión de los datos de tu academia siguen lo
> previsto en el contrato de encargo del tratamiento (Anexo).
>
> Podemos suspender o cancelar el acceso si incumples gravemente estas
> condiciones o si lo exige una autoridad, avisándote antes salvo que la
> urgencia o la ley lo impidan, y dándote ocasión de descargar tus datos.

**Motivo**: la cancelación por portal y el efecto al final del periodo ya están
en §3; se añade lo que ocurre con los datos, que hoy no se explica. Los límites
de Free salen de `src/lib/plans/catalog.ts` y el modo solo lectura de
`src/modules/saas-billing/application/organization-usage.ts` («Los datos se
conservan»). **No verificado**: que el portal de Stripe esté configurado para
cancelar al final del periodo (el código lee `cancel_at_period_end`, pero la
configuración del portal está en el panel de Stripe). Tampoco existe hoy un
botón de cierre de cuenta; por eso se propone hacerlo por correo.

---

## T9. Datos personales y contrato de encargo (sección 6)

**Texto actual**:

> El tratamiento de datos personales se describe en nuestra Política de
> Privacidad. Nos comprometemos a mantener la confidencialidad de la
> información de tu academia.
>
> Puedes firmar un Acuerdo de Encargado de Tratamiento (DPA) solicitándolo a
> hola@zaltyko.com para dar cumplimiento a la normativa europea aplicable.

**Texto propuesto**:

> Respecto a los datos de gimnastas, familias y personal que tu academia
> introduce en Zaltyko, tu academia es la responsable del tratamiento y el
> titular actúa como encargado. Ese tratamiento se rige por el **contrato de
> encargo del tratamiento**, que forma parte de estas condiciones y aceptas al
> registrarte. Puedes descargarlo en [URL] o pedirnos una copia firmada.
>
> Los datos que tratamos como responsables (tu cuenta, la facturación, la
> seguridad de la plataforma) se describen en la Política de privacidad.

**Motivo**: el art. 28.3 RGPD exige que el encargo conste en un contrato u otro
acto jurídico **antes** de tratar los datos. Ofrecerlo «a petición» deja sin
contrato a las academias que no lo piden. Ver
`contrato-encargado-tratamiento.md`.

---

## T10. Integraciones de terceros (sección 7)

**Texto actual**:

> El acceso a integraciones opcionales (Stripe, Supabase, Brevo y otros
> proveedores autorizados) está sujeto a los términos de cada proveedor. No
> somos responsables de su disponibilidad ni de incidencias derivadas de su uso.

**Texto propuesto**:

> Para prestar el servicio usamos proveedores esenciales (alojamiento, base de
> datos, correo y pagos), que figuran en la lista de subencargados del contrato
> de encargo. Respondemos de ellos frente a ti en los términos de ese contrato.
>
> Algunas funciones opcionales que tú decides activar (por ejemplo, el envío de
> mensajes por WhatsApp) dependen de servicios de terceros con sus propias
> condiciones. Te informaremos de ellas antes de activarlas.

**Motivo**: Stripe, Supabase y Brevo no son integraciones opcionales sino
proveedores esenciales. Exonerarse de «incidencias derivadas de su uso»
contradice el art. 28.4 RGPD (el encargado responde de sus subencargados).

---

## T11. Garantías y responsabilidad (sección 8)

**Texto actual**:

> Zaltyko se ofrece "tal cual". Aunque trabajamos para garantizar alta
> disponibilidad, no garantizamos ausencia de interrupciones. No responderemos
> por daños indirectos, lucro cesante o pérdida de datos ocasionados por
> terceros.
>
> Nuestra responsabilidad total frente a tu organización estará limitada al
> importe abonado en los últimos doce (12) meses previos al incidente que
> origine la reclamación.

**Texto propuesto**:

> Trabajamos para que Zaltyko esté disponible y funcione correctamente, pero no
> podemos garantizar que no haya interrupciones, por ejemplo por mantenimiento
> o por fallos de proveedores.
>
> Si la academia contrata como empresa o profesional, no responderemos de daños
> indirectos ni de lucro cesante, y nuestra responsabilidad total estará
> limitada al importe pagado en los 12 meses anteriores al hecho que origine la
> reclamación [PROPUESTA: fijar un mínimo, por ejemplo [X] €, para que no sea
> cero en el plan Free].
>
> Estas limitaciones no se aplican en caso de dolo o culpa grave, a los daños
> a las personas, a las obligaciones de protección de datos personales ni a
> los derechos que la ley reconoce a los consumidores, incluida la garantía de
> conformidad de los servicios digitales.

**Motivo**: frente a consumidores, las cláusulas que limitan o excluyen la
responsabilidad o la garantía pueden ser abusivas (TRLGDCU arts. 82, 86 y
114 y siguientes). Con un límite basado en lo pagado, una academia en Free no
tendría ninguna compensación aunque se filtren datos de menores. El abogado
debe decidir el alcance.

---

## T12. Cambios en los términos (sección 10)

**Texto actual**:

> Podemos actualizar estas condiciones para reflejar cambios normativos o
> mejoras del servicio. Te lo notificaremos con antelación razonable mediante
> correo electrónico a los administradores registrados.

**Texto propuesto**:

> Podemos actualizar estas condiciones por cambios normativos, de los
> proveedores o del servicio. Te avisaremos por correo a la cuenta propietaria
> con al menos [PROPUESTA: 30 días] de antelación, salvo que el cambio lo
> imponga la ley con un plazo menor. Si no estás de acuerdo, puedes cancelar
> antes de que entren en vigor sin coste adicional. Los cambios no afectan al
> periodo ya pagado.

**Motivo**: TRLGDCU art. 85.3 (modificación unilateral sin motivo válido y sin
derecho de resolución puede ser abusiva). «Antelación razonable» es indefinido.

---

## T13. Ley aplicable y jurisdicción (sección 11)

**Texto actual**:

> Estos términos se rigen por la legislación española, respetando las normas
> imperativas y la jurisdicción que corresponda legalmente.

**Texto propuesto**:

> Estas condiciones se rigen por la legislación española. Si la academia es
> consumidora, puede reclamar ante los juzgados de su domicilio y conserva la
> protección de las normas imperativas de su país de residencia. En otro caso,
> [PROPUESTA: fuero del domicilio del titular].
>
> Para reclamaciones de consumo puedes escribir a hola@zaltyko.com. El titular
> no está adherido al Sistema Arbitral de Consumo. [PROPUESTA: confirmar.]

**Motivo**: TRLGDCU art. 90.2 (fuero del consumidor) y Reglamento Roma I art.
6. Como el registro está abierto a cualquier país, la referencia a normas
imperativas extranjeras es necesaria. No se incluye enlace a la plataforma
europea de resolución de litigios en línea (ODR) porque fue suprimida
(Reglamento (UE) 2024/3228) — **confirmar con el abogado**.

---

## T14. Versión y fecha

**Texto actual**: «Última actualización: 26 de octubre de 2026».

**Texto propuesto**: «Versión [PROPUESTA: terminos-v2] · En vigor desde
[FECHA]». Conservar las versiones anteriores accesibles (por ejemplo,
`/terminos/v1`).

**Motivo**: permite probar qué versión aceptó cada academia (enlaza con T4 y
con `owner_signup_consents.policy_version`, hoy con formato `vN-AAAA-MM-DD`).

---

## Otros puntos menores

- §1: «Los pagos familiares no se cobran automáticamente» es coherente con el
  producto actual. El código tiene Stripe Connect para familias
  (`src/app/api/stripe/connect`); si se activa, habrá que cambiar este párrafo.
- §4: «Zaltyko se reserva el derecho de auditar logs de auditoría» → «Podemos
  revisar los registros técnicos y de auditoría para detectar usos indebidos y
  proteger la plataforma».
- No existe una página de política de cookies ni de aviso legal separada; la
  identificación del titular se muestra en Términos y Privacidad. Ver README.
