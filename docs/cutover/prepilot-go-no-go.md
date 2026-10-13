# Gate PR-09 — GO/NO-GO de prepiloto

## Revalidación vigente — 14 de octubre de 2026

Continúa **NO-GO para datos reales**. El propietario ya autorizó producción,
Stripe Live y trabajo remoto de forma progresiva; no falta autorización
general, faltan pruebas y controles específicos. La negativa a crear una rama
Supabase de pago se mantiene: no provisionar recursos facturables.

| Requisito | Estado y evidencia actual |
| --- | --- |
| Navegación Owner autenticada | CI `38481155607`, SHA `5708d130`, 33/33 PASS en tres navegadores, incluidos breakpoints; no demuestra alta desde cero. |
| Alta cuenta y academia vacía | NO VERIFICADO. El setup local provisiona usuario sintético por API y luego falla login en tres navegadores. Signup UI necesita prueba independiente. |
| Recorrido completo issue #227 | NO DEMO-READY; no hay walkthrough de seis pasos aprobado. CI global verde tolera el fallo experimental del setup. |
| Resumen de operaciones | SHA `aa23222d` integrado; 35 focales/tipos/lint PASS. Consultas PostgreSQL reales y runtime autenticado del resumen pendientes. |
| Analítica browser | Gate default-deny integrado; no UI de grant, no captura por defecto. No sustituye revisión integral RGPD/menores. |
| Cuota mensual | Mensual por gimnasta y tarifa confirmado; cobertura multiclase sin decidir. No emitir cuotas reales ambiguas. |
| Release | #225 sin aprobación independiente; #226 draft. Preview no prueba compatibilidad remota ni release productivo. |
| Backup y restore | Runbook existente; simulacro restaurable/reconciliación no verificados en este corte. |

Los apartados siguientes conservan el informe PR-09 original. Sus afirmaciones
de aprobación local y de falta de autorización son históricas, no evidencia
vigente ni autorización para eludir los controles de esta revalidación.

### Avance de QA posterior al corte publicado

Chromium local con parche CSP acotado (todavía en worktree QA) confirma login
UI con Auth real y ausencia de violación CSP. Bootstrap devuelve 429: sin Redis,
el rate limiter de producción deniega por diseño. Se autorizó un adaptador en
memoria únicamente para el runner local aislado, conservando límites y 429;
no un bypass ilimitado ni una degradación del entorno Vercel. Recorrido completo
y signup UI continúan sin demostrar. Este avance no cambia NO-GO.

## Decisión

**NO-GO para datos reales o tráfico de prepiloto.** El núcleo local está
implementado, pero faltan dependencias de seguridad y operación que no pueden
sustituirse por un build verde.

## Aprobado localmente

- esquema canónico desde cero, FKs tenant/sede, RLS/grants y auditoría;
- servicios transaccionales de enrollment, sesiones y asistencia;
- trials, waitlist, familia/pagador y fixture sintético;
- ledger reconciliable e inbox idempotente sandbox;
- métricas versionadas, Health Score explicable y snapshots inmutables;
- Owner Dashboard e Insights Engine con scope, idempotencia y acciones;
- responsive 375/768/1280, Axe A/AA, typecheck, lint, build y gates estáticos;
- rutas owner heredadas desviadas al centro canónico.

## Bloqueantes

| Bloqueante                              | Evidencia requerida para cerrar                                    |
| --------------------------------------- | ------------------------------------------------------------------ |
| bootstrap solo probado localmente       | signup/login/alta canónica con rollback y E2E remoto               |
| ninguna base remota canónica autorizada | proyecto sandbox aprobado, migración fresh y grants inspeccionados |
| sin E2E autenticado                     | owner/admin/manager, dos tenants y dos sedes en navegador          |
| sin workers/scheduler                   | outbox, recompute, reglas y reintentos observables                 |
| sin restore                             | simulacro firmado con RPO/RTO y reconciliación                     |
| RGPD incompleto                         | DPA/base jurídica/EIPD/retención/derechos aprobados                |
| carga objetivo no probada               | 5.000 atletas, 2 M asistencias y p95 definido en PRD               |
| filtros programa/grupo ausentes         | grano materializado y atribución financiera probada                |
| ocho reglas P0 sin evaluador            | fixtures, umbral, explicación y tests por regla                    |
| sin benchmark español validado          | fuente, vigencia, segmentación y aprobación de producto            |

## Orden para desbloquear

1. Autorizar sandbox remoto y aplicar instalación fresh.
2. Ejecutar signup/bootstrap, restore, E2E autenticado, carga y observabilidad.
3. Completar evaluación RGPD y reglas P0.
4. Repetir este gate; solo un informe nuevo puede cambiar NO-GO a GO.

Producción, Stripe Live, credenciales y despliegue no fueron tocados.
