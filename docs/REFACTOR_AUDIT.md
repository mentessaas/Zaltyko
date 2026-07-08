# Auditoria tecnica de refactor - Zaltyko

Fecha: 2026-07-07  
Alcance: inspeccion estatica, lectura de configuracion, rutas criticas y script interno `pnpm audit:api-routes`. No se modifico codigo de aplicacion antes de generar este documento.

## Resumen del stack detectado

- Framework: Next.js 15.5.19 con App Router.
- Runtime UI: React 18.3.1.
- Package manager: pnpm 9.15.3, lockfile `pnpm-lock.yaml`.
- Backend: Next.js API Routes bajo `src/app/api`.
- Database: Supabase PostgreSQL con RLS; acceso de servidor mediante Drizzle ORM.
- ORM: Drizzle ORM 0.45.2, `drizzle-kit` 0.31.6.
- Auth: NextAuth.js v5 beta y Supabase Auth; wrappers principales `withTenant`, `withSuperAdmin` y rutas bearer.
- Styling: Tailwind CSS 3.4 + shadcn/ui.
- Payments: Stripe para suscripcion SaaS y tabla `charges` para control interno de cuotas/pagos.
- QA: Vitest, Playwright, axe; scripts `lint`, `typecheck`, `test`, `build`, `test:e2e`, `test:a11y`.
- Observabilidad: Sentry, Vercel Analytics/Speed Insights, logger propio.

## Mapa de carpetas principales

| Carpeta | Uso actual | Observaciones |
| --- | --- | --- |
| `src/app/app/[academyId]` | Dashboard multi-tenant por academia | Superficie critica de demo y operacion diaria. |
| `src/app/(super-admin)/super-admin` | Panel global de super admin | Contiene componentes grandes y metricas con estimaciones. |
| `src/app/dashboard` | Rutas legacy de dashboard | Conviven con `/app/[academyId]`; aumenta riesgo de divergencia. |
| `src/app/api` | API Routes | 265 rutas auditadas por script interno; 194 tenant, 10 super-admin, 35 bearer. |
| `src/components` | UI modular por dominio | Hay componentes muy grandes aun mezclando UI y flujo. |
| `src/lib` | Servicios, auth, dashboard, dominio y utilidades | Buenas bases, pero algunos servicios siguen siendo monoliticos. |
| `src/db/schema` | Esquema Drizzle | 70+ tablas separadas por dominio. |
| `src/types` | Tipos compartidos | Existe centralizacion parcial; aun hay tipos duplicados en componentes. |
| `src/hooks` | Hooks de UI/data fetching | Hooks utiles, pero algunos duplican responsabilidades de servicios. |
| `tests` | Unit, integration y e2e | Cobertura amplia en APIs y helpers; e2e depende de entorno Supabase. |
| `docs` | Documentacion tecnica y producto | Mucha documentacion historica; falta hilo actual de refactor vendible. |
| `vault` | KB operativa Obsidian | Debe actualizarse al cerrar cambios relevantes. |

## Riesgos tecnicos encontrados

| Prioridad | Riesgo | Evidencia | Impacto | Recomendacion |
| --- | --- | --- | --- | --- |
| Alta | Datos estimados o placeholder en super admin | `src/lib/superAdminService.ts` calcula `previousRevenue` con `* 0.85`; `src/app/(super-admin)/super-admin/components/SuperAdminDashboard.tsx` tiene fallback de meses 2025 y tendencias fijas para owners/coaches/charges. | Demo puede mostrar datos inventados como reales. | Etiquetar explicitamente como estimacion/demo o reemplazar por calculo real/estado vacio. |
| Alta | Copy y configuracion con framing fiscal | `src/app/app/[academyId]/settings/page.tsx` muestra "Informacion fiscal", `taxId`, `invoicePrefix`; billing habla de "facturas". | Riesgo de posicionar Zaltyko como software fiscal, contrario a estrategia. | Renombrar superficies internas a "recibos/justificantes internos" cuando aplique; no tocar Stripe invoice tecnico si es suscripcion SaaS. |
| Alta | Artefacto `.js` dentro de App Router | `src/app/app/[academyId]/my-dashboard/page.js` convive con `page.tsx`. | Next puede detectar rutas duplicadas o servir codigo generado/desactualizado. | Confirmar origen y eliminar/ignorar de forma controlada tras validar build. |
| Alta | Endpoints bearer/family fuera del wrapper estandar | `src/app/api/family/children/route.ts`, `src/app/api/me/*`, soporte y marketplace usan auth manual/NextResponse. | Mas superficie para divergencia de permisos/respuestas. | Normalizar gradualmente sin romper casos de padre/familia. |
| Alta | `isFlexibleTenantEndpoint` depende de validacion manual | `src/lib/authz/endpoint-config.ts` permite `/api/dashboard`, `/api/groups`, `/api/athletes`, `/api/events`. | Si un handler olvida validar `academyId`/tenant, puede haber fuga multi-tenant. | Mantener lista minima y auditar handlers flexibles con tests de acceso cruzado. |
| Media | Componentes y servicios muy grandes | `SuperAdminDashboard.tsx` 1017 lineas, `src/lib/dashboard.ts` 853, settings 742, `CreateAthleteDialog.tsx` 606, `BillingPanel.tsx` 577. | Coste alto de mantenimiento y regresiones en cambios pequenos. | Dividir por flujo/estado y mantener facades publicas estables. |
| Media | Tipos duplicados por modulo | Interfaces `AthleteOption`, `CoachOption`, `GroupOption`, `ChargeItem`, `AttendanceStatus` repetidas en componentes. | Cambios de contrato requieren ediciones multiples. | Consolidar tipos de demo/operacion en `src/types` o modelos de componente cuando son locales. |
| Media | Respuestas API no totalmente estandarizadas | `pnpm audit:api-routes` muestra rutas con `standardizedResponse: false`: publicas, soporte, tooltips, videos, exports, algunos `/me`. | Clientes deben manejar formas distintas. | Priorizar rutas de demo autenticadas y familia; publicas pueden quedarse si estan documentadas. |
| Media | Data fetching client-side adicional en dashboard | `DashboardPage.tsx` hace fetch de grupos/clases para resumen tecnico aunque ya hay `initialData`. | Potenciales waterfalls y estados parciales en demo. | Mover datos al server o marcar widgets como progresivos con estados empty/error claros. |
| Media | Rutas legacy duplican producto | `src/app/dashboard/*` y `src/app/app/[academyId]/*`. | Confusion de QA, permisos y demo. | Definir rutas canonicas y mantener redirects/compatibilidad hasta retirar legacy. |
| Baja | Documentacion historica muy extensa | `docs/` contiene planes/auditorias pasadas con referencias a fiscalidad/facturacion genericas. | Ruido para onboarding de devs y venta. | Crear documentos actuales de refactor y demo; no borrar historico sin decision. |

## Duplicidades detectadas

- Dashboard de academia: rutas canonicas en `src/app/app/[academyId]` y legacy en `src/app/dashboard`.
- Tipos de entidades repetidos en componentes (`AthleteOption`, `CoachOption`, `GroupOption`, `ChargeItem`, `AttendanceRecord`).
- `DashboardData` existe en `src/lib/dashboard.ts` y tipos relacionados en `src/lib/dashboard/types.ts`; revisar si ambos siguen necesarios.
- Logica de fechas/reportes aparece en varios componentes de reportes con `new Date()` y rangos por defecto.
- Naming de billing mezcla suscripcion SaaS (`Stripe invoices`) con pagos internos (`charges`, cuotas), lo que crea ambiguedad de producto.

## Componentes demasiado grandes

| Archivo | Lineas aprox. | Riesgo |
| --- | ---: | --- |
| `src/app/(super-admin)/super-admin/components/SuperAdminDashboard.tsx` | 1017 | Mezcla charts, cards, drill-down, comparacion, actividad y metricas. |
| `src/app/(super-admin)/super-admin/components/SuperAdminUserDetail.tsx` | 986 | Detalle y acciones de usuario super admin muy acopladas. |
| `src/lib/dashboard.ts` | 853 | Query/data shaping de dashboard monolitico. |
| `src/app/api/academies/[academyId]/settings/route.ts` | 834 | Handler muy grande para settings. |
| `src/app/app/[academyId]/settings/page.tsx` | 742 | UI de settings con secciones heterogeneas y copy fiscal. |
| `src/components/athletes/CreateAthleteDialog.tsx` | 606 | Formulario con UI, validacion y flujo. |
| `src/components/groups/CreateGroupDialog.tsx` | 599 | Formulario complejo y asignaciones. |
| `src/components/billing/BillingPanel.tsx` | 577 | Mezcla plan SaaS y cuotas/pagos internos. |

## Logica mezclada

- `DashboardPage.tsx` combina UI, fetch client-side de resumen tecnico, checklist, recomendaciones, navegacion y derivaciones de copy.
- `SuperAdminDashboard.tsx` mezcla render, transformacion de metricas, datos fallback y estados de drill-down.
- `settings/page.tsx` mezcla integraciones, branding/terminologia, Stripe y datos de cobro en un unico componente.
- Formularios de atletas/grupos/clases contienen transformaciones de dominio que deberian vivir en modelos/helpers ya iniciados en algunos modulos.

## Problemas de naming

- "Facturacion", "facturas", "Informacion fiscal", `taxId`, `invoicePrefix` pueden sugerir fiscalidad oficial. Mantener Stripe invoice para suscripcion SaaS si es tecnico, pero no venderlo como facturacion fiscal.
- `StudentChargesTab` usa "Student" mientras producto usa atletas/gimnastas; conviene alinear lenguaje visible segun disciplina.
- Variables como `mockTrends` persisten aunque parte de los datos ya son reales; aumenta confusion.

## Problemas de roles/permisos

- El core usa `withTenant`, `withSuperAdmin`, `verifyAcademyAccessForProfile`, `verify*Access`; patron correcto.
- Rutas `/api/me/*` y `/api/family/children` usan autenticacion manual por token/email y no el helper de respuesta estandar. Deben considerarse superficie sensible para padre/familia.
- `verifyAcademyAccessForProfile` permite a coaches con membership acceder a la academia; los handlers deben filtrar despues por grupos/clases asignadas cuando el caso de uso lo requiera.
- Endpoints flexibles deben validar `academyId` de forma explicita porque `withTenant` lo permite por diseno para algunos modulos.

## Problemas de queries/data fetching

- `getGlobalStats` carga listas completas de academias, perfiles, planes, subscriptions, invoices, athletes, groups, charges y events en memoria. Puede servir en early stage, pero no escala bien para super admin.
- `getDashboardData` es monolitico; se ejecuta en server, pero su tamano dificulta tests dirigidos.
- `DashboardPage` hace fetch client-side adicional para clases/grupos, duplicando informacion de server y creando waterfalls potenciales.
- Algunos endpoints de listados hacen joins y conteos en handlers en vez de repositorios/servicios reutilizables.

## Posibles hydration mismatches

- Super admin ya evita `Math.random`, pero usa `new Date()` en cliente (`currentMonth`) y `toLocaleDateString`. Si SSR/cliente difieren por zona horaria o cambio de dia, puede haber diferencias visuales leves.
- Dashboard usa `getTodayInCountryTimezone` en cliente para copy de bienvenida; revisar con snapshot si hay mismatch en medianoche.
- Reportes y paginas cliente inicializan rangos con `new Date()`; riesgo bajo si son client-only, mayor si se renderizan en server.

## Hardcoded data sospechosa

- Fallback de `monthlyAcademies` en `SuperAdminDashboard.tsx` con meses 2025 y valores 6-15.
- Tendencias fijas para owners/coaches/charges en `mockTrends`.
- `previousRevenue` estimado con 15% de crecimiento en `getGlobalStats`.
- Alertas de suscripcion muestran nombres genericos `"Academia"` / `"En prueba"` en vez de academias reales.
- Public marketplace/empleo usa demo data solo fuera de production; aceptable si sigue marcado como demo.

## Flujos criticos rotos o fragiles

- Posible conflicto `page.js` + `page.tsx` en `my-dashboard`.
- Super admin puede mostrar estimaciones como reales, afectando confianza comercial.
- Settings/billing puede llevar a una conversacion fiscal no deseada.
- Familia/padre tiene endpoints y pantallas parciales; requiere pruebas de aislamiento por email/guardian antes de demo.
- Coach dashboard debe confirmar que no ve datos de otras academias ni atletas no asignados; hay permisos de academia, pero la restriccion por asignacion debe validarse por flujo.

## Prioridad de refactorizacion

### Alta

1. Eliminar/etiquetar datos estimados o mock en super admin.
2. Corregir copy fiscal/facturas en superficies internas para dejar claro "pagos/cuotas/recibos internos".
3. Resolver artefacto `page.js` si build o Next lo considera ruta duplicada.
4. Auditar flujos familia/coach por aislamiento de datos.
5. Mantener `withTenant` y validar handlers flexibles por academia.

### Media

1. Dividir `SuperAdminDashboard`, `settings/page.tsx`, `BillingPanel` y formularios grandes en piezas ya modeladas.
2. Mover data fetching progresivo del dashboard a servicios/server cuando sea viable.
3. Centralizar tipos repetidos de opciones y estados.
4. Normalizar respuestas de rutas bearer/family/soporte usadas por la demo.

### Baja

1. Limpieza de documentacion historica.
2. Renombrados internos sin impacto visible.
3. Micro-optimizaciones de componentes ya estables.

