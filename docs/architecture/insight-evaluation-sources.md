# Fuentes canónicas de evaluación de Insights P0

**Fecha:** 2026-10-06  
**Implementación:** `src/modules/insights/application/evaluate-p0-rules.ts`

## Contrato

`evaluateP0Insights` recibe organización, sede, actor, fecha de evaluación,
watermark e idempotency prefix. Requiere `owner` o `admin` activo para esa sede;
las consultas se filtran por organización y sede. Cada regla activa se persiste
por `runInsightEvaluation`, que vuelve a autorizar y registra corrida,
observaciones, deduplicación y resolución. El watermark se propaga a las
consultas históricas y a cada corrida.

| Regla | Fuente canónica y criterio |
| --- | --- |
| `underutilized_class` | sesiones no canceladas en ventana configurada; capacidad efectiva limitada por plantilla, override, espacio; plazas por atletas distintos en inscripciones vigentes en la fecha local, usando historial de estado. |
| `excess_demand` | ocupación ponderada de la ventana y entradas waiting/offered con `contactable` y consentimiento `granted`; no lee ni expone contactos. |
| `overdue_collections` | cargos due/partially_paid por moneda; asignaciones de pagos exitosos menos reembolsos exitosos hasta watermark; salida agregada por sede/moneda/familias. |
| `incomplete_attendance` | sesiones completadas tras umbral; inscripciones activas en fecha de sesión menos filas de asistencia presentes. |
| `trial_without_followup` | pruebas completed/converted anteriores al umbral y sin seguimiento completado. |
| `low_trial_conversion` | pruebas completadas/convertidas de la sede; solo emite si existe meta activa específica de la organización para `trial_conversion_rate`. |
| `capacity_without_price` | capacidad libre de clases activas menos inscripciones activas; precio evaluado con asignación vigente a inscripción y price plan activo. |
| `session_without_coach` | sesiones scheduled dentro del umbral sin asignación con `assignment_role='coach'`. |
| `critical_data_missing` | incidencias `METRIC_INVALID` abiertas de runs completados; solo traduce explícitamente `class_fill_rate`, `attendance_rate` y `attendance_coverage` a campos permitidos. |

El riesgo individual de retención no se evalúa y sigue `draft`. No se infieren
benchmarks españoles. La CTA `simulate_group` abre una simulación hipotética
con demanda agregada, capacidad introducida por la persona usuaria y precio
opcional igualmente hipotético. Los escenarios 50/75/100% son sensibilidades
no calibradas, no tasas observadas. Sin precio aportado no hay cifra monetaria.
El flujo no crea clases, grupos, plazas ni comunicaciones; véase
[ADR-0013](./adr/0013-simulacion-hipotetica-demanda.md).

## Verificación y límites

`bash scripts/run-zaltyko-insight-engine-local.sh` aplica el esquema canónico en
PostgreSQL efímero con fixture sintético y ejecuta las nueve reglas activas a
través de la integración. El tipo y ESLint locales pasan. Esto no valida una
instancia Supabase remota, RLS/PostgREST bajo Auth real, concurrencia a volumen,
20 identidades, 5.000 atletas, 2 M asistencias, worker, SLA de 15 min, digests,
E2E autenticado ni calibración con academias reales.

Riesgo pendiente: las consultas de agregados históricos deben someterse a
golden tests por regla (altas/bajas efectivas, devolución parcial, sesiones sin
espacio, consentimiento revocado y watermark atrasado), límites de cardinalidad
y pruebas de resolución por regla antes de activar ejecución programada.
