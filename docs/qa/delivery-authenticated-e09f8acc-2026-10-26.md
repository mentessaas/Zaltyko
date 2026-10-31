# Validación autenticada de entregas e09f8acc — 26 octubre 2026

## Hallazgos

Deployment dpl_12VKJTpvwECxzZ45pvkmn1aLW7xm READY y alias de entregas contrastados. Sesión QA existente accede a la academia 0242c134-872b-45ca-a2bf-c64ece52a15b. Plan Free lee30/3/10 sin excedente. Recarga de asistencia conserva Presente; repetir el guardado de la marca sintética mantiene una sola fila y ningún par session_id/athlete_id duplicado.

Dashboard autenticado muestra30 gimnastas,3 grupos,1 asistencia y3 pagos manuales sintéticos/7000EURcent. SELECT acotado a la academia confirma esos pagos, ninguna referencia de pago proveedor y3500cent asignados al cargo QA conocido. No son transferencias reales.

Cuota noviembre de familia QA Cierre Entrega20261026:35EUR, motivo correcto Este periodo ya está facturado para esta familia y emisión deshabilitada. No se emitió una nueva factura ni se registró pago en esta ronda.

Tres intentos nuevos por UI del commit e09: gimnasta31,grupo4,clase11 rechazados por límite. Comparaciones consecutivas antes/después de cada intento:18 tablas, recuento y hash de contenido sin diferencias. Alcance exclusivo de entregas, no prueba de tablas no incluidas ni concurrencia alojada. Se reutilizó el snapshot posterior de cada rechazo como snapshot previo del siguiente, sin escritura intermedia.

Geometría del resumen en375/768/1280:clientWidth igual scrollWidth en los tres casos; menú móvil abre/cierra. Capturas CDP y captura nativa producen escalas distintas en esta herramienta: NO se considera aceptación visual móvil completa. Emulación retirada antes de continuar.

Defecto encontrado al preparar alta QA B: pese a directoryDiscoveryEnabled=false, el formulario renderiza el enlace Buscar academias públicas a una ruta retirada. Se prepara guard explícito de visibilidad y regresión sobre componente real, no solo sobre props del page mock. Pendiente CI/revisión/publicación del nuevo commit; e09 sigue publicado.

## Fuente

Browser del chat tab15 y22, Vercel inspect exacto y SELECTs solo sandbox aeeootdmuiqkfeernskw. Evidencia JSON/PNG en /Users/elvisvaldesinerarte/projects/Zaltyko/auditorias/2026-10-26/e09-*. Sesión local del alias de entregas retirada mediante cookies de Auth para preparar registro B; no signOut global, no cambios de cuentas/contraseñas, no cookies de ensayo alteradas. Cookie anterior solo en memoria, sin secretos en evidencias.

## Importancia

Sin fallo de persistencia ni registros parciales observado en estos casos. No se acredita aislamiento alojado entre dos academias/sedes, nuevo recorrido de correo ni contratación Live. No se consultó ni modificó el ensayo. Cero builds/tests/instalaciones locales, cero cambios productivos.

## Siguiente paso

Registro B preparado con alias mentessaas+zaltyko-delivery-b-20261026@gmail.com, contraseña vacía y términos sin aceptar. Humano completa contraseña/aceptación/envío por política del navegador. Después confirmar correo real y crear academia independiente para matriz de denegaciones. Producción sigue cerrada hasta completar gates técnicos y perfil fiscal/Live real; no inferir alta autónomo ni impuesto efectivo.
