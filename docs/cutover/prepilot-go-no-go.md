# Gate PR-09 — GO/NO-GO de prepiloto

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
