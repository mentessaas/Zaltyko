# Auditoría de cobertura del PRD — Owner Dashboard y Academy Health Score

**Fecha:** 2026-10-06
**Fuente principal:** `PRD-Zaltyko-Owner-Dashboard-Academy-Health-Score.md` v1.0
**Base examinada:** rama `codex/health-score-v2`; actualización local `evaluateP0Insights` verificada sobre PostgreSQL efímero el 2026-10-06.

## Dictamen

La arquitectura central está implementada y varias invariantes funcionales pasan
con PostgreSQL local y fixtures sintéticos. El producto todavía no satisface
todo el PRD: el Owner Dashboard ofrece principalmente score, dimensiones,
métricas y prioridades; faltan APIs de drill-down requeridas, filtros de
programa/grupo/período comparable, worker/SLA, entrega de notificaciones, carga
objetivo y E2E autenticado en un entorno aislado. Las nueve reglas P0 activas ya
leen datos canónicos y ejecutan el ciclo idempotente en local. Por tanto, este
dictamen no declara el producto completo ni apto para piloto.

## Acceptance criteria

| AC                            | Estado actual                        | Evidencia y límite                                                                                                                                                                                                                                                           |
| ----------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-01 Score explicable        | PASS local sintético                 | `docs/architecture/health-score-engine.md`, `docs/architecture/owner-dashboard-query-ui.md`, `scripts/verify-zaltyko-health-score-engine.ts`; falta E2E autenticado remoto.                                                                                                  |
| AC-02 Datos insuficientes     | PASS local sintético                 | `scripts/verify-zaltyko-health-score-engine.ts`; UI ofrece cobertura y resolución, pero aún faltan reglas sistemáticas de calidad.                                                                                                                                           |
| AC-03 Ocupación ponderada     | PASS local sintético                 | `docs/architecture/metric-engine.md`, `scripts/verify-zaltyko-metrics-engine.ts`; el dashboard aún no incluye el heatmap/drill-down del PRD.                                                                                                                                 |
| AC-04 Transferencia sin churn | PASS local sintético                 | `docs/architecture/metric-engine.md`, `scripts/verify-zaltyko-operational-services.ts`; falta E2E integrado de temporada.                                                                                                                                                    |
| AC-05 Finanzas reconciliables | PASS local sintético                 | `docs/architecture/ledger-operations.md`, `scripts/verify-zaltyko-ledger-services.ts`; no prueba pagos remotos ni Stripe.                                                                                                                                                    |
| AC-06 Idempotencia            | PASS local sintético                 | Verificadores de ledger, métricas e Insights; dispatcher outbox demuestra claims concurrentes, consumidor idempotente y lease caducado recuperable. El runtime remoto no está activado.                                                                                      |
| AC-07 Insight accionable      | PASS parcial                         | Las nueve reglas P0 ejecutan contra tablas canónicas; CTA `excess_demand` ya ofrece simulador ejecutable, con capacidad/precio opcionales introducidos por Owner, escenarios no calibrados etiquetados, recálculo/whitelist servidor e idempotencia de parámetros (ADR-0013; `85d82100`). No crea clases ni mensajes. Falta calibración, validación profunda por regla, scheduler y E2E autenticado. |
| AC-08 Seguridad multi-tenant  | PASS local; remoto NO VERIFICADO     | Tests de servicios/RLS y query layer; el proyecto remoto llamado E2E Sandbox contiene 7 filas de academias legacy y no se usó.                                                                                                                                               |
| AC-09 Scope de sede           | PASS local; E2E remoto NO VERIFICADO | `scripts/verify-zaltyko-owner-dashboard-query.ts`, pruebas de Insights y ADR-0010; selector de programa/grupo filtra aforo/cohortes y la lista de grupos respeta sedes asignadas.                                                                                            |
| AC-10 Frescura ≤15 min        | NO VERIFICADO                        | Se guardan watermarks/calidad; no hay worker/scheduler que garantice el SLA.                                                                                                                                                                                                 |
| AC-11 Accesibilidad           | PASS automatizado parcial            | Auditorías Axe y responsive automatizadas; lector de pantalla y revisión manual no equivalen a prueba automatizada.                                                                                                                                                          |
| AC-12 Rendimiento a escala    | NO CUMPLE / NO VERIFICADO            | El p95 existente es sintético y de baja escala. No representa 5.000 atletas, 2 M asistencias ni 20 identidades.                                                                                                                                                              |
| AC-13 Recompute reproducible  | PASS local sintético                 | `scripts/verify-zaltyko-health-score-engine.ts`; requiere scheduler/admin API antes de operar.                                                                                                                                                                               |
| AC-14 Eventos sin PII         | PASS local de esquema/contrato       | `src/modules/events/domain/domain-event.ts` y validadores; falta inspección del pipeline remoto de analítica de producto (no desplegado).                                                                                                                                    |
| AC-15 Outcome                 | PASS local sintético                 | API manual idempotente más worker vence acciones sin evidencia como `not_measurable`; carrera manual/worker, actor original, auditoría de sistema y outbox pasan `test:zaltyko-insight-engine:local` (ADR-0012). No prueba scheduler activo ni resultados medidos reales.    |

## Requisitos del producto incompletos

| Área                   | Faltante comprobado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Próximo trabajo                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lecturas de Owner      | Dashboard, score, serie de métricas, heatmap y cohortes agregadas existen; UI integra capacidad/cohortes con degradación parcial. Faltan riesgos individuales y perfiles de benchmark. Cohortes omiten tasa si hay pausa por gracia no decidida.                                                                                                                                                                                                                                                              | Cerrar alta/gracia, revisión RGPD y permiso de riesgos; filtros, cursor pagination, carga/E2E autenticado.                                                                  |
| Filtros y dashboard    | Filtros de período/sede y selectores URL de programa/grupo implementados. Estos últimos acotan aforo/cohortes, no el score academia/sede (ADR-0010). Score muestra delta contra período anterior si perfil/score/duración comparable (ADR-0011). Harness verifica opciones cross-tenant/sede; preview sintética 375/768/1280 sin overflow. Falta selector del modo de comparación, año anterior, filtro de datos incompletos, acciones operativas, oportunidades integradas, E2E autenticado y WCAG completa. | Completar filtros restantes, cursor pagination visible, acciones operativas, axe/teclado y E2E autenticado.                                                                 |
| Insights P0            | Nueve reglas activas conectadas a fuentes canónicas y verificadas en PostgreSQL efímero; CTA de exceso de demanda ahora simula escenarios de forma acotada, sin prometer resultados ni mutar operación (ADR-0013). No hay carga a escala ni schedule activo. Retención individual permanece en draft por privacidad.                                                                                                                                                                                       | Añadir pruebas de activación/resolución por regla, calibrar solo con cohortes validadas, probar carga y operación programada; mantener riesgo individual desactivado hasta completar EIPD y aprobación. |
| Jobs y alertas         | Dispatcher y cascada local invalidación→recompute→score condicionado→9 reglas P0, más cierre de outcomes vencidos, pasan PostgreSQL efímero. Score omitido se audita sin benchmark explícito. No hay schedule registrado; digest, métricas runtime, escala y SLA siguen no verificados.                                                                                                                                                                                                                       | Añadir digest y métricas/alertas de lag/errores; solo después evaluar schedule en entorno aislado y probar frescura/degradación stale.                                      |
| Benchmark              | Hay configuración owner/admin de cinco metas internas versionadas; no es benchmark de mercado. No hay benchmark español verificado ni flujo para importar/revisar referencias externas.                                                                                                                                                                                                                                                                                                                       | Mantener etiquetas separadas, fuente/metodología auditable y sin FX implícito; no presentar referencias como norma española.                                                |
| Piloto y operación     | No hay E2E autenticado con dos organizaciones/sedes, restore drill, ni prueba de carga a escala.                                                                                                                                                                                                                                                                                                                                                                                                              | Entorno aislado sin datos de clientes; ensayos reproducibles y reportados antes de solicitar piloto.                                                                        |
| Definiciones prepiloto | Siguen abiertas las ocho preguntas de PRD §30, incluida fecha de alta, temporada y elegibilidad de autoservicio.                                                                                                                                                                                                                                                                                                                                                                                              | Decisiones de producto con valor predeterminado explícito o bloqueo antes del piloto cuando cambie una métrica.                                                             |

## Verificación fresca durante esta auditoría

- `pnpm test:zaltyko-canonical-stack:local`: **PASS**. Aplicó en PostgreSQL
  efímero y vacío las ocho migraciones canónicas, en orden, y ejecutó las pruebas
  SQL de dominio, crecimiento, ledger, métricas, score e Insights con fixture
  sintético. El primer intento reveló que las pruebas de crecimiento esperan el
  fixture común; se corrigió el orden del runner y el segundo intento pasó.
- El Supabase E2E Sandbox identificado por ref `aeeootdmuiqkfeernskw` figura
  activo, pero contiene tablas `public` legacy con 7 academias. No se aplicó
  ninguna migración ni se inspeccionaron filas o PII. Ese recurso no se considera
  una base vacía para el nuevo producto.
- No existe `supabase/config.toml` ni runtime Supabase local iniciado. PostgreSQL
  efímero valida DDL/RLS/constraints; no sustituye Auth/PostgREST/Realtime ni el
  sandbox remoto.

## Actualización posterior — simulador de demanda (2026-10-06)

Commit local `85d82100` añade el simulador en la bandeja de Insights. La UI solo
usa el conteo agregado del insight; Owner define capacidad y puede introducir
precio mensual hipotético. Sensibilidades 50/75/100% son ilustrativas/no
calibradas y sin precio no aparece un importe. El servidor valida el contrato,
recalcula escenarios con la moneda base de la academia y persiste una
representación whitelisted; clave idempotente con otros parámetros se rechaza.
No crea grupo, plazas, enrollment, charge ni comunicación. Typecheck, ESLint
focalizado, 8 tests de dominio, harness PostgreSQL efímero y build pasan. No
prueba E2E autenticado ni entorno remoto.

## Siguiente secuencia vigente

1. Completar el circuito del dashboard con acceso contextual a Insights y
   navegación de drill-down hacia capacidad/cohortes, manteniendo filtros y
   scope de organización/sede.
2. Añadir pruebas de activación/resolución por regla y observabilidad de
   freshness; preparar schedule solo cuando política y entorno estén aprobados.
3. Completar tablas, filtros/año anterior, interacción por teclado y WCAG 2.2 AA.
4. Calibrar escenarios comerciales solo con cohortes válidas y revisión humana;
   no presentar benchmarks no verificados.
5. Verificar en entorno Supabase aislado autorizado bootstrap, RLS/Data API,
   E2E, restauración y carga; sin tocar el sandbox legacy existente.
6. Cerrar definiciones del PRD §30 y gates RGPD/EIPD antes de cualquier piloto
   con datos reales.
