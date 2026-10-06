# ADR-0004 — Outbox, idempotencia y auditoría

- Estado: aceptada
- Fecha: 2026-10-06
- Alcance: mutaciones, eventos, métricas e insights

## Decisión

Toda mutación operativa relevante guarda en una misma transacción:

1. el cambio de dominio;
2. la transición o evidencia de negocio;
3. una fila de `outbox_events` con `event_name`, versión, entidad y clave de
   idempotencia;
4. una entrada de `audit_log` cuando la acción sea sensible.

El outbox admite reintentos y leases; los consumidores mantienen su propia
deduplicación. La unicidad `(organization_id, event_name, idempotency_key)`
impide efectos duplicados en origen. `audit_log` es append-only mediante
trigger. Sus correcciones se expresan con un nuevo evento, no con UPDATE/DELETE.

Los payloads operativos y analíticos contienen identificadores, estados y
cantidades estrictamente necesarias. Se rechazan nombres, email, teléfono,
dirección, fecha de nacimiento, datos médicos o del tutor.

## Consecuencias

- Analytics puede fallar o retrasarse sin bloquear asistencia, inscripciones o
  cobros.
- “Exactly once” se consigue por efectos idempotentes observables, no por
  asumir una entrega única.
- La publicación directa a PostHog/colas desde una request no sustituye el
  outbox.

## Evidencia

- PRD, secciones 5.7, 12, 16, 18 y AC-06/AC-14.
