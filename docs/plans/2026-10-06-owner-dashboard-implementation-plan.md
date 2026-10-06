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
| Ledger                                                | PR-04 cerrado localmente; sin procesador remoto       |
| Métricas                                              | PR-05 cerrado localmente                              |
| Academy Health Score                                  | PR-06 cerrado localmente                              |
| Dashboard                                             | PR-07 implementado y verificado localmente            |
| Insights                                              | PR-08 implementado y verificado localmente            |

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

Estado: **cerrada localmente** el 2026-10-06. Esquema, servicios y fixture
mono/multi-sede aprobados; evidencia en `docs/architecture/growth-operations.md`.

- trials/followups, waitlist entries/offers y expiración idempotente;
- familias/guardianes/payers con permisos separados;
- fixture sintético de una sede y multi-sede, sin datos reales;
- importador idempotente y reporte de reconciliación.

Gate: journey completo trial→waitlist/enrollment y transferencia sin churn falso.

Resultado: trial→waitlist→enrollment, conversión directa y expiración de oferta
aprobados con reintentos, scope de sede y reservas de capacidad. La transferencia
conserva su evento propio y el cierre de un trial publica `completed`, no churn.

### PR-04 — Ledger mínimo

Estado: **cerrada localmente** el 2026-10-06. Esquema, servicios e inbox de
proveedor sandbox aprobados; evidencia en
`docs/architecture/ledger-operations.md`.

- invoices/lines, charges, payments, allocations, attempts y refunds;
- adaptador de procesador sin dependencia de Stripe Live;
- webhook inbox idempotente y reconciliación diaria;
- eventos financieros sin PII.

Gate: pagos parciales, fallo/reintento/refund, tres entregas del mismo evento con
un solo efecto y sumas reconciliadas por moneda.

Resultado: el caso 100 €/60 €/10 € reconcilia a 50 € netos y 40 € pendientes;
tres entregas concurrentes generan un pago y un intento. RLS, grants, tenant,
moneda, sobreasignación, sobrereembolso, outbox y auditoría pasan localmente.
No se tocó Stripe, red, secretos, API, despliegue ni producción.

### PR-05 — Motor de métricas

Estado: **cerrada localmente** el 2026-10-06. Contratos, ejecución,
invalidaciones, evidencia inmutable y read model aprobados; detalle en
`docs/architecture/metric-engine.md`.

- diccionario versionado y contratos SQL;
- metric runs/values, watermarks, calidad y recompute;
- atletas activos, fill rate ponderado, asistencia, retención, churn, revenue y
  collection rate;
- golden fixture y property tests.

Gate: mismas entradas+versión producen mismo resultado; fallo analítico no
bloquea operaciones; frescura y cobertura observables.

Resultado: 12 métricas canónicas reproducibles, AC-03 y AC-04 aprobados sobre
fixture congelado, tres entregas de evento producen una invalidación y el
recompute conserva cada run. Scheduler, API, carga objetivo, E2E y runtime
remoto siguen fuera de evidencia.

### PR-06 — Academy Health Score

Estado: **cerrada localmente** el 2026-10-06. Versiones, perfiles, snapshots,
dimensiones y contribuciones explicables aprobados; evidencia en
`docs/architecture/health-score-engine.md`.

- benchmark profiles, versiones y pesos;
- snapshots globales y por dimensión;
- normalización, redistribución explícita y `insufficient_data`;
- explicación por contribución y recomputación administrativa auditada.

Gate: AC-01, AC-02 y AC-13 del PRD sobre fixture congelado.

Resultado: AC-01 explica cinco contribuciones; AC-02 produce
`insufficient_data` al perder 45% de Enrollment; AC-13 conserva snapshots y
recalcula 83,28 con idéntica versión/entrada. El único perfil probado es
sintético; no existe benchmark español validado ni evidencia remota.

### PR-07 — Query layer y Owner Dashboard

Estado: **implementada localmente** el 2026-10-06. Contrato, autorización,
responsive y accesibilidad automatizada aprobados; evidencia y límites en
`docs/architecture/owner-dashboard-query-ui.md`.

- API/bundle de lectura con filtros de período, sede, programa y grupo;
- `/owner` responsive, mobile-first y accesible;
- score, prioridades, KPIs, tendencias, capacidad, retención y cobros;
- tablas equivalentes para gráficos, empty/error/stale/insufficient states.

Gate: 375/768/1280 px, teclado/VoiceOver, sin escaneo de eventos en request y
p95 medido contra volumen objetivo.

Resultado: 375/768/1280 sin overflow, navegación de teclado y Axe sin
infracciones, lectura exclusiva de read models, AC-08/AC-09 y build aprobados.
El p95 local sintético es 54,3 ms, pero AC-12 a volumen objetivo, VoiceOver
humano, programa/grupo, E2E autenticado y runtime remoto siguen `NO VERIFICADO`.

### PR-08 — Insights y acciones

Estado: **implementado localmente** el 2026-10-06. Modelo, ciclo de vida,
deduplicación, bandeja y acciones medibles aprobados; evidencia y límites en
`docs/architecture/insights-engine.md`.

- reglas P0, deduplicación, prioridad, snooze y resolución;
- acciones y outcome tracking;
- digest con política anti-fatiga.

Gate: mismo problema no duplica insight; toda acción enlaza métrica, regla,
actor y resultado.

Resultado: AC-07, triple entrega concurrente, anti-fatiga, cooldown, optimistic
locking, scope de sede, action/outcome y UI responsive/accesible aprobados sobre
datos sintéticos. Solo `excess_demand` tiene evaluador conectado; scheduler,
digest externo, E2E autenticado, carga, calibración real y runtime remoto siguen
`NO VERIFICADO`.

### PR-09 — Cutover prepiloto

Estado: **paquete local cerrado con decisión NO-GO** el 2026-10-06. Se eligió
arranque limpio, se retiraron las entradas owner sustituidas y se añadieron
threat model, evaluación RGPD inicial, observabilidad, backup/restore y gate de
frontera. Ver `docs/cutover/prepilot-go-no-go.md`.

- retirar rutas/módulos heredados sustituidos;
- decidir importación o arranque limpio;
- threat model, RGPD, observabilidad, backup/restore y runbooks;
- E2E autenticado completo en entorno autorizado.

Gate: GO/NO-GO explícito. Producción, Stripe Live, credenciales y despliegue
siguen fuera de alcance sin autorización adicional.

Resultado: el gate local pasa, pero el prepiloto con datos reales queda NO-GO
hasta verificar el bootstrap owner en un sandbox remoto, ejecutar E2E
autenticado, workers, carga, restore y completar la revisión RGPD. Ninguno de
esos límites se oculta como deuda menor.

## Reporte obligatorio por PR

Cada cambio informará por separado: implementación, migraciones, pruebas
locales, RLS/autorización, E2E autenticado, despliegue, runtime y dependencias
externas no verificadas. Un typecheck verde nunca equivale a listo para
producción.
