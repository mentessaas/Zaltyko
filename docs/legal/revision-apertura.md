# Paquete de revisión de tratamiento de datos

## Hallazgos
Borradores del 2 noviembre 2026: [acuerdo](acuerdo-encargo-tratamiento-borrador.md), [conservación](anexo-conservacion-borrador.md), [proveedores](anexo-proveedores-borrador.md). Incluyen alcance, instrucciones, confidencialidad, seguridad, derechos, incidentes, subencargados, transferencias, fin de servicio y auditoría. No están firmados ni incorporados a las altas.

## Importancia
No confundir redacción con cumplimiento operativo. Los objetivos de 30 días/90 días son propuestas para revisar, no configuración aplicada. Sentry fue corregido y publicado solo en entregas a69b25ee: Replay no cargado y filtro compartido probado con eventos sintéticos. El artefacto productivo anterior no incluye esa corrección; retención y contratos del proveedor siguen pendientes. La fila SQL de política no formaliza este acuerdo ni prueba aceptación de anexos. No aplicar SQL sobre estos borradores.

## Fuentes
Documentación oficial enlazada en cada anexo; código instrumentation-client.ts, sentry.server.config.ts y src/lib/rate-limit.ts; runbook de backup y evaluación RGPD existentes. Fuentes históricas no acreditan pruebas productivas actuales.

## Siguiente paso
1. Revisar contenido y objetivos propuestos sin marcarlos como implementados.
2. Acreditar contratos, regiones, retención y transferencias de cuentas reales de proveedores mediante lectura autorizada; no contratar ni aceptar términos por inferencia.
3. Verificar saneado/carga de observabilidad, devolución/supresión y recuperación antes de prometer plazos.
4. Revisar la identidad documentada y el domicilio autorizado incorporados al borrador del 6 de noviembre; completar revisión fiscal del software, soporte operativo, aceptación/versionado de acuerdo y revisión jurídica final antes de clientes con datos reales.

## Validación
Revisión estática y git diff --check. Ninguna prueba/build local, ejecución remota, consulta productiva, SQL, envío, cambio de proveedor ni despliegue. Hashes del paquete en auditoría durable dpa-review-manifest.json. El SHA publicado y sus pruebas no cambian por estos archivos locales.


## Complementos de revisión
- [Procedimientos de derechos e incidentes](procedimientos-derechos-incidentes.md).
- [Verificación estática y cola priorizada](verificacion-operativa-privacidad.md).

## Actualización factual — 4 noviembre 2026

La autenticación del dominio Brevo y la verificación del remitente están acreditadas en la cuenta de entregas; no se mantienen como bloqueo DNS. La recuperación recibida desde la aplicación utilizó Supabase Auth y el alta de QA México confirmó su correo por ese mismo proveedor. No equivalen a entrega transaccional por Brevo ni autorizan cambiar el SMTP del proyecto compartido con el ensayo. Fuente: auditoría externa automatic-mail-auth-delivery-2026-11-04.md y qa-mx-64dc9381-hosted-acceptance.md.

La devolución permanece parcial. El nuevo verificador de paquetes solo comprueba estructura y hashes autocontenidos; no acredita origen, autorización, completitud de fuentes, integridad referencial ni recuperación. Matriz de disposición y protocolo financiero MX en preparación independiente del candidato507d3521. No se ha firmado este paquete, fijado plazos definitivos ni aplicado su SQL contractual.


## Actualización factual — 6 noviembre 2026

El alta censal y la resolución de alta RETA del 5 de noviembre se han revisado documentalmente. El titular autorizó utilizar el domicilio de actividad del resguardo en los textos legales y la preparación de facturas. La identidad completa se incorpora al perfil común del vendedor y al borrador de encargo; los documentos de origen, datos bancarios y de Seguridad Social no se copian al repositorio. Esta revisión documental no es una consulta actual de estado ante la Administración ni valida el tratamiento fiscal del software.

Los borradores locales dejan de presentar al vendedor como futuro titular. Los flags de fiscalidad, Checkout fiscal, aprobación contractual y publicación Live permanecen cerrados. La confirmación de alta/domicilio no aprueba todo el paquete. Los tests ajustados están preparados, NO ejecutados ni incluidos en la CI histórica de c32a7e44.

Preparación separada: [facturación SaaS](facturacion-saas-preparacion.md). No cambia el vendedor de las cuotas de las familias: sigue siendo su academia. Sigue pendiente el dictamen del asesor, la revisión del paquete de tratamiento, conservación y proveedores, la suplencia humana y la evidencia técnica restante. SQL contractual sin cambios ni aplicación. Copia y manifiesto actuales: auditoría externa del 6 de noviembre.
