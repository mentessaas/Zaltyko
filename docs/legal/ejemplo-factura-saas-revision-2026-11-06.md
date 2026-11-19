# Ejemplo de factura SaaS para revisión del gestor

**BORRADOR SIN VALIDEZ — NO EMITIDO — NO CONTABILIZAR — NO PAGAR**

Preparado el **6 de noviembre de 2026**. Único escenario ilustrativo: suscripción Starter mensual de software Zaltyko vendida por un titular establecido en territorio IVA español a una academia que actúa como empresario y recibe el servicio en **Málaga, España peninsular**. La operación, el comprador y el periodo son ficticios. No existe contratación, cargo, pago ni factura real por este documento.

**Hipótesis fiscal pendiente:** IVA general del 21 % y ausencia de retención solo si el gestor confirma la clasificación empresarial del ingreso y descarta otras rentas sujetas. El alta documental del titular no supone esa confirmación. Si cambia cualquiera de esas premisas, este total deja de ser una referencia utilizable. Véase la [propuesta fiscal para el gestor](/Users/elvisvaldesinerarte/Projects/Zaltyko/trabajos/Zaltyko-main-bridge-20261025/docs/legal/propuesta-fiscal-software-para-gestor-2026-11-06.md).

## Borrador del documento

| Campo | Valor para revisión |
| --- | --- |
| Número | **BORRADOR-SIN-VALIDEZ**. Sin número final, sin serie fiscal asignada. |
| Fecha del borrador | 06/11/2026. No acredita expedición fiscal. |
| Fecha de operación simulada | 06/11/2026, pendiente de confirmar el devengo aplicable. No hubo operación ni anticipo real. |
| Periodo de acceso simulado | 06/11/2026 a 05/12/2026, un mes ilustrativo. |
| Moneda | EUR |
| Emisor | **[NOMBRE LEGAL DEL TITULAR — remisión al perfil central autorizado]** |
| NIF del emisor | **[NIF DEL PERFIL CENTRAL — no reproducido en este borrador]** |
| Domicilio del emisor | **[DOMICILIO DEL PERFIL CENTRAL — no reproducido en este borrador]** |
| Marca del software | Zaltyko; no sustituye el nombre legal del emisor. |
| Destinatario | **COMPRADOR TOTALMENTE SINTÉTICO — Academia de Ensayo SaaS, S.L. (entidad ficticia)** |
| NIF del destinatario | **[NIF-SINTÉTICO-NO-VÁLIDO]**. No corresponde a un identificador fiscal utilizable. |
| Domicilio del destinatario | **[DOMICILIO FICTICIO SIN DIRECCIÓN POSTAL REAL], Málaga, España peninsular** |
| Condición del destinatario | Empresario que compra software para su actividad, solo premisa del ejemplo. |
| Medio de pago / vencimiento | No asignados. No hay instrucción de pago ni cuenta bancaria. |

La [identidad central del vendedor](/Users/elvisvaldesinerarte/Projects/Zaltyko/trabajos/Zaltyko-main-bridge-20261025/src/lib/launch/commercial-launch-profile.ts) contiene los valores autorizados para su revisión en el expediente correspondiente. La omisión deliberada de identidad fiscal completa y domicilio en este borrador, junto con el comprador ficticio y la ausencia de numeración fiscal, impide usarlo como factura real.

| Concepto | Cantidad | Precio unitario sin IVA | Base |
| --- | ---: | ---: | ---: |
| Acceso mensual al software de gestión Zaltyko, plan Starter, periodo simulado indicado | 1 | 19,00 EUR | 19,00 EUR |

| Resumen condicionado a aprobación fiscal | Importe |
| --- | ---: |
| Base imponible propuesta | 19,00 EUR |
| IVA **hipotético 21 %**: 19,00 × 0,21 | 3,99 EUR |
| Total base + IVA hipotético | **22,99 EUR** |
| Retención IRPF | No aplicada **solo bajo la hipótesis empresarial pendiente de confirmar**; no se declara exenta una renta profesional. |
| Líquido teórico, exclusivamente si no procede retención | **22,99 EUR** |
| Importe cobrado por este borrador | Ninguno; no es un recibo ni acredita saldo real. |

El concepto corresponde al **software**, no a clases, matrícula o cuotas deportivas de familias. La eventual situación exenta de la academia por sus propios servicios no se traslada automáticamente a esta adquisición. No se incluye «operación exenta» ni «inversión del sujeto pasivo» por inferencia: el escenario propuesto es interior y sujeto al tipo general, pendiente del gestor.

## Fuente y criterio del ejemplo

La AEAT describe los datos de una factura completa: identidad fiscal de las partes, numeración correlativa, fechas, descripción, base y desglose del impuesto, entre otros. Estos requisitos sirven para revisar la futura factura; **el borrador no los cumple con datos reales ni pretende sustituirla**. [AEAT: contenido de las facturas completas](https://sede.agenciatributaria.gob.es/Sede/iva/facturacion-registro/facturacion-iva/contenido-facturas.html).

El 21 % se toma del tipo general del artículo 90 LIVA, cuya aplicación al caso debe confirmar el gestor junto con la localización y la naturaleza del servicio. [BOE: Ley del IVA, artículos 69 y 90](https://www.boe.es/buscar/act.php?id=BOE-A-1992-28740). La hipótesis sin retención necesita revisión de la calificación del rendimiento; no se sustituye por un 7 % automático de nuevo autónomo. [BOE: Reglamento IRPF, artículo 95](https://www.boe.es/buscar/act.php?id=BOE-A-2007-6820#a95).

La base de 19 EUR procede del [contrato comercial de preparación SaaS](/Users/elvisvaldesinerarte/Projects/Zaltyko/trabajos/Zaltyko-main-bridge-20261025/docs/legal/facturacion-saas-preparacion.md:19). Las otras combinaciones se presentan únicamente en la tabla comparativa de la propuesta fiscal; no se agregan a esta operación simulada.

## Importancia y siguiente paso

El gestor debe corregir o aprobar por escrito: actividad y calificación del ingreso; IVA y retención; identidad del emisor; datos mínimos del comprador; concepto, periodo y devengo; serie/número reales y sistema emisor; rectificación, entrega y conservación. Su revisión debe indicar expresamente si acepta el resultado **19,00 + 3,99 = 22,99 EUR** para estas premisas.

Solo tras esa respuesta se preparará una implementación y comprobación separadamente autorizadas. No se ha configurado un facturador o Stripe, asignado número definitivo, presentado información a la AEAT, emitido factura, enviado correo ni abierto cobros de producción. **NO VERIFICADO:** aprobación del gestor, regla fiscal del titular, configuración real y documento emitido/recibido.
