# Auditoria funcional por roles - Zaltyko

Fecha: 2026-07-07  
Alcance: inspeccion funcional por codigo, smoke HTTP/browser local, lectura de tests existentes y script `pnpm audit:api-routes`.  
Servidor local usado: `pnpm dev` en `http://localhost:3000`.

## Evidencia de ejecucion

- Home publica: carga 200; navegador confirma H1 "Dirige tu academia de gimnasia..." y sin errores de consola.
- Login: carga 200; campos email/password visibles; copy diferencia direccion, entrenadores, familias y atletas; sin errores de consola.
- Ruta protegida `/app/9ec3ea79-73e9-4604-8e4a-ddf1d6469cbb/dashboard` sin sesion activa en navegador: compila y responde `307` a login. Cold start aprox. 22.6s.
- Browser plugin: `domSnapshot()` falla con `incrementalAriaSnapshot is not a function`; se uso `evaluate()` para smoke visible.
- Playwright autenticado: intento con `BASE_URL=http://localhost:3000 E2E_ACADEMY_ID=9ec3ea79-73e9-4604-8e4a-ddf1d6469cbb E2E_STORAGE_STATE=.auth/user.json` fallo antes de ejecutar tests por carga duplicada de `@playwright/test` desde `.claude/worktrees/*`. Ver QA.
- No se invoco `/api/dev/session` en la primera pasada porque crea/asegura datos demo en base de datos.
- Segunda tanda 2026-07-07: se invoco `/api/dev/session` con `NEXT_PUBLIC_ENABLE_DEV_SESSION=true`; quedo estable (`degraded:false`) y permitio smoke HTTP de rutas owner clave.
- Segunda tanda 2026-07-07: regenerar `.auth/user.json` quedo bloqueado por credenciales demo invalidas; Supabase Auth devuelve `Invalid login credentials`.

## Rol 1: Super Admin

| Flujo probado | Estado actual | Problema encontrado | Severidad | Archivo/ruta relacionada | Recomendacion concreta |
| --- | --- | --- | --- | --- | --- |
| Acceso a panel super admin | `layout.tsx` exige usuario o devSession y rol `super_admin`; redirige si no cumple. | DevSession puede simular super admin en desarrollo si esta habilitada; correcto para local, no debe activarse fuera. | Media | `src/app/(super-admin)/super-admin/layout.tsx` | Mantener `NEXT_PUBLIC_ENABLE_DEV_SESSION` desactivado fuera de desarrollo; documentar en QA. |
| Dashboard global | Usa `getGlobalStats()` y `getRecentEvents()`. | Mezcla metricas reales con estimaciones: revenue previo `* 0.85`, fallback de meses 2025, tendencias fijas de owners/coaches/charges. | Alta | `src/lib/superAdminService.ts`, `src/app/(super-admin)/super-admin/components/SuperAdminDashboard.tsx` | Mostrar estimaciones como "demo/estimado" o reemplazarlas por calculos reales; nunca presentarlas como metricas de negocio reales. |
| Academias/usuarios | Existen rutas y tablas super-admin. | Inconsistencia potencial: `getAllAcademies()` cruza owner profile -> subscription por userId; si ownerId falta o subscription no coincide, plan queda null. | Media | `src/lib/superAdminService.ts` | Anadir empty state/indicador "sin plan asociado" y no inferir plan como real si falta relacion. |
| Planes/billing/soporte/configuracion | Hay paginas `billing`, `support`, `settings`, pero navegacion super admin solo muestra Inicio, Usuarios, Academias, Academias Publicas, Logs. | Super admin no expone todos los modulos que el producto promete; posible decision de ocultar placeholders. | Media | `src/lib/navigation/registry.ts`, `src/app/(super-admin)/super-admin/*` | Mantener oculto si no esta listo, pero documentar en demo: no ensenar billing/soporte/settings super admin hasta validar. |
| Logs | Ruta protegida por super admin. | Sin hallazgo critico en inspeccion. | Baja | `src/app/(super-admin)/super-admin/logs/page.tsx` | Incluir en checklist manual con datos reales. |
| Errores de consola | Home/login sin errores; super admin no se pudo abrir autenticado por runner/sesion. | Falta evidencia renderizada super admin en esta corrida. | Media | Playwright config, `.auth/user.json` | Corregir config e2e para excluir worktrees y repetir smoke autenticado. |

## Rol 2: Dueno de academia

| Flujo probado | Estado actual | Problema encontrado | Severidad | Archivo/ruta relacionada | Recomendacion concreta |
| --- | --- | --- | --- | --- | --- |
| Entrada a dashboard academia | `AcademyLayout` valida user/profile, membership, tenant y `canAccessAcademyWorkspace`; dashboard limita owner/admin/super_admin y membership owner. | Cold start local alto en dashboard (compilacion 16.4s y redirect 22.6s sin sesion). | Media | `src/app/app/[academyId]/layout.tsx`, `src/app/app/[academyId]/dashboard/page.tsx` | No es bug funcional, pero para demo usar build warm/precompilado o mantener dev server caliente. |
| Dashboard de academia | Data server en `getDashboardData`, UI en `DashboardPage`, widgets progresivos. | Fetch client-side adicional para grupos/clases y copy calculado en cliente puede crear waterfalls/estados parciales. | Media | `src/components/dashboard/DashboardPage.tsx`, `src/lib/dashboard.ts` | Consolidar datos criticos en server o marcar widgets progresivos con error/empty state. |
| Crear/editar alumnos | API `POST /api/athletes` usa `withTenant`, Zod, plan limits, validacion de academia/grupo/sport config. | GET admite `tenantOverride` por query si no hay `context.tenantId`; flexible pero sensible. | Alta | `src/app/api/athletes/route.ts` | Evitar `tenantId` por query en rutas autenticadas o cubrir con test de cross-tenant. |
| Asignar alumnos a grupos | Grupo verifica academia/tenant; atleta se asigna en transaccion. | En `GET /api/groups`, sport config enriquecido se devuelve como null en filas aunque el modelo tiene columnas; puede empobrecer UI/plantillas. | Media | `src/app/api/groups/route.ts` | Devolver campos reales de grupo en GET para que la UI no pierda contexto tecnico. |
| Crear grupos/clases | APIs tienen `withTenant`, rate limit, plan limits y validaciones deportivas. | Algunos formularios grandes aun mezclan UI/modelo; riesgo de regresion al editar. | Media | `src/components/groups/CreateGroupDialog.tsx`, `src/components/classes/CreateClassDialog.tsx` | Continuar extraccion hacia modelos/helpers ya iniciados. |
| Cuotas/pagos internos | `charges` gestiona estados `pending`, `paid`, `overdue`; billing items y pagos manuales existen. | UI/copy usa "Facturacion", "facturas" y ajustes fiscales, lo que contradice el posicionamiento no fiscal. | Alta | `src/app/app/[academyId]/billing/page.tsx`, `src/app/app/[academyId]/settings/page.tsx`, `src/lib/navigation/registry.ts` | Renombrar visible a "Cobros", "cuotas", "recibos internos"; no introducir fiscalidad oficial. |
| Asistencia | API upsert valida session tenant, atletas de clase y ahora clase asignada para coach. | Falta e2e real con storage state coach valido. | Media | `src/app/api/attendance/route.ts`, `src/lib/attendance/service.ts`, `src/lib/permissions.ts` | Regenerar credenciales demo y ejecutar smoke coach asignado/no asignado. |
| Progreso tecnico | Evaluaciones/assessments y dashboard tecnico existen; API valida atleta/clase asignada para coach. | No se pudo probar e2e autenticado por credenciales demo invalidas. | Media | `src/app/app/[academyId]/assessments`, `src/app/api/assessments/*`, `src/lib/progress/service.ts` | Repetir flujo con storage state coach valido y datos demo estables. |
| Comunicacion/recordatorios | Modulos messages, announcements, notifications, WhatsApp, templates y alerts existen. | Varias integraciones (WhatsApp/Brevo/Mailgun) pueden depender de env; no validar en demo si no estan configuradas. | Media | `src/app/app/[academyId]/messages`, `src/app/api/communication/*`, `src/app/api/whatsapp/*` | Preparar demo con comunicaciones internas/read-only o mocks claramente marcados. |

## Rol 3: Entrenador

| Flujo probado | Estado actual | Problema encontrado | Severidad | Archivo/ruta relacionada | Recomendacion concreta |
| --- | --- | --- | --- | --- | --- |
| Acceso a workspace | `AcademyLayout` permite `coach` con membership; navigation muestra dashboard, atletas, grupos, clases, eventos, evaluaciones, mensajes, informes. | Coach tambien tiene acceso a rutas generales de atletas/grupos desde sidebar; API debe filtrar por asignacion si el producto no quiere vista completa de academia. | Alta | `src/lib/navigation/registry.ts`, `src/app/app/[academyId]/layout.tsx` | Definir si coach ve toda la academia o solo asignados; ajustar rutas/API segun decision. |
| Panel coach | `src/app/app/[academyId]/coach/page.tsx` filtra por membership y coach asociado, luego obtiene clases asignadas, grupos, atletas, sesiones de hoy, asistencia y evaluaciones recientes. | Varias queries posteriores no incluyen `tenantId`/`academyId` en cada join, confiando en ids asignados previamente. | Media | `src/app/app/[academyId]/coach/page.tsx` | Anadir filtros defensivos de tenant/academy para evitar fugas por datos corruptos. |
| Registrar asistencia | API valida clase/sesion, atletas en clase y asignacion coach via `verifyCoachClassScope`. | Falta verificacion e2e con usuario coach real. | Media | `src/app/api/attendance/route.ts`, `src/lib/attendance/service.ts` | Crear storage state coach y probar clase asignada/no asignada. |
| Registrar progreso tecnico | Assessments API valida asignacion por atleta/grupo/clase via `verifyCoachAthleteScope`. | Falta verificacion e2e con usuario coach real. | Media | `src/app/api/assessments/*`, `src/app/app/[academyId]/assessments/page.tsx`, `src/lib/progress/service.ts` | Ejecutar smoke coach con atleta asignado/no asignado. |
| Consultar informacion util | Panel coach parece orientado a clases, atletas, asistencia y evaluaciones. | No se pudo renderizar autenticado en esta corrida. | Media | `src/components/coach/CoachDashboardPage.tsx` | Repetir smoke con usuario coach real o fixture. |

## Rol 4: Padre/Familia

| Flujo probado | Estado actual | Problema encontrado | Severidad | Archivo/ruta relacionada | Recomendacion concreta |
| --- | --- | --- | --- | --- | --- |
| Redireccion por rol | `resolveUserHome()` manda parent a `/dashboard/profile`; `AcademyLayout` redirige parent/athlete fuera del workspace de academia. | Correcto para evitar acceso al workspace operativo. | Baja | `src/lib/auth/resolve-user-home.ts`, `src/lib/product/roles.ts` | Mantener como contrato de seguridad. |
| Dashboard familiar/atleta | `/app/[academyId]/my-dashboard` permite roles `athlete` y `parent` con membership; obtiene atleta(s), clases, asistencia, pagos y evaluaciones. | Queries de atleta/guardian no siempre filtran por `academyId`/`tenantId`; dependen de relationships existentes. | Alta | `src/app/app/[academyId]/my-dashboard/page.tsx` | Filtrar todos los datos por `academyId` y tenant asociado; testear que parent no pueda cambiar `athleteId` por query a otro atleta. |
| API family children | Endpoint autentica por Supabase y usa `getFamilyChildrenForUser()` con rol familiar, tenant y relaciones legacy/guardian deduplicadas. | Quedan endpoints familia/bearer relacionados por revisar y falta QA con usuario parent real. | Media | `src/app/api/family/children/route.ts`, `src/lib/family/scope-service.ts` | Extender scoping a endpoints familiares restantes y probar parent propio/ajeno. |
| Pagos/cuotas visibles a familia | `my-dashboard` muestra `charges` del atleta objetivo. | Wording en UI puede decir facturas/estado de cuenta en componentes relacionados; riesgo fiscal/comercial. | Media | `src/app/app/[academyId]/my-dashboard/MyDashboardPage.tsx`, widgets de pagos | Usar "cuotas" y "pagos internos"; no "factura fiscal". |
| Comunicaciones/progreso | Perfil y dashboard familiar existen parcialmente. | No se pudo validar con usuario parent real en navegador. | Media | `src/components/profiles/ParentProfile.tsx`, `src/app/app/[academyId]/my-dashboard` | Crear fixture parent y smoke e2e read-only. |

## Problemas transversales que afectan demo

| Problema | Severidad | Impacto | Recomendacion |
| --- | --- | --- | --- |
| Playwright local recoge `.claude/worktrees` por `testDir: "."` | Alta | Bloquea smoke autenticado local y validacion rapida. | Excluir `.claude/**`, `.worktrees/**`, `node_modules/**` o cambiar `testDir` a `tests`. |
| Browser plugin no soporta `domSnapshot()` en esta sesion | Media | Limita evidencia visual automatizada desde Codex. | Usar `evaluate()`/screenshots o Playwright CLI tras arreglar config. |
| Cold starts altos en dev | Media | Demo local puede parecer rota/lenta. | Warm-up de rutas antes de demo o usar build/preview. |
| Copy fiscal/facturas | Alta | Riesgo de vender producto equivocado o abrir expectativas legales. | Refactor visible inmediato a pagos/cuotas/recibos internos. |
| Datos hardcodeados/estimados en dashboards | Alta | Pierde confianza de cliente si se detecta. | Ocultar/etiquetar o calcular real. |
