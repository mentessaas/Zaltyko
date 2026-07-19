---
name: zaltyko-agent-structure
description: Estructura completa de agentes para operar Zaltyko 24/7
type: project
---

# Zaltyko - Estructura de Agentes 24/7

## Estado Actual del Proyecto

**Métricas:**
- ~71,795 líneas de código
- ~100+ páginas/rutas
- ~50+ tablas en base de datos
- 18 TODOs/FIXMEs pendientes
- Stack: Next.js 14, Supabase, Drizzle ORM, Tailwind, shadcn/ui

**Fortalezas:**
- Base técnica sólida
- Marketplace/Empleo ~80% completo
- AI Fase 1 implementado
- Sistema de billing configurado
- Documentación extensa

**Debilidades:**
- Build con warnings
- Testing coverage bajo
- Código necesita limpieza
- UX/UI mejorable

---

# AGENTE 1: Producto y Feature Development

## Mission
Construir y mejorar el producto constantemente, lanzando features que generen valor.

## Estado Actual
- Marketplace/Empleo: ~80% completado
- AI: Fase 1 completa
- Roadmap: Q1 2026

## Tareas Inmediatas (Sprint Actual)

### 1.1 Completar Marketplace/Empleo
- [ ] Schema advertising (falta crear src/db/schema/advertising.ts si no existe)
- [ ] API de advertising zones
- [ ] Componente AdBanner
- [ ] Páginas de detalle (marketplace/[id], empleo/[id])
- [ ] Formularios de creación (nuevo)
- [ ] Sistema de ratings para vendedores
- [ ] Navegación en navbar

### 1.2 AI Fase 2+ (Billing AI)
- [ ] Dashboard de predicción de ingresos
- [ ] UI para visualizar predicciones
- [ ] Alertas de riesgo de churn

### 1.3 AI Fase 3 (Attendance AI)
- [ ] Sistema de predicción de ausencias
- [ ] Alertas automáticas a padres
- [ ] Análisis de patrones de asistencia

### 1.4 AI Fase 4 (Communication AI)
- [ ] Chatbot para atención automática
- [ ] Respuestas automáticas comunes
- [ ] Integración con WhatsApp

## Métricas
- Features lanzadas por sprint
- Bugs en features nuevas
- Velocity del equipo

---

# AGENTE 2: Infraestructura y DevOps

## Mission
Mantener el sistema funcionando 24/7 con alto rendimiento y disponibilidad.

## Estado Actual
- Build funciona con warnings
- Production en Vercel
- Supabase como DB
- Sentry configurado

## Tareas Inmediatas

### 2.1 Estabilidad del Build
- [ ] Resolver warnings de rutas dinámicas
- [ ] Optimizar bundle size (analizar con next/bundle-analyzer)
- [ ] Configurar build caching

### 2.2 Monitoreo
- [ ] Dashboard de métricas en producción
- [ ] Alertas automáticas (Sentry)
- [ ] Logs centralizados
- [ ] Uptime monitoring

### 2.3 Base de Datos
- [ ] Optimizar queries lentas
- [ ] Indices faltantes
- [ ] Conexiones pooling
- [ ] Backup strategy

### 2.4 CI/CD
- [ ] Pipeline de deployment optimizado
- [ ] Testing automatizado en CI
- [ ] Rollback strategy

## Métricas
- Uptime: >99.9%
- Time to recovery: <15 min
- Build time: <5 min

---

# AGENTE 3: Calidad y Testing

## Mission
Asegurar que cada release funcione correctamente sin regresiones.

## Estado Actual
- Vitest configurado
- Playwright configurado
- Coverage bajo (~10-20% estimado)

## Tareas Inmediatas

### 3.1 Testing Coverage
- [ ] Aumentar coverage a 50% (unit tests)
- [ ] Tests de integración críticos (auth, billing)
- [ ] E2E tests para flows principales:
  - [ ] Login/Register
  - [ ] Onboarding
  - [ ] Crear academia
  - [ ] Añadir atleta
  - [ ] Cobrar mensualidad
  - [ ] Marketplace compra

### 3.2 Automatización
- [ ] GitHub Actions para tests
- [ ] Test on push to main
- [ ] Coverage gates (bloquear merge si <50%)

### 3.3 Bug Tracking
- [ ] Reproducir bugs reportados
- [ ] Tests de regresión para bugs corregidos

## Métricas
- Coverage: >50%
- Bugs en producción: <5%
- Regression rate: <2%

---

# AGENTE 4: UX/UI y Diseño

## Mission
Crear experiencias de usuario excepcionales que generen retención.

## Estado Actual
- shadcn/ui implementado
- Design system en docs/
- UI funcional pero mejorable

## Tareas Inmediatas

### 4.1 Mejoras UX Inmediatas
- [ ] Dashboard de atletas (prioridad alta)
- [ ] Mobile responsiveness completo
- [ ] Loading states y skeletons
- [ ] Error states改善
- [ ] Formularios con mejor validación UX

### 4.2 Design System
- [ ] Consolidar componentes duplicados
- [ ] Documentar patrones
- [ ] Theme consistente

### 4.3 Accesibilidad
- [ ] WCAG 2.1 AA compliance
- [ ] Keyboard navigation
- [ ] Screen reader support

## Métricas
- NPS: >40
- Tiempo para completar tareas: -20%
- Mobile engagement: +30%

---

# AGENTE 5: Marketing Digital

## Mission
Atraer tráfico cualificado y generar leads de calidad.

## Estado Actual
- Buyer personas documentado
- Pricing definido
- Messaging creado
- SEO básico

## Tareas Inmediatas

### 5.1 SEO
- [ ] Optimizar meta tags de todas las páginas
- [ ] Sitemap actualizado
- [ ] Schema.org markup
- [ ] Core Web Vitals: >90

### 5.2 Contenido
- [ ] Blog con artículos de valor (4/mes)
- [ ] Casos de éxito (2/mes)
- [ ] Guides para usuarios

### 5.3 Ads
- [ ] Google Ads setup
- [ ] Meta Ads setup
- [ ] Retargeting campaigns
- [ ] Landing pages para ads

### 5.4 Social Media
- [ ] LinkedIn presence
- [ ] Instagram/X content
- [ ] Community building

### 5.5 Email Marketing
- [ ] Welcome sequence
- [ ] Nurturing campaigns
- [ ] Re-engagement flows

## Métricas
- Tráfico: 10k/mes → 50k/mes
- Leads: 100/mes → 500/mes
- CAC: reducir 30%

---

# AGENTE 6: Ventas y Growth

## Mission
Convertir leads en clientes y hacer crecer el revenue.

## Estado Actual
- Planes: Free, Pro, Enterprise
- Pricing configurado
- Stripe + Lemonsqueezy integrados

## Tareas Inmediatas

### 6.1 Sales
- [ ] Demo flow optimizado
- [ ] Sales collateral (PDFs, videos)
- [ ] CRM setup (HubSpot, Pipedrive, etc)
- [ ] Lead scoring

### 6.2 Onboarding
- [ ] Automated onboarding flow
- [ ] Checklists de setup
- [ ] Success milestones

### 6.3 Growth
- [ ] Referral program
- [ ] Integrations marketplace
- [ ] Partnership program

## Métricas
- MRR: $0 → $10k/mes (mes 6)
- Clientes: 0 → 50 (mes 6)
- Churn: <5%/mes

---

# AGENTE 7: Customer Success

## Mission
Garantizar que cada cliente tenga éxito y se quede largo tiempo.

## Estado Actual
- Sistema de tickets implementado
- Onboarding en desarrollo

## Tareas Inmediatas

### 7.1 Soporte
- [ ] Help center / Knowledge base
- [ ] FAQ optimizado
- [ ] Chat en vivo (intercom, crisp)
- [ ] SLA definición

### 7.2 Onboarding
- [ ] Welcome emails sequence
- [ ] Setup wizard guiado
- [ ] Video tutorials

### 7.3 Feedback
- [ ] NPS surveys mensuales
- [ ] Customer interviews
- [ ] Product feedback loop

## Métricas
- NPS: >50
- Ticket resolution: <24h
- Retention: >90%/año

---

# AGENTE 8: Datos y Analytics

## Mission
Medir todo y generar insights accionables para el negocio.

## Estado Actual
- Analytics widgets en dashboard
- AI predictions en desarrollo

## Tareas Inmediatas

### 8.1 Analytics Stack
- [ ] Dashboard de métricas completo
- [ ] Product analytics (Mixpanel, PostHog)
- [ ] Funnel analysis
- [ ] Cohort analysis

### 8.2 KPIs
- [ ] Definir OKRs
- [ ] Dashboard ejecutivo
- [ ] Alertas de anomalías

### 8.3 AI/ML
- [ ] Predicción de churn
- [ ] Predicción de asistencia
- [ ] Segmentación de clientes

## Métricas
- Data-driven decisions: 100%
- Predictive accuracy: >80%

---

# AGENTE 9: Legal y Compliance

## Mission
Proteger el negocio de riesgos legales y regulatorios.

## Estado Actual
- TOS y Privacy Policy existen
- GDPR parcial

## Tareas Inmediatas

### 9.1 Compliance
- [ ] GDPR completo
- [ ] CCPA compliance
- [ ] Cookie policy

### 9.2 Legal
- [ ] Terms actualizados
- [ ] Privacy policy detallada
- [ ] DPA para clientes enterprise

### 9.3 Seguridad
- [ ] Penetration testing
- [ ] Security audit
- [ ] Vulnerability disclosure

## Métricas
- Compliance: 100%
- Incidentes de seguridad: 0

---

# AGENTE 10: Finanzas y Revenue

## Mission
Asegurar rentabilidad y control de costos.

## Estado Actual
- Stripe + Lemonsqueezy integrados
- Facturación automatizada

## Tareas Inmediatas

### 10.1 Pricing
- [ ] A/B testing de precios
- [ ] Descuentos y promociones
- [ ] Planes anual con descuento

### 10.2 Cost Control
- [ ] Monitoring de costos (Vercel, Supabase)
- [ ] Alerts de billing
- [ ] Optimización de recursos

### 10.3 Reporting
- [ ] P&L mensual
- [ ] MRR/ARR tracking
- [ ] Forecast

## Métricas
- MRR growth: >10%/mes
- Burn rate: <$2k/mes (al inicio)
- Unit economics: LTV:CAC >3:1

---

# PRIORIDADES Y TIMELINE

## Mes 1 (Marzo 2026)
**Foco: Producto + Marketing + Ventas**

| Semana | Agente Principal | Entregable |
|--------|------------------|-------------|
| 1 | Producto | Completar Marketplace |
| 2 | Marketing | SEO baseline, Landing page |
| 3 | Ventas | Demo flow, Sales deck |
| 4 | DevOps | Monitoreo completo |

## Mes 2 (Abril 2026)
**Foco: Growth + CS**

| Semana | Agente Principal | Entregable |
|--------|------------------|-------------|
| 1 | Growth | Referral program |
| 2 | CS | Help center, Onboarding |
| 3 | Producto | AI Fase 2 (Billing) |
| 4 | Marketing | Content calendar |

## Mes 3 (Mayo 2026)
**Foco: Escalabilidad**

| Semana | Agente Principal | Entregable |
|--------|------------------|-------------|
| 1 | Analytics | Dashboard completo |
| 2 | Testing | Coverage 50% |
| 3 | Producto | AI Fase 3 (Attendance) |
| 4 | Legal | Compliance completo |

---

# RECURSOS REQUERIDOS

## Herramientas Sugeridas

| Categoría | Herramienta | Costo |
|-----------|-------------|-------|
| Analytics | PostHog | $0-99/mes |
| Email | Resend | $0-49/mes |
| CRM | HubSpot Free | $0 |
| Chat | Crisp | $0-95/mes |
| Docs | Notion | $0-18/mes |
| Payments | Stripe | 2.9% + $0.30 |
| Hosting | Vercel | $0-100/mes |
| DB | Supabase | $0-70/mes |

## Budget Mensual Inicial
- **Sin revenue:** ~$200-500/mes
- **Con revenue:** 10-20% del MRR

---

# ACTION ITEMS INMEDIATOS

1. **Hoy:** Completar Marketplace/Empleo (20% restante)
2. **Esta semana:** Setup PostHog + SEO audit
3. **Esta semana:** Demo flow + Sales deck
4. **Próxima semana:** Help center básico
5. **Próxima semana:** CI/CD con testing automatizado

---

*Documento vivo - Actualizar mensualmente*
*Creado: 2026-03-17*
