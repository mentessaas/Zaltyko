# Investigación legal y fiscal: cobro automático de cuotas y precios

**Fecha de consulta de fuentes: 24 de noviembre de 2026.**

> **Este documento no es una opinión jurídica ni sustituye el asesoramiento de un abogado o gestor.** Resume normas y documentación oficial y propone medidas prudentes para Zaltyko. La aplicación depende del contrato, de la configuración real de Stripe, de quién presta y cobra cada servicio y de los hechos de cada academia. Los textos del anexo son borradores para revisión profesional.

## Resumen ejecutivo

### Qué puede hacerse ya

- Continuar pruebas aisladas en Stripe sandbox, sin familias reales, manteniendo las banderas de producción apagadas. El propio ADR separa las pruebas de staging de la activación y dice que el cobro sigue cerrado.
- Preparar contratos y pantallas para dejar claro que la academia presta las clases, fija las cuotas y es la acreedora; que Stripe procesa y liquida el pago en su cuenta; y que Zaltyko presta el software, sin recibir ni custodiar el dinero ni cobrar comisión por el pago.
- Anunciar a clientes profesionales españoles un precio visible y claro con IVA incluido, siempre que se indique que el total mostrado corresponde al 21 % peninsular/balear y se corrija según el territorio y la condición fiscal del cliente. Como regla comercial sencilla, se recomienda publicar para España **29 €/mes, 290 €/año y 24,90 € fundador, IVA incluido**; hay que confirmar la periodicidad y duración de la tarifa fundador. Enseñar el tipo, base y total aplicables en el checkout y la factura.
- Mantener cobro manual de cuotas mientras se resuelven los documentos y controles de L1–L5 y L7. L4 solo es requisito para activar SEPA; L6 condiciona el justificante automático, no por sí solo la posibilidad jurídica de cobrar una cuota con tarjeta si la academia expide su factura y el consentimiento/documentación restantes están resueltos.

### Qué no debe encenderse todavía

- **No activar cargos automáticos a familias reales** hasta que abogado confirme el perímetro de servicios de pago y se aprueben los términos con las academias (L1–L2), el consentimiento expreso y flujo de autenticación/recuperación de tarjeta (L3), la información y reparto RGPD (L5), y el control de que consiente y paga una persona adulta facultada (L7).
- **No activar adeudos SEPA reales** hasta cerrar además la orden de domiciliación, el identificador de acreedor y la pre-notificación (L4), incluida la confirmación de quién la envía y con qué plazo. Stripe exige expresamente una pre-notificación con fecha, importe, referencia de mandato e identificador de acreedor.
- **No activar el envío del justificante de Zaltyko** hasta que gestor y abogado revisen el modelo de L6. El justificante interno no sustituye a la factura fiscal de la academia.
- **No vender todavía a academias mexicanas**: falta dictamen local sobre si este SaaS concreto entra en el listado de servicios digitales de la LIVA mexicana y, si entra, sobre inscripción RFC, representante/domicilio, IVA, declaraciones y comprobantes. Las posibles retenciones de ISR dependen de la calificación del pago y del Convenio España–México; no se pueden resolver como una retención automática por el solo hecho de que el cliente esté en México.

### Qué no está probado

La documentación del repositorio no demuestra que las nuevas banderas o migraciones estén activas en producción, que la cuenta Connect de una academia real esté creada para este flujo, que Stripe Live permita los métodos previstos, ni que se hayan probado allí autenticaciones, devoluciones y eventos. No se consultó Stripe, Supabase ni producción para esta investigación. La posición legal sobre L1–L7 queda pendiente de profesionales.

## Alcance y método

Se han leído el ADR-0028, `docs/COBROS_Y_CUOTAS.md` y los borradores de términos, privacidad y DPA. Este informe sigue las preguntas L1–L7 literalmente y distingue: (1) lo que dicen las fuentes; (2) una recomendación operativa; y (3) la decisión que debe validar un abogado o gestor. Se cita la fuente junto a la afirmación y se indica la fecha de consulta. En la sección de fuentes se enlaza el texto oficial o documento primario aplicable.

El ADR alterna una descripción histórica de Connect Standard y una decisión posterior de Accounts v2; también señala que el código anterior no se reutiliza. Para el análisis se toma el modelo vigente descrito en D2 y en la arquitectura: cuenta conectada de la academia, cargo directo, dinero en la cuenta de la academia. La configuración contractual y técnica definitiva debe cotejarse antes de producción.

## L1. Papel de Zaltyko y servicios de pago

### Qué dice la norma y la fuente

La norma española aplicable es el **Real Decreto-ley 19/2018, de 23 de noviembre**, no una «Ley 19/2018». Su artículo 4 excluye los servicios técnicos que apoyan la prestación de servicios de pago si el proveedor no entra nunca en posesión de los fondos que se transfieren. La misma norma excluye al agente comercial solo cuando actúa bajo un acuerdo para negociar o concluir la compra o venta por cuenta **exclusiva** del ordenante o del beneficiario. El art. 5 enumera quién puede prestar profesionalmente servicios de pago. La PSD2 contiene exclusiones equivalentes en su art. 3(b) y (j). ([RDL 19/2018, arts. 4–5, BOE](https://www.boe.es/buscar/act.php?id=BOE-A-2018-16036); [PSD2, arts. 3(b), 3(j), EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX%3A02015L2366-20240408); consulta: 24-11-2026.)

Stripe describe los cargos directos como cargos creados directamente en la cuenta conectada; su acuerdo de servicios asigna a la cuenta conectada y a la plataforma obligaciones según lo que cada una hace. La documentación no determina si el modelo concreto de Zaltyko está fuera de la autorización española: esa calificación depende de la actividad real, control de fondos, instrucciones, contratos y soporte. ([Stripe, direct charges](https://docs.stripe.com/connect/direct-charges); [Stripe Services Agreement—Service Terms, apartados Connect y MIT](https://stripe.com/legal/ssa-service-terms); [Stripe Connected Account Agreement](https://stripe.com/en-it/legal/connect-account); consulta: 24-11-2026.)

### Conclusión y recomendación para Zaltyko

Los hechos descritos —cargo directo a la cuenta propia de la academia, sin saldo de plataforma, sin recibir ni custodiar fondos y sin comisión de pago— son compatibles con la exclusión de proveedor técnico. Pero no bastan para afirmar por cuenta propia que no hace falta licencia o registro: Zaltyko inicia llamadas API que producen cargos y facilita/gestiona el flujo, por lo que hay que confirmar el perímetro con abogado de pagos español. No conviene basar el análisis principal en agente comercial: Zaltyko no negocia ni concluye el contrato de clases y la exclusión exige representación exclusiva de una parte.

Hasta recibir esa confirmación: limitar el producto a software y automatización por cuenta de la academia; evitar que fondos pasen por Zaltyko, que la plataforma decida o altere cuotas, que cobre comisión vinculada a la operación o que se presente como acreedora, proveedor de pago o vendedora de clases. Documentar los flujos de fondos, cargos directos, responsabilidades y poderes que sí autoriza la academia.

### A confirmar por abogado

1. Si la implementación real de Connect y las actuaciones de Zaltyko encajan en la exclusión técnica del art. 4 del RDL 19/2018, tanto tarjeta como SEPA.
2. Si iniciar cargos mediante API, guardar referencias de métodos, presentar métodos de pago o dar soporte a devoluciones altera la calificación.
3. Si el papel de la academia como acreedora/beneficiaria y titular de su cuenta Stripe queda inequívoco; si existe alguna obligación de inscripción, autorización, agente o comunicación al Banco de España.
4. Qué versión de Stripe Connected Account Agreement se incorpora para academias españolas, con qué flujo de aceptación y prueba.

## L2. Términos con las academias y acuerdo de Stripe

### Qué dicen las fuentes

Stripe exige una relación directa entre Stripe y la cuenta conectada, y sus términos requieren que el acuerdo plataforma–cuenta conectada explique el uso de datos de cuenta y qué actividad puede ejecutar la plataforma en nombre de la cuenta; la actividad requiere autorización y debe cesar cuando esta se retire. Stripe también indica que la academia debe aceptar el acuerdo de cuenta conectada antes de usar Stripe. ([Stripe Services Agreement, 3.4–3.5](https://stripe.com/legal/ssa-service-terms); [Stripe Connected Account Agreement](https://stripe.com/en-it/legal/connect-account); consulta: 24-11-2026.)

### Conclusión y recomendación para Zaltyko

Los Términos vigentes que describe el borrador contradicen el producto al decir que los pagos familiares no se cobran automáticamente. Antes de conectar una academia real, reemplazar esa afirmación y añadir una cláusula que identifique: academia como prestadora y acreedora; Zaltyko como proveedor técnico; Stripe como entidad de pago contratada directamente por la academia; cuenta, métodos, cargos y datos a los que la academia autoriza acceso; y responsabilidad de la academia por fijación de cuotas, avisos, impuestos de sus servicios, devoluciones, disputas y atención a familias. No declarar que una cláusula contractual exonera a Zaltyko de obligaciones legales propias.

### A confirmar por abogado

- Redacción, incorporación por referencia y prueba de aceptación de los términos de Zaltyko y de Stripe; qué texto recibe el administrador antes de iniciar onboarding.
- Si basta la aceptación del acuerdo de Stripe dentro de Stripe-hosted onboarding para cada tipo de Connected Account previsto en España.
- Obligaciones y límites de responsabilidad que no pueden trasladarse a la academia, y tratamiento de academias que sean asociación sin ánimo de lucro.

## L3. Consentimiento de la familia para tarjeta guardada, MIT y SCA

### Qué dicen las fuentes

Stripe clasifica una operación off-session como iniciada por el comercio sin el cliente presente. Para tratarla como MIT, Stripe requiere un mandato del cliente, que el pago corresponda a bienes o servicios prestados a ese cliente y que el comercio inicie el pago sin una acción concreta del cliente que lo dispare. Stripe recomienda que el acuerdo explique consentimiento a uno o varios pagos, frecuencia y cómo se determina el importe. ([Stripe, MIT guidance](https://support.stripe.com/questions/merchant-initiated-transactions-mits-when-to-categorize-a-transaction-as-mit); [Stripe, consentimiento para pagos recurrentes/SCA](https://support.stripe.com/questions/updating-your-terms-and-conditions-to-make-sure-customers-have-been-given-a-mandate-to-collect-recurring-payments-for-strong-customer-authentication-%28sca%29-purposes); consulta: 24-11-2026.)

El Reglamento Delegado (UE) 2018/389 exige SCA cuando el pagador crea, modifica o inicia por primera vez una serie de operaciones recurrentes **del mismo importe y al mismo beneficiario**; permite no repetir SCA en las operaciones posteriores de esa serie. Esto no da una exención general a cuotas variables. Si el banco exige autenticación, el pagador debe volver a la sesión y completarla; marcar un pago `off_session` no garantiza que el emisor lo apruebe ni elimina la obligación de tratar `requires_action`. ([Reglamento Delegado 2018/389, arts. 14 y 18, EUR-Lex](https://eur-lex.europa.eu/eli/reg_del/2018/389/oj/eng); [Stripe, off-session payments](https://support.stripe.com/questions/what-is-the-difference-between-on-session-and-off-session-and-why-is-it-important); consulta: 24-11-2026.)

### Conclusión y recomendación para Zaltyko

Guardar una tarjeta no equivale a autorizar cargos. Antes del primer cobro obtener del pagador adulto una acción afirmativa separada, sin casilla premarcada, con identidad de la academia, qué cuotas pueden cobrarse, periodicidad esperada, cómo se calcula el importe variable, cuándo se cobra, cómo quitar la autorización y qué hacer si el banco pide confirmar. Guardar versión del texto, fecha/hora, academia, pagador y referencia de autorización; permitir revocar sin fricción. Conservar el primer pago autenticado si el esquema MIT lo requiere en este caso concreto. Cuando Stripe devuelva acción requerida, no reintentar como si fuese rechazo ordinario: parar el cobro y llevar al pagador a una sesión de autenticación para el mismo intento, con límite temporal y sin duplicar cargos.

### A confirmar por abogado y adquirente

- Si el consentimiento propuesto en el Anexo B satisface PSD2, reglas de tarjetas/Stripe y derecho de consumo cuando el pagador familiar actúe como consumidor.
- Si una cuota mensual variable puede calificarse como MIT bajo las reglas del adquirente y qué mandato/operación inicial es necesario. No se debe afirmar que la excepción de SCA para recurrencia aplica a importes variables.
- Si los avisos de cambios de cuota, suspensión, baja, impago y revocación son suficientes y con qué preaviso contractual.

## L4. Orden SEPA Core, aviso previo e identificador de acreedor

### Qué dicen las fuentes

El EPC define el mandato como autorización del deudor al acreedor para iniciar adeudos sobre la cuenta indicada. Para identificar inequívocamente al cobrador se usa conjuntamente el identificador único del mandato y el identificador de acreedor. En el esquema Core, el deudor puede solicitar devolución de un adeudo autorizado dentro de ocho semanas sin justificarla; uno no autorizado, hasta trece meses. ([EPC, SDD Core Rulebook 2025 v1.2, vigente desde 30-09-2026](https://www.europeanpaymentscouncil.eu/document-library/rulebooks/2025-sepa-direct-debit-core-rulebook-version-1-2); [EPC, esquema SDD](https://www.europeanpaymentscouncil.eu/what-we-do/epc-payment-schemes/sepa-direct-debit); consulta: 24-11-2026.)

La pre-notificación debe comunicar importe y fecha de vencimiento. El plazo por defecto es al menos 14 días naturales antes del adeudo, salvo que acreedor y pagador hayan acordado otro plazo. El documento puede ser una factura, una programación de pagos repetidos o un aviso individual. ([EPC, SDD Core Rulebook, PT-04.02](https://www.europeanpaymentscouncil.eu/document-library/rulebooks/2025-sepa-direct-debit-core-rulebook-version-1-2); [EPC, nota aclaratoria v5.1](https://www.europeanpaymentscouncil.eu/document-library/guidance-documents/clarification-paper-sepa-direct-debit-core-and-sepa-direct); consulta: 24-11-2026.)

Stripe impone contractualmente que antes de presentar cada adeudo se envíe correo de pre-notificación con fecha, importe, referencia del mandato e identificador de acreedor. Por tanto, no debe asumirse que Stripe lo envía automáticamente en el modelo de Connect usado. ([Stripe, SEPA Direct Debit terms, actualizado 06-04-2026](https://stripe.com/legal/sepa-direct-debit); consulta: 24-11-2026.)

### Conclusión y recomendación para Zaltyko

No encender SEPA hasta verificar el formulario de mandato que ofrece Stripe para la cuenta conectada: nombre y dirección del acreedor, identificador de acreedor, referencia única, IBAN/pagador, texto obligatorio, autorización electrónica y evidencia conservada. La academia debe figurar como acreedora si así se ejecuta el flujo. Cada academia debe usar su identificador propio **si es su identificador de acreedor asignado**, pero el abogado y Stripe deben confirmar quién recibe formalmente el mandato y si Connect permite el identificador/descriptor esperado. No usar el ID de Stripe como propio de la academia ni uno inventado.

Recomendación conservadora: la academia envía el aviso previo mediante Zaltyko por encargo, de forma verificable, o Stripe confirma por escrito que lo envía para esa cuenta y método. Programar los adeudos con al menos 14 días de margen hasta que el abogado apruebe expresamente otro plazo acordado. Incluir como mínimo fecha, importe total y moneda, mandato e identificador de acreedor, y forma de contactar y revocar.

### A confirmar por abogado/Stripe

- Texto legal de mandato Core vigente en España y validez de firma/consentimiento electrónico en Stripe.
- Identificador de acreedor aplicable, acreedor que conserva el mandato y presentación visible en extracto bancario.
- Quién y cómo envía cada pre-notificación, plazo acordado y prueba de entrega. Las notas del ADR ya declaran L4 pendiente.

## L5. RGPD: academia, Zaltyko, Stripe e información a la familia

### Qué dicen las fuentes

RGPD no asigna roles por el nombre que las partes se den: responsable es quien decide fines y medios; encargado trata datos por cuenta e instrucciones del responsable. Un encargado necesita contrato del art. 28 con objeto, duración, finalidad, categorías, instrucciones, confidencialidad, seguridad, subencargados, derechos, brechas, devolución/supresión y auditoría. La información del art. 13 debe facilitarse cuando se recogen los datos e identificar responsable, fines, bases, destinatarios, transferencias, conservación y derechos. ([RGPD, arts. 4, 13, 28 y 32, EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=celex%3A32016R0679); [AEPD, roles de responsable y encargado](https://www.aepd.es/derechos-y-deberes/cumplimiento-de-las-obligaciones); consulta: 24-11-2026.)

Stripe declara que actúa como encargado en determinados tratamientos para el usuario de Stripe y como responsable independiente para otros fines que decide por sí mismo, entre ellos prevención del fraude, seguridad, cumplimiento legal/AML, relación, facturación y mejora de sus servicios. El DPA de Stripe hace responsable al usuario de dar avisos y obtener base jurídica/consentimientos que habiliten los datos que transmite. Esto significa que Stripe no puede describirse de forma global como solo encargado ni como solo responsable; hay que asignar el rol para cada finalidad y cada relación. ([Stripe DPA, actualizado 28-09-2026](https://stripe.com/legal/dpa); [Stripe Privacy Policy](https://stripe.com/legal/privacy); consulta: 24-11-2026.)

### Conclusión y recomendación para Zaltyko

Para la gestión de cuotas de la academia, la hipótesis de trabajo adecuada es academia responsable y Zaltyko encargado cuando Zaltyko actúa siguiendo sus instrucciones. Zaltyko es responsable de sus propios tratamientos (cuentas de usuario, seguridad, facturación de su SaaS y obligaciones propias). Stripe tiene roles distintos según la finalidad, incluida su responsabilidad independiente para funciones reguladas, fraude y cumplimiento. Debe verificarse el DPA de Stripe que se aplica a la cuenta conectada y su posición frente a cada flujo de familias.

Actualizar antes de activar: DPA academia–Zaltyko para cobros y subencargado Stripe; inventario/registro de actividades; términos de servicio y política de privacidad; pantalla de `/familia` antes de guardar medio y antes del primer cargo. La información familiar debe nombrar a la academia acreedora y sus datos de contacto como responsable de la cuota; identificar a Zaltyko y Stripe y sus funciones; explicar datos transmitidos (identidad y contacto del pagador, importe, cuota, token/referencias, método/estado), finalidad/base jurídica, conservación, destinatarios, transferencias, derechos y contacto. No incluir número completo de tarjeta ni IBAN en registros de Zaltyko.

### A confirmar por abogado/DPD

- Rol de Stripe en cada flujo Connect y entidad Stripe concreta; contrato/datos aplicables y mecanismo de transferencia internacional actual.
- Bases jurídicas separadas para ejecutar el contrato, gestionar el mandato, prevención de fraude y comunicaciones; no confundir consentimiento al cargo con consentimiento RGPD.
- Texto, momento y canal de información a familias; reparto de solicitudes de derechos y brechas entre academia, Zaltyko y Stripe.
- Que el DPA borrador, lista de subencargados y registro incluyan el flujo Connect y sus plazos reales.

## L6. Fiscalidad, factura y justificante

### Qué dicen las fuentes

El Reglamento español de facturación obliga al empresario/profesional a expedir factura por sus servicios y también por anticipos sujetos a esa obligación. Se puede usar factura simplificada hasta 400 € IVA incluido, pero un destinatario empresario/profesional puede exigir factura completa con sus datos para ejercer derechos tributarios. Un justificante de que se cargó una tarjeta prueba el pago, pero no reemplaza la factura de la clase/cuota que presta la academia. ([RD 1619/2012, arts. 2, 4 y 7, BOE](https://www.boe.es/buscar/act.php?id=BOE-A-2012-14696); consulta: 24-11-2026.)

La suscripción SaaS de Zaltyko y las clases de la academia son relaciones distintas. Si Stripe carga en la cuenta propia de la academia y Zaltyko no cobra comisión ni recibe fondos, el flujo técnico por sí solo no demuestra que cambie la base imponible o facturación de la suscripción de Zaltyko. La norma no permite confirmar aquí que «no cambia nada»: hacen falta el asiento contable, el titular de la cuenta y el circuito real de tarifas, devoluciones y reembolsos. No se factura a la familia por la cuota en nombre de la academia sin analizar representación y facturación.

El Reglamento de sistemas informáticos de facturación (VeriFactu/RRSIF) regula software que soporta procesos de facturación. Si Zaltyko solo presenta cargos, los registra como pagos del libro interno y no expide facturas fiscales, este flujo de cobro no convierte por sí solo al justificante en factura ni resuelve si otra función de Zaltyko entra en el ámbito del reglamento. La normativa prevé fechas de adaptación diferenciadas que fueron modificadas en 2025; el gestor debe revisar la obligación de Zaltyko como autónomo y el alcance del producto facturador antes de prometer compatibilidad fiscal. ([RD 1007/2023, arts. 1–3 y disposición final cuarta, texto consolidado BOE](https://www.boe.es/buscar/act.php?id=BOE-A-2023-24840); consulta: 24-11-2026.)

### Conclusión y recomendación para Zaltyko

Mantener el texto «justificante de pago» y aclarar que no es factura, no calcula impuestos de la academia y no sustituye su factura. La academia conserva su obligación de facturar por las clases conforme a su régimen. Mostrar qué cuota/periodo se pagó, academia acreedora, pagador, fecha, importe/moneda, estado, referencia y método enmascarado; no afirmar que ese recibo cumple una obligación fiscal. Mantener apagada `ZALTYKO_FAMILY_COLLECTION_RECEIPTS_ENABLED` hasta revisión de gestor/abogado. Si el cobro se activa antes, exigir que la academia tenga un proceso propio y comunicado para facturar.

Para los precios de Zaltyko, presentar los importes sin IVA y el impuesto aplicable antes de comprar a clientes empresariales, y dar total claro; para consumidores, mostrar total con impuestos. La factura de Zaltyko al cliente profesional debe reflejar base, tipo y cuota de IVA según el lugar de imposición y situación fiscal; no basta el cargo de Stripe. L6 no es una prohibición general al cargo familiar: sí bloquea la función específica de recibo automática hasta revisión, y no elimina la obligación de factura de la academia.

### A confirmar por gestor/abogado

- Que el flujo directo no genera comisión, ingreso o suplido de Zaltyko; asiento correcto de ingresos y gastos Stripe; devoluciones y contracargos.
- Quién emite factura a la familia, serie, momento, destinatario, IVA de las clases y tratamiento en asociaciones, autónomos y empresas.
- Si una función actual o futura de Zaltyko (facturas, abonos, rectificativas, exportaciones que soporten facturación) convierte el producto en sistema informático de facturación sujeto al RD 1007/2023 y qué calendario aplica a Elvis/Zaltyko.
- Contenido mínimo y denominación del justificante no fiscal. No dar por verificado que sea «suficiente» para justificar el pago.

## L7. Menores y pagador adulto

### Qué dicen las fuentes

En España, los menores no emancipados solo pueden celebrar por sí mismos los contratos que la ley permita, con asistencia de representante cuando corresponda, y los relativos a bienes y servicios corrientes propios de su edad. En protección de datos, la LOPDGDD permite basar un tratamiento en el consentimiento del menor desde los 14 años, con excepciones y requisitos para menores de 14; esta edad de consentimiento de datos no confiere por sí sola capacidad para autorizar cargos en una tarjeta ajena o contratar una actividad. ([Código Civil, arts. 1263–1264, BOE](https://www.boe.es/eli/es/rd/1889/07/24/%281%29/con/20250103); [LO 3/2018, art. 7, BOE](https://www.boe.es/buscar/act.php?id=BOE-A-2018-16673); consulta: 24-11-2026.)

### Conclusión y recomendación para Zaltyko

El diseño del ADR es prudente: la gimnasta menor no guarda el método ni autoriza el cobro. Verificar que quien añade la tarjeta o cuenta bancaria es una persona adulta vinculada a la familia y reconocida como pagadora, y que declara tener autoridad sobre el método de pago y representación necesaria. Guardar el vínculo, autorización y prueba; impedir que el nombre de una menor sustituya al pagador adulto en la autorización. Si hay dos tutores, conflicto de patria potestad, custodia o pagador tercero, no automatizar hasta aclarar quién puede autorizar.

### A confirmar por abogado

- Si el consentimiento contractual del pagador adulto es suficiente para la cuota y el medio de pago en los supuestos de custodia compartida, tutores o familiares no progenitores.
- Qué prueba proporcional debe pedir la plataforma sin recoger más documentación de menores de la necesaria.
- Si se requiere consentimiento/info adicional para datos de menores distintos del tratamiento necesario para prestar la actividad.

## Precios nuevos: España y Unión Europea

### Regla española y presentación al público

La LSSI exige que, al publicar precios de un servicio online, se indique de forma clara y exacta si incluyen impuestos. Para contratos a distancia con consumidores, la información previa debe incluir el precio total con impuestos y, si es suscripción, el coste por periodo de facturación. ([LSSI, art. 10.1.f, BOE](https://www.boe.es/buscar/act.php?id=BOE-A-2002-13758); [Directiva 2011/83/UE, art. 6.1.e, EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=celex%3A02011L0083-20220528); consulta: 24-11-2026.)

En España peninsular y Baleares, la prestación SaaS ordinaria está normalmente al tipo general del 21 %, sujeto a que el gestor confirme el servicio y circunstancias. Canarias, Ceuta y Melilla no aplican IVA peninsular. El comprador puede ser asociación, sociedad o autónomo: importa si actúa como empresario/profesional y dónde está establecido, no solo su forma legal o ausencia de ánimo de lucro. Una asociación puede ejercer actividad económica; el estatus debe acreditarse para aplicar inversión del sujeto pasivo o reglas B2B. ([Ley 37/1992, arts. 69, 70, 84 y 90, BOE](https://www.boe.es/buscar/act.php?id=BOE-A-1992-28740); consulta: 24-11-2026.)

### Clientes empresariales en la UE

En servicios B2B, la regla general localiza la prestación donde está establecido el cliente empresario/profesional; en muchos casos el cliente liquida el IVA por inversión del sujeto pasivo. Comprobar condición empresarial y NIF-IVA intracomunitario antes de tratar una operación como B2B. Si el cliente no es sujeto pasivo —por ejemplo, un consumidor o una entidad que no actúa como tal en esa compra—, servicios electrónicos se localizan normalmente donde reside el cliente. Existe el umbral conjunto de 10.000 € (año actual y anterior) para ciertos proveedores establecidos solo en un Estado miembro; al superarlo, o al optar, se aplica IVA del Estado de consumo y puede declararse por OSS. ([Directiva 2006/112/CE, arts. 44, 58 y 59 quater, EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX%3A02006L0112-20250320); [LIVA, arts. 69–70](https://www.boe.es/buscar/act.php?id=BOE-A-1992-28740); consulta: 24-11-2026.)

### Recomendación de precio

Los precios que el usuario ha propuesto son cifras finales de España con el 21 % incluido. El desglose matemático orientativo es el siguiente. Para el precio fundador, la periodicidad no está indicada; la base y el IVA se calculan suponiendo también 21 %:

| Precio final | Base imponible (21 %) | IVA | Presentación recomendada |
|---:|---:|---:|---|
| 29,00 €/mes | 23,97 € | 5,03 € | 29 €/mes, IVA incluido (España peninsular/Baleares) |
| 290,00 €/año | 239,67 € | 50,33 € | 290 €/año, IVA incluido (España peninsular/Baleares) |
| 24,90 € fundador (periodicidad no indicada) | 20,58 € | 4,32 € | 24,90 €, IVA incluido (España peninsular/Baleares) |

Son cálculos de dividir el precio final entre 1,21 y redondear a céntimos, no determinan el precio de otros territorios. Publicar un precio final claro para España. En checkout adaptar la etiqueta y total al país y condición fiscal: España 21 % cuando proceda; B2B UE con inversión cuando se cumplen requisitos; cliente EU no empresarial con tipo de destino/OSS cuando corresponda. No decir «IVA incluido» a secas si el precio mostrado no incluye todos los impuestos que puedan resultar aplicables. Informar al cliente profesional de base, IVA/tipo o inversión del sujeto pasivo antes de contratar y en la factura.

### A confirmar por gestor

- Clasificación del servicio electrónico de Zaltyko y tratamiento preciso en territorios españoles no peninsulares.
- Verificación de VAT ID y tratamiento de asociaciones sin ánimo de lucro/entidades públicas según actúen o no como empresarios.
- Umbral 10.000 €, uso/renuncia a OSS, evidencias de localización del consumidor y tasas locales UE; facturación OSS si se vende a B2C europeo.
- Si los importes propuestos son precios finales vigentes para nuevo cliente o también se quieren aplicar a cuentas ya contratadas. Este informe no modifica precios contractuales ni valida un cambio unilateral a clientes actuales.
- Periodicidad, duración, cupo y requisitos de elegibilidad de la tarifa fundador de 24,90 €.

## Venta a academias de México desde España

### Qué dicen las normas mexicanas y el tratado

La LIVA mexicana establece IVA general del 16 % y un régimen especial para residentes en el extranjero sin establecimiento en México que presten los **servicios digitales definidos por la ley** a receptores ubicados allí. Entre las obligaciones del art. 18-D figuran registrarse en el RFC dentro de 30 días desde el primer servicio sujeto, cobrar IVA expresamente y por separado, reportar operaciones y receptores mensualmente, calcular/pagar IVA mensual y cumplir requisitos de comprobante. La RMF para 2026 exige representante y domicilio en México al inscribirse y fija requisitos del comprobante solicitado. ([LIVA, arts. 1, 18-B, 18-D y 18-E, texto del SAT; su PDF indica última reforma 12-11-2021](https://wwwmat.sat.gob.mx/cs/Satellite?blobcol=urldata&blobkey=id&blobtable=MungoBlobs&blobwhere=1461175802025&ssbinary=true); [RMF para 2026, reglas 12.1.1, 12.1.3 y 12.1.4, DOF/SAT](https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2026/rmf/rmf/RMF_2026-DOF-28122025.pdf); consulta: 24-11-2026.)

El art. 18-B delimita categorías de servicios digitales automatizados; no se ha verificado que el SaaS de administración de academias de Zaltyko encaje inequívocamente en una de ellas. El SAT trata el régimen como aplicable a los servicios expresamente comprendidos y a receptores situados en México. Por tanto, no es responsable afirmar sin dictamen que el registro/IVA mexicano es automático para todo SaaS extranjero, ni afirmar que no aplica. La determinación del lugar del receptor usa presunciones legales (incluida IP, medio de pago o teléfono mexicanos, según corresponda). ([LIVA, arts. 18-B, 18-C, 18-D, SAT](https://wwwmat.sat.gob.mx/cs/Satellite?blobcol=urldata&blobkey=id&blobtable=MungoBlobs&blobwhere=1461175802025&ssbinary=true); consulta: 24-11-2026.)

En ISR, la ley mexicana grava ciertas rentas de fuente mexicana de no residentes, con reglas distintas para servicios personales, regalías y otros conceptos. El Convenio España–México establece que beneficios empresariales tributan en el Estado de residencia salvo establecimiento permanente en el otro Estado, mientras que los cánones/regalías pueden someterse en México con el límite del convenio, si se califican como tales y se cumplen sus requisitos. La mera contratación de SaaS no permite concluir si el pago es beneficio empresarial, regalía por licencia o servicio; hace falta analizar derechos concedidos, acceso remoto, explotación/reproducción de software, servicios y presencia física. La versión consolidada de la LISR de la Cámara consultada informa última reforma de 01-04-2024; no se verificó en un texto oficial consolidado si hubo reformas posteriores hasta la fecha de este informe, por lo que los artículos y retenciones deben refrescarse antes de vender. ([LISR, arts. 153, 156 y 167, Cámara de Diputados; consolidación consultada con última reforma 01-04-2024](https://www.congreso.gob.mx/LeyesBiblio/pdf_mov/Ley_del_Impuesto_sobre_la_Renta.pdf); [Convenio España–México, arts. 7 y 12, BOE](https://www.boe.es/buscar/act.php?id=BOE-A-1994-23743); consulta: 24-11-2026.)

### Conclusión y recomendación para Zaltyko

No abrir ventas activas a México hasta que un fiscalista mexicano confirme por escrito si la suscripción concreta cae bajo arts. 18-B y 18-D y establezca las obligaciones de registro, RFC, representante, domicilio, facturación, declaraciones y moneda. Si sí aplica, presupuestar el 16 % mexicano y mostrarlo expresamente separado en el comprobante mexicano; el IVA no está incluido simplemente porque el precio web muestre euros. Determinar por separado si clientes mexicanos deben retener ISR y qué certificado/documentos permiten aplicar el convenio. No cobrar un neto arbitrario que asuma cero retenciones ni presentar el convenio como exención automática.

Mientras se resuelve, se puede preparar una política de bloqueo geográfico/contractual o no ofrecer alta/pago a cuentas mexicanas. La prueba ya existente en México no prueba que la fiscalidad mexicana esté resuelta.

### A confirmar por fiscalista mexicano y español

- Encaje del software de acceso remoto de Zaltyko en las categorías cerradas del art. 18-B LIVA; identificación del receptor y fecha de primer suministro sujeto.
- Registro RFC como residente extranjero de servicios digitales; representante y domicilio en México; IVA del 16 % separado, declaraciones mensuales, reportes, comprobante y otros datos/cambios de la RMF vigente.
- Si cliente mexicano debe retener ISR: calificación de SaaS frente a licencia de software/royalty/servicio; artículos de LISR y Convenio; certificado de residencia fiscal y documentos requeridos; deducibilidad y comprobantes del pagador.
- Cobro en euros o MXN, efectos cambiarios y comisiones bancarias; términos y factura con impuestos, precio y responsable correctos.

## Lista final de bloqueos para familias reales

| Punto | Tarjeta | SEPA | ¿Bloquea cualquier cargo familiar? |
|---|---|---|---|
| L1: calificación de Zaltyko bajo RDL 19/2018 | Sí, confirmar | Sí, confirmar | Sí, hasta dictamen |
| L2: términos academia–Zaltyko y aceptación de Stripe | Sí | Sí | Sí, antes de conectar academia real |
| L3: consentimiento claro de tarjeta, MIT/SCA y recuperación | Sí | No es el mandato SEPA | Sí para tarjeta automática |
| L4: mandato SEPA, pre-notificación e identificador | No | Sí | Solo bloquea SEPA |
| L5: DPA, privacidad e información a pagador/familia | Sí | Sí | Sí |
| L6: justificante fiscal/no fiscal | Bloquea el envío del justificante; no necesariamente el cargo si academia factura | Igual | No, si se apaga recibo y academia factura correctamente |
| L7: tutor adulto facultado, prueba y bloqueo de menores | Sí | Sí | Sí |
| Prueba técnica de extremo a extremo con cuentas sandbox; Live no probado | Sí | Sí | Sí, como gate operativo antes de Live |
| México | No afecta piloto español | No afecta piloto español | No; bloquea solo ventas a México |

Además de esos puntos jurídicos, el ADR identifica pruebas sandbox y pasos de infraestructura/migración todavía no acreditados en producción, y ordena autorizaciones separadas de Elvis para cualquier cambio en producción. Por tanto, resolver la consulta legal no activa por sí solo el flujo.

## Anexo. Borradores para revisión del abogado

**Los siguientes textos son propuestas de trabajo, no cláusulas aprobadas.** Sustituir los campos entre llaves y validar con la implementación, Stripe y un abogado antes de incorporarlos a documentos o pantallas.

### Anexo A. Cláusula de términos para academias (L2)

> **Cobro de cuotas de la Academia mediante Stripe.** La Academia decide y comunica a las familias el precio, concepto, periodicidad y vencimiento de sus cuotas, y es la prestadora del servicio de actividad deportiva y acreedora de esas cantidades. Si activa los cobros automáticos, autoriza a Zaltyko a transmitir a Stripe las instrucciones de pago que la Academia configure y a mostrar en Zaltyko el estado e información necesarios para gestionar esas cuotas. Los pagos se procesan directamente en la cuenta Stripe conectada de la Academia. La Academia mantiene una relación contractual propia con Stripe y acepta el acuerdo de cuenta conectada que Stripe le presente antes de utilizar el servicio. Zaltyko proporciona la herramienta técnica y no recibe ni custodia los fondos de las cuotas ni cobra una comisión por ellas. La Academia responde de que las cuotas, su comunicación y sus impuestos sean correctos, de emitir las facturas que correspondan, de los mandatos y avisos previos que le incumban, y de atender pagos, devoluciones, disputas y reclamaciones de las familias. La Academia puede desconectar el servicio y revocar las autorizaciones de actividad de Zaltyko en la cuenta según las opciones disponibles. Este apartado no limita las obligaciones que la ley imponga directamente a Zaltyko, Stripe o la Academia.

### Anexo B. Consentimiento para guardar tarjeta y cargos variables (L3)

> **Autorizo a {nombre legal de la Academia}, y no a Zaltyko, a solicitar a Stripe el cobro en mi tarjeta de las cuotas de {nombre de la gimnasta/persona inscrita} que la Academia me comunique y que estén vencidas.** La Academia podrá iniciar un cargo mensual, normalmente el día {día}, por el importe que resulte de las cuotas vigentes y de los conceptos que yo haya contratado con ella. Antes de cada vencimiento, la Academia me comunicará el periodo y el importe aplicable. Entiendo que el importe puede cambiar si cambia la cuota o los servicios que he contratado; cualquier cambio se comunicará antes de cobrarlo. Autorizo a la Academia a iniciar cada cargo sin que yo tenga que estar presente, usando la tarjeta guardada por Stripe. Stripe o el banco pueden pedir que vuelva a entrar y confirme una operación; si eso ocurre, el cargo no se considerará completado hasta que se confirme. Puedo retirar esta autorización en cualquier momento desde {ruta/contacto} o escribiendo a {contacto de la Academia}; la retirada impedirá nuevos cargos, pero no anula importes ya vencidos ni impide pagarlos por otro medio. Mi tarjeta se guarda y procesa por Stripe; Zaltyko solo conserva referencias técnicas y los datos enmascarados que se indiquen.

Casilla sin marcar por defecto: **«He leído la información de pago y autorizo a {Academia} a iniciar los cargos descritos en mi tarjeta guardada»**. Guardar versión íntegra, aceptación explícita, fecha/hora, pagador adulto, academia y persona inscrita vinculada. El texto final debe incorporar enlace a cuotas vigentes, derechos de devolución y canal efectivo de revocación.

### Anexo C. Información breve para la familia (L5)

> **Quién cobra y quién procesa tus datos.** La cuota la cobra {nombre legal y contacto de la Academia}, que presta la actividad y decide el importe y vencimiento; la Academia es responsable del tratamiento de los datos necesarios para gestionar la cuota. Zaltyko presta el software a la Academia y trata los datos de pago siguiendo sus instrucciones. Stripe procesa el pago en la cuenta de Stripe de la Academia; para algunas finalidades propias —como seguridad, prevención del fraude y obligaciones legales— Stripe trata datos bajo sus propios términos y como responsable independiente. Para guardar y gestionar el método de pago se pueden transmitir a Stripe tu nombre, correo, referencia de la cuota, importe, método y estado del pago. Zaltyko no recibe el número completo de tarjeta ni el IBAN. Consulta la política de privacidad de {Academia}, la de [Zaltyko](https://zaltyko.com/privacidad) y la de [Stripe](https://stripe.com/privacy) para conocer base jurídica, conservación, destinatarios, transferencias, derechos y contactos. Para corregir una cuota o retirar la autorización de cobro, contacta con {Academia}; para derechos sobre datos, puedes dirigirte a {contacto y canal de privacidad}.

Este aviso breve debe enlazar la información completa del art. 13 RGPD antes de recoger la tarjeta, indicar bases jurídicas y plazos reales y ajustarse a la función efectiva que Stripe desempeña en cada tratamiento.

### Anexo D. Justificante de pago familiar (L6)

> **JUSTIFICANTE DE PAGO — NO ES FACTURA**  
> Academia acreedora: {nombre legal y NIF de la academia}  
> Pagador: {nombre de la persona adulta pagadora}  
> Cuota y periodo: {concepto / mes / año}  
> Importe pagado: {importe y moneda}  
> Fecha del pago: {fecha y hora}  
> Medio: {tarjeta o domiciliación; marca y últimos cuatro dígitos, si aplica}  
> Estado: {pagado / pendiente de confirmación / devuelto}  
> Referencia: {referencia de Zaltyko o Stripe}  
> Este justificante acredita el estado técnico del pago mostrado. No es una factura, no desglosa impuestos de la actividad de la Academia y no sustituye la factura o documento fiscal que deba emitir la Academia. Para solicitar una factura, corregir el concepto o consultar la cuota, contacta con {Academia y contacto}.

El gestor debe revisar si mostrar “pagado” mientras un adeudo SEPA aún puede devolverse es correcto y qué estado/fecha debe imprimirse. No incluir datos completos de tarjeta o cuenta bancaria.

## Fuentes consultadas

Todas las fuentes siguientes se consultaron el **24-11-2026**. Las normas citadas se enlazan en versión consolidada u oficial cuando estaba disponible; una página de ayuda de un proveedor describe sus condiciones de producto, no sustituye la norma.

### España y Unión Europea

- [Real Decreto-ley 19/2018, de servicios de pago, BOE](https://www.boe.es/buscar/act.php?id=BOE-A-2018-16036).
- [PSD2, Directiva (UE) 2015/2366, texto consolidado EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX%3A02015L2366-20240408).
- [Reglamento Delegado (UE) 2018/389, SCA, EUR-Lex](https://eur-lex.europa.eu/eli/reg_del/2018/389/oj/eng).
- [RGPD, Reglamento (UE) 2016/679, EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=celex%3A32016R0679).
- [LO 3/2018, LOPDGDD, BOE](https://www.boe.es/buscar/act.php?id=BOE-A-2018-16673).
- [Código Civil, BOE](https://www.boe.es/eli/es/rd/1889/07/24/%281%29/con/20250103).
- [Ley 34/2002, LSSI, BOE](https://www.boe.es/buscar/act.php?id=BOE-A-2002-13758).
- [Ley 37/1992, IVA, BOE](https://www.boe.es/buscar/act.php?id=BOE-A-1992-28740).
- [Reglamento (UE) 2006/112/CE, IVA, arts. 44, 58 y 59 quater, EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX%3A02006L0112-20250320).
- [Directiva 2011/83/UE, derechos de consumidores, EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=celex%3A02011L0083-20220528).
- [RD 1619/2012, facturación, BOE](https://www.boe.es/buscar/act.php?id=BOE-A-2012-14696).
- [RD 1007/2023, sistemas de facturación, BOE](https://www.boe.es/buscar/act.php?id=BOE-A-2023-24840).
- [AEPD, responsable y encargado](https://www.aepd.es/derechos-y-deberes/cumplimiento-de-las-obligaciones).

### EPC y Stripe

- [EPC, SDD Core Rulebook 2025 v1.2, vigente desde 30-09-2026](https://www.europeanpaymentscouncil.eu/document-library/rulebooks/2025-sepa-direct-debit-core-rulebook-version-1-2).
- [EPC, nota aclaratoria SDD Core/B2B v5.1](https://www.europeanpaymentscouncil.eu/document-library/guidance-documents/clarification-paper-sepa-direct-debit-core-and-sepa-direct).
- [EPC, mandato SEPA](https://www.europeanpaymentscouncil.eu/what-we-do/epc-payment-schemes/sepa-direct-debit/sdd-mandate).
- [Stripe, condiciones de SEPA Direct Debit, actualizadas 06-04-2026](https://stripe.com/legal/sepa-direct-debit).
- [Stripe, Services Agreement—Service Terms, Connect](https://stripe.com/legal/ssa-service-terms).
- [Stripe, documentación oficial de cargos directos en Connect](https://docs.stripe.com/connect/direct-charges).
- [Stripe, Connected Account Agreement](https://stripe.com/en-it/legal/connect-account).
- [Stripe, Data Processing Agreement, actualizado 28-09-2026](https://stripe.com/legal/dpa).
- [Stripe, MIT: cuándo usar esa clasificación](https://support.stripe.com/questions/merchant-initiated-transactions-mits-when-to-categorize-a-transaction-as-mit).
- [Stripe, mandato en términos para pagos recurrentes y SCA](https://support.stripe.com/questions/updating-your-terms-and-conditions-to-make-sure-customers-have-been-given-a-mandate-to-collect-recurring-payments-for-strong-customer-authentication-%28sca%29-purposes).
- [Stripe, on-session y off-session](https://support.stripe.com/questions/what-is-the-difference-between-on-session-and-off-session-and-why-is-it-important).

### México

- [Ley del IVA, SAT, arts. 1 y 18-B–18-D](https://wwwmat.sat.gob.mx/cs/Satellite?blobcol=urldata&blobkey=id&blobtable=MungoBlobs&blobwhere=1461175802025&ssbinary=true).
- [SAT, declaración de IVA para servicios digitales de residentes en el extranjero](https://wwwmat.sat.gob.mx/declaracion/42009/presenta-tu-declaracion-de-pagos).
- [RMF para 2026, reglas 12.1.1, 12.1.3 y 12.1.4, SAT/DOF](https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2026/rmf/rmf/RMF_2026-DOF-28122025.pdf).
- [Ley del ISR, arts. 153, 156 y 167, Cámara de Diputados; texto consolidado indica última reforma 01-04-2024](https://www.congreso.gob.mx/LeyesBiblio/pdf_mov/Ley_del_Impuesto_sobre_la_Renta.pdf).
- [Convenio para evitar doble imposición España–México, arts. 7 y 12, BOE](https://www.boe.es/buscar/act.php?id=BOE-A-1994-23743).
