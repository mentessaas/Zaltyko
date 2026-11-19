# Propuesta fiscal del software Zaltyko para revisión del gestor

Fecha: **6 de noviembre de 2026**. Estado: **PROPUESTA, NO VALIDADA POR EL GESTOR**. Preparación documental sobre producto base `c32a7e448572db642c177199f9e6d728b1643ec6` y borradores legales locales coordinados. No es una declaración censal, una liquidación tributaria ni una autorización para facturar o cobrar en producción.

## Hallazgos y recomendación priorizada

Recomiendo presentar al gestor la explotación de Zaltyko como **suscripción a un software de gestión para academias**, estudiar primero su encuadre empresarial y preparar inicialmente la venta B2B a compradores establecidos en España peninsular. Para ese caso propongo revisar **IVA general del 21 %** y **ausencia de retención únicamente si se confirma la calificación empresarial y no concurre otra renta sujeta**. Son hipótesis razonadas, no reglas aprobadas para este titular. La alternativa profesional y los contratos de propiedad intelectual requieren examen expreso.

El orden de cierre propuesto es: **actividad y censo → IVA y retención → facturador y documento → comprobación técnica autorizada → decisión comercial posterior**. No trasladar la exención de enseñanza ni las facturas de las familias al vendedor del SaaS.

## Fuente: hechos de partida y límites

| Hecho | Fuente y grado de acreditación | Importancia |
| --- | --- | --- |
| Alta 036 y resolución RETA de 5 de noviembre de 2026 revisadas documentalmente por coordinación. El resumen comunicado identifica CNAE 8559 / IAE 826 en RETA; el 036 incluye también 6596, 844 y 9611. Consta alta en IVA general desde el 5 de noviembre y no una situación exclusivamente exenta. | **Hechos documentales comunicados por Root en el chat**. No se han reabierto documentos personales ni consultado AEAT para comprobar el estado administrativo actual. | No acredita que la explotación del software esté ya correctamente declarada ni determina su tratamiento tributario. No usar esas actividades como habilitación automática del SaaS. |
| Identidad y domicilio autorizados para textos legales y facturas. | [Perfil central del vendedor](/Users/elvisvaldesinerarte/Projects/Zaltyko/trabajos/Zaltyko-main-bridge-20261025/src/lib/launch/commercial-launch-profile.ts). No se reproducen sus valores en este documento. | El gestor debe contrastarlos en el expediente central; autorización de publicación e idoneidad fiscal son cuestiones distintas. |
| Zaltyko vende acceso a software; las academias prestan sus propios servicios a sus familias. | [Preparación técnica: tres circuitos](/Users/elvisvaldesinerarte/Projects/Zaltyko/trabajos/Zaltyko-main-bridge-20261025/docs/legal/facturacion-saas-preparacion.md:9). | El emisor SaaS y el emisor de las clases no son intercambiables. Un recibo operativo familiar no sustituye la factura SaaS. |
| Starter: bases 19 EUR/mes y 190 EUR/año. Growth: bases 49 EUR/mes y 490 EUR/año. | [Contrato de precios existente](/Users/elvisvaldesinerarte/Projects/Zaltyko/trabajos/Zaltyko-main-bridge-20261025/docs/legal/facturacion-saas-preparacion.md:19). | Son bases comerciales; no se cambian ni se presentan como precio final fiscal validado. |

Las fuentes públicas oficiales se consultaron el **6 de noviembre de 2026**. La investigación describe reglas generales y distingue su aplicación propuesta de lo que debe confirmar el gestor. No se han consultado cuentas de proveedores, realizado envíos, emitido facturas, presentado modelos, ejecutado SQL ni pruebas o builds locales. No se modifica producto, configuración, vault ni otros documentos existentes.

## Hallazgo 1: actividad de software y encuadre censal

**Hipótesis recomendada:** estudiar como primera opción el grupo **845, sección primera**, para la explotación organizada del software propio mediante suscripciones. Su tarifa comprende programación, venta de programas y tratamiento de datos. Contrastar la alternativa **763, sección segunda**, si la actividad real es el trabajo personal de programación/análisis profesional. Ser persona física no resuelve por sí solo esta elección. Las reglas 3 y 4 distinguen las secciones y el alcance de cada actividad. [BOE: tarifas e instrucción IAE, grupos 845 y 763 y reglas 3–4](https://www.boe.es/buscar/act.php?id=BOE-A-1990-23930).

**Importancia:** el producto es un acceso recurrente a una plataforma; no se describe aquí un encargo de programación a medida ni enseñanza impartida por el titular. Esta descripción favorece estudiar la explotación empresarial, pero es una **inferencia**, no una clasificación vinculante del caso.

**Qué confirmar:** quién explota y es titular de los derechos; qué se concede al cliente; organización y medios; desarrollo propio o ajeno; soporte incluido; servicios profesionales separables; rúbrica o rúbricas correctas; CNAE aplicable y eventual modificación censal, con fecha y obligaciones. No afirmar que el alta actual basta. La clasificación de las actividades y la declaración censal siguen siendo relevantes aunque proceda exención de pago del IAE; la AEAT explica la sustitución del modelo 840 por el 036 cuando todas las actividades están exentas. [AEAT: actividades a declarar](https://sede.agenciatributaria.gob.es/Sede/declaraciones-informativas-otros-impuestos-tasas/impuesto-sobre-actividades-economicas/que-actividades-debo-declarar.html), [AEAT: declaración censal e IAE](https://www3.agenciatributaria.gob.es/Sede/censos-nif-domicilio-fiscal/tramites-censales-relacionados-empresarios-profesionales-retenedores/impuesto-sobre-actividades-economicas.html).

## Hallazgo 2: SaaS, enseñanza y propuesta de IVA inicial

**Hipótesis recomendada:** tratar el acceso predominantemente automatizado a Zaltyko como servicio de software por vía electrónica, sujeto y no exento en el escenario B2B peninsular descrito. La AEAT incluye acceso a programas y actualizaciones entre los servicios electrónicos; distingue la enseñanza impartida por un profesor a través de Internet. Que el comprador sea una academia no convierte el software en enseñanza. [AEAT: servicios electrónicos](https://sede.agenciatributaria.gob.es/Sede/iva/iva-comercio-electronico/iva-telecomunicaciones-servicios-electronicos.html).

**Evidencia normativa:** la exención educativa del artículo 20.Uno.9 LIVA exige una prestación y condiciones específicas; no se hereda por la actividad del cliente. Para el B2B, el artículo 69.Uno.1 localiza el servicio donde esté el establecimiento destinatario. El artículo 90 fija el tipo general del 21 %. [BOE: Ley del IVA, artículos 20, 69 y 90](https://www.boe.es/buscar/act.php?id=BOE-A-1992-28740).

**Importancia:** propongo 21 % como hipótesis de trabajo para un vendedor establecido en territorio IVA español que vende este SaaS a una academia que actúa como empresario y recibe el servicio en Málaga. La posible exención de las clases del comprador no exime automáticamente su compra de software ni garantiza que pueda deducir su IVA.

**Qué confirmar:** prestación y contrato reales; establecimiento del vendedor y del destinatario; condición empresarial del comprador; inexistencia de exención o regla especial aplicable; devengo de mensualidades/anualidades y anticipos; redondeo; rectificaciones; declaraciones y libros correspondientes. No introducir un tipo universal por país de la interfaz ni activar cálculo automático sin contrato revisado.

### Casos futuros separados, sin habilitación

| Caso | Orientación para una futura revisión | Decisión pendiente |
| --- | --- | --- |
| B2B Península/Baleares, destinatario allí establecido | Escenario inicial propuesto con IVA general si se confirman sus premisas. | Identificación fiscal y establecimiento destinatario acreditados. |
| B2B en otro Estado miembro UE | Regla de localización en destino; posible inversión del sujeto pasivo. | Acreditación empresarial/NIF-IVA, ROI/VIES cuando corresponda, mención en factura y obligaciones informativas. |
| B2B fuera de la UE, incluido un futuro cliente en México | Estudiar no sujeción al IVA español por localización y las obligaciones del destino. | Evidencia empresarial/establecimiento, reglas particulares y fiscalidad del país receptor. No significa ausencia de impuestos en destino. |
| Canarias, Ceuta o Melilla | Fuera del territorio de aplicación del IVA peninsular. | Localización, impuesto territorial, sujeto obligado y menciones; no aplicar mecánicamente el 21 %. |
| Consumidor final, especialmente electrónico transfronterizo UE | Reglas específicas de destino y, en casos tasados, umbral conjunto de 10.000 EUR y posible OSS. | Condición del cliente, pruebas de localización, requisitos del umbral y registros. No abrir B2C ni otros mercados por este documento. |

La tabla es una agenda de revisión, no una configuración aprobada. Fuentes: [AEAT: localización de servicios B2B](https://sede.agenciatributaria.gob.es/Sede/iva/iva-operaciones-comercio-exterior/prestaciones-servicios.html), [AEAT: servicios electrónicos y excepción del umbral](https://sede.agenciatributaria.gob.es/Sede/iva/iva-comercio-electronico/iva-telecomunicaciones-servicios-electronicos.html).

## Hallazgo 3: retención IRPF, decisión condicionada

**Hipótesis recomendada para el ejemplo:** no descontar retención si el gestor confirma una explotación empresarial ordinaria del SaaS y descarta otras categorías sujetas. No justificarlo solo por escribir «licencia» o «suscripción», ni solo por escoger un epígrafe. Examinar el contenido de los derechos cedidos y la posición del autor/explotador.

**Evidencia:** el artículo 95 RIRPF establece retención general profesional del 15 % y un 7 % de inicio condicionado, durante el ejercicio inicial y los dos siguientes. Exige no haber ejercido actividad profesional en el año anterior y comunicación firmada al pagador. También contempla rendimientos de autores y una distinción cuando editan directamente sus obras. [BOE: Reglamento IRPF, artículo 95](https://www.boe.es/buscar/act.php?id=BOE-A-2007-6820#a95). La LIRPF contiene reglas de retención para propiedad intelectual que deben examinarse si el contrato encaja en ellas. [BOE: LIRPF, artículo 101](https://www.boe.es/buscar/act.php?id=BOE-A-2006-20764#a101).

**Qué confirmar:** calificación empresarial/profesional o de otra renta, derechos concretos, pagador obligado a retener y porcentaje aplicable. El alta de noviembre no acredita por sí sola el derecho al 7 %. Una eventual retención reduce el líquido a cobrar; no es un descuento comercial ni modifica por sí misma la base de IVA. Si procede, rehacer el ejemplo antes de usarlo. [AEAT: retenciones de actividades económicas](https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/folleto-actividades-economicas/7-otras-obligaciones-fiscales-retenciones/7_1-cuadro-relacion-tipos-retencion-porcentaje.html).

## Hallazgo 4: facturador y conservación

**Recomendación:** elegir con el gestor un facturador mantenido que cubra la normativa española aplicable y permita exportar documentos y registros. Evaluar la herramienta del gestor o una solución existente antes de desarrollar un facturador propio. Mantener una sola fuente de numeración y rectificación; si el pago usa Stripe, conciliar pago, factura y organización sin producir dos facturas por la misma operación. Un PDF o un pago confirmado no acreditan por sí solos cumplimiento fiscal.

**Criterios de selección propuestos:** declaración responsable de la versión cuando resulte exigible; identidad completa; factura completa B2B; series correlativas; desglose y menciones fiscales; rectificación sin sobrescribir el original; trazabilidad, exportación y conservación; acceso y entrega al cliente; separación Test/Live. El artículo 13 RRSIF atribuye la declaración responsable al productor: no equivale a una homologación previa de la AEAT. [BOE: RD 1007/2023, artículo 13](https://www.boe.es/buscar/act.php?id=BOE-A-2023-24840).

**Calendarios distintos, consultados a 6 de noviembre de 2026:**

- **SIF:** el texto consolidado consultado mantiene adaptación antes del 1 de enero de 2027 para sujetos del Impuesto sobre Sociedades y antes del 1 de julio de 2027 para el resto de obligados de su ámbito. La AEAT reproduce esos plazos. Hacienda anunció el 5 de octubre de 2026 una **previsión** de aplazamiento a octubre de 2028; ese anuncio no se trata aquí como modificación aprobada. El gestor debe reconfirmar norma y ámbito antes de contratar o emitir. [BOE: disposición final cuarta](https://www.boe.es/buscar/act.php?id=BOE-A-2023-24840#df-4), [AEAT: plazos aprobados](https://www3.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/nota-informativa-ampliacion-plazo-adaptacion-facturacion.html), [Hacienda: previsión de modificación, 5 octubre 2026](https://www.hacienda.gob.es/sgt/gabsehacienda/nota-informativa-verifactu.pdf).
- **Factura electrónica B2B:** la AEAT sitúa el inicio del cómputo en el 6 de octubre de 2026: emisión/recepción obligatoria desde el 6 de octubre de 2027 para volumen superior a 8 millones y desde el 6 de octubre de 2028 para el resto. La comunicación de estados/pagos tiene fechas propias, incluido 2029 para determinadas personas físicas. Elegir una herramienta preparada para este régimen sin confundirlo con SIF/VERI*FACTU ni con un PDF enviado por email. [AEAT: calendario de implantación](https://www3.agenciatributaria.gob.es/Sede/iva/factura-electronica/calendario-implantacion.html).

**Conservación recomendada:** acordar una tabla por clase de documento y obligación. La AEAT señala cuatro años como regla fiscal general y periodos mayores en supuestos de regularización; no es una orden universal de borrado al cuarto año. El artículo 30 del Código de Comercio establece seis años desde el último asiento para documentación empresarial, con salvedades legales. Contemplar interrupciones de prescripción, requerimientos y otras obligaciones aplicables antes de eliminar. Esto no autoriza retener indiscriminadamente todos los datos deportivos o de menores. [AEAT: conservación fiscal](https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/folleto-actividades-economicas/5-impuesto-sobre-valor-anadido/5_10-facturas/5_10_7-conservacion-facturas-documentos-sustitutivos.html), [BOE: Código de Comercio, artículo 30](https://www.boe.es/buscar/act.php?id=BOE-A-1885-6627#art30).

## Importancia: precio y documento que se someterán a revisión

**Cálculo ilustrativo exclusivamente si se confirma 21 % y ausencia de retención.** No son cuatro facturas emitidas ni una oferta fiscal activada.

| Plan y periodo | Base EUR | IVA hipotético 21 % EUR | Total hipotético EUR |
| --- | ---: | ---: | ---: |
| Starter mensual | 19,00 | 3,99 | 22,99 |
| Starter anual | 190,00 | 39,90 | 229,90 |
| Growth mensual | 49,00 | 10,29 | 59,29 |
| Growth anual | 490,00 | 102,90 | 592,90 |

El [único ejemplo de factura](/Users/elvisvaldesinerarte/Projects/Zaltyko/trabajos/Zaltyko-main-bridge-20261025/docs/legal/ejemplo-factura-saas-revision-2026-11-06.md) desarrolla Starter mensual B2B en Málaga. No se altera la base comercial para absorber impuestos por inferencia. Precio, base, impuesto y total deben mostrarse coherentemente antes de la contratación una vez aprobada la regla.

## Siguiente paso: respuesta concreta que debe devolver el gestor

Solicitar aprobación o corrección por escrito de estas cinco decisiones, con fecha y escenario:

1. **Actividad:** descripción de explotación del SaaS; grupo/sección IAE y CNAE correctos; suficiencia o modificación del 036 actual; obligaciones resultantes. Propuesta de partida: estudiar 845 empresarial frente a 763 profesional, sin imponer la elección.
2. **IVA:** para vendedor y comprador B2B establecidos en territorio IVA español, confirmar o corregir la propuesta de 21 %, devengo y declaración; identificar los casos que se excluyen del primer lanzamiento. No dar por aprobada una exención educativa.
3. **Retención:** confirmar o corregir «sin retención» por calificación y contrato; si procede, precisar fundamento, pagador, porcentaje y requisitos. No activar automáticamente el 7 %.
4. **Factura:** validar el ejemplo, campos fiscales de ambas partes, concepto, fechas, serie final a crear en el facturador, rectificaciones, entrega y calendario de conservación. La numeración del borrador no debe usarse como serie real.
5. **Sistema:** identificar la herramienta y versión elegidas, cumplimiento y fechas aplicables de SIF y factura electrónica B2B, exportación y conciliación con pagos. **NO VERIFICADO:** proveedor/configuración real, documento resultante y recepción por un comprador.

Después de esa respuesta corresponde preparar los cambios técnicos concretos y su validación autorizada, preservando bases EUR e idempotencia. Los controles `taxTreatmentReviewed`, `checkoutTaxVerified` y apertura comercial no se habilitan con estos borradores. No hay aprobación fiscal, facturación real ni cobro de producción por este trabajo.
