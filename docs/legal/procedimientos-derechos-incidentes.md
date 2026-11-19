# Procedimientos de derechos e incidentes — propuesta operativa

Fecha: 2 noviembre 2026. Para revisión, no acredita operación ensayada ni canal atendido.

## Solicitudes de derechos
- Entrada: hola@zaltyko.com. Antes de apertura verificar recepción/respuesta, responsable de atención y suplente; no enviar mensajes en esta tarea.
- Registrar identificador de solicitud, fecha, solicitante, academia, finalidad, base del rol responsable/encargado y vencimiento. No adjuntar copias de identidad por defecto.
- Verificar identidad con información mínima y canal ya conocido; no revelar si otra academia tiene una persona ni eliminar cuentas globales por una baja de pertenencia.
- Si afecta a cuenta/contratación propia: resolver como responsable. Si afecta a datos aportados por academia: trasladar al responsable y asistir según instrucciones; no resolver por él sin mandato legal.
- Regla general RGPD: respuesta sin dilación y dentro de un mes desde recepción; extensión posible de dos meses por complejidad/número, informando dentro del primer mes con motivos. Registrar excepciones y fundamento, no automatizar denegaciones.
- Preparar devolución delimitada, comprobar permisos y datos de terceros, entregar por canal seguro; documentar lo realizado. Los exports de módulos existentes no prueban portabilidad completa.
- Supresión: aplicar solo tras autorización específica y revisión de dependencias/obligaciones; aquí no se autoriza SQL ni borrado. Considerar Auth compartido, ledger, auditoría, copias, correo y observabilidad.

## Incidentes de seguridad
- Registrar hora de detección/conocimiento, fuente y alcance conocido sin copiar secretos o datos de menores a tickets públicos.
- Identificar responsable operativo y suplente; clasificar confidencialidad, integridad y disponibilidad. Preservar evidencia con acceso mínimo.
- Como encargado: comunicar al responsable sin dilación indebida; enviar información progresiva sin esperar certeza completa. El plazo de 72 horas de notificación a autoridad del responsable no es una ventana para retrasar el aviso del encargado.
- Como responsable: evaluar riesgo y notificación a autoridad sin dilación y, si procede, dentro de 72 horas desde conocimiento; justificar retraso. Evaluar comunicación a afectados cuando exista alto riesgo y excepciones legales.
- Informar de categorías, alcance estimado, consecuencias, medidas y punto de contacto; no afirmar cifras no acreditadas.
- Contención, revocación, cambios de configuración y recuperación requieren autorización del alcance de la intervención. Esta propuesta no permite rotación preventiva ni tocar producción.
- Cerrar con causa, acciones, validación, cronología y medidas preventivas; conservar registro justificado y limitar su contenido.

## Control previo a devolución o supresión por academia
Propuesta de preparación del 3 noviembre; no es una implementación ni autoriza ejecutar borrados.
- Delimitar organización, personas y sedes afectadas. Comprobar pertenencias a otras academias antes de incluir perfiles o Auth globales.
- Inventariar datos operativos, familiares, asistencia, cuotas y pagos; separar conservación justificada de datos que puedan suprimirse. Conservar referencias coherentes sin borrar movimientos financieros por inferencia.
- Preparar exportación estructurada con manifiesto de alcance y exclusiones; revisar que no incluya terceros de otra academia. El PDF de evaluaciones existente no sustituye esta devolución.
- Revisar por separado archivos, auditoría, correo, observabilidad y copias de seguridad. Registrar plazos efectivos de cada proveedor y cómo evitar reintroducir datos suprimidos tras una restauración.
- Presentar una propuesta revisable con dependencias, efectos y comprobaciones. Probar su aislamiento en un entorno autorizado antes de solicitar ejecución concreta.
- No utilizar la eliminación global del perfil de SuperAdmin como atajo: el código revisado elimina el perfil antes de intentar Auth y el propietario legacy tiene dependencias en cascada.
- Cerrar con evidencia del alcance ejecutado y las excepciones de conservación, sin afirmar supresión de copias o proveedores que no se haya acreditado.

## Fuente normativa
RGPD artículos 12, 28 y 33–34: https://www.boe.es/buscar/doc.php?id=DOUE-L-2016-80807 . Procedimiento propuesto, no dictamen ni evidencia de ejecución.

## Responsable de soporte confirmado — 3 noviembre 2026
Elvis Valdes Inerarte atiende el buzón hola@zaltyko.com, con apoyo de IA. No se acredita automatización instalada, atención 24/7 ni suplencia humana. Las solicitudes de derechos, incidentes y decisiones delicadas requieren revisión humana; cualquier acceso de IA a mensajes personales debe definirse y revisarse antes de habilitar una integración.
