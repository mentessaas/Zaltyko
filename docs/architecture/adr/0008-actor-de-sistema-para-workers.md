# ADR-0008 — Actor de sistema explícito para workers

- Estado: aceptada para implementación local en cortes pequeños
- Fecha: 2026-10-06
- Contexto: PRD §§12, 17 y 18 requiere procesamiento programado de métricas e
  Insights. Los servicios actuales aceptan `userId/memberId` activo y verifican
  roles/scope de una persona. Reusar la membresía de owner/admin desde un cron
  falsearía quién ejecutó la evaluación y ampliaría permisos sin necesidad.

## Decisión

Separar `OperationalActor` humano de un actor interno discriminado, limitado a
trabajos de diagnóstico/recomputación. El adaptador del worker solo se invoca
después de autenticar `CRON_SECRET`; valida organización y sedes objetivo en
base de datos y nunca sintetiza ni reutiliza `userId/memberId`. El actor se emite
en un contexto async por `withCronSystemActor`; los servicios comprueban que el
actor coincida con ese contexto, de modo que un objeto `type=system` falsificado
fuera de cron falla.

Las entradas de auditoría representan al worker con `actor_user_id = null` y
metadata estructurada no sensible (`actor_type=system`, job/version,
correlation e idempotency). Las acciones `insight_actions` representan decisiones
humanas: su actor obligatorio no se relaja ni se crean acciones automáticas.
El worker puede evaluar, refrescar y resolver insights; no acciona cambios de
operación ni envía comunicaciones externas.

La secuencia local prevista es outbox → invalidación → recompute de métricas →
score → reglas P0 → cierre de outcomes ya iniciados por humanos. Reintentos,
leases y operaciones destino conservan idempotencia. El cron no se registra ni
despliega hasta superar pruebas de aislamiento y operabilidad en un entorno
aislado autorizado.

## Consecuencias y gates

- Los comandos humanos conservan su esquema y autorización actuales.
- Las tablas que admiten actor nulo conservan `actor_user_id`; se diferencia el
  actor de sistema en metadata y run IDs. No se agrega FK a un usuario ficticio.
- El dispatcher usa identidad de job fija, no una identidad personal.
- Pruebas requeridas: scope de organización/sede, no suplantación, trazabilidad,
  deduplicación concurrente, recuperación de lease, outcome idempotente y
  ausencia de efectos de negocio o notificaciones externas.
- El SLA ≤15 min no se declara hasta scheduler durable, medición de lag y prueba
  de degradación `stale`.

## Alternativas rechazadas

- Usar al owner como actor del cron: suplantación y audit trail engañoso.
- Relajar actor obligatorio en acciones humanas: destruye atribución legal y
  semántica de “el owner decidió actuar”.
- Desplegar scheduler antes de probar el actor interno: riesgo de contaminar
  métricas o permitir procesamiento cross-tenant.
