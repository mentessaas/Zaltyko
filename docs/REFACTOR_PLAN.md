# Plan tecnico de refactor progresivo - Zaltyko

Fecha: 2026-07-07  
Principio rector: no big rewrite. Solo cambios quirurgicos que mejoren demo, venta, estabilidad, permisos o mantenimiento verificable.

## Prioridad Alta

| Tarea | Objetivo | Archivos afectados | Riesgo | Beneficio | Criterio de aceptacion | Como probarlo |
| --- | --- | --- | --- | --- | --- | --- |
| A1. Excluir worktrees del runner Playwright | Recuperar validacion e2e local sin cargar dependencias duplicadas. | `playwright.config.ts` | Bajo; solo afecta descubrimiento de tests. | Permite smoke autenticado y a11y sin fallos de bootstrap. | `pnpm exec playwright test tests/e2e-zaltyko-audit-smoke.spec.ts` no falla por `@playwright/test` duplicado. | Ejecutar smoke con `BASE_URL`, `E2E_ACADEMY_ID`, `E2E_STORAGE_STATE`. |
| A2. Eliminar ambiguedad fiscal visible | Evitar que Zaltyko parezca software fiscal. | `src/app/app/[academyId]/settings/page.tsx`, `src/app/app/[academyId]/billing/page.tsx`, `src/lib/navigation/registry.ts`, componentes de billing si procede. | Medio; puede afectar tests/copy. | Alinea producto a cuotas/pagos internos, mejora venta. | No aparecen "Informacion fiscal" ni "facturas" como promesa operativa interna; Stripe invoice tecnico queda solo donde sea SaaS billing. | `rg -n "Información fiscal|facturacion|facturas|invoicePrefix" src/app/app src/components/billing src/lib/navigation`. |
| A3. Marcar o retirar metricas estimadas del super admin | Evitar dashboards engañosos. | `src/lib/superAdminService.ts`, `src/app/(super-admin)/super-admin/components/SuperAdminDashboard.tsx` | Medio; dashboard grande. | Demo mas confiable. | Tendencias/fallbacks quedan etiquetados como estimados/demo o se sustituyen por cero/empty state. | Unit/typecheck + inspeccion de super admin; `rg -n "mockTrends|0.85|2025-03|Academia\\\""`. |
| A4. Resolver `page.js` duplicado en App Router | Evitar conflicto de ruta/desfase en `my-dashboard`. | `src/app/app/[academyId]/my-dashboard/page.js` | Medio si era usado accidentalmente; debe validarse build. | Reduce riesgo de build/runtime y confusion. | Solo queda `page.tsx` para esa ruta o se documenta razon por la que no se toca. | `find src/app -name 'page.js'`, `pnpm build`. |
| A5. Endurecer permisos de asistencia para coach | Evitar que un coach registre asistencia de sesiones no asignadas. | `src/app/api/attendance/route.ts`, posible helper en `src/lib/permissions.ts`, tests. | Medio; API critica. | Aislamiento por rol mas claro. | Owner/admin/super_admin pueden registrar; coach solo clase/sesion asignada; otros roles no. | Vitest especifico o tests API existentes actualizados. |
| A6. Endurecer parent/athlete data scoping | Evitar acceso a datos de otro atleta via query o relacion incompleta. | `src/app/app/[academyId]/my-dashboard/page.tsx`, `src/app/api/family/children/route.ts` | Medio-alto; superficie sensible. | Seguridad para futuro panel familia. | Todas las queries se filtran por academia/tenant y atleta permitido. | Tests de parent con `athleteId` propio/ajeno; typecheck. |

## Prioridad Media

| Tarea | Objetivo | Archivos afectados | Riesgo | Beneficio | Criterio de aceptacion | Como probarlo |
| --- | --- | --- | --- | --- | --- | --- |
| M1. Dividir SuperAdminDashboard | Separar cards, charts, activity y dialogs. | `src/app/(super-admin)/super-admin/components/SuperAdminDashboard.tsx`, nuevos componentes locales. | Medio por tamano actual. | Reduce regresiones y facilita corregir metricas. | Componente principal baja de tamano y mantiene props. | Lint/typecheck + smoke super admin. |
| M2. Dividir settings por secciones | Separar integraciones, branding, terminologia, pagos internos. | `src/app/app/[academyId]/settings/page.tsx`, `src/components/settings/*`. | Medio. | Cambios de copy/config menos riesgosos. | Secciones extraidas sin cambiar API. | Typecheck + ruta settings. |
| M3. Centralizar tipos de opciones recurrentes | Reducir duplicidad de `AthleteOption`, `CoachOption`, `GroupOption`, `ChargeItem`. | `src/types`, componentes atletas/clases/grupos/billing. | Bajo-medio. | Menos deuda en formularios. | Tipos compartidos usados en 2+ modulos reales. | `pnpm typecheck`. |
| M4. Mover resumen tecnico del dashboard al server | Reducir waterfalls client-side. | `src/lib/dashboard.ts`, `DashboardPage.tsx`, `DashboardSections.tsx`. | Medio. | Dashboard mas estable en demo. | Datos tecnicos llegan con `initialData` o widget muestra estado progresivo claro. | Smoke dashboard, revisar red client-side. |
| M5. Normalizar respuestas de rutas familia/soporte usadas en demo | Reducir contratos divergentes. | `src/app/api/family/children/route.ts`, soporte si entra en demo. | Medio. | Clientes mas faciles de mantener. | Respuestas usan `apiSuccess/apiError` sin perder formato necesario. | Unit/API tests. |

## Prioridad Baja

| Tarea | Objetivo | Archivos afectados | Riesgo | Beneficio | Criterio de aceptacion | Como probarlo |
| --- | --- | --- | --- | --- | --- | --- |
| B1. Limpieza de docs historicos | Reducir ruido para onboarding. | `docs/*` legacy | Alto si se borra historia sin decision. | Navegacion documental mas clara. | Solo archivar/indice, sin borrar informacion critica. | Revision manual. |
| B2. Renombrados internos no visibles | Alinear naming tecnico. | Componentes puntuales | Bajo. | Legibilidad. | Sin cambios de UI/contratos. | Typecheck. |
| B3. Micro-optimizaciones de render | Ajustar memorias/imports menores. | Componentes pequenos | Bajo. | Performance marginal. | Solo si hay evidencia de coste. | Profiling o bundle check. |

## Plan de ejecucion inmediato

1. Ejecutar A1 para desbloquear QA.
2. Validar smoke Playwright autenticado. Si falla por datos/sesion, documentar y no seguir cambiando flujos dependientes.
3. Ejecutar A2 y A3 porque afectan venta/demo y no requieren migraciones.
4. Evaluar A4 con `pnpm build`; si el build falla por duplicidad, eliminar artefacto; si no, documentar como deuda y evitar tocar sin confirmacion de origen.
5. Ejecutar validacion: `pnpm lint`, `pnpm typecheck`, tests focales y `pnpm build`.
6. Solo entrar en A5/A6 si hay margen para tests razonables; si no, dejarlas como siguientes 7 dias.

## Ejecucion 2026-07-07 - segunda tanda

| Tarea | Estado | Evidencia | Pendiente |
| --- | --- | --- | --- |
| A4. Resolver `page.js` duplicado en App Router | Resuelto | `src/app/app/[academyId]/my-dashboard/page.js` eliminado; `pnpm build` pasa con 201 paginas. | Ninguno salvo vigilar que no se regenere como artefacto manual. |
| A5. Endurecer permisos de asistencia para coach | Resuelto en API critica | `verifyCoachClassScope()` y `verifyAttendanceWriteAccess()` aplicados en `/api/attendance`; tests focales pasan. | E2E real con storage state coach valido. |
| A6. Endurecer parent/athlete data scoping | Parcial seguro | `/api/family/children` usa `getFamilyChildrenForUser()` con rol familiar, tenant y relaciones permitidas; tests focales pasan. | Extender revision a endpoints bearer/family restantes y QA con usuario parent real. |
| E2E por rol | Preparado, bloqueado por credenciales | `tests/e2e-role-smoke.spec.ts` creado; ejecuta y salta sin storage states. Supabase Auth devuelve `Invalid login credentials` con las credenciales actuales. | Regenerar credenciales demo y storage states para super_admin, owner y coach. |
| Dataset demo Espana | Resuelto para dev-session | `/api/dev/session` siembra academia, gimnastas, grupo, clase, entrenadores, asistencia, cobros internos y progreso; rutas owner clave responden 200. | Elevar a seed permanente o fixture controlado si se usara en CI. |

## Fuera de alcance explicito

- No agregar VeriFactu, AEAT, firma fiscal, modelos tributarios ni contabilidad avanzada.
- No migraciones de DB sin changelog Supabase y revision manual SQL.
- No reescritura de dashboards ni redisenos amplios.
- No activar integraciones externas ni enviar mensajes reales.
