# Zaltyko - Analisis de Producto

**Fecha:** 2026-03-26
**Versión:** 1.0
**Scope:** Producto completo (Core + Marketing)

---

## Resumen Ejecutivo

Zaltyko es un SaaS B2B para gestión de academias de gimnasia con un nucleo funcional solido en su base (atletas, entrenadores, clases, eventos, facturación), pero con una deuda técnica significativa en la capa de UI/UX, modulos de marketing prometer funcionalidades no implementadas, y features criticas incompletas. El modelo de datos es maduro (73+ schemas) pero la experiencia de usuario no esta a la altura del potencial del back-end.

---

## Product Score: 52 / 100

| Dimensión | Score | Observaciones |
|-----------|-------|--------------|
| Core Ops (atletas, clases, coaches, billing) | 72/100 | Funcionalidades operativas basicas implementadas, pero con deuda UX |
| Evaluaciones y Seguimiento | 25/100 | Schema existe, UI casi no existe, funcionalidad parcial |
| Comunicacion y Notificaciones | 30/100 | Infraestructura existe, UI minima, segmentacion no implementada |
| Marketing y Adquisicion | 35/100 | 7 landing pages de modulos, directorio prometido pero no existe |
| AI / Automation | 40/100 | Infraestructura de AI integrada, endpoints de IA listos, UI casi nula |
| UX / Consistencia | 38/100 | Mezcla de estilos (shadcn + custom), pages incompletas, ausencia de loading states |
| Monetizacion / Pricing | 25/100 | Componente de pricing hardcodeado, checkout basico, no hay trial flow real |
| Onboarding | 45/100 | Onboarding existe con checklist, pero no hay producto de demo funcional |

---

## Inventario de Funcionalidades

### 1. Modulo de Atletas

| Feature | Estado | Notas |
|---------|--------|-------|
| Listado con stats (total/active/trial/inactive) | ✅ Implemented | Page completa en `/dashboard/athletes` |
| Busqueda por nombre | ✅ Implemented | Filtro con ilike |
| Filtros (estado, nivel, academia, edad) | ✅ Implemented | Multiples selects + age range |
| Distribucion por nivel visual | ✅ Implemented | Badges con porcentajes |
| Perfil de atleta individual | ✅ Implemented | `/dashboard/athletes/[id]` |
| Seccion de cuenta de atleta | ✅ Implemented | `AthleteAccountSection` |
| Clases base y extra | ✅ Implemented | `AthleteBaseClassesSection`, `AthleteExtraClassesSection` |
| Historial de atleta | ✅ Implemented | `AthleteHistoryView` |
| Progreso con charts y timeline | ✅ Implemented | `ProgressCharts`, `ProgressTimeline` |
| Gestor de tutores | ✅ Implemented | `GuardianManager`, `GuardiansSection` |
| Import/Export CSV | ✅ Implemented | `ImportExportPanel`, `CsvImportDialog` |
| Formularios de creacion/edicion | ✅ Implemented | `CreateAthleteDialog`, `EditAthleteDialog` |
| Migracion de usuarios (sync-users) | ✅ Implemented | API route + `sync-users.ts` |
| Nivel tecnico por aparato | ❌ Missing | Schema `athleteAssessments` existe, UI no existe |
| Historial medico | ❌ Missing | Prometido en marketing, no implementado |
| Documentos digitalizados con vencimiento | ❌ Missing | Prometido en marketing, no implementado |
| Evaluaciones periodicas | 🔨 Partial | Schema existe, page en `dashboard/assessments` no existe |

### 2. Modulo de Entrenadores

| Feature | Estado | Notas |
|---------|--------|-------|
| Listado de entrenadores | ✅ Implemented | `/dashboard/coaches` con stats |
| Panel de asignaciones a clases | ✅ Implemented | `CoachAssignmentsPanel` |
| Perfil de entrenador | ✅ Implemented | `CoachProfile` component |
| Certificaciones | ✅ Implemented | `CertificationsSection` |
| Bio y foto perfil publico | ✅ Implemented | `CoachPublicProfileEditor` |
| Notas del entrenador | ✅ Implemented | `CoachNotesManager`, `NoteForm` |
| Vista del dia para entrenador | ✅ Implemented | `CoachTodayView` |
| Crear/editar entrenador | ✅ Implemented | `CreateCoachDialog`, `EditCoachDialog` |
| Sincronizacion de calendario | 🔨 Partial | Schedule conflicts existe, vista parcial |
| Gestionar horarios disponibles | ❌ Missing | Prometido en marketing, no existe |

### 3. Modulo de Clases y Horarios

| Feature | Estado | Notas |
|---------|--------|-------|
| Calendario visual (week/month) | ✅ Implemented | `CalendarView` en `/dashboard/calendar` |
| Vista de agenda | ✅ Implemented | `AgendaView` component |
| Placeholder sessions (sin generar) | ✅ Implemented | Fallback inteligente en calendar page |
| Generar sesiones recurrentes | ✅ Implemented | `GenerateSessionsDialog`, API route |
| Excepciones (festivos, cancelaciones) | ✅ Implemented | `ClassExceptionsDialog`, schema completo |
| Configuracion de recurrencia | ✅ Implemented | `RecurringSessionsManager` |
| Control de capacidad | ✅ Implemented | Schema tiene `capacity`, waiting list en schema |
| Clase extra (isExtra) | ✅ Implemented | Campo en schema |
| Registro de asistencia a sesion | ✅ Implemented | `AttendanceDialog`, `attendanceRecords` |
| Anadir atleta a clase | ✅ Implemented | `AddAthleteToClassDialog` |
| Lista de espera | 🔨 Partial | Schema existe, UI no visible |
| Trial gratuito (allowsFreeTrial) | 🔨 Partial | Campo existe, UI no visible |
| Politicas de cancelacion | 🔨 Partial | Campo existe, UI no visible |
| Pagina individual de clase | ❌ Missing | No existe `/dashboard/classes/[id]` |
| Gestion de clases (CRUD) | ❌ Missing | No hay page de gestion de clases |

### 4. Modulo de Grupos

| Feature | Estado | Notas |
|---------|--------|-------|
| Dashboard de grupos | ✅ Implemented | `GroupsDashboard` en `/dashboard/groups` |
| Crear grupo | ✅ Implemented | `CreateGroupDialog` |
| Editar grupo | ✅ Implemented | `EditGroupDialog` |
| Vista de grupo individual | ✅ Implemented | `GroupView` |
| Tarjeta de grupo | ✅ Implemented | `GroupCard` |
| Actualizar coaches del grupo | ✅ Implemented | `UpdateGroupCoachesDialog` |
| Actualizar miembros del grupo | ✅ Implemented | `UpdateGroupMembersDialog` |
| Asignar atletas a grupos | ✅ Implemented | `GroupView` tiene UI |

### 5. Modulo de Facturacion

| Feature | Estado | Notas |
|---------|--------|-------|
| Items de facturacion (cuotas) | ✅ Implemented | Schema completo + API |
| Cargos automaticos y manuales | ✅ Implemented | `GenerateChargesDialog`, `CreateChargeDialog` |
| Historial de facturas | ✅ Implemented | `InvoiceHistory`, `InvoiceList` |
| Gestion de descuentos | ✅ Implemented | `discounts`, `discountCampaigns` |
| Becas (scholarships) | ✅ Implemented | Schema existe |
| Recibos (receipts) | ✅ Implemented | `ReceiptViewer`, `receipt-generator` |
| Panel de facturacion | ✅ Implemented | `BillingSummary`, `StudentChargesTab` |
| Metodo de pago (Stripe) | ✅ Implemented | `PaymentMethodCard`, webhook handler |
| Recordatorios de pago (AI) | 🔨 Partial | Tipo definido en `ai/types.ts`, no hay UI |
| Prediccion de morosidad (AI) | 🔨 Partial | Tipo definido, no hay UI de uso |
| Generar cargos mensuales (cron) | ✅ Implemented | API route + cron job |
| Facturas electrónicas | ❌ Missing | Prometido en marketing, no existe |
| Panel financiero con proyecciones | ❌ Missing | Solo stats basicos |
| Exportacion a contabilidad | ❌ Missing | Prometido en marketing |

### 6. Modulo de Eventos y Competiciones

| Feature | Estado | Notas |
|---------|--------|-------|
| Listado de eventos | ✅ Implemented | `/dashboard/events` con stats |
| Crear evento | ✅ Implemented | `/dashboard/events/new` |
| Detalle de evento | ✅ Implemented | `/dashboard/events/[id]` |
| Registro de competidores (athletes) | ✅ Implemented | `eventRegistration` schema |
| invitaciones a eventos | ✅ Implemented | `eventInvitations` schema |
| Notificaciones de eventos | ✅ Implemented | `EventNotifications`, `eventsNotifier` |
| Niveles de evento (internal/local/national) | ✅ Implemented | Enums completos |
| Upload de archivos | ✅ Implemented | `FileUpload` component |
| Pagina publica de evento | ✅ Implemented | `/events/[id]` public page |
| Inscripcion publica online | 🔨 Partial | Schema existe, UI incompleta |
| Seleccion automatica de elegibles | ❌ Missing | Prometido en marketing |
| Generacion de listados federativos | ❌ Missing | Prometido en marketing |
| Registro de resultados competitiva | 🔨 Partial | Schema existe, no hay UI |

### 7. Evaluaciones y Progreso

| Feature | Estado | Notas |
|---------|--------|-------|
| Schema de evaluaciones | ✅ Implemented | `athleteAssessments`, `assessmentScores` |
| Catalogo de habilidades | ✅ Implemented | `skillCatalog` schema |
| Evaluaciones extendidas | ✅ Implemented | `assessment-extended` schema |
| Rubricas de evaluacion | 🔨 Partial | API route existe, UI no visible |
| Tipos de evaluacion | 🔨 Partial | API route existe, UI no visible |
| Exportar evaluaciones | 🔨 Partial | API route existe, UI no visible |
| Page de evaluaciones | ❌ Missing | Glob no encontro `dashboard/assessments/**` |
| Dashboard de evaluaciones | ❌ Missing | No existe `/dashboard/assessments` |
|Seguimiento por aparato | ❌ Missing | Prometido en marketing, no implementado |
| Historial de evaluaciones por atleta | ❌ Missing | UI no existe |

### 8. Asistencia

| Feature | Estado | Notas |
|---------|--------|-------|
| Registro de asistencia (session/athlete) | ✅ Implemented | `attendanceRecords` schema completo |
| Attendance dialog | ✅ Implemented | `AttendanceDialog` component |
| Prediccion de ausencia (AI) | 🔨 Partial | API route existe, UI no visible |
| Analisis de riesgo de abandono (AI) | 🔨 Partial | API route existe, UI no visible |
| Reportes de asistencia (export) | 🔨 Partial | API route existe, UI no visible |
| Page de asistencia | ❌ Missing | No existe `/dashboard/attendance` |
| Dashboard de asistencia | ❌ Missing | Widgets existen en dashboard pero no page dedicada |

### 9. Comunicacion y Notificaciones

| Feature | Estado | Notas |
|---------|--------|-------|
| Sistema de notificaciones | ✅ Implemented | `notifications` schema + service |
| Centro de mensajes | ✅ Implemented | `ContactMessagesList` |
| Plantillas de email | ✅ Implemented | `email-service`, `event-email-content` |
| Email logs | ✅ Implemented | `emailLogs` schema |
| WhatsApp integration | ✅ Implemented | `whatsapp.ts` + API route |
| Push notifications | ✅ Implemented | `pushSubscriptions`, `pushTokens` schemas |
| Preferencias de notificacion | ✅ Implemented | `EmailPreferences`, `NotificationPreferencesAdvanced` |
| Historial de notificaciones | ✅ Implemented | API routes completos |
| Notificaciones segmentadas | ❌ Missing | Marketing promete "segmentacion quirurgica" |
| Confirmacion de lectura | ❌ Missing | Prometido en marketing |
| Centro de notificaciones unificado | ❌ Missing | No existe UI centralizada |
| Actualizaciones de progreso IA (chat) | 🔨 Partial | API route existe, no hay UI de chat |

### 10. Dashboard y Reportes

| Feature | Estado | Notas |
|---------|--------|-------|
| Dashboard general de academias | ✅ Implemented | `/dashboard/academies` con stats |
| Chart de atletas por academia | ✅ Implemented | `BarChart` con `academiesWithStats` |
| Metricas de negocio | 🔨 Partial | `BusinessStatsCard`, `AdvancedMetrics`, `financial-calculator` |
| Quick actions | ✅ Implemented | `QuickAction`, `QuickClassModal`, `QuickPaymentModal` |
| Onboarding checklist | ✅ Implemented | `OnboardingChecklist` |
| Reporte de asistencia | 🔨 Partial | API routes existen, no hay UI |
| Reporte financiero | 🔨 Partial | `financial-calculator`, no hay UI dedicada |
| Reporte de progreso | 🔨 Partial | `progress-analyzer`, no hay UI |
| Reporte de churn | 🔨 Partial | `churn-report` existe, no hay UI |
| Scheduled reports | ✅ Implemented | `scheduledReports` schema |
| Panel de reportes | ❌ Missing | Page completa prometida en marketing |
| KPIs en tiempo real | ❌ Missing | Solo stats basicos |
| Exportar reportes (PDF/Excel) | ❌ Missing | Prometido en marketing, no existe |

### 11. AI y Automatizacion

| Feature | Estado | Notas |
|---------|--------|-------|
| Orchestrator de IA | ✅ Implemented | `lib/ai/orchestrator.ts` |
| Prediccion de ausencia | 🔨 Partial | API route implementada, UI no existe |
| Analisis de riesgo de abandono | 🔨 Partial | API route implementada, UI no existe |
| Recordatorios de pago (IA) | 🔨 Partial | API route, no hay UI |
| Actualizacion de progreso (IA) | 🔨 Partial | API route, no hay UI |
| Chat de comunicacion IA | 🔨 Partial | API route existe, no hay UI |
| Tipos definidos (RiskAnalysis, etc) | ✅ Implemented | `lib/ai/types.ts` completo |
| Prompts de IA | ✅ Implemented | `lib/ai/prompts/*` |

### 12. Panel Operativo por Academia

| Feature | Estado | Notas |
|---------|--------|-------|
| Arquitectura de routing | ✅ Implemented | `src/app/app/[academyId]/**` existe |
| Dashboard de academia | ❌ Missing | Page `app/[academyId]/dashboard` no existe |
| Navigacion del academy | ✅ Implemented | `academy-nav-items.ts` con 8 secciones |
| Asignacion de roles | ✅ Implemented | API + schemas |

### 13. Super Admin

| Feature | Estado | Notas |
|---------|--------|-------|
| Panel de academias | ✅ Implemented | `/super-admin/academies` |
| Panel de usuarios | ✅ Implemented | `/super-admin/users` |
| Detalle de academia (admin) | ✅ Implemented | `SuperAdminAcademyDetail` |
| Log viewer | ✅ Implemented | `AuditLogsViewer` + `SuperAdminLogsTable` |
| Toggle visibilidad publica | ✅ Implemented | `PublicAcademiesTable`, `TogglePublicVisibility` |
| Dashboard super admin | ✅ Implemented | `/super-admin/dashboard` |
| Configuracion (admin) | ✅ Implemented | `/super-admin/settings` |
| Soporte tickets | ✅ Implemented | `supportTickets` schema + API |

### 14. Onboarding y Autenticacion

| Feature | Estado | Notas |
|---------|--------|-------|
| Onboarding flow | ✅ Implemented | 4 pasos (AccountStep, AcademyStep, etc.) |
| Invitacion de usuarios | ✅ Implemented | `InviteUserForm`, `invitations` schema |
| Aceptar invitacion | ✅ Implemented | `AcceptInvitationForm` |
| Autenticacion (Supabase) | ✅ Implemented | Supabase Auth + RLS |
| Perfiles multiples (Owner/Coach/Athlete/Parent) | ✅ Implemented | Roles completos en profiles |
| Plan limits y upgrade prompts | ✅ Implemented | `LimitIndicator`, `UpgradeModal`, `DowngradeModal` |

### 15. Landing Page y Marketing

| Feature | Estado | Notas |
|---------|--------|-------|
| Hero section | ✅ Implemented | Stats hardcodeados (+120 academias, 18k atletas) |
| Seccion de CTA | ✅ Implemented | `Cta.tsx` |
| Modulo landing: Clases y Horarios | ✅ Implemented | `modules/clases-horarios` - SEO completo |
| Modulo landing: Pagos y Administracion | ✅ Implemented | `modules/pagos-administracion` - SEO completo |
| Modulo landing: Eventos y Competiciones | ✅ Implemented | `modules/eventos-competiciones` - SEO completo |
| Modulo landing: Comunicacion | ✅ Implemented | `modules/comunicacion` - SEO completo |
| Modulo landing: Gestion de Atletas | ✅ Implemented | `modules/gestion-atletas` - SEO completo |
| Modulo landing: Directorio de Academias | ✅ Implemented | `modules/directorio-academias` - SEO completo |
| Modulo landing: Dashboard y Reportes | ✅ Implemented | `modules/dashboard-reportes` - SEO completo |
| Coaches public profiles | ✅ Implemented | `/coaches/[slug]` pages |
| Directorio publico de academias | ❌ Missing | Prometido en marketing como feature implementada |
| Pagina de pricing real | ❌ Missing | `pricing.tsx` es un placeholder basico con datos falsos |

### 16. Roles y Permisos

| Feature | Estado | Notas |
|---------|--------|-------|
| Sistema de roles (RBAC) | ✅ Implemented | `roles`, `permissions`, `memberships` schemas |
| Authz service | ✅ Implemented | `lib/authz.ts` + servicios relacionados |
| Audit logs | ✅ Implemented | `audit-logs` schema + viewer component |
| Control de acceso multi-tenant | ✅ Implemented | RLS policies + tenant resolution |

### 17. Marketplace y Empleo (Extra)

| Feature | Estado | Notas |
|---------|--------|-------|
| Schema de empleo | ✅ Implemented | `empleo` schema + API routes |
| Schema de marketplace | ✅ Implemented | `marketplace` schema + API routes |
| Páginas placeholder | ✅ Implemented | `empleo/[id]`, `marketplace/[id]`, `nuevo/` |
| Funcionalidad real | ❌ Missing | Solo schemas y pages basicas |

### 18. Public Site (Directorio)

| Feature | Estado | Notas |
|---------|--------|-------|
| Perfil publico de academia | ✅ Implemented | `/academias/[id]` page completa |
| Filtros de academias | ✅ Implemented | `filter-options` API + UI |
| Paginas publicas de eventos | ✅ Implemented | `/events/[id]` con registro |

---

## UX / UI Issues

### CRITICOS (bloquean uso)

1. **No existe page de gestion de clases** - No hay `/dashboard/classes` ni `/dashboard/classes/[id]`. El modulo de clases existe logicamente (schemas, API, calendar view) pero no hay una page donde crear/editar/clasificar clases.

2. **No existe page de asistencia** - No hay `/dashboard/attendance`. El registro de asistencia existe a nivel de sesion (`AttendanceDialog`) pero no hay una vista aggregated de asistencia por atleta/grupo/periodo.

3. **Pricing page es un placeholder** - `src/components/pricing.tsx` muestra "My SaaS Boilerplate" con planes basicos hardcodeados ($9.99, $19.99) que no corresponden a los planes reales del producto (Free/Pro/Premium). Esto es lo primero que ve un potencial cliente.

4. **Ausencia total de loading states** - La mayoria de las pages no tienen archivos `loading.tsx` dedicados, lo que resulta en navegacion brusca. Las pages que si tienen loading (`athletes/loading.tsx`, etc.) son archivos vacios o minimos.

### ERROR STATES

5. **Landing page con datos falsos** - El Hero muestra "+120 academias, 18k atletas, €3.4M procesado" que son numeros de marketing sin soporte en datos reales.

6. **Redirect loop potential** - `Dashboard` page (`/dashboard`) redirige inmediatamente a `/dashboard/academies`. Varias pages hacen redirects en cadena (no profile -> no tenant -> onboarding). Si falla DB, puede haber loops.

7. **Sin handling de errores de conexion DB** - En `profile/page.tsx` hay un try/catch parcial para errores de DB, pero el resto de pages no tienen este fallback.

### DEUDA UX

8. **Mezcla de estilos** - Algunas pages usan `bg-zaltyko-*` custom classes, otras usan `bg-emerald-*`, `bg-red-*` de Tailwind. Inconsistencia en la paleta de colores entre componentes.

9. **No hay empty states consistentes** - Aunque existe `EmptyState` component, no todas las pages lo usan (ej: coaches page no tiene empty state).

10. **Falta de breadcrumb en varias pages** - `AutoBreadcrumb` existe pero no se usa en todas las pages.

11. **No hay tooltips o help text** - Forms complejos (ej: athlete creation) no tienen inline help.

12. **Navegacion no responsiva** - `AcademyNavItems` no tiene version mobile/mobile menu.

13. **No hay confirm dialogs** - Acciones destructivas (delete) no tienen confirmacion visual.

14. **Calendar placeholder UX** - Cuando no hay sesiones generadas, el calendario muestra placeholders con un mensaje "No hay sesiones generadas todavía" pero no hay CTA claro para generarlas.

---

## Product-Market Fit Assessment

### Lo que funciona (problemas reales resueltos)

1. **Gestion de atletas centralizada** - El problema de tener datos dispersos es real. La solucion (fichas digitales, import CSV, filtros) resuelve un pain point genuino.

2. **Calendario de clases** - Coordinar horarios de multiples grupos es un problema real. La vista de calendario con placeholders es util aunque incompleta.

3. **Facturacion con Stripe** - Cobrar manualmente es un dolor de cabeza real. La automatizacion con Stripe resolve un problema concreto.

4. **Multi-tenant** - La arquitectura RLS/multi-tenant esta bien disenada para el caso de academias independientes.

### Lo que NO funciona (gaps de PMF)

5. **No hay tracking de progreso real** - El caso de uso mas fuerte para un software de gimnasia es "ver como avanza mi hija". El schema de evaluaciones existe pero la UI no. Sin evaluaciones periodicas visibles, el valor para padres es limitado.

6. **Portal de padres incompleto** - El rol `parent` existe pero el portal es basico. No hay calendario de ninos, no hay evaluacion visible, no hay comunicacion bidireccional real.

7. **Eventos/compepticiones sin funcionalidad completa** - Registrar atletas en competiciones es un workflow critico. Se promete muchisimo en marketing pero la UI es una lista de eventos basica.

8. **No hay integracion con federaciones** - La promesa de "generar listados federativos" no esta implementada. Para academias competitivas, esto es un diferenciador clave.

---

## Top 5 Gaps de Producto (por impacto de negocio)

### GAP 1: Evaluaciones Periodicas Ausentes (Severity: CRITICA)
**Impacto:** Alto - Es el feature mas diferenciador para academias competitivas y el mas esperado por padres.
**Que se prometio:** "Seguimiento de nivel tecnico por aparato y categoria competitiva", "registro de lesiones y condiciones especiales", "evaluaciones periodicas"
**Que existe:** Solo schemas en la DB
**Que falta:** Page completa de evaluaciones, rubricas configurables, historial visual, exportacion, integracion con progreso
**Esfuerzo estimado:** 3-4 semanas

### GAP 2: Portal de Padres Funcional (Severity: ALTA)
**Impacto:** Alto - Es el canal de retencion y monetizacion (parents pagan)
**Que se prometio:** Ver progreso de atletas, calendario de clases, justificar ausencias, comunicacion bidireccional
**Que existe:** Login de parent, lista de hijos, perfil basico
**Que falta:** Calendario con clases de los hijos, evaluaciones visibles, justificacion de ausencias, chat con entrenador, pagos (ver/registrar)
**Esfuerzo estimado:** 2-3 semanas

### GAP 3: Page de Gestion de Clases Completa (Severity: ALTA)
**Impacto:** Medio-alto - Sin esto, el modulo de clases es inutilizable para crear/editar
**Que existe:** Calendario que muestra placeholders, schemas, API de generacion
**Que falta:** Page `/dashboard/classes` para CRUD de clases, configuracion de capacidad/waiting list, politica de cancelacion
**Esfuerzo estimado:** 1-2 semanas

### GAP 4: Pricing Page Real y Trial Flow (Severity: MEDIA-ALTA)
**Impacto:** Directo en conversion de leads
**Que existe:** Component `PlanComparison` con planes reales, `PlanSelector`
**Que falta:** `pricing.tsx` es un placeholder de boilerplate. Falta: comparativa de planes visible, trial flow real (que se active y tracked), checkout completo con LemonSqueezy (solo `LemonButton` existe), integracion real de Stripe Checkout
**Esfuerzo estimado:** 1 semana

### GAP 5: Dashboard y Reportes Operativos (Severity: MEDIA)
**Impacto:** Medio - Afecta percepcion de profesionalismo y churn
**Que se prometio:** KPIs en tiempo real, reportes de asistencia, analisis financiero, exportacion a Excel/PDF
**Que existe:** `DashboardWidget.tsx` components, calculators en `lib/reports/`
**Que falta:** Page dedicada `/dashboard/reports`, dashboard con KPIs reales (no fake data), reportes exportables
**Esfuerzo estimado:** 2 semanas

---

## Top 5 Quick Wins

### QUICK WIN 1: Crear Page de Evaluaciones Basica (1 dia)
Usar el schema existente y crear una page `/dashboard/assessments` que:
- Liste evaluaciones por atleta
- Permita crear una evaluacion con scores por habilidad
- Muestre el historial en el perfil del atleta

### QUICK WIN 2: Fix Pricing Page (1 dia)
Reemplazar el placeholder `pricing.tsx` con el componente `PlanComparison` existente y conectarlo a Stripe/LemonSqueezy.

### QUICK WIN 3: Dashboard de Asistencia en Calendario (1-2 dias)
La page de calendario ya existe. Anadir un widget de stats de asistencia aggregated (top athletes absent, top groups, tendencia mensual) usando los datos de `attendanceRecords`.

### QUICK WIN 4: Empty States Consistente (1 dia)
Auditar todas las pages y anadir `EmptyState` component donde falte. Esto mejora percepcion de calidad sin cambiar logica.

### QUICK WIN 5: Page de Gestion de Clases Basica (2 dias)
Crear `/dashboard/classes` con:
- Listado de clases por academia
- Crear/editar clase con capacidad y waiting list
- Enlazar con calendario existente

---

## Recomendaciones Priorizadas

### Corto plazo (0-4 semanas)

1. **Fix critical UX blockers** - Loading states, error boundaries, empty states
2. **Page de clases funcional** - Sin esto el modulo de clases es inutilizable
3. **Pricing page real** - Primer contacto con potenciales clientes
4. **Evaluaciones basicas** - Feature diferenciador mas importante

### Medio plazo (1-3 meses)

5. **Portal de padres completo** - Calendario de hijos, progreso, comunicacion
6. **Dashboard de reportes** - Con KPIs reales y exportacion
7. **Directorio publico de academias** - Prometido en marketing, genera inbound
8. **Completar modulo de eventos** - Inscripciones online, listados federativos

### Largo plazo (3+ meses)

9. **Integracion con federaciones** (RFEG, federation APIs)
10. **App mobile** - Portal de padres mobile
11. **WhatsApp business integration** - Comunicacion real bidireccional
12. **Marketplace de empleo** - Prometido y con schemas, funcional

---

## Apendice: Inventario de Schemas

El modelo de datos es remarquablemente completo y maduro para el estado del producto:

```
73 schemas en index.ts:
- Academias y memberships
- Profiles y auth
- Athletes, guardians, family contacts
- Coaches y asignaciones
- Classes, sessions, weekdays
- Groups y group athletes
- Attendance records
- Assessments, scores, skills
- Events, registrations, invitations
- Billing (items, charges, invoices, receipts)
- Discounts y campaigns
- Scholarships
- Notifications y push
- Communication
- Roles y permissions
- AI types (scheduled reports, churn)
- Support tickets
- Employment y marketplace (early)
- Audit logs
```

El problema no es el modelo de datos. El problema es que hay ~40% de los schemas sin UI de uso correspondientes.

---

*Generado automaticamente por analisis de codebase. Fecha: 2026-03-26*
