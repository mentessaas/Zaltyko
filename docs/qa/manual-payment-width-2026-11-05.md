# Cobros: ancho intrínseco del selector de cargo

## Hallazgo

La aceptación autenticada de `df73ad3b` en entregas detectó recorte real del formulario de Cobros con una referencia larga en la opción de cargo pendiente. A 375 px el formulario medía 892,5 px; a 768 px, 916,5 px. A 1280 px cabía en la pantalla, pero superaba el contenedor de 896 px. El ancho del documento coincidía con el viewport porque un ancestro ocultaba el desbordamiento; esa comparación aislada no acredita geometría correcta.

El selector nativo imponía su ancho intrínseco a la columna del grid. Owner limitó el formulario y su columna a `minmax(0,1fr)` y permitió contraer el selector dentro del ancho disponible. Solo cambian clases CSS de `ManualPaymentForm.tsx`. Backend revisó el diff de forma independiente: no cambia estado, importes, fechas, autorización, body, clave de idempotencia ni recuperación.

La aceptación financiera anterior se conserva: cuota de 350,25 MXN, pago parcial de 125,50 MXN, recarga sin POST automático, reintento con mismo cuerpo y clave, una sola fila de pago y saldo de 224,75 MXN. Un resultado financiero correcto no sustituye la aceptación visual pendiente.

## Comprobación

QA añade medición del formulario, contenedor, título, controles y texto a 375, 768 y 1280 px con una referencia larga. Se comprueba el tamaño real de los elementos aunque el documento oculte su desbordamiento. El recorrido financiero y sus aserciones se conservan.

No se ejecutan pruebas, builds, lint, typecheck, instalaciones ni servicios en Mac. La regresión y los controles se ejecutarán remotamente sobre el nuevo SHA. El efecto visual alojado sigue pendiente hasta aprobar y publicar ese candidato; no se heredan los PASS de `df73ad3b` para el cambio nuevo.

## Fuente, importancia y siguiente paso

Fuente: aceptación autenticada de entregas el 5 de noviembre, capturas y geometría durable en `auditorias/2026-11-05` fuera del checkout; revisión de Owner y Backend del diff. Los artefactos completos de exportación y las respuestas privadas del proveedor no forman parte de este documento.

Importancia: el recorte impedía usar con normalidad Cobros en móvil y tablet, aunque el pago persistiera correctamente.

Siguiente paso: CI remota completa, revisión externa del SHA y publicación solo en entregas; después repetir la geometría afectada con la sesión QA existente. Producción, Live, ensayo y SQL alojado quedan fuera de esta corrección.
