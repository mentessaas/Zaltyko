# Gate PR-09 — GO/NO-GO de prepiloto

## Revalidación vigente — 14 de octubre de 2026

Continúa **NO-GO para datos reales**. El propietario ya autorizó producción,
Stripe Live y trabajo remoto de forma progresiva; no falta autorización
general, faltan pruebas y controles específicos. La negativa a crear una rama
Supabase de pago se mantiene: no provisionar recursos facturables.

| Requisito | Estado y evidencia actual |
| --- | --- |
| Navegación Owner autenticada | CI `38481155607`, SHA `5708d130`, 33/33 PASS en tres navegadores, incluidos breakpoints; no demuestra alta desde cero. |
| Alta cuenta y academia vacía | Signup UI real local confirma Auth, pero POST del perfil legacy devuelve 500. Stack canónico no crea public.profiles; SQLSTATE exacto no capturado. ADR-0027 elimina esa dependencia. Alta completa pendiente. |
| Recorrido completo issue #227 | NO DEMO-READY; no hay walkthrough de seis pasos aprobado. CI global verde tolera el fallo experimental del setup. |
| Resumen de operaciones | Servicio validado con PostgreSQL efímero real: M:N, otro tenant, fechas/DST, bruto por moneda y manager sin SELECT financiero. Tablas mínimas sintéticas, no esquema completo/RLS remoto. Walkthrough autenticado del resumen pendiente. |
| Aceptación contractual | Gate previo integrado en dec076e1: 43 tests + 3 guard harness, grant concurrente único y rollback audit reales PASS. Ese store sigue vinculado a perfil legacy; sustitución canónica ADR-0027 en curso, sin importación de declaraciones históricas. |
| Analítica browser | Gate default-deny integrado; no UI de grant, no captura por defecto. No sustituye revisión integral RGPD/menores. |
| Cuota mensual | Mensual por gimnasta y tarifa confirmado; cobertura multiclase sin decidir. No emitir cuotas reales ambiguas. |
| Release | #225 sin aprobación independiente; #226 draft. Preview no prueba compatibilidad remota ni release productivo. |
| Backup y restore | Runbook existente; simulacro restaurable/reconciliación no verificados en este corte. |

Los apartados siguientes conservan el informe PR-09 original. Sus afirmaciones
de aprobación local y de falta de autorización son históricas, no evidencia
vigente ni autorización para eludir los controles de esta revalidación.

### Avance de QA posterior al corte publicado

CSP loopback y rate limiter acotados ya integrados: el runner conserva límites
y 429, y las excepciones están vetadas en Vercel. Login y operaciones hasta
activar inscripción se observaron en Chromium/Firefox con identidad sintética
provisionada: no equivalen a signup real. La siguiente prueba sí empieza en
registro público y confirma Auth, pero falla preparación del perfil legacy.
QA corrige además SQL y período del panel; el gate canónico nuevo y el recorrido
completo siguen pendientes. Este avance no cambia NO-GO.

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
