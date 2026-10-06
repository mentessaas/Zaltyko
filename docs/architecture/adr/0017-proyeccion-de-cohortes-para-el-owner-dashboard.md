# ADR-0017: Proyección mensual de cohortes para Owner Dashboard

- Estado: aceptado; implementación pendiente
- Fecha: 2026-10-06
- Contexto: AC-12 fija p95 de agregados ≤800 ms y vista caliente ≤2 s con 5.000
  atletas, 100.000 sesiones, 2 M asistencias, 500.000 movimientos financieros,
  36 meses y 20 usuarios. El benchmark sintético local alcanzó esas
  cardinalidades. Tras dos optimizaciones set-based, el p95 de cohortes sigue
  en 6,42 s; el heatmap ya queda por debajo de 800 ms. La consulta de cohortes
  expande 5.000 atletas por hasta 36 meses para reconstruir estados de cada
  inscripción en cada request.

## Decisión

- No calcular cohortes atleta-mes en una petición interactiva. Materializar una
  proyección mensual agregada por organización, scope autorizado, mes de cohorte
  y mes de observación.
- La proyección es un read model reconstruible, nunca fuente de verdad. Cada
  fila conservará `metric_run_id`, fórmula/versión, `source_watermark`, calidad,
  numerador y denominador; la publicación de un run será idempotente.
- Las filas solo contienen conteos agregados, sin atleta, familia, inscripción,
  pago ni identificador reversible. Aplicar RLS y scope organización/sede como
  defensa en profundidad; las APIs seguirán autorizando mediante el actor y el
  selector de scope existente.
- Cambios de historial de inscripción recalculan los períodos afectados desde
  la fecha efectiva; las transferencias entre sedes mantienen la política de
  continuidad organizativa. Las pausas mantienen `insufficient_data` hasta
  definir su gracia, sin convertirlas en bajas.
- El endpoint leerá únicamente la última proyección completa compatible con el
  scope y watermark. Si no existe o está atrasada, devolverá estado explícito
  (`stale`/`unavailable`), no hará fallback silencioso al query lento.

## Consecuencias y gates

- Requiere tabla, índice por scope/cohort_month/observation_month, clave única
  idempotente, worker integrado en invalidación de métricas y permisos/RLS.
- Probar reconstrucción/reintento, cambios retroactivos, aislamiento entre
  tenants/sedes, transferencias, pausas, datos insuficientes y ausencia de PII.
- Aceptación local: p95 <800 ms para query de cohortes y <2 s para vista
  compuesta en el fixture AC-12 con 20 identidades; no afirmar cumplimiento
  remoto hasta medir Auth/HTTP/browser en un entorno aislado.
- Hasta pasar esos gates, AC-12 permanece `NO CUMPLE`; no rebajar el SLO.
