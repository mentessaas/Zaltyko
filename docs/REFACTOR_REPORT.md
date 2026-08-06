# Reporte final de refactor - Zaltyko

Fecha: 2026-07-07  
Alcance ejecutado: inspeccion, auditoria tecnica, auditoria funcional, plan, refactor de prioridad alta, hardening de roles criticos, validacion y documentacion final.

## 1. Resumen ejecutivo

Se mejoro la confiabilidad comercial y tecnica de Zaltyko sin reescritura. El foco fue evitar metricas falsas en super admin, retirar ambiguedad fiscal visible, desbloquear Playwright para que no cargue worktrees locales y estabilizar tests con mocks de logger completos.

Esto importa para negocio porque una demo de SaaS pierde confianza si muestra crecimiento, ingresos o comparativas inventadas. Tambien evita posicionar Zaltyko como software fiscal: el producto queda orientado a gestion interna de academia, cuotas, cobros, asistencia, progreso y comunicacion.

Impacto: build productivo pasa, typecheck pasa, lint pasa, Vitest completo pasa. La demo renderiza las rutas owner clave con dataset dev-session estable. El e2e autenticado real sigue bloqueado hasta actualizar credenciales demo, porque Supabase Auth devuelve `Invalid login credentials` para las variables `E2E_AUTH_*` actuales.

## 2. Archivos modificados

| Archivo | Explicacion |
| --- | --- |
| `playwright.config.ts` | Excluye `.claude/**`, `.worktrees/**` y `node_modules/**` del descubrimiento de tests. |
| `src/lib/superAdminService.ts` | Sustituye revenue previo estimado por calculo basado en fechas reales y elimina nombres genericos de academias en alertas. |
| `src/app/(super-admin)/super-admin/components/SuperAdminDashboard.tsx` | Elimina fallback hardcodeado 2025, tendencias fabricadas, grafico de ingresos proyectado y comparativa falsa de academias. |
| `src/lib/navigation/registry.ts` | Renombra navegacion visible de billing a Cobros. |
| `src/app/app/[academyId]/billing/page.tsx` | Reposiciona la pantalla como planes/cobros/recibos, no facturacion fiscal. |
| `src/app/app/[academyId]/settings/page.tsx` | Cambia copy fiscal por datos para recibos internos. |
| `src/components/billing/BillingPanel.tsx` | Cambia textos de facturacion/facturas a planes, cobros y recibos de suscripcion. |
| `src/components/billing/InvoiceList.tsx` | Cambia historial y acciones visibles a recibos. |
| `src/components/billing/InvoiceHistory.tsx` | Cambia descarga/copy visible de factura a recibo. |
| `src/components/billing/UpgradeModal.tsx` | Cambia "ciclo de facturacion" por "ciclo de suscripcion". |
| `src/app/(site)/modules/pagos-administracion/page.tsx`, `src/app/(site)/FeaturesSection.tsx`, `src/app/(site)/home/ModulesSection.tsx`, `src/app/(site)/faq/page.tsx`, `src/app/integrations/page.tsx`, `src/app/about/page.tsx`, `src/app/tos/page.tsx`, `src/app/privacy-policy/page.tsx` | Barrido de copy publico para hablar de cobros, cuotas, recibos internos y suscripcion, eliminando promesas fiscales. |
| `src/i18n/es.json`, `src/lib/help/articles.ts`, `src/hooks/use-keyboard-shortcuts.tsx`, `src/lib/quick-actions.ts` | Alinea labels traducidos, ayuda y accesos rapidos hacia Cobros/Recibos. |
| `src/components/analytics/AnalyticsWidgets.tsx`, `src/components/notifications/*`, `src/components/support/*`, `src/components/contact/ContactForm.tsx`, `src/components/announcements/AnnouncementForm.tsx`, `src/components/onboarding/UpgradeConfirmationModal.tsx`, `src/components/profiles/OptimizedOwnerProfile.tsx`, `src/app/dashboard/account-form.tsx` | Limpia copy visible de facturacion/facturas en widgets, soporte, onboarding y perfiles. |
| `src/lib/stripe/notification-service.ts`, `src/lib/stripe/client.ts`, `src/lib/email/templates/welcome-email.tsx`, `src/lib/mcp/tools/academy-tools.ts`, `src/app/api/billing/*` | Cambia mensajes visibles/API de factura/facturacion a recibo/cobros/suscripcion, manteniendo nombres tecnicos Stripe donde corresponde. |
| `src/app/app/[academyId]/my-dashboard/MyDashboardPage.tsx` | Cambia copy familiar hacia cuotas/estados de pago. |
| `src/app/app/[academyId]/notifications/page.tsx` | Cambia notificaciones de factura a recibo. |
| `src/app/app/[academyId]/announcements/page.tsx` y `[id]/page.tsx` | Cambia categoria visible de billing a Cobros. |
| `src/app/app/[academyId]/reports/page.tsx` | Cambia descripcion a recibos internos. |
| `tests/api-academy-settings-sport-config.test.ts` | Mock de logger completo para `handleApiError`. |
| `tests/api-stripe-webhook.test.ts` | Mock de logger completo con `apiError`. |
| `tests/api-webhooks-complete.test.ts` | Mock de logger completo con `apiError`. |
| `docs/REFACTOR_AUDIT.md` | Auditoria tecnica inicial. |
| `docs/FUNCTIONAL_AUDIT.md` | Auditoria funcional por rol. |
| `docs/REFACTOR_PLAN.md` | Plan priorizado. |
| `docs/QA_CHECKLIST.md` | Checklist QA manual por rol. |
| `docs/DEMO_READY_CHECKLIST.md` | Checklist de demo vendible. |
| `docs/REFACTOR_REPORT.md` | Este reporte final. |
| `src/lib/permissions.ts` | Agrega guards reutilizables para que coach solo opere clases/atletas asignados. |
| `src/lib/attendance/service.ts` | Centraliza autorizacion de escritura de asistencia. |
| `src/lib/progress/service.ts` | Centraliza autorizacion de progreso/evaluaciones. |
| `src/lib/family/scope-service.ts` | Centraliza scoping familiar por usuario, tenant y atleta permitido. |
| `src/app/api/attendance/route.ts` | Aplica guard de clase asignada antes de registrar asistencia. |
| `src/app/api/assessments/route.ts` y `src/app/api/assessments/[athleteId]/route.ts` | Aplica guard de progreso por atleta/clase asignada. |
| `src/app/api/family/children/route.ts` | Usa servicio familiar scopeado y evita devolver hijos fuera del tenant permitido. |
| `src/app/api/dev/session/route.ts` | Prepara dataset demo Espana con academia, gimnastas, grupo, clase, entrenadores, asistencia, cobros internos y progreso. |
| `src/lib/dashboard.ts` | Evita exponer detalle SQL/`Failed query` en HTML dev cuando fallan metricas opcionales. |
| `src/app/app/[academyId]/my-dashboard/page.js` | Eliminado tras confirmar que `page.tsx` cubre la ruta y `pnpm build` pasa. |
| `tests/e2e-role-smoke.spec.ts` | Smoke E2E minimo por rol, condicionado a storage states por rol. |
| `tests/lib/family-scope-service.test.ts`, `tests/lib/attendance-service.test.ts`, `tests/lib/progress-service.test.ts` | Tests focales para scoping familiar y delegacion de permisos. |

## 3. Cambios tecnicos

### UI

- Se retiraron graficos y comparativas que no tenian fuente real.
- Se mantuvieron estados vacios explicitos para ingresos mensuales y comparacion de academias.
- Se ajusto copy de cobros/recibos para evitar promesas fiscales.

### Business logic

- Super admin deja de calcular crecimiento/revenue previo con multiplicadores.
- Tendencias visibles quedan limitadas a datos con base real.
- Cuotas/cobros internos se mantienen separados de fiscalidad.

### Data layer

- `getGlobalStats()` selecciona `createdAt` de perfiles e invoices para calculos reales.
- No hubo migraciones ni cambios de schema.

### Roles/permisos

- Coach queda bloqueado en API si intenta registrar asistencia o progreso fuera de sus clases/atletas asignados.
- El endpoint familiar de hijos usa scoping por rol familiar, tenant y relaciones de tutor/atleta.
- No se debilito auth ni RLS.

### Tipos

- Se introdujeron tipos acotados de servicio para permisos y scoping familiar sin mover contratos globales.

### Testing

- Playwright ya no recoge worktrees locales.
- Mocks de logger en tests incluyen `apiError`, alineados con `src/lib/logger.ts`.
- Se agrego smoke E2E por rol con skips explicitos cuando no hay storage state.
- Se agregaron tests unitarios focales para servicios de asistencia, progreso y familia.

### Documentacion

- Se crearon los 6 documentos obligatorios.
- Se actualizaron notas del vault con cambios, backlog y riesgos.

## 4. Bugs corregidos

| Bug | Causa probable | Solucion aplicada | Como probar |
| --- | --- | --- | --- |
| Playwright fallaba antes de ejecutar tests por `@playwright/test` duplicado. | `testDir: "."` recogia `.claude/worktrees/*`. | `testIgnore` excluye `.claude/**`, `.worktrees/**`, `node_modules/**`. | Ejecutar smoke Playwright; ahora corre tests y falla solo por sesion/login. |
| Super admin mostraba datos inventados como reales. | Fallback de meses 2025, tendencias fijas y revenue `* 0.85`. | Se eliminaron fallbacks/proyecciones y se usan calculos reales o empty state. | `rg -n "mockTrends|2025-03|0\\.85|Ingresos Estimados" src`. |
| Producto sugeria facturacion fiscal. | Copy visible con facturacion/facturas/informacion fiscal. | Cambio a cobros, cuotas, recibos y suscripcion. | `rg -n "Información fiscal|Facturación|facturas|factura|VeriFactu|AEAT" src/app/app src/components/billing src/lib/navigation`. |
| Suite Vitest fallaba por `logger.apiError is not a function`. | Mocks de `@/lib/logger` incompletos frente a `handleApiError`. | Se agrego `apiError: vi.fn()` a mocks afectados. | `pnpm exec vitest run`. |
| Coach podia depender solo de UI/RLS para asistencia/progreso. | Faltaba guard explicito en endpoints usados por flujos criticos. | Se agregaron `verifyCoachClassScope` y `verifyCoachAthleteScope` antes de mutaciones/lecturas sensibles. | Tests focales + typecheck + smoke manual con dev-session. |
| Endpoint familiar devolvia hijos con logica inline y scoping debil. | Mezcla de auth Supabase, queries legacy y guardianes en una ruta. | Se extrajo `getFamilyChildrenForUser()` con tenant obligatorio y deduplicacion. | `tests/lib/family-scope-service.test.ts`. |
| Dataset demo dev-session fallaba por drift DB/schema en coaches. | Drizzle insert emitia columnas declaradas en TS que no existen en DB real. | Seed demo usa insert minimo y estable para coaches, sin migrar schema. | `GET /api/dev/session` devuelve `degraded:false`. |

## 5. Riesgos restantes

| Severidad | Riesgo | Estado |
| --- | --- | --- |
| Critico | Credenciales demo `E2E_AUTH_*` actuales no autentican en Supabase Auth. | Bloquea regenerar `.auth/user.json` y ejecutar e2e real por rol. |
| Alto | No existen storage states reales separados para super_admin, owner y coach. | Spec creado; queda generar sesiones validas. |
| Medio | Endpoints legacy `/api/me/*` y algunas rutas bearer/family siguen pendientes de normalizacion completa. | `/api/family/children` esta endurecido; continuar por modulo. |
| Medio | DB real sigue con drift frente a schema TS. | Dev seed tiene workaround minimo; no se hicieron migraciones. |
| Medio | Rutas legacy `/dashboard/*` siguen conviviendo con `/app/[academyId]`. | Decision humana pendiente ya registrada en vault. |
| Medio | Warnings de tests UI (`act()` y controlled/uncontrolled input). | No bloquean Vitest, pero deben limpiarse. |

## 6. Deuda tecnica restante

- Dividir `SuperAdminDashboard.tsx` en cards/charts/activity/dialogs.
- Dividir `settings/page.tsx` por secciones.
- Endurecer endpoints familia/bearer restantes y normalizar respuestas.
- Auditar handlers flexibles de `withTenant` con tests cross-tenant.
- Resolver decision de rutas legacy.
- Crear storage states regenerables por rol con credenciales demo vigentes.

## 7. Recomendaciones siguientes

### Proximas 24 horas

- Actualizar credenciales demo, regenerar `.auth/user.json` y repetir smoke Playwright autenticado.
- Validar manualmente super admin y dashboard owner en entorno caliente.
- Generar storage states separados para super_admin, owner y coach.

### Proximos 7 dias

- Extender scoping familiar a endpoints bearer/family restantes.
- Crear smoke E2E real con storage states por rol.
- Revisar drift DB/schema antes de cualquier migracion.

### Proximos 30 dias

- Extraer componentes grandes de super admin/settings/billing.
- Normalizar endpoints bearer/family a helpers estandar.
- Cerrar decision de rutas legacy `/dashboard/*`.

## 8. Estado de validacion

| Comando | Resultado | Observaciones |
| --- | --- | --- |
| `pnpm exec tsc --noEmit --pretty false` | PASS | Sin errores TypeScript. |
| `pnpm lint` | PASS | ESLint sin errores. |
| `pnpm exec vitest run` | PASS | 40 archivos, 358 tests. Persisten warnings UI preexistentes de `act()` y controlled/uncontrolled input. |
| `pnpm build` | PASS | Next build completo; 201 paginas generadas. |
| `pnpm exec playwright test tests/e2e-role-smoke.spec.ts --project=chromium` | PASS/SKIP | Spec ejecuta y salta 3 tests porque faltan storage states por rol. |
| `pnpm test:e2e:auth` equivalente con `.env.local` | FAIL | Supabase Auth confirma `Invalid login credentials`; no se pudo regenerar `.auth/user.json`. |
| Dev-session manual con `NEXT_PUBLIC_ENABLE_DEV_SESSION=true pnpm dev` + curl autenticado | PASS | `/dashboard`, `/athletes`, `/groups`, `/classes`, `/billing`, `/settings`, `/my-dashboard` respondieron 200 sin marcadores de error visibles. |
