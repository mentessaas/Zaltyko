# Diccionario de métricas v0

Estado: fórmulas v1 implementadas y verificadas localmente en PR-05.

## Reglas comunes

- Grano base: organización, sede opcional, período y dimensiones declaradas.
- Cada resultado conserva versión de definición, numerador, denominador,
  cobertura, estado de calidad, `calculated_at` y watermark de fuentes.
- `insufficient` e `invalid` publican `value = null`, nunca cero.
- Tasas agregadas se reconstruyen desde numeradores/denominadores; no se
  promedian porcentajes de clases o sedes.
- Transferencias internas no cuentan como churn organizacional.
- Identidad, nombres, contacto, deuda individual y datos médicos no forman
  parte del resultado ni del evento analítico.

## Definiciones iniciales

| Código                       | Unidad / agregación    | Definición v1                                                                                                                          | Fuente canónica                                        | Estado                                                              |
| ---------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------- |
| `active_athletes_count`      | count / sum            | Atletas distintos con al menos una inscripción `active` vigente en el día; el período publica promedio diario y cierre por separado    | `enrollments`, historial y pausas                      | Implementada v1                                                     |
| `class_fill_rate`            | ratio / weighted_ratio | Suma de plazas ocupadas elegibles / suma de capacidad efectiva; capacidad efectiva = mínimo de plantilla, espacio y override de sesión | `enrollments`, `class_templates`, `sessions`, `spaces` | Implementada v1; canceladas excluidas                               |
| `cohort_retention_rate`      | ratio / cohort_ratio   | Miembros elegibles de la cohorte inicial que siguen activos al cierre / cohorte inicial elegible                                       | historial de `enrollments`                             | Implementada v1; continuidad organizacional                         |
| `churn_rate`                 | ratio / cohort_ratio   | Miembros elegibles de cohorte inicial que terminan sin transferencia/reactivación dentro de ventana / cohorte inicial elegible         | historial de `enrollments`                             | Implementada v1; transferencia interna excluida                     |
| `recognized_revenue_minor`   | currency_minor / sum   | Cargos no anulados del período; Stripe no es fuente única                                                                              | `charges`                                              | Implementada v1                                                     |
| `collection_rate`            | ratio / weighted_ratio | Pagos asignados netos de refund / importe cobrable vencido del período                                                                 | `charges`, `payment_allocations`, `refunds`            | Implementada v1                                                     |
| `waitlist_opportunity_count` | count / sum            | Entradas contactables y activas para clases/programas con demanda no atendida                                                          | `waitlist_entries`                                     | Implementada v1                                                     |

## Estados de calidad

| Estado         | Semántica                                                       |
| -------------- | --------------------------------------------------------------- |
| `complete`     | fuentes y campos requeridos cubren el período; valor publicable |
| `partial`      | valor publicable con cobertura incompleta y causa explícita     |
| `insufficient` | no existe denominador/cobertura suficiente; valor nulo          |
| `stale`        | cálculo válido pero watermark supera el SLA de frescura         |
| `invalid`      | invariantes rotas o reconciliación fallida; valor nulo          |

## Decisiones diferidas a nuevas versiones de fórmula

- calendario de temporada distinto a períodos explícitos;
- ventana de gracia adicional tras una baja real;
- granularidad por programa y grupo;
- reconocimiento contable de descuentos, becas, impuestos y prorrateos;
- umbrales de cobertura por dimensión del score;
- benchmarks autorizados y adecuados al mercado español.

Fuente: PRD técnico, secciones 8–12 y criterios AC-01…AC-05.
