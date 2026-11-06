# Aislamiento autenticado de academias de entregas — 26 octubre 2026

## Hallazgos

QA B completó el registro humano. Correo auténtico de confirmación recibido en el alias autorizado; el enlace normal del correo abrió `/owner/setup` sin error de callback. Se creó mediante UI la academia `QA Entregas B Aislamiento 20261026`, organización `2f3457a0-3333-4b39-82f7-20879796b933`, sede `9bbf9903-81ab-43ba-93d4-9d9d85f11e11`. Sin trial, compra ni datos del ensayo. Su resumen muestra cero gimnastas, grupos, asistencias y cobros.

La academia A existente es `0242c134-872b-45ca-a2bf-c64ece52a15b`, sede `4b49cf40-077e-4deb-85b0-5c45340d9edd`. Cada sesión lee su propio `/api/v1/owner/saas/usage` con HTTP 200; la consulta de la otra organización recibe HTTP 404/NOT_FOUND. Las consultas de grupos y clases a la otra academia reciben HTTP 403 en ambos sentidos. Como QA B, resumen y gimnastas de A y clases con su sede muestran 404, sin sus datos.

En clases y opciones de cuotas mensuales, las consultas con organización y sede propias responden 200; mezclar la organización propia con la sede de la otra academia responde 403 en ambos sentidos. Opciones de cuotas incluyen `servicePeriod=2026-11`. No se emiten cuotas ni pagos.

Familias (`families/options`), sesiones de asistencia (`attendance/sessions`) y cobros manuales (`billing/manual-payments`): HTTP 200 con organización/sede propias y HTTP 403 con la organización/sede ajenas, en ambos sentidos. No se exponen nombres ni movimientos ajenos.

Se conservan cuatro intentos iniciales con parámetros incompletos y HTTP 400 en el JSON técnico: NO cuentan como prueba de aislamiento. La consulta completa de cuotas se verificó posteriormente. B no tiene clase recurrente; la búsqueda de candidatos de inscripción completa queda pendiente, sin inventar identificadores.

CI del candidato d6ffd9de, ejecución 40401694219: build, lint/tipos, Chromium, móvil, seguridad, RLS y migraciones pasaron. Unitarias: 5144 PASS, una expectativa antigua falló por exigir directorio público con la opción deshabilitada; las dos regresiones nuevas pasaron. Se corrige la expectativa antigua manteniendo la comprobación con catálogo y reclamaciones explícitamente habilitados. Firefox/WebKit seguían pendientes al registrar este corte; no es una CI verde ni se desplegó d6.

## Fuente

Preview de entregas `https://zaltyko-delivery-preview.vercel.app`, deployment `dpl_12VKJTpvwECxzZ45pvkmn1aLW7xm`, commit publicado e09f8acca9899e81b3c2d2cacc19113a96476c42. Navegación autenticada y eventos HTTP de la misma pestaña del navegador. Evidencias JSON y capturas en `auditorias/2026-10-26/delivery-academy-isolation-e09.json`, `qa-b-own-academy.png` y `qa-b-cross-academy-denied.png` del workspace de auditoría.

Se alternaron únicamente las cookies de las mismas sesiones QA A/B en el origen de entregas, conservadas solo en memoria. Sin nuevas sesiones administrativas, cambios de contraseña, permisos ni cookies del alias del ensayo. Al terminar queda activa la sesión B. Ningún secreto en evidencias.

## Importancia

Prueba alojada positiva y negativa de lectura entre estas dos academias y sus sedes. No acredita escrituras cruzadas sin efectos parciales, roles limitados entre dos sedes de una misma academia, concurrencia alojada ni el candidato d6 todavía no publicado. No se consultó el ensayo ni producción. Cero builds, pruebas pesadas o instalaciones locales.

## Siguiente paso

Terminar CI remota y enviar la corrección de la expectativa obsoleta; exigir CI y revisión sobre el commit final antes de publicar. Completar la matriz pendiente de roles/escrituras y aceptación móvil sin presentar estas lecturas como cierre integral de lanzamiento.
