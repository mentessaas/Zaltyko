# ADR-0015: Frescura operativa observada desde el outbox

- Estado: aceptado para V1 local
- Fecha: 2026-10-06
- Contexto: AC-10 del PRD exige que una actualización quede reflejada en ≤15 minutos o se muestre pendiente/atrasada. El estado persistido de una métrica no descubre por sí solo un evento de pago sin procesar.

## Decisión

- El read model Owner mide eventos operativos fuente aún no resueltos (`pending`, `processing`, `failed`) en `outbox_events`, filtrados por organización, sede (incluidos los eventos de ámbito organización) y lista de familias de evento que alimentan métricas.
- `pending` cubre eventos con ≤15 minutos; `stale` indica edad del evento no resuelto >15 minutos; `failed` señala eventos terminales fallidos inmediatamente. La edad se calcula desde `occurred_at`, no desde el instante de consulta del cliente.
- Se exponen solo conteos, edad máxima y estado; nunca event IDs, payloads, pagos individuales ni PII. Manager de sede no cuenta eventos de otra sede.
- Un índice parcial compuesto reduce el conjunto operativo a filas no resueltas. El contrato aparece en `/owner`, `GET /api/v1/health-scores/current` y la respuesta de serie de métricas.
- Esto permite medir cambios conocidos del outbox. No demuestra un schedule periódico ni cobertura frente a cambios que no generen eventos; no se afirma disponibilidad/SLO global del 95% ni se activa cron.

## Consecuencias

- Eventos retrasados o fallidos quedan visibles sin marcar como atrasada una academia simplemente porque no tuvo actividad reciente.
- Para demostrar el requisito completo aún hacen falta prueba E2E webhook→outbox→worker→dashboard, frecuencia de schedule y medición de cobertura del 95%.

## Verificación

Tests puros prueban estados y frontera 900/901 segundos. Harness PostgreSQL local verifica pending, stale, processed/recovered, failed y aislamiento de sede. No se aplicó la migración a Supabase remoto.
