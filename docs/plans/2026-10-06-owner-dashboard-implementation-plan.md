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
humano, comparación año-año, E2E autenticado y runtime remoto siguen
`NO VERIFICADO`.

Actualización: ADR-0010 define que filtros compartibles de programa/grupo
afectan aforo y cohortes, pero no alteran el score academia/sede porque aún no
hay contrato ni muestra válida de scoring para ese nivel. Selectores URL,
validación tenant/sede y filtros operativos pasan el harness local con grupos
sintéticos en sedes norte/sur. Comparación de período, opciones por entrenador/
sala y E2E autenticado siguen pendientes. ADR-0011 y el query layer muestran
delta contra el snapshot previo solo con mismo perfil, score válido y duración
comparable (±3 días); si no, explican por qué no hay delta. Selección de modo,
año anterior y validación con snapshots reales siguen pendientes.

### PR-08 — Insights y acciones

Estado: **implementado localmente** el 2026-10-06. Modelo, ciclo de vida,
deduplicación, bandeja y acciones medibles aprobados; evidencia y límites en
`docs/architecture/insights-engine.md`.

- reglas P0, deduplicación, prioridad, snooze y resolución;
- acciones y outcome tracking;
- digest con política anti-fatiga.
- simulación hipotética de `excess_demand`, con capacidad introducida por
  usuario, precio opcional introducido por usuario y escenarios de sensibilidad
  explícitamente no calibrados (ADR-0013); no crea entidades ni comunicaciones.
- drill-down desde clase del heatmap a Insights filtrados por entityId, scope de
  organización/sede y filtro/paginación preservados (ADR-0014).

Gate: mismo problema no duplica insight; toda acción enlaza métrica, regla,
actor y resultado.

Resultado inicial: AC-07, triple entrega concurrente, anti-fatiga, cooldown,
optimistic locking, scope de sede, action/outcome y UI responsive/accesible
aprobados sobre datos sintéticos. El evaluador original cubría solo
`excess_demand`; PR-11 añade conexión de las nueve reglas P0 activas. El
simulador permite comparar escenarios hipotéticos sin inferir precio; guardar
la simulación registra el snapshot agregado para seguimiento, no la creación
del grupo. El worker cierra
acciones vencidas como `not_measurable` si no existe evidencia humana y resuelve
el insight `actioned`; carrera humano/worker, audit actor y outbox pasan fixture
sintético (ADR-0012). Scheduler activo, digest externo, E2E autenticado, carga,
calibración real y runtime remoto siguen `NO VERIFICADO`.

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
hasta verificar bootstrap, E2E autenticado, workers, carga, restore y revisión
RGPD en una base aislada. La inspección no invasiva del proyecto existente
«Zaltyko E2E Sandbox» halló siete academias legacy en `public`; no se aplicaron
migraciones ni se leyeron filas, y no se reutilizará como base vacía.

### PR-10 — Auditoría de cobertura completa del PRD

Estado: **auditoría abierta**. `docs/audits/2026-10-06-prd-completion-audit.md`
contrasta AC-01…AC-15 y las rutas/paneles con evidencia actual. La nueva prueba
`test:zaltyko-canonical-stack:local` aplica desde cero las ocho migraciones
canónicas y ejecuta seis contratos SQL de fundación con fixtures sintéticos.
Esto prueba reconstrucción PostgreSQL, no Supabase Auth/PostgREST ni readiness
para piloto.

### PR-11 — Evaluadores P0 deterministas

Estado: **conexión local implementada** el 2026-10-06. `evaluateP0Insights`
autorizado por sede carga hechos scoped desde sesiones, enrollments, waitlist,
ledger, trials/followups, asignaciones de coach y data-quality runs; aplica
configuración activa versionada, llama los evaluadores de dominio y entrega cada
regla al ciclo idempotente de `runInsightEvaluation`. Evidencia financiera
agregada por moneda y sede; no incluye PII. La regla de conversión baja solo se
activa con meta interna configurada, nunca con benchmark supuesto. Retention risk
individual permanece en `draft`.

Verificación: el harness efímero aplica las migraciones locales y ejecuta la
integración con fixture sintético; las nueve reglas quedan ejecutadas. Typecheck,
ESLint y `scripts/run-zaltyko-insight-engine-local.sh` pasan. Esto valida SQL y
ciclo de persistencia local, pero no demuestra volumen objetivo, worker, frescura,
entrega de digest ni E2E autenticado.

Gate: cada regla activa tiene umbrales, explicación, evidencia sin PII,
deduplicación y resolución probadas. Pendiente reforzar pruebas de activación y
resolución por regla, calibración de escenarios con cohortes validadas, carga y
operación programada.

### PR-12 — Workers, SLA y notificaciones

Estado parcial: dispatcher local de outbox y endpoint POST autenticado con
`CRON_SECRET`, lease recuperable usando `status/available_at`, `SKIP LOCKED`,
idempotencia del consumidor, backoff y dead-letter tras intentos acotados.
Integración sintética valida claims concurrentes y recuperación de lease
caducado. El endpoint no se ha añadido a `vercel.json` ni desplegado.

ADR-0008 acepta un actor de sistema separado del actor humano. Contrato base
implementado para recompute, score y evaluación P0; valida organización/sede
activa y audita con `actor_user_id = null`, tipo/job/correlation. PostgreSQL
efímero pasa las rutas system, denegación de scope cruzado y P0 sin suplantación.
El endpoint existente crea el actor solo dentro de contexto async tras comprobar
`CRON_SECRET`; cron ausente o actor falsificado se deniega. El endpoint aún solo
despacha invalidaciones y no ejecuta la cascada completa.

ADR-0009 fija `organizations.default_currency` explícita al bootstrap (EUR
editable, sin inferir por país); cada movimiento preserva su moneda y no existe
conversión FX implícita. El worker solo debe puntuar con un perfil benchmark
único, activo y asignado explícitamente; nunca escoge un fixture sintético ni un
perfil global ambiguo. Si no existe, conserva métricas y deja score
pendiente/datos insuficientes con motivo. Schema/contrato/UI iniciales de
moneda añadidos localmente; administración de benchmark externo y pruebas con
organizaciones reales no forman parte del corte. No usar datos financieros
reales.

La cascada local ya conecta outbox→invalidación→recompute agregado más serie de
la sede afectada por `default_currency`→score del agregado solo con perfil
activo único y explícito→nueve reglas P0 por sede. El
motivo de score pendiente (benchmark ausente/ambiguo, divisa discordante o
versión faltante) se conserva en `audit_log`; no se escoge un perfil global o
fixture. Recompute reintenta runs fallidos y recupera `running` con más de cinco
minutos. El harness canonical fresco valida dispatcher+worker+reintento,
score omitido de forma segura, P0 y anti-suplantación.

El worker local ahora cierra outcomes vencidos como `not_measurable` dentro de
la transacción y lease existente; el endpoint manual bloquea la misma acción y
solo un resultado gana la carrera (ADR-0012). Harness sintético valida
idempotencia, actor original humano, audit system null y outbox.

Pendiente: digest/notificaciones, métricas/alertas de lag y política del
schedule. El SLA ≤15 min solo puede
afirmarse cuando exista frecuencia durable, lag medido y degradación `stale`
verificada; no registrar cron ni desplegar todavía.

Configuración owner/admin de metas internas añadida en
`/owner/health-score/setup`: cinco ratios requeridos, perfil versionado,
autorización tenant/sede, idempotencia, audit log y outbox
`benchmark.configured`. Se explicita que son metas de la academia, no cifras de
mercado. El harness sintético prueba reintento, conflicto al reutilizar clave,
denegación cross-tenant y activación de score; no hay valores prellenados para
academias reales ni carga de benchmark externo.

### PR-13 — APIs completas y filtros

Estado parcial: `GET /api/v1/health-scores/current` y
`GET /api/v1/health-scores/history` implementados con sesión verificada, scope
de organización/sede, filtros Zod, errores RFC 9457, no-store y cursor estable
con tie-breaker. Historial trae explicación, benchmark y dimensiones en bulk;
no devuelve personas. `GET /api/v1/metrics/:key` añade serie explicable desde
`metric_run_values` exitosos, denominador/numerador, calidad, fórmula,
diagnósticos y watermark, con filtro de fechas/moneda y cursor estable. Pruebas
locales cubren tres páginas, cursor corrupto, manager fuera de scope y sede sin
snapshots.

`GET /api/v1/capacity/heatmap` agrupa slots semanales por día/hora, pondera
ocupación por capacidad efectiva y devuelve clases autorizadas para drill-down;
acepta sede, programa y grupo con cursor. La prueba sintética cubre 2 celdas,
paginación y filtro de programa. `GET /api/v1/retention/cohorts` devuelve cohortes
mensuales agregadas, transferencias conservadas dentro del scope y matriz de
actividad sin IDs personales. Si hay pausas, omite la tasa porque está pendiente
definir la gracia de pausa; se documenta el criterio provisional de alta. Prueba
sintética pasa con IDs de atleta ausentes.

El endpoint no sustituye los paneles/UI. Pendiente: riesgos individuales (draft
hasta completar revisión RGPD y resolver permisos), benchmark externo validado y
definición de alta/gracia. Metas internas del score ya tienen pantalla/API
owner/admin y activan la cascada; no se presentan como benchmark externo.

### PR-14 — Dashboard funcional según PRD

Estado parcial: el dashboard integra en servidor el heatmap de capacidad y las
cohortes agregadas, reusando sesión y alcance de organización/sede. Un fallo de
un agregado no derriba el score; se registra y presenta como no disponible, y
los errores de autorización no se convierten en estados vacíos. La capacidad
muestra día/hora, ocupación efectiva y plazas por clase; aforo cero se presenta
como configuración pendiente, no como 0/0. La retención indica criterio
provisional de cohorte y omite la tasa si hubo pausa. El preview usa fixture
solo sintético, incluyendo ambos casos límite.

Verificación de UI: preview observada con navegador local a 375/768/1280 px;
`documentElement.scrollWidth` coincide con viewport en los tres anchos. No se
usó identidad autenticada ni datos remotos. Typecheck, ESLint focalizado y
`next build` pasan; el build final de filtros/comparador terminó el 2026-10-06.
Sigue pendiente probar filtros/paginación de extremos en UI,
axe/teclado/lector de pantalla y E2E autenticado.

Actualización: filtros URL de período/sede/programa/grupo; programa/grupo filtran
solo operación, explícitamente no el score (ADR-0010). El score tiene delta
contra snapshot previo con perfil y duración comparables (ADR-0011). Harness
prueba tenant/sede y datos insuficientes; browser preview 375/1280 sin overflow
ni errores de consola. Build completo posterior a filtros/comparador pasó el
2026-10-06.

Pendiente: elección de modo de comparación/año anterior, lectura de histórico y
series en todos los paneles, enlace a acciones operativas y oportunidades
P0→outcomes; tablas equivalentes más completas y WCAG 2.2 AA. Esta vista todavía
no demuestra el drill-down completo del PRD.

### PR-15 — Sandbox aislado y pruebas operativas

Pendiente: Supabase Auth/PostgREST y grants en proyecto/branch aislado; E2E de
dos organizaciones y sedes con owner/admin/manager; restore; carga 5.000/2 M con
20 usuarios. El sandbox existente no es limpio.

### PR-16 — Decisiones de piloto y revisión privacidad

Pendiente: cerrar preguntas PRD §30 con producto; completar bases legales,
retención, derechos y EIPD antes de datos reales. No activar riesgo individual
ni comunicaciones automatizadas hasta completar sus condiciones.

## Reporte obligatorio por PR

Cada cambio informará por separado: implementación, migraciones, pruebas
locales, RLS/autorización, E2E autenticado, despliegue, runtime y dependencias
externas no verificadas. Un typecheck verde nunca equivale a listo para
producción.
