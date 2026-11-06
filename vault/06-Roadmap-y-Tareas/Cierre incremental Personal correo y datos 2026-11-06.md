---
status: in_progress
owner: coordinacion
last_reviewed: 2026-11-06
---

# Cierre incremental de Personal, correo y datos

## Hallazgos

Personal conservaba estado visual de otra academia al navegar: se separa el ciclo de vida del editor, manteniendo los comandos inciertos en su academia original. El correo necesita una vía exclusiva de entregas, apagada por defecto, con actor confirmado, mensaje exacto, permiso temporal y una reserva persistente por intento; un mock no acredita recepción. El diagnóstico de datos debe conservar explícitamente las fuentes desconocidas y no autoriza supresión ni recuperación.

## Fuente

docs/qa/mvp-closure-batch-2026-11-06.md y revisiones estáticas Backend, Owner y QA de este lote. Los borradores fiscales para el gestor se mantienen aparte del candidato de producto.

## Importancia

Evitar operaciones bajo el contexto equivocado, envíos repetidos o afirmaciones de borrado y conservación sin evidencia. Las invitaciones permanecen apagadas; no se cambia ningún permiso comercial.

## Siguiente paso

Completar revisión independiente y CI remota del mismo SHA, incluida concurrencia sobre PostgreSQL desechable. Después, revisión externa antes de cualquier publicación. La recepción automática, suplencia humana, reglas fiscales, aceptación contractual y procedimientos integrales de datos siguen pendientes de sus respectivas verificaciones. Sin SQL alojado, Live, producción, ensayo ni builds/tests locales.

## Corte del primer candidato

a197b740 pasa PostgreSQL desechable, build principal, tipos y Chromium; no completa la CI por documentación de una variable y una regresión real de claves duplicadas en la rama simulada de invitaciones. Se corrigen ambos sin bajar controles. Se incorpora además un arreglo revisado del emisor común: simulación o respuesta sin aceptación ya no serán sent/true. El código no configura proveedores, no habilita invitaciones y no acredita recepción de correo. Las comprobaciones del candidato definitivo siguen pendientes.

## Corte 2895f605 — WebKit

Unitarias5998PASS/6omitidas, ambos builds y PostgreSQL desechable pasan, también Chromium y Firefox3/3, seguridad y controles estáticos. WebKit pasa Owner operativo pero falla esperando alert de contacto asistido; Personal queda sin ejecutar. Captura: botón detrás de cabecera fija. Sin evidencia del primer POST ni defecto funcional demostrado. Se ajusta únicamente posición antes del click nativo y observación/diagnóstico sintético, conservando todas las aserciones. No se atribuye una causa exclusiva ni se declara listo para publicar hasta conciliar el nuevo SHA.
