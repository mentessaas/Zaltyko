# ADR-0002 — Inscripción canónica y pertenencia a grupos

- Estado: aceptada
- Fecha: 2026-10-06
- Alcance: atletas, grupos, clases, capacidad y retención

## Contexto

El histórico válido más importante es que un atleta puede pertenecer a varios
grupos. Un `athletes.group_id` singular destruye información. A la vez, grupo,
clase recurrente, sesión e inscripción son conceptos distintos y no deben
usarse como sustitutos.

## Decisión

- `group_memberships` es la relación M:N canónica atleta↔grupo, fechada y con
  estado. Nunca se añadirá `group_id` a `athletes`.
- `class_templates` describe recurrencia; `sessions` describe ocurrencias
  reales. Una plantilla puede relacionarse con varios grupos mediante
  `class_template_groups`.
- `enrollments` es la relación fechada atleta↔plantilla que alimenta capacidad,
  retención, churn y atribución de precio.
- Las inscripciones abiertas son `pending`, `trial`, `active` o `paused`. Una
  combinación atleta/plantilla solo puede tener una inscripción abierta.
- Toda transición crea `enrollment_status_history`, incrementa `version`, usa
  clave de idempotencia y publica el evento correspondiente en la misma
  transacción.
- El historial conserva `effective_on` como fecha de negocio y `changed_at`
  como fecha de ejecución. Los intervalos usan `starts_on` inclusivo y
  `ends_on` exclusivo.
- Toda pausa crea un intervalo en `enrollment_pauses`. Reactivar, cancelar,
  completar o transferir cierra el intervalo abierto; el estado actual no
  sustituye al historial temporal necesario para métricas.
- Mientras no exista un scheduler de comandos, una transición futura se
  rechaza en vez de adelantar el estado actual.
- Una transferencia cierra la inscripción origen y crea la destino de forma
  atómica. No cuenta como churn salvo que la regla analítica lo determine de
  forma explícita.
- La capacidad efectiva es el mínimo válido entre plantilla, espacio y override
  de sesión. La reserva definitiva se valida dentro de una transacción con
  bloqueo de fila o advisory lock estable.

## Consecuencias

- El dashboard puede reconstruir ocupación y cohortes sin inferencias desde el
  grupo “principal”.
- El flujo operativo no dependerá de cálculos del dashboard.
- Los próximos servicios deben probar concurrencia, transferencia y reintentos;
  el esquema por sí solo no demuestra que la capacidad sea segura.

## Evidencia y referencias

- PRD, secciones 5, 9.3, 10.3–10.4 y AC-03/AC-04.
- Regla heredada validada: `group_athletes` era la relación M:N canónica.
- Implementación operativa: `../operational-services.md`.
