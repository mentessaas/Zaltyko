# ADR-0024 — Alta atómica de clases recurrentes

- Estado: aceptada para implementación incremental
- Fecha: 2026-10-13
- Alcance: plantillas de clase, sesiones, autorización y Owner UI

## Contexto

El modelo ya distingue la plantilla semanal (`class_templates`), sus horarios
(`class_template_weekdays`), las sesiones concretas (`sessions`), las
inscripciones y la pertenencia M:N a grupos. Sin una superficie Owner para
crear una plantilla, el servicio de matrículas y las métricas operativas no
tienen una fuente de clases que la academia pueda mantener por sí misma.

## Decisión

- Una orden Owner crea una plantilla activa y uno o más horarios semanales, y
  materializa las sesiones iniciales dentro de la misma transacción.
- El alcance de sede, organización, rol y actividad se verifica en servidor y
  vuelve a validarse durante la transacción. El actor se deriva de la sesión;
  una sede fuera de alcance no puede crear clases.
- La clave idempotente cubre el alta completa: repetir la orden devuelve la
  plantilla existente sin duplicar sesiones; reutilizarla con otros datos
  produce conflicto.
- La materialización interpreta las horas locales con la zona horaria de la
  sede, respeta las fechas efectivas y conserva el límite existente de 120 días
  por comando. La interfaz informa el horizonte preparado; el siguiente corte
  debe añadir una ampliación repetible o un worker que mantenga el calendario.
- El outbox publica identificadores y datos no personales necesarios para
  idempotencia; no copia el nombre visible de la clase. Auditoría, plantilla,
  horarios, sesiones y outbox se confirman o revierten juntos.
- Crear una clase no crea matrículas, pertenencias a grupos, familias,
  consentimiento, cargos ni cobros. `group_memberships` y `enrollments` siguen
  siendo relaciones distintas.
- No se añade migración: el esquema y las políticas necesarios ya existen.

## Consecuencias

La academia puede configurar una clase y disponer de sesiones iniciales desde
una sola pantalla. Las métricas reciben hechos operativos canónicos sin calcular
el Health Score dentro de la operación. La limitación de 120 días no debe
presentarse como calendario perpetuo: el refresco del horizonte y la cobertura
E2E autenticada continúan siendo gates antes del lanzamiento.

## Evidencia local

- `/owner/classes` y `/api/v1/owner/classes` usan membresía y ámbito de sede
  canónicos; la API limita solicitudes y evita cachear datos privados.
- Vitest de ruta e interfaz: 7/7.
- `scripts/run-zaltyko-operational-services-local.sh`: PASS con PostgreSQL
  efímero para alta de plantilla y sesiones, replay idempotente con horarios
  en orden distinto, no duplicación y denegación de sede fuera de scope.
- TypeScript: PASS. No se aplicó SQL remoto ni se desplegó a Producción.
