# Plan de implementación — Owner Dashboard y Academy Health Score

## Decisión de ejecución

El PRD es la especificación principal. El nuevo núcleo no preservará contratos
internos, tablas, endpoints o componentes heredados. La sustitución será por
cortes pequeños para que cada invariantes se revise y pruebe antes de construir
la siguiente.

## Estado inicial de este plan

| Elemento                                              | Estado                                                |
| ----------------------------------------------------- | ----------------------------------------------------- |
| ADRs de tenancy, enrollment, ledger, outbox y scoring | Implementados en documentación                        |
| Esquema `zaltyko`                                     | Ejecutado desde cero en PostgreSQL local; no remoto   |
| Contratos TypeScript                                  | Organización, enrollment, capacidad y eventos creados |
| RLS/grants                                            | Matriz local tenant/sede/privilegios aprobada         |
| Capa operativa                                        | Implementada y verificada localmente                  |
| Ledger                                                | Solo catálogo `price_plans`; resto pendiente          |
| Métricas, score, dashboard e insights                 | Pendientes                                            |

## Secuencia de cambios revisables

### PR-01 — Fundación de dominio

- ADR-0001…0005 y mapa de dominio.
- Organizaciones, sedes, instalaciones, espacios, miembros y scope.
- Personas, atletas y staff sin mezclar PII en eventos.
- Grupos M:N, plantillas, sesiones, inscripción, asistencia.
- Outbox, audit log, RLS, grants y tests PostgreSQL negativos.

Gate: migración desde cero en PostgreSQL aislado; cero referencias cross-tenant;
scope de sede negativo; audit log inmutable; TypeScript, lint y tests focales.

### PR-02 — Servicios operativos transaccionales

Estado: **cerrada localmente** el 2026-10-06. Evidencia y límites en
`docs/architecture/operational-services.md`.

- repositorios y application services por módulo;
- alta, pausa, reactivación, cancelación y transferencia de enrollment;
- materialización de sesiones desde plantilla;
- registro de asistencia;
- validación de capacidad con lock y conflicto determinista;
- escritura atómica dominio + historial + outbox + auditoría.

Gate: pruebas de integración con dos organizaciones, dos sedes, reintentos y
concurrencia. Ninguna API ni UI antes de pasar este gate.

Resultado: gate local aprobado con PostgreSQL efímero, autorización resuelta en
base de datos, última plaza concurrente, correcciones concurrentes de asistencia
y paridad dominio/historial/outbox/auditoría. API, E2E autenticado, despliegue y
runtime remoto no forman parte de esta fase.

### PR-03 — Trials, waitlist y fixture sintético

- trials/followups, waitlist entries/offers y expiración idempotente;
- familias/guardianes/payers con permisos separados;
- fixture sintético de una sede y multi-sede, sin datos reales;
- importador idempotente y reporte de reconciliación.

Gate: journey completo trial→waitlist/enrollment y transferencia sin churn falso.

### PR-04 — Ledger mínimo

- invoices/lines, charges, payments, allocations, attempts y refunds;
- adaptador de procesador sin dependencia de Stripe Live;
- webhook inbox idempotente y reconciliación diaria;
- eventos financieros sin PII.

Gate: pagos parciales, fallo/reintento/refund, tres entregas del mismo evento con
un solo efecto y sumas reconciliadas por moneda.

### PR-05 — Motor de métricas

- diccionario versionado y contratos SQL;
- metric runs/values, watermarks, calidad y recompute;
- atletas activos, fill rate ponderado, asistencia, retención, churn, revenue y
  collection rate;
- golden fixture y property tests.

Gate: mismas entradas+versión producen mismo resultado; fallo analítico no
bloquea operaciones; frescura y cobertura observables.

### PR-06 — Academy Health Score

- benchmark profiles, versiones y pesos;
- snapshots globales y por dimensión;
- normalización, redistribución explícita y `insufficient_data`;
- explicación por contribución y recomputación administrativa auditada.

Gate: AC-01, AC-02 y AC-13 del PRD sobre fixture congelado.

### PR-07 — Query layer y Owner Dashboard

- API/bundle de lectura con filtros de período, sede, programa y grupo;
- `/owner` responsive, mobile-first y accesible;
- score, prioridades, KPIs, tendencias, capacidad, retención y cobros;
- tablas equivalentes para gráficos, empty/error/stale/insufficient states.

Gate: 375/768/1280 px, teclado/VoiceOver, sin escaneo de eventos en request y
p95 medido contra volumen objetivo.

### PR-08 — Insights y acciones

- reglas P0, deduplicación, prioridad, snooze y resolución;
- acciones y outcome tracking;
- digest con política anti-fatiga.

Gate: mismo problema no duplica insight; toda acción enlaza métrica, regla,
actor y resultado.

### PR-09 — Cutover prepiloto

- retirar rutas/módulos heredados sustituidos;
- decidir importación o arranque limpio;
- threat model, RGPD, observabilidad, backup/restore y runbooks;
- E2E autenticado completo en entorno autorizado.

Gate: GO/NO-GO explícito. Producción, Stripe Live, credenciales y despliegue
siguen fuera de alcance sin autorización adicional.

## Reporte obligatorio por PR

Cada cambio informará por separado: implementación, migraciones, pruebas
locales, RLS/autorización, E2E autenticado, despliegue, runtime y dependencias
externas no verificadas. Un typecheck verde nunca equivale a listo para
producción.
