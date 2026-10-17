# Academy Health Score explicable

- Estado: implementado y verificado localmente
- Fecha: 2026-10-06
- Alcance: PR-06 del plan Owner Dashboard / Academy Health Score

## Dependencia y trazabilidad

El score consume exclusivamente `metric_run_values`, la evidencia inmutable de
una ejecución completada. No consulta enrollment, asistencia, ledger ni outbox.
Cada snapshot conserva:

- ejecución de métricas y watermark;
- versión del score;
- perfil benchmark y fuente declarada;
- score, banda y cobertura global;
- cuatro snapshots de dimensión;
- una contribución por métrica configurada con valor, target, normalización,
  peso, cobertura, calidad, numerador, denominador y versión de fórmula.

El historial pagina los snapshots y limita su lectura secundaria de dimensiones
a `número de snapshots × valores del enum canónico health_dimension`. Así se
cubren todas las dimensiones de cada snapshot sin depender de un tope fijo; si
el enum incorpora una dimensión futura, el límite se ajusta con el esquema.

No se copian nombres, contactos, notas médicas ni deuda individual.

## Versión `zaltyko_owner_health@1`

Los pesos de dimensión siguen el PRD: Enrollment 30%, Financial 30%,
Operational 25% y Workforce 15%. La versión local inicial solo configura
métricas ya materializadas:

| Dimensión   | Métricas y pesos                              |
| ----------- | --------------------------------------------- |
| Enrollment  | fill 45%, retención 35%, churn 20%            |
| Financial   | collection rate 100%                          |
| Operational | cobertura de asistencia 100%                  |
| Workforce   | sin fuente canónica; siempre insufficient V1  |

Esto no elimina el roadmap del PRD. Evita puntuar ceros o inventar adopción de
portal, automatizaciones o estabilidad de staff antes de modelarlas.

Las lecturas del perfil de objetivos seleccionan las cinco métricas canónicas
con su moneda esperada: cuatro sin moneda y `collection_rate` con la moneda
guardada en esa versión del perfil. Validan claves distintas y rechazan perfiles
incompletos, duplicados o con moneda incompatible. No se sustituyen objetivos
inválidos por ceros; el replay devuelve conflicto si el conjunto no es exacto.

Una dimensión requiere ≥60% de su peso configurado disponible. El global
requiere al menos tres dimensiones válidas y ≥70% de cobertura. Las bandas son
las del PRD: crítico 0–49, necesita atención 50–69, saludable 70–84 y excelente
85–100. Se conserva precisión a dos decimales; el redondeo entero será solo de
presentación.

## Benchmarks

El esquema admite perfiles globales y propios de organización, targets por
métrica, moneda, grano, dirección y referencia documental. No se siembra un
target comercial español sin evidencia.

La prueba usa `synthetic_acceptance_profile@1`, propiedad de la organización
sintética y con `source_title = Fixture sintético PR-06`. Sus objetivos son
datos fabricados para verificar fórmulas, no recomendaciones ni benchmark de
mercado.

## Evidencia local

- Fixture completo: score 83,28 (`healthy`), cobertura 0,85, tres dimensiones
  válidas y Workforce `insufficient_data`.
- AC-01: cinco contribuciones explican valor, target, fórmula, numerador,
  denominador, calidad, cobertura, fuente y watermark.
- AC-02: invalidar fill (45% de Enrollment) deja 55% disponible; Enrollment y
  el global pasan a `insufficient_data`, nunca a cero.
- AC-13: dos snapshots con mismo metric run, versión y perfil producen el mismo
  score, banda y cobertura; el reintento con la misma clave no duplica filas.
- Perfil de otro tenant y actor sin membership no obtienen acceso.
- Historial de 50 snapshots: la consulta de dimensiones queda limitada a 200
  filas con filtro de organización; historial vacío no ejecuta esa consulta.

Comandos:

- `pnpm test:zaltyko-health-score-foundation:local`
- `pnpm test:zaltyko-health-score-engine:local`
- `pnpm exec vitest run tests/zaltyko-health-score-formulas.test.ts`

## Límites

No hay benchmark España validado, calibración de 90 días, Workforce Health,
API, dashboard, scheduler desplegado, prueba de carga, E2E autenticado ni
runtime remoto. La banda no debe usarse como promesa comercial antes del piloto.
