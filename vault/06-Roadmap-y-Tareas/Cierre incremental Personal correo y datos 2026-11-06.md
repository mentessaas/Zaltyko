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
