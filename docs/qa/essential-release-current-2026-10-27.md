# Cierre esencial — corte de validación del 27 octubre 2026

## Hallazgos

Artefacto alojado de entregas: ab067043, dpl_GnNq4NtSNoRPGQzttQwv96ERvcXD. Nueva sesión humana QA A accede por /owner sin query y resuelve únicamente su academia. Cerrar sesión visible. Resumen30gimnastas/3grupos/1asistencia/3cobros70EUR. Usage autenticado Free30/3/10,readOnly=false. Inscripciones muestra dos activas; asistencia histórica muestra Presente. Cuota noviembre de familia QA Cierre Entrega20261026:35EUR, segunda emisión deshabilitada por factura existente. Cobros manuales muestra No hay cargos pendientes. No se crean facturas/pagos/inscripciones en esta ronda.

A→B usage devuelve NOT_FOUND; academia A con sede B en clases devuelve403 location-scope-denied. Son lecturas, no prueba de rechazos de escritura ni ausencia de efectos parciales en este candidato. B→A corresponde al artefacto31e, no se hereda como prueba actual.

En inscripciones cssContentSize coincide con viewport375/768/1280, pero captura CDP375 demuestra textos Inscripciones/Asistencia solapados. No basta probar ausencia de scroll horizontal. Parche: tres columnas bajo640px, seis desde640px, objetivos centrados y sin partir etiquetas; conserva los cinco destinos diarios, Más, contexto y logout. Regresión en recorrido sintético remoto mide texto dentro de su objetivo, área mínima44px y no intersección entre objetivos a375/768; no se retiran checks anteriores. Parche no publicado, pendiente CI/revisión.

## Fuente

Browser del chat QA A, alias de entregas; evidencia de captura auditorias/2026-10-27/qa-a-ab067043-enrollments-375-cdp.png fuera del checkout. CI40465505339 SUCCESS acredita ab067043 de forma aislada, no este nuevo diff. Matriz original essential-launch-matrix-2026-10-26.md es histórica; este corte no reescribe sus observaciones.

## Importancia y pendientes finitos

1. Candidato definitivo: corregir navegación móvil, CI completa/revisión exacta y repetir validación alojada pertinente. Completar roles y dos sedes, escrituras cruzadas y snapshots sin parciales, respuesta perdida/concurrencia, límites y archivo sobre candidato definitivo. Evidencia aislada e histórica no sustituye ejecución alojada. Mantener correo real/recuperación históricos separados del recorrido actual; no reenviar correo sin necesidad.
2. Ensayo natural: primer impago acreditado históricamente no equivale a agotamiento terminal; seguimiento separado mantiene su calendario. Esta ronda no lo consulta ni modifica.
3. Antes de cobrar: alta efectiva del vendedor, NIF/domicilio profesional, fiscalidad y precio final confirmados, condiciones/privacy finales y soporte recibido/respondido. El humano indicó que los precios son base sin IVA; eso no configura impuestos en Checkout. No inventar datos ni activar automatic_tax por inferencia.
4. Producción/Live: configuración propia de Stripe Live (cuenta, cuatro precios, Portal, endpoint firmado), Auth/correo, TLS, Redis y permisos/observabilidad aún requieren revalidación autorizada. Las notas26oct son históricas, no se consultó producción hoy. No reutilizar objetos test ni aplicar SQL adicional sin diff/autorización. Promoción solo con gates y artefacto productivo comprobado, manteniendo rollback de aplicación.
5. Primera academia externa: recorrido y contratación auténticos; no compras reales de prueba. Hasta entonces no declarar MVP comercial cerrado.

## Siguiente paso

CI remota del parche móvil y revisión; no nuevos despliegues por push. Mantener preview actual utilizable, sin tocar producción ni ensayo, sin instalaciones/builds/tests/servicios locales. No cambios SQL/proveedores/precios/roles/credenciales.
