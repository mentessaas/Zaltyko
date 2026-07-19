# Plan de Implementación Frontend - Zaltyko

## Estado Actual: ~85-90% Completado

El proyecto ya tiene una base sólida con:
- Autenticación completa
- Gestión de academias, atletas, entrenadores, clases
- Sistema de facturación con Stripe
- Panel de Super Admin
- Sitio público de marketing

---

## TAREAS PENDIENTES POR GRUPO

## GRUPO 1: MEJORAS PARA USUARIOS FINALES (Atletas, Padres, Entrenadores)

### 1.1 Dashboard Personal del Atleta/Parent
- [ ] Crear página `/app/[academyId]/my-dashboard` para que atletas/padres vean su propia actividad
- [ ] Mostrar próximas clases, asistencia, pagos pendientes
- [ ] Componente `MyScheduleWidget` - próximas clases del usuario
- [ ] Componente `MyAttendanceWidget` - historial de asistencia
- [ ] Componente `MyPaymentsWidget` - estado de pagos

### 1.2 Perfil Público de Entrenador Mejorado
- [ ] Mejorar `/app/[academyId]/coaches/[coachId]` con más secciones
- [ ] Agregar galería de fotos/videos
- [ ] Mostrar horarios de disponibilidad
- [ ] Sistema de reseñas/valoraciones

### 1.3 Centro de Notificaciones Mejorado
- [ ] Componente `NotificationCenter` más completo
- [ ] Preferencias de notificaciones por tipo
- [ ] Notificaciones en tiempo real (ya existe base)
- [ ] Integración con WhatsApp - UI para recibir notificaciones

### 1.4 App Mobile / PWA
- [ ] Optimizar para mobile-first en todas las páginas
- [ ] Mejorar manifest.json para PWA completo
- [ ] Notifications push
- [ ] Pantallas de splash custom

### 1.5 Portal de Pago para Padres
- [ ] Página `/app/[academyId]/billing/parent-view` simplificada
- [ ] Ver hijos asociados
- [ ] Pagar facturas fácilmente
- [ ] Historial de pagos

---

## GRUPO 2: MEJORAS PARA ADMINISTRADORES/DUEÑOS

### 2.1 Analytics Dashboard Avanzado
- [ ] Crear `/app/[academyId]/dashboard/analytics`
- [ ] Gráficos de retención de atletas
- [ ] Gráficos de ingresos por mes
- [ ] Gráficos de asistencia por clase/entrenador
- [ ] Métricas de crecimiento (nuevos atletas vs perdidos)
- [ ] Exportar reportes a PDF/Excel

### 2.2 Sistema de Mensajería Masiva
- [ ] Componente `BulkMessagingPanel`
- [ ] UI para enviar WhatsApp masivos
- [ ] Plantillas de mensajes
- [ ] Programar envíos
- [ ] Ver historial de envíos

### 2.3 Configuración de Academia Mejorada
- [ ] Página `/app/[academyId]/settings` completa
- - Logo y branding
- - Colores custom
- - Horarios de operación
- - Información de contacto
- - Redes sociales
- [ ] Editor visual de horarios

### 2.4 Reports Hub Mejorado
- [ ] Componente `ReportsHub` con más opciones
- [ ] Reporte de facturación por período
- [ ] Reporte de clases más populares
- [ ] Reporte de rendimiento de entrenadores
- [ ] Exportación a PDF/Excel

### 2.5 Gestión de Descuentos y Becas UI
- [ ] Mejorar `DiscountManager` con más opciones
- [ ] UI para crear campañas de descuento
- [ ] Panel de becas mejorado
- [ ] Historial de modificaciones

### 2.6 Audit Logs para Dueños
- [ ] Página `/app/[academyId]/audit-logs` completa
- [ ] Ver todos los cambios en la academia
- [ ] Filtrar por tipo, usuario, fecha
- [ ] Exportar logs

---

## GRUPO 3: PANEL SUPER ADMIN MEJORADO

### 3.1 Dashboard Super Admin v2
- [ ] Gráficos más detallados de crecimiento
- [ ] Métricas de churn (cancelaciones)
- [ ] Comparación entre tenants
- [ ] Alertas de anomalías

### 3.2 Gestión de Planes
- [ ] UI para crear/editar planes de suscripción
- [ ] Definir features por plan
- [ ] Preview de planes

### 3.3 Sistema de Tickets/Soporte
- [ ] Panel de tickets de usuarios
- [ ] Chat de soporte integrado
- [ ] Base de conocimiento

### 3.4 Configuración de Plataforma
- [ ] UI completa de settings
- - Emails automatizados
- - Plantillas de email
- - Webhooks
- - Integraciones

---

## GRUPO 4: MEJORAS GENERALES/UX

### 4.1 Búsqueda Global
- [ ] Mejorar `GlobalSearch` con más filtros
- [ ] Búsqueda por voz (opcional)
- [ ] Historial de búsquedas

### 4.2 Skeleton Loaders
- [ ] Agregar skeletons a todas las páginas que cargan datos
- [ ] Estados de carga más suaves

### 4.3 Empty States
- [ ] Mejorar mensajes de "no hay datos" en todas las tablas
- [ ] CTAs claros para crear primer elemento

### 4.4 Accesibilidad
- [ ] Audit de accesibilidad
- [ ] Soporte para screen readers
- [ ] Contraste de colores

### 4.5 Internacionalización (i18n)
- [ ] Preparar estructura para múltiples idiomas
- [ ] Agregar keys de traducción

---

## GRUPO 5: INTEGRACIONES

### 5.1 WhatsApp Business
- [ ] UI de configuración en settings
- [ ] Panel de envío de mensajes
- [ ] Templates de WhatsApp
- [ ] Estado de entrega

### 5.2 Stripe Connect (para multi-tenant)
- [ ] Onboarding de Stripe Connect
- [ ] Dashboard de payouts

### 5.3 Google Calendar
- [ ] Sincronización bidirectional
- [ ] Importar eventos

---

## PRIORIDADES DE IMPLEMENTACIÓN

### PRIORIDAD ALTA (Hacer primero)
1. Analytics Dashboard
2. Configuración de Academia
3. Centro de Notificaciones
4. Skeleton Loaders
5. Empty States

### PRIORIDAD MEDIA
1. Dashboard personal usuario
2. Reports mejorados
3. Audit logs
4. Búsqueda global

### PRIORIDAD BAJA
1. WhatsApp UI
2. i18n
3. PWA completo
4. Sistema de tickets

---

## AGENTES ESPECIALIZADOS ASIGNADOS

| Agente | Área | Tareas Principales | Estado |
|--------|------|-------------------|--------|
| @analytics-agent | Analytics | Dashboard avanzado, gráficos, reportes | ✅ Completado |
| @settings-agent | Settings | Configuración academia, branding | ✅ Completado |
| @ux-agent | UX/UI | Skeletons, empty states, accesibilidad | ✅ Completado |
| @user-dashboard-agent | User Dashboard | Dashboard personal para atletas/padres | ✅ Completado |
| @whatsapp-agent | WhatsApp | Integración WhatsApp UI | ✅ Completado |
| @audit-agent | Audit Logs | Logs de auditoría | ✅ Ya existía |

---

## RESUMEN DE IMPLEMENTACIONES COMPLETADAS (HIGH PRIORITY)

### 1. Analytics Dashboard ✅
- Archivo: `src/app/[academyId]/dashboard/analytics/page.tsx`
- Componente: `src/components/analytics/AnalyticsWidgets.tsx`
- API: `src/app/api/dashboard/[academyId]/analytics/full/route.ts`
- Características: 6 tipos de gráficos (Area, Bar, Pie, Line), filtros de fecha/clase/entrenador, exportación CSV

### 2. Settings de Academia ✅
- Página: `src/app/[academyId]/settings/page.tsx`
- Componentes: SettingsLayout, BrandingEditor, ScheduleEditor, SocialLinksEditor, TimezoneSelector
- API: `src/app/api/academies/[academyId]/settings/route.ts`
- Schema: Agregados campos de branding, schedule, stripe keys

### 3. Skeleton Loaders y Empty States ✅
- Skeletons: AthletesTableSkeleton, ClassesTableSkeleton, CoachesTableSkeleton, EventsGridSkeleton, AcademiesGridSkeleton, CalendarSkeleton
- Archivos loading.tsx: athletes, coaches, events, calendar, classes
- Empty States mejorados en tablas existentes

### 4. Dashboard Personal para Usuarios ✅
- Página: `src/app/[academyId]/my-dashboard/page.tsx`
- Widgets: MyScheduleWidget, MyAttendanceWidget, MyPaymentsWidget, MyProgressWidget

### 5. WhatsApp Integration ✅
- Componentes: WhatsAppSettings, WhatsAppMessagePanel, WhatsAppHistory
- Página: `src/app/[academyId]/whatsapp/page.tsx`
- APIs: `/api/whatsapp/send`, `/api/whatsapp/verify`

### 7. Reports Hub Mejorado ✅
- Dashboard principal con 6 tipos de reportes
- Reporte de clases, coaches, churn
- Filtros por fecha, clase, grupo
- Exportación PDF, Excel, Email
- Componentes: ReportCard, ReportFilters, ExportButtons

### 8. Búsqueda Global Mejorada ✅
- Command Palette con Cmd+K
- Búsqueda con debounce
- Historial de búsquedas recientes
- Filtros por tipo
- Navegación con teclado
- API de búsqueda mejorada

### 9. PWA y Mobile Experience ✅
- Manifest.json mejorado con icons, shortcuts
- Service Worker con cache strategies
- Offline support
- Push notifications setup
- Bottom navigation para mobile
- Pull to refresh
- Infinite scroll
- Error states

### 10. Centro de Notificaciones Mejorado ✅
- Página de notificaciones completa
- Preferencias por tipo y canal
- Filtros y búsquedas
- Badge con contador
- Realtime via Supabase
- Sonido de notificaciones

### 11. Panel Super Admin Mejorado ✅
- Dashboard existente con gráficos Recharts
- Stats cards con tendencias
- Gráficos de pastel, barras y área
