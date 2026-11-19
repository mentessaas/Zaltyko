# Paquete único de revisión — 3 noviembre 2026

## Qué revisar
1. Condiciones de uso y privacidad: borradores corregidos en src/app/terminos/page.tsx y src/app/politica-privacidad/page.tsx; lectura sin código en la auditoría durable contractual-texts-for-review.md.
2. [Acuerdo de encargo](acuerdo-encargo-tratamiento-borrador.md).
3. [Conservación](anexo-conservacion-borrador.md) y [proveedores](anexo-proveedores-borrador.md).
4. [Derechos e incidentes](procedimientos-derechos-incidentes.md).

## Decisiones propuestas, todavía no aceptadas
- Ventana de devolución30días y supresión activa dentro30días de instrucción validada: propuesta pendiente de viabilidad, no obligación aplicada.
- Revisión de necesidad de logs90días y objetivo de eventos ordinarios Sentry30días: propuesta, no retención actual.
- Aviso de nuevos subencargados al menos30días: mecanismo pendiente de habilitar/verificar.
No hace falta aprobar objetivos no acreditados para mantener una demo sintética; no presentarlos como compromisos comerciales vigentes.

## Del titular
Completar NIF, domicilio profesional y confirmar alta efectiva; revisión fiscal del importe final antes de Live. No introducir documentos de identidad ni secretos en estos archivos. El correo oficial hola@zaltyko.com tiene recepción y respuesta manual verificadas el 3 de noviembre de 2026. Elvis es el responsable designado, con apoyo de IA previsto; falta suplencia humana y no se acredita integración IA. El correo automático de la aplicación sigue NO VERIFICADO.

## Trabajo interno antes de datos reales
Acreditar DPA/entidad/región/transferencias/retención de cada cuenta de proveedor; comprobar canal de soporte y suplencia; validar devolución/supresión compatible con ledger y recuperación; cerrar aceptación versionada del DPA. Son verificaciones técnicas/contractuales, no datos fiscales que deba inventar el titular.

## SQL separado
production-consent-policy-candidate.sql sigue NO aplicado y conserva SHA256940c01540599802be64ee2144b7f4e534080b9912676207f3476e0da11849218. La versión propuesta v1-2026-11-02 no está activada. Aprobar estos textos NO autoriza ejecutar SQL ni firma DPA por nadie. Antes de aplicar, fijar commit/hashes aprobados, revalidar proyecto y guards del candidato. No modificar versión silenciosamente.

## Estado técnico y frontera
Entregas a69b25ee ya publicada con filtro Sentry y Replay excluido. Producción y staged anteriores no actualizados. Los borradores legales siguen locales y no han pasado CI como un commit legal. No afirmar que estos textos ya se sirven a usuarios. No se ha hecho SQL, Live, despliegue ni cambio de proveedor para esta consolidación.

## Actualización de correo — 3 noviembre 2026
- Soporte manual: prueba real Gmail → hola@zaltyko.com → Gmail recibida en ambos sentidos.
- Brevo accesible: cuenta Zaltyko / zaltyko@gmail.com, relay habilitado, plan gratuito con sendLimit 300 (no acredita saldo disponible). Dominio zaltyko.com authenticated=false y verified=false; único remitente listado activo zaltyko@gmail.com. No se han cambiado DNS, remitentes ni proveedores.
- Pendiente confirmar que esta es la cuenta prevista para los correos automáticos; la conexión accesible no acredita que sus credenciales coincidan con las de la aplicación o Auth.
- Antes de una prueba automática: identificar circuito concreto (Auth SMTP o API de aplicación), entorno de entregas, remitente autorizado y destinatario QA; conservar aceptación del proveedor y recepción real como evidencias separadas. No crear cuentas ni generar recuperaciones por inferencia.
- Los compromisos de conservación, devolución, subencargados y aceptación del DPA siguen sujetos a revisión operativa; no son solo datos fiscales pendientes.

## Confirmaciones del titular — 3 noviembre 2026
El titular confirma zaltyko@gmail.com como cuenta Brevo de Zaltyko. Elvis Valdes Inerarte atenderá hola@zaltyko.com con apoyo de IA. Esto no acredita un agente de soporte desplegado ni autoriza conectar mensajes/datos de clientes a un proveedor de IA. No se ha designado suplente humano ni comprometido atención continua. La identidad de la cuenta queda confirmada; la correspondencia de credenciales desplegadas y la entrega automática siguen pendientes.

## Corte histórico previo al 4 de noviembre — autenticación y contrato Brevo
Remitente hola@zaltyko.com ya verificado y cambio DMARC aprobado publicado. El dominio sigue sin confirmación de autenticación en Brevo: no ejecutar ni dar por entregada la prueba automática. Se conserva el monitor existente, sin duplicarlo. Documentos legales de la cuenta indica APD incorporado por condiciones; no se ha aceptado nada nuevo ni archivado todavía su versión íntegra. El anexo añade Hostinger Mail como proveedor real del soporte. Los cortes anteriores se conservan como historia, no como estado actual.


## Copias actuales para revisión, sin publicación
La copia legible [Términos y privacidad actuales](/Users/elvisvaldesinerarte/projects/Zaltyko/auditorias/2026-11-03/contractual-working-review-2026-11-03.md) reproduce los23apartados de los borradores TSX y enlaza acuerdo/anexos. Corrige el inventario con Hostinger Mail y el acuerdo con la prueba manual de soporte ya verificada. No certifica correo automático, fiscalidad ni devolución/borrado.
El [manifiesto local](/Users/elvisvaldesinerarte/projects/Zaltyko/auditorias/2026-11-03/contractual-review-working-copy-manifest.json) fija hashes de10archivos para comprobar qué copia se revisó, no aceptación. Cualquier cambio obliga a regenerarlo. Los borradores están fuera del commit85ff32c1 y de su CI; la aprobación GitHub de ese commit no aprueba este paquete contractual ni el SQL. NIF, domicilio y alta efectiva siguen sin rellenar; no se inventan datos.


## Corte vigente para revisión — 5 noviembre 2026

Los cortes del3nov y sus hashes se conservan como historia. Este corte sustituye sus afirmaciones de estado actual, sin aprobar textos ni ejecutar SQL.

- Dominio Brevo y remitente hola@zaltyko.com autenticados/verificados el4nov; DNS ya no es el bloqueo. La recepción de alta y recuperación comprobadas fue por Supabase Auth. Una entrega Brevo desde el núcleo continúa NO VERIFICADA. Fuente: auditoría externa2026-11-03/automatic-mail-auth-delivery-2026-11-04.md.
- Preview de entregas64dc9381; candidato de código c343a6e909e2797e6e93207e99add2d375dc897f en CI remota. Los borradores de esta revisión siguen fuera de ese commit y no se sirven por haber pasado su CI. Producción y Live no cambian.
- Los textos incorporan la separación entre gestión administrativa ES/MX, perfiles deportivos generales y contratación SaaS. EUR/MXN operativas no habilitan factura fiscal local ni contratación Live internacional.
- El formulario de acceso asistido conserva el contacto adulto y su país, función, disciplinas y necesidad; no crea academia, campañas ni una promesa de apertura. Su retención y atención de derechos deben concretarse antes de captación pública.
- La descarga canónica sigue siendo parcial. El verificador de estructura y hashes no acredita origen, autorización, integridad referencial, devolución integral ni restauración. La nueva regresión se ejecuta en PostgreSQL efímero GitHub; no demuestra recuperación productiva.
- Sigue pendiente: alta/NIF/domicilio, fiscalidad y precio final, suplencia humana de soporte, evidencia contractual/región/retención de proveedores, conservación acordada, aceptación del DPA y procedimientos de devolución/supresión/recuperación. No son solo campos fiscales.

La nueva [copia legible](/Users/elvisvaldesinerarte/projects/Zaltyko/auditorias/2026-11-05/contractual-working-review-2026-11-05.md) y su [manifiesto](/Users/elvisvaldesinerarte/projects/Zaltyko/auditorias/2026-11-05/contractual-review-working-copy-manifest.json) fijan esta revisión local. Los manifiestos del3nov no deben usarse para afirmar integridad de estos archivos actuales. El SQL contractual mantiene su hash original y estado NO AUTORIZADO / NO APLICADO; aprobar un commit de producto no aprueba estos borradores ni el SQL.


## Corte vigente para revisión — 6 noviembre 2026

Este corte sustituye las menciones anteriores de alta, NIF y domicilio pendientes; los cortes fechados se conservan como historia. Alta censal y resolución RETA del 5 de noviembre revisadas documentalmente. El titular autorizó el 6 de noviembre usar el domicilio de actividad del resguardo para textos legales y facturas. El perfil común del vendedor y el acuerdo de encargo local incorporan esos datos; no se adjuntan originales ni datos bancarios/Seguridad Social.

La autorización cubre esos datos, NO la aprobación del conjunto contractual ni su publicación. La fiscalidad del software queda expresamente pendiente del asesor. Todos los flags de preparación fiscal, Checkout fiscal, aprobación de textos y Live siguen false. El soporte manual verificado no se confunde con correo automático, cobertura continua o suplencia humana.

Código base local c32a7e448572db642c177199f9e6d728b1643ec6: los cambios de esta revisión están sin commit, sin publicación y sin CI nueva. No heredan los PASS de ese SHA. La copia legible actual es [Textos del 6 de noviembre](/Users/elvisvaldesinerarte/projects/Zaltyko/auditorias/2026-11-06/contractual-working-review-2026-11-06.md); el [manifiesto](/Users/elvisvaldesinerarte/projects/Zaltyko/auditorias/2026-11-06/contractual-review-working-copy-manifest.json) fija sus hashes locales, no aceptación.

[Preparación de facturación SaaS](facturacion-saas-preparacion.md): distingue vendedor del software, datos fiscales del comprador y cuotas/recibos de la academia. Los precios base se conservan; impuesto y total no se inventan. Faltan reglas del asesor y posterior configuración/prueba autorizadas.

El SQL contractual conserva SHA-256 940c01540599802be64ee2144b7f4e534080b9912676207f3476e0da11849218 y versión propuesta v1-2026-11-02. Sigue NO AUTORIZADO PARA APLICAR / NO APLICADO. La futura aprobación deberá identificar el paquete y versión definitivos antes de revalidar ese candidato, sin reutilizar su versión silenciosamente para nuevos textos. Invitaciones OFF, Live, producción y ensayo sin cambios.
