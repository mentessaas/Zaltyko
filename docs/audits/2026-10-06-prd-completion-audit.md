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

| AC                            | Estado actual                        | Evidencia y límite                                                                                                                                                          |
| ----------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-01 Score explicable        | PASS local sintético                 | `docs/architecture/health-score-engine.md`, `docs/architecture/owner-dashboard-query-ui.md`, `scripts/verify-zaltyko-health-score-engine.ts`; falta E2E autenticado remoto. |
| AC-02 Datos insuficientes     | PASS local sintético                 | `scripts/verify-zaltyko-health-score-engine.ts`; UI ofrece cobertura y resolución, pero aún faltan reglas sistemáticas de calidad.                                          |
| AC-03 Ocupación ponderada     | PASS local sintético                 | `docs/architecture/metric-engine.md`, `scripts/verify-zaltyko-metrics-engine.ts`; el dashboard aún no incluye el heatmap/drill-down del PRD.                                |
| AC-04 Transferencia sin churn | PASS local sintético                 | `docs/architecture/metric-engine.md`, `scripts/verify-zaltyko-operational-services.ts`; falta E2E integrado de temporada.                                                   |
| AC-05 Finanzas reconciliables | PASS local sintético                 | `docs/architecture/ledger-operations.md`, `scripts/verify-zaltyko-ledger-services.ts`; no prueba pagos remotos ni Stripe.                                                   |
| AC-06 Idempotencia            | PASS local sintético                 | Verificadores de ledger, métricas e Insights; dispatcher outbox demuestra claims concurrentes, consumidor idempotente y lease caducado recuperable. El runtime remoto no está activado. |
| AC-07 Insight accionable      | PASS parcial                         | Las nueve reglas P0 activas ejecutan contra tablas canónicas y el ciclo idempotente pasa en PostgreSQL efímero sintético (`scripts/run-zaltyko-insight-engine-local.sh`). Sigue faltando simulador de grupo funcional, validación profunda por regla y operación programada. |
| AC-08 Seguridad multi-tenant  | PASS local; remoto NO VERIFICADO     | Tests de servicios/RLS y query layer; el proyecto remoto llamado E2E Sandbox contiene 7 filas de academias legacy y no se usó.                                              |
| AC-09 Scope de sede           | PASS local; E2E remoto NO VERIFICADO | `scripts/verify-zaltyko-owner-dashboard-query.ts`, pruebas de Insights; los filtros de producto aún no cubren programa/grupo.                                               |
| AC-10 Frescura ≤15 min        | NO VERIFICADO                        | Se guardan watermarks/calidad; no hay worker/scheduler que garantice el SLA.                                                                                                |
| AC-11 Accesibilidad           | PASS automatizado parcial            | Auditorías Axe y responsive automatizadas; lector de pantalla y revisión manual no equivalen a prueba automatizada.                                                         |
| AC-12 Rendimiento a escala    | NO CUMPLE / NO VERIFICADO            | El p95 existente es sintético y de baja escala. No representa 5.000 atletas, 2 M asistencias ni 20 identidades.                                                             |
| AC-13 Recompute reproducible  | PASS local sintético                 | `scripts/verify-zaltyko-health-score-engine.ts`; requiere scheduler/admin API antes de operar.                                                                              |
| AC-14 Eventos sin PII         | PASS local de esquema/contrato       | `src/modules/events/domain/domain-event.ts` y validadores; falta inspección del pipeline remoto de analítica de producto (no desplegado).                                   |
| AC-15 Outcome                 | PASS parcial                         | API idempotente y registro manual; falta job que cierre automáticamente la ventana con resultado o `not_measurable`.                                                        |

## Requisitos del producto incompletos

| Área                   | Faltante comprobado                                                                                                                                                     | Próximo trabajo                                                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Lecturas de Owner      | Solo existe `/api/v1/owner/dashboard`; faltan score history, detalle/serie de métricas, heatmap, cohortes y riesgos.                                                    | Contratos de lectura con scope, filtros validados, paginación y respuestas RFC 9457.                                                   |
| Filtros y dashboard    | API/UI no persisten período comparable, disciplina/programa y grupo; faltan paneles de cobros, retención, capacidad y oportunidades conforme al PRD.                    | Read models primero; después rutas y UI responsive.                                                                                    |
| Insights P0            | Nueve reglas activas conectadas a fuentes canónicas y verificadas en PostgreSQL efímero; no hay carga a escala ni worker. Retención individual permanece en draft por decisión de privacidad. | Añadir pruebas de activación/resolución por regla, carga, scheduler y operación; mantener riesgo individual desactivado hasta completar evaluación de impacto y aprobación. |
| Jobs y alertas         | Dispatcher outbox local y route autenticada implementados, pero sin cron registrado; faltan invalidación→recompute→score→Insights→outcome, digest, métricas runtime y evidencia de SLA. | Completar actor interno seguro y orquestación, instrumentar lag/errores, luego configurar scheduler solo en entorno aislado y probar frescura/degradación stale. |
| Benchmark              | Modelo y valores iniciales existen, pero no hay API/configuración de perfil completa ni benchmark español validado.                                                     | Separar perfil Jackrabbit de objetivos internos; impedir conversión monetaria implícita; no presentar referencias como norma española. |
| Piloto y operación     | No hay E2E autenticado con dos organizaciones/sedes, restore drill, ni prueba de carga a escala.                                                                        | Entorno aislado sin datos de clientes; ensayos reproducibles y reportados antes de solicitar piloto.                                   |
| Definiciones prepiloto | Siguen abiertas las ocho preguntas de PRD §30, incluida fecha de alta, temporada y elegibilidad de autoservicio.                                                        | Decisiones de producto con valor predeterminado explícito o bloqueo antes del piloto cuando cambie una métrica.                        |

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

## Siguiente secuencia

1. Añadir evaluadores deterministas para ocho reglas P0 agregadas y verificarlos
   con fixtures; retention risk individual sigue apagado.
2. Construir runner durable para outbox → métricas → score → reglas → outcomes,
   con reintentos/idempotencia y observabilidad.
3. Completar contratos y APIs de drill-down, perfil de benchmarks y filtros.
4. Completar dashboard operativo, filtros URL, estados de datos y accesibilidad.
5. Aprovisionar un entorno Supabase aislado, cuando se elija organización/coste,
   y validar bootstrap, RLS/Data API, E2E, restauración y carga.
6. Cerrar decisiones de PRD §30 y revisión RGPD/EIPD antes del piloto con datos
   reales.
