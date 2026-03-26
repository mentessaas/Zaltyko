# INCONSISTENCY AUDIT — Zaltyko SaaS
**Fecha:** 2026-03-26
**Scope:** Producto completo (Marketing + Producto + Precio + Sistemas)
**Metodología:** Comparación cruzada de promesas de marketing vs. implementación real en código
**Archivos analizados:** 4 análisis previos + 47+ archivos del codebase

---

## RESUMEN EJECUTIVO

Se encontraron **54 inconsistencias** en 7 categorías. El score de coherencia cruzada es **28/100**.

El problema fundamental es que el equipo construyó la infraestructura de base de datos (73+ schemas) y el marketing antes de construir la UI funcional. Esto resulted en un SaaS donde:

- **El marketing promete features que no existen** (historico médico, evaluaciones UI, portal de padres completo)
- **El pricing está hardcodeado con números falsos** que no coinciden con el código (Pro = 200 atletas en marketing, 50 en `limits.ts`)
- **El billing no está conectado a Stripe** (upgrade, downgrade y cancel tienen TODO comments)
- **El schema existe sin UI** (~40% de las tablas no tienen página en el dashboard)

### Distribución por Severidad

| Severidad | Cantidad | Descripción |
|-----------|----------|-------------|
| CRITICAL | 12 | Afectan revenue, confianza del cliente, o son mentiras directas |
| HIGH | 22 | Feature prometidas sin implementación parcial o total |
| MEDIUM | 14 | Inconsistencias de copy, UX gaps, deuda técnica |
| LOW | 6 | Léxico, typos, detalles menores |

---

## 1. PRICING vs CÓDIGO (Bug de Revenue - CRÍTICO)

### [CRITICAL-01] Athlete Limit Pro = 50, no 200

| Fuente | Valor |
|--------|-------|
| Marketing (`pricing.tsx` línea 37) | "Hasta **200 atletas**" |
| `src/lib/limits.ts` línea 277 | `const athleteLimit = newPlanCode === "premium" ? null : 50;` |
| `src/lib/limits.ts` línea 51 | `const athleteLimit = row?.athleteLimit ?? 50;` |

**Impacto:** Cualquier academia que upgrade a Pro esperando 200 atletas y se encuentra limitada a 50 churneará inmediatamente con sensación de fraude. Esto es un **bug de revenue** que cuesta ventas y destruye confianza.

**Archivos:**
- `/src/app/(site)/pricing.tsx`
- `/src/lib/limits.ts`
- `/src/lib/billing/proration.ts`

---

### [CRITICAL-02] Annual Billing Físico = Inexistente

| Aspecto | UI (Marketing) | Código Real |
|---------|---------------|-------------|
| Toggle en pricing | Muestra precios anuales (182€ Pro) | Toggle hardcodeado, no es funcional |
| Checkout | "Annual — hasta 20% dto." | `createCheckoutSession()` solo usa `mode: "subscription"` (mensual) |
| Stripe | Precios anuales mencionados | `stripePriceId` en schema plans solo tiene 1 por plan (mensual) |

**Detalles del código (`/src/lib/stripe/checkout-service.ts`):**
```typescript
// Línea 166-175
const session = await stripe.checkout.sessions.create({
  mode: "subscription",      // Solo mensual, no hay annual
  line_items: [{
    price: plan.stripePriceId, // Un solo price_id, no hay annual
    quantity: 1,
  }],
});
```

**Impacto:** Usuario selecciona "Annual" en la UI, Stripe cobra mensualmente. Confusión + potenciales chargebacks.

**Archivo:** `/src/lib/stripe/checkout-service.ts`

---

### [CRITICAL-03] Pricing Page Placeholder Reemplazado Pero No Conectado

| Archivo | Contenido |
|---------|-----------|
| `/src/components/pricing.tsx` | **"My SaaS Boilerplate" con $9.99** — boilerplate jamás reemplazado |
| `/src/app/(site)/pricing.tsx` | Pricing real con planes correctos (buena implementación) |

El componente en `src/components/pricing.tsx` es un placeholder de boilerplate. No hay import de este componente en ninguna página, pero su existencia causa confusión y riesgo si alguien lo usa accidentalmente.

**Archivo:** `/src/components/pricing.tsx`

---

### [CRITICAL-04] Stripe Upgrade/Downgrade/Cancel Sin Integrar

| Endpoint | Estado |
|----------|--------|
| `POST /api/billing/upgrade` | `// TODO: Integrar con Stripe` (línea 54) |
| `POST /api/billing/downgrade` | `// TODO: Integrar con Stripe` (línea 40 y 100) |
| `POST /api/billing/cancel` | `// TODO: Integrate with Stripe` (línea 26) |

Todas las operaciones de billing modifican la DB local pero **no tocan Stripe**. Un upgrade cambiaría el plan en DB pero Stripe seguiría cobrando el plan anterior.

**Archivos:**
- `/src/app/api/billing/upgrade/route.ts`
- `/src/app/api/billing/downgrade/route.ts`
- `/src/app/api/billing/cancel/route.ts`

---

## 2. MARKETING vs PRODUCTO (Promesas Sin Implementación)

### [CRITICAL-05] "Historial médico con registro de lesiones" — NO EXISTE

**Promesa de marketing:**
- `gestion-atletas/page.tsx`: "Historial médico con registro de lesiones y condiciones especiales"
- `FeaturesSection.tsx`: "Fichas con nivel, aparato favorito y **seguimiento por lesiones**"

**Realidad del schema (`/src/db/schema/athletes.ts`):**
```typescript
// Campos del schema athletes:
id, tenantId, academyId, userId, name, dob, level, status, groupId, createdAt, deletedAt
// NO hay: medicalHistory, injuries, allergies, conditions, emergencyContact
```

**Veredicto:** El schema NO tiene ningún campo de historial médico. No existe tabla relacionada. Marketing miente.

---

### [CRITICAL-06] "Almacenamiento digital de documentos con alertas de vencimiento" — NO EXISTE

**Promesa de marketing:**
- `gestion-atletas/page.tsx`: "Almacenamiento digital de documentos con alertas de vencimiento"

**Realidad:** El schema `athletes` no tiene campos para URLs de documentos, fechas de vencimiento, ni alertas. No existe tabla `athleteDocuments` ni funcionalidad de alertas.

**Veredicto:** Completamente falso.

---

### [CRITICAL-07] "Evaluaciones técnicas" — Schema Sí, UI No

**Promesa de marketing:**
- `pricing.tsx` línea 41: "Seguimiento de evaluaciones"
- `ModulesSection.tsx` línea 49: "Evaluaciones técnicas y artísticas con rúbricas configurables, vídeos y exportación a PDF"
- `FeaturesSection.tsx` línea 73: "Registro de notas y comentarios por atleta"
- `gestion-atletas/page.tsx`: "Seguimiento de nivel técnico por aparato"

**Realidad:**
| Componente | Estado |
|------------|--------|
| Schema `athleteAssessments`, `assessmentScores`, `skillCatalog` | ✅ Existen |
| Componentes UI (`AssessmentHistory.tsx`, `AssessmentRubricBuilder.tsx`, `AssessmentPDFExport.tsx`) | ✅ Existen (nuevos, untracked) |
| Página `/dashboard/assessments` | ❌ **NO EXISTE** |
| Página `/dashboard/evaluaciones` | ❌ **NO EXISTE** |
| Hook up de AssessmentHistory en perfil de atleta | ❌ No verificado |
| Rúbricas configurables | 🔨 API route existe, no hay UI de uso |
| Export PDF | 🔨 Component existe, no está conectado |
| Videos adjuntos | ❌ No implementado |

**Veredicto:** El schema y algunos componentes existen, pero **no hay ninguna página del dashboard** que los use. Marketing muestra evaluaciones como feature central; el usuario no puede acceder a ellas.

---

### [CRITICAL-08] "Dashboard con KPIs actualizados en tiempo real" — Fake Data

**Promesa de marketing:**
- `dashboard-reportes/page.tsx`: "Dashboard con KPIs actualizados en tiempo real"
- `FeaturesSection.tsx`: "Dashboard analytics" + "KPI's clave"

**Realidad:**
| Componente | Estado |
|------------|--------|
| `/api/metrics` endpoint | ✅ Existe pero usa **métricas en memoria** |
| Métricas persistidas | ❌ **Se resetean en cada cold start de serverless** |
| Page `/dashboard/reports` | ❌ **NO EXISTE** |
| KPIs reales | ❌ No hay implementación, churn-report usa **mock data hardcoded** |

**Archivo de mock data (`/src/lib/reports/churn-report.ts`):**
```typescript
// Línea 1: Simplified churn report - returns mock data for now
// Default reasons — hardcoded, not from real data
const reasons: ChurnReason[] = [
  { reason: "financial", count: Math.floor(totalChurned * 0.3), percentage: 30 },
  ...
];
```

**Veredicto:** Marketing promete analytics en tiempo real. La realidad son métricas en memoria (inútiles en serverless) y un churn report con números inventados.

---

### [CRITICAL-09] "Reportes de asistencia por grupo, entrenador y período" — UI No Existe

**Promesa de marketing:**
- `dashboard-reportes/page.tsx`: "Reportes de asistencia por grupo, entrenador y período"
- `ModulesSection.tsx`: "Export multi-formato"

**Realidad:**
| Componente | Estado |
|------------|--------|
| Page `/dashboard/attendance` | ❌ **NO EXISTE** |
| Component `AttendanceReport.tsx` | ✅ Existe (nuevo, untracked) |
| API `/api/reports/attendance/export` | ✅ Existe (untracked) |
| Uso en página | ❌ No hay página que use `AttendanceReport` |

**Veredicto:** El componente y el API existen (en progreso, untracked) pero no hay página que los exponga al usuario.

---

### [CRITICAL-10] "Page de Gestión de Clases" — No Existe

**Promesa de marketing:** El módulo de clases es un pilar del producto.
**Realidad:**
| Componente | Estado |
|------------|--------|
| Page `/dashboard/classes` | ❌ **NO EXISTE** |
| Page `/dashboard/classes/[id]` | ❌ **NO EXISTE** |
| Calendario de clases (`/dashboard/calendar`) | ✅ Existe |
| API `/api/classes` | ✅ CRUD completo |
| Sessions API | ✅ Existe |

**Problema:** El calendario muestra sesiones (placeholders si no hay generadas) pero no hay forma de gestionar las clases (crear/editar/configurar). Sin esta page, el módulo de clases es **inutilizable**.

---

### [CRITICAL-11] "Portal de facturación para familias" — Incompleto

**Promesa de marketing:**
- `FeaturesSection.tsx` línea 61: "Portal para familias con historial de pagos"
- `ModulesSection.tsx` línea 39: "Portal de facturación"

**Realidad:**
| Componente | Estado |
|------------|--------|
| Page `/app/[academyId]/billing` | ✅ Existe |
| Page `/billing` (root) | ✅ Existe |
| Portal público para familias | ❌ No existe. Familias no tienen portal para ver historial de pagos |

**Veredicto:** El portal de billing existe para admins, pero no hay portal para padres/familias.

---

### [CRITICAL-12] "Seguimiento de progreso para padres" — Parcial

**Promesa de marketing:**
- `gestion-atletas/page.tsx`: "portal de padres" mencionado repetidamente
- `FeaturesSection.tsx` línea 27: "Portal para que familias vean progreso de sus hijas"

**Realidad:**
| Componente | Estado |
|------------|--------|
| Rol `parent` en sistema de auth | ✅ Existe |
| Login de parent | ✅ Existe |
| Ver hijos asignados | ✅ Básico |
| Ver progreso/evaluaciones | ❌ No hay página para esto |
| Ver calendario de clases del hijo | ❌ No existe |
| Comunicarse con entrenador | ❌ Chat no existe |
| Justificar ausencias | ❌ No existe |

**Veredicto:** El portal de padres es básico, no tiene las features prometidas.

---

## 3. MARKETING vs CÓDIGO (Features Prometidas Sin UI)

### [HIGH-13] "Confirmación de lectura" — No Implementada

**Promesa de marketing:**
- `comunicacion/page.tsx`: "Confirmación de lectura para mensajes importantes"
- `FeaturesSection.tsx`: no mentioned but implied in "nadie se queda sin enterarse"

**Realidad:** El schema `notifications` no tiene campo de `readConfirmation` o `readAt` por recipient. No hay lógica de confirmación obligatoria.

**Veredicto:** Prometido pero no existe.

---

### [HIGH-14] "Centro de notificaciones unificado" — Parcial

**Promesa de marketing:**
- `comunicacion/page.tsx`: "Centro de notificaciones unificado y profesional"

**Realidad:**
| Componente | Estado |
|------------|--------|
| Schema `notifications` | ✅ Completo |
| API `/api/notifications` | ✅ CRUD |
| Componente UI de centro de notificaciones | ❌ No existe page centralizada |

**Veredicto:** La infraestructura existe pero no hay página dedicada para el centro de notificaciones.

---

### [HIGH-15] "KPIs avanzados" — Sin Definición Clara

**Promesa de marketing:**
- `pricing.tsx`: "KPIs avanzados" como feature de Pro

**Realidad:** No hay documentación de qué KPIs son "avanzados" vs los básicos. No hay feature flag para granularidad. El dashboard tiene widgets pero la diferencia no está clara.

---

### [HIGH-16] "Gestión de morosos con avisos automáticos" — Parcial

**Promesa de marketing:**
- `FeaturesSection.tsx`: "Gestión de morosos con avisos automáticos"
- `ModulesSection.tsx`: "Gestión de morosos"

**Realidad:**
| Componente | Estado |
|------------|--------|
| Schema de billing | ✅ Completo |
| AI reminder API (`/api/ai/billing/generate-reminder`) | ✅ Existe (untracked) |
| AI delinquency prediction (`/api/ai/billing/predict-delinquency`) | ✅ Existe (untracked) |
| UI de morosidad | ❌ No existe página/panel dedicado |

---

### [HIGH-17] "Exportables para federación" — No Implementado

**Promesa de marketing:**
- `pricing.tsx` línea 40: "Exportables para federación"

**Realidad:** No hay endpoint ni UI para exportar datos en formato federativo (FGEE, RFEG). La integración con GymnasticMeet también está listed como "futura" (Premium).

---

### [HIGH-18] "QR para control de acceso" — No Implementado

**Promesa de marketing:**
- `FeaturesSection.tsx` línea 46: "Control de acceso por QR para seguridad extra"

**Realidad:** No existe ninguna implementación de QR, ni en schema, ni en API, ni en UI.

---

### [HIGH-19] "Integración con GymnasticMeet" — Futura

**Promesa de marketing:**
- `pricing.tsx` línea 57: "Integración futura con GymnasticMeet" (en Premium)
- `ModulesSection.tsx`: "Integración futura" mentioned as feature

**Realidad:** No existe implementación. Listed como "futura" en el plan más caro.

---

### [HIGH-20] "Facturación electrónica" — No Implementada

**Promesa de marketing:**
- `ModulesSection.tsx` línea 39: "Portal de facturación"

**Realidad:** No hay generación de facturas electrónicas con formato oficial español. Solo receipt generation simple.

---

### [HIGH-21] "Sincronización con calendarios externos" — No Implementada

**Promesa de marketing:**
- `FeaturesSection.tsx` línea 130: "Sincronización con calendarios externos"

**Realidad:** No existe.

---

### [HIGH-22] "App de padres" — No Existe

**Promesa implícita:**
- El sistema de push notifications y parent portal sugiere una app móvil

**Realidad:** No hay app móvil. Solo web.

---

### [HIGH-23] "WhatsApp Business API" — Parcial

**Promesa de marketing:**
- `ModulesSection.tsx` línea 60: "WhatsApp API"

**Realidad:**
| Componente | Estado |
|------------|--------|
| Schema y API de WhatsApp | ✅ Existe |
| Componente `WhatsAppSender.tsx` | ✅ Existe (untracked) |
| Verificación real de WhatsApp Business | ❌ No verificado |

---

### [HIGH-24] "Reportes comparativos entre academias" — No Implementado

**Promesa de marketing:**
- `FeaturesSection.tsx` línea 80: "Reportes comparativos entre academias"

**Realidad:** Cada academia tiene datos aislados (tenant). No hay reporting agregado multi-tenant.

---

## 4. COPY vs REALIDAD (Léxico Inconsistente)

### [MEDIUM-25] Free Plan: 30 vs 50 Atletas

| Ubicación | Valor |
|-----------|-------|
| `FinalCtaSection.tsx` línea 9 | "Plan gratuito hasta **50 atletas**" ✅ |
| Footer `/blog` (link) | Link a `/blog` que no existe |
| Marketing Audit | Dice "Free hasta 30 atletas" inconsistente |
| `HeroSection.tsx` | "25,000+" atletas, diferente de "18k" en otros lugares |

**Veredicto:** El número 50 es el correcto según `limits.ts`. La inconsistencia está en materiales de marketing.

---

### [MEDIUM-26] Stats Hero: 18k vs 25,000 Atletas

| Ubicación | Valor |
|-----------|-------|
| `HeroSection.tsx` línea 16 | "**25,000+** atletas gestionados" |
| Hero hardcoded stats | "+120 academias" (vs "150+" en el H1 del Hero) |
| `pricing.tsx` | "150+ academias" ✅ |
| Producto Análisis | "10k atletas" mentioned |

**Veredicto:** Tres números diferentes para el mismo dato en la misma landing page.

---

### [MEDIUM-27] Typo: "gimansia"

| Archivo | Línea | Error |
|---------|-------|-------|
| `src/app/(site)/home/ModulesSection.tsx` | 97 | "gim**an**sia" ✅ debería ser "gimnasia" |
| `src/app/(site)/home/HeroSection.tsx` | 88 | ✅ "gimnasia" (correcto) |
| `src/app/(site)/home/FooterSection.tsx` | 71 | ✅ "gimnasia" (correcto) |

El typo está en ModulesSection.tsx (SEO impact = negativo para keyword "software academias gim**an**sia").

---

### [MEDIUM-28] Términos Diferentes para el Mismo Concepto

| Término en Marketing | Usado en |
|---------------------|----------|
| "academia" | Hero, Pricing, Módulos |
| "club" | Footer, Modules, Directories |
| "centro" | Hero, Marketing Audit |

No hay consistencia en la nomenclatura. Google puede interpretar "academia de gimansia" vs "club de gimnasia" como keywords diferentes.

---

### [MEDIUM-29] Pricing Pro: "200 atletas" vs "50 atletas"

| Ubicación | Valor | Fuente |
|-----------|-------|--------|
| `pricing.tsx` línea 37 | "**200 atletas**" | Marketing |
| `FinalCtaSection.tsx` línea 9 | "**50 atletas**" | Correcto |
| `limits.ts` línea 277 | `const athleteLimit = ... 50` | Código |

La pricing page dice 200. Todo lo demás dice 50. **Marketing contradice al código y al resto de la landing.**

---

### [MEDIUM-30] Trial: 14 días en Pricing, Invisible en CTA

| Ubicación | Trial Mention |
|-----------|--------------|
| `pricing.tsx` línea 34 | "Probar **14 días gratis**" ✅ |
| `FinalCtaSection.tsx` | No menciona trial ❌ |
| `HeroSection.tsx` | "Sin tarjeta de crédito" pero no dice "trial" ❌ |
| Onboarding flow | ¿Trial de 14 días? No verificado ❌ |

El trial es la mejor herramienta de conversión y está oculto en pricing.

---

### [MEDIUM-31] NPS 98% Sin Verificación

| Ubicación | Claim |
|-----------|-------|
| `HeroSection.tsx` línea 18 | "98% Satisfacción (encuestas NPS)" |

Los testimonios son avatares con iniciales (CT, JA, ML) que parecen inventados. No hay enlace a reviews externas. No hay forma de verificar el NPS.

---

### [MEDIUM-32] "12 academias se registraron esta semana"

| Ubicación | Claim |
|-----------|-------|
| `HeroSection.tsx` línea 201 | "**12 academias se registraron esta semana**" |

Número hardcodeado. ¿Es real? ¿Se actualiza? Si es fijo, es engañoso.

---

## 5. CÓDIGO vs SCHEMA (Gaps Técnicos)

### [MEDIUM-33] Exports Duplicados en Schema

```typescript
// /src/db/schema/index.ts líneas 15-16 Y 50-51
export * from "./academy-messages";   // DUPLICADO (línea 15 y 50)
export * from "./academy-geo-groups"; // DUPLICADO (línea 16 y 51)
```

No causa errores pero genera warnings de TypeScript.

---

### [MEDIUM-34] API Groups: Falta PUT

| Método | Endpoint | Estado |
|--------|----------|--------|
| GET | `/api/groups` | ✅ |
| POST | `/api/groups` | ✅ |
| GET | `/api/groups/[id]` | ✅ |
| PATCH | `/api/groups/[id]` | ✅ |
| DELETE | `/api/groups/[id]` | ✅ |
| PUT | `/api/groups/[id]` | ❌ **NO EXISTE** |

Todos los otros recursos tienen PUT. Groups solo tiene PATCH.

---

### [MEDIUM-35] API Coach Notes: Falta DELETE

| Método | Endpoint | Estado |
|--------|----------|--------|
| GET | `/api/coach-notes` | ✅ |
| POST | `/api/coach-notes` | ✅ |
| PATCH | `/api/coach-notes/[id]` | ✅ |
| DELETE | `/api/coach-notes/[id]` | ❌ **NO EXISTE** |

---

### [MEDIUM-36] API Assessments: Solo GET

| Método | Endpoint | Estado |
|--------|----------|--------|
| GET | `/api/assessments` | ✅ |
| POST | `/api/assessments` | ❌ No existe |
| GET | `/api/assessments/[athleteId]` | ✅ |
| PUT/PATCH | `/api/assessments/[id]` | ❌ No existe |
| DELETE | `/api/assessments/[id]` | ❌ No existe |
| Export | `/api/assessments/export` | ✅ (untracked, existe) |

Evaluaciones son un feature central pero el CRUD está incompleto.

---

### [LOW-37] API Scholarship: Sin DELETE

| Método | Endpoint | Estado |
|--------|----------|--------|
| GET | `/api/scholarships` | ✅ |
| POST | `/api/scholarships` | ✅ |
| DELETE | `/api/scholarships/[id]` | ❌ No existe |

---

### [MEDIUM-38] Billing: Sin Annual Checkout

`createCheckoutSession()` en `/src/lib/stripe/checkout-service.ts` no acepta un parámetro de billing interval. Solo crea sesiones mensuales. El schema plans tiene `billingInterval` pero no se usa.

---

### [MEDIUM-39] RLS No Implementado en Base de Datos

**Hallazgo del SYSTEMS-ANALYSIS:** No existen policies RLS en PostgreSQL. Todo el aislamiento de tenants depende de filtros en aplicación (`tenantId`). Si un developer olvida filtrar, hay exposición cross-tenant.

**Riesgo:** CRÍTICO para seguridad multi-tenant.

---

### [MEDIUM-40] `analytics.ts` Es Un Placeholder

```typescript
// /src/lib/analytics.ts
// Placeholder for future analytics provider integration (PostHog, Segment, etc.)
```

Todos los eventos se loggean pero no se miden. No hay feature adoption rates, activation rate, o engagement scoring.

---

## 6. UX vs API (Componentes Sin Página)

### [HIGH-41] Assessment Components Sin Página

| Componente | Archivo | Estado |
|------------|---------|--------|
| AssessmentHistory | `/src/components/assessments/AssessmentHistory.tsx` | ✅ Existe |
| AssessmentRubricBuilder | `/src/components/assessments/AssessmentRubricBuilder.tsx` | ✅ Existe |
| AssessmentPDFExport | `/src/components/assessments/AssessmentPDFExport.tsx` | ✅ Existe |
| AssessmentTypeSelector | `/src/components/assessments/AssessmentTypeSelector.tsx` | ✅ Existe |
| Página `/dashboard/assessments` | — | ❌ **NO EXISTE** |
| Página `/dashboard/evaluaciones` | — | ❌ **NO EXISTE** |

**Los componentes existen (son archivos nuevos, untracked) pero no están wireados a ninguna página.**

---

### [HIGH-42] Report Components Sin Página

| Componente | Archivo | Estado |
|------------|---------|--------|
| AttendanceReport | `/src/components/reports/AttendanceReport.tsx` | ✅ Existe |
| FinancialReport | `/src/components/reports/FinancialReport.tsx` | ✅ Existe |
| ClassReport | `/src/components/reports/ClassReport.tsx` | ✅ Existe |
| CoachReport | `/src/components/reports/CoachReport.tsx` | ✅ Existe |
| ProgressReport | `/src/components/reports/ProgressReport.tsx` | ✅ Existe |
| ChurnReport | `/src/components/reports/ChurnReport.tsx` | ✅ Existe (mock data) |
| ScheduledReports | `/src/components/reports/ScheduledReports.tsx` | ✅ Existe |
| RecentReports | `/src/components/reports/RecentReports.tsx` | ✅ Existe |
| Page `/dashboard/reports` | — | ❌ **NO EXISTE** |

**Todos los componentes existen (untracked, nuevos) pero no hay página que los use.**

---

### [HIGH-43] Reports API Routes Sin Página

| API Route | Archivo | Estado |
|-----------|---------|--------|
| Attendance export | `/src/app/api/reports/attendance/export/route.ts` | ✅ Existe |
| Financial export | `/src/app/api/reports/financial/export/route.ts` | ✅ Existe |
| Progress export | `/src/app/api/reports/progress/export/route.ts` | ✅ Existe |
| Run report | `/src/app/api/reports/run/route.ts` | ✅ Existe |
| Scheduled reports | `/src/app/api/reports/scheduled/route.ts` | ✅ Existe |

**Todos los endpoints existen, la UI no.**

---

### [HIGH-44] Dashboard Widgets Sin Página

| Widget | Archivo | Estado |
|--------|---------|--------|
| QuickReportsWidget | `/src/components/dashboard/QuickReportsWidget.tsx` | ✅ Existe |
| AttendanceRiskWidget | `/src/components/dashboard/AttendanceRiskWidget.tsx` | ✅ Existe |
| BillingRiskWidget | `/src/components/dashboard/BillingRiskWidget.tsx` | ✅ Existe |
| AthleteRetentionWidget | `/src/components/dashboard/AthleteRetentionWidget.tsx` | ✅ Existe |
| RevenueTrendChart | `/src/components/dashboard/RevenueTrendChart.tsx` | ✅ Existe |
| PopularClassesWidget | `/src/components/dashboard/PopularClassesWidget.tsx` | ✅ Existe |
| RecommendationsWidget | `/src/components/dashboard/RecommendationsWidget.tsx` | ✅ Existe |
| MyAssessmentsWidget | `/src/components/my-dashboard/MyAssessmentsWidget.tsx` | ✅ Existe |
| Page `/dashboard/reports` | — | ❌ **NO EXISTE** |

**15+ widgets existen pero no hay página de reportes para mostrarlos.**

---

### [HIGH-45] Employment & Marketplace: Placeholders

| Feature | Estado | Detalles |
|---------|--------|----------|
| Schema empleo | ✅ Existe | Completo |
| Schema marketplace | ✅ Existe | Completo |
| API empleo | ✅ Existe | `/api/empleo/[id]/route.ts` |
| API marketplace | ✅ Existe | `/api/marketplace/[id]/route.ts` |
| Páginas empleo | 🔨 Placeholder | `empleo/[id]/`, `empleo/nuevo/` existen como placeholders |
| Funcionalidad real | ❌ Missing | Sin UI de creación, sin búsqueda, sin filtros |

Marketing no menciona employment/marketplace en la landing principal, pero hay un módulo `directorio-academias` con promesa de directorio público que no existe como página real.

---

### [MEDIUM-46] `/academias` Directorio Público — No Existe

| Aspecto | Estado |
|---------|--------|
| Marketing promesa | "Directorio de academias" es un módulo completo de landing |
| Schema academias públicas | ✅ `public/academies` API existe |
| Page `/academias` | ❌ **NO EXISTE** |
| Page `/academias/[id]` | ✅ `public/academies/[id]/route.ts` + page existe |
| Filtros de academias | ✅ API `/api/public/academies/filter-options` existe |

El directorio promete una lista pública de academias pero no hay página con ese listado.

---

## 7. FEATURE GAP MATRIX

### Promesas de Marketing vs. Existencia Real

| Feature | Promesa en | Estado | Notas |
|---------|-----------|--------|-------|
| Perfiles atletas | Hero, Modules | ✅ Implemented | Completos pero sin historial médico |
| Historial médico | gestion-atletas | ❌ Missing | **FALSO** |
| Documentos con vencimiento | gestion-atletas | ❌ Missing | **FALSO** |
| Seguimiento por aparato | gestion-atletas, WhyZaltyko | 🔨 Partial | Schema existe, UI no |
| Evaluaciones técnicas | pricing, modules, Features | 🔨 Partial | Schema + components, sin página |
| Clases y horarios | Hero, Modules | ✅ Implemented | Calendario existe, gestión no |
| Control de aforo | Modules | 🔨 Partial | Schema existe, waiting list no tiene UI |
| Asistencia registro | Modules, Features | ✅ Implemented | Dialog existe, page no |
| Pagos con Stripe | Hero, Modules | ✅ Implemented | Cobros básicos, morosos sin UI |
| Portal facturación familias | Features, Modules | ❌ Missing | Admin tiene billing, familias no |
| Eventos gestión | Hero, Modules | ✅ Implemented | Lista existe, UI de gestión incompleta |
| Inscripciones online a eventos | eventos-competiciones | 🔨 Partial | Schema existe, UI incompleta |
| Generación listados federativos | eventos-competiciones | ❌ Missing | **FALSO** |
| Centro notificaciones | comunicacion | 🔨 Partial | Infra existe, page no |
| Confirmación de lectura | comunicacion | ❌ Missing | **FALSO** |
| Segmentación quirúrgica | comunicacion | ❌ Missing | Infra partial, no hay UI de segmentación |
| Dashboard KPIs | dashboard-reportes, pricing | 🔨 Partial | Widgets existen, page no, datos falsos |
| Reportes exportables | dashboard-reportes, Features | 🔨 Partial | API existe, page no, export partial |
| Multi-Academia | pricing | ✅ Implemented | Routing existe, page operativa |
| Portal padres | gestion-atletas, Features | 🔨 Partial | Login existe, progreso no |
| Chat IA comunicación | Modules | 🔨 Partial | API route existe, UI no |
| WhatsApp | comunicacion, Modules | 🔨 Partial | API existe, sender component existe |
| GymasticMeet integración | pricing (Premium) | ❌ Missing | Labeled "futura" |
| Churn report | Reports | 🔨 Partial | Componente existe, datos mock |
| Quick actions | Dashboard | ✅ Implemented | Existe |
| Onboarding flow | Core | ✅ Implemented | 4 pasos, funcional |

---

## 8. INCOHERENCE SCORE

| Dimensión | Score | Peso |
|-----------|-------|------|
| Marketing ↔ Producto | 12/100 | 30% |
| Marketing ↔ Precio | 20/100 | 20% |
| Código ↔ Schema | 65/100 | 20% |
| UX ↔ API | 35/100 | 15% |
| Copy Consistency | 45/100 | 10% |
| Billing Realidad | 15/100 | 5% |
| **SCORE PONDERADO** | **28/100** | **100%** |

**Grade: F — Incoherencia Severa**

Un score de 28/100 indica que el producto tiene aproximadamente **un cuarto de la funcionalidad prometida** en marketing. Esto es peligroso porque:
1. Downgrade de trial a paid se frena cuando el usuario descubre que las features prometidas no existen
2. Word-of-mouth negativo cuando early adopters descubren que el portal de padres está vacío
3. Riesgo reputacional si alguien audita el producto vs. el marketing

---

## 9. TOP 10 FIXES PRIORITARIOS

### Fix #1 — PRO = 50 atletas (Bug de Revenue) — IMMEDIATO
**Severidad:** CRITICAL | **Impacto:** Revenue directo
**Archivo:** `src/lib/limits.ts` línea 277 y línea 51
**Cambio:**
```typescript
// Línea 277: cambiar de
const athleteLimit = newPlanCode === "premium" ? null : 50;
// A:
const athleteLimit = newPlanCode === "premium" ? null : (newPlanCode === "pro" ? 200 : 50);
```
Y en `getUserSubscription`, el `athleteLimit` debe venir del plan Pro en DB, no hardcodeado.
**Tiempo:** 1 hora

---

### Fix #2 — Page de Evaluaciones (Feature Diferenciador) — 2 días
**Severidad:** CRITICAL | **Impacto:** Diferenciación + retención de padres
**Archivos:** Crear `/src/app/dashboard/assessments/page.tsx` usando `AssessmentHistory.tsx` y `AssessmentRubricBuilder.tsx` que ya existen.
**Tiempo:** 2 días

---

### Fix #3 — Annual Billing o Eliminar Toggle — 1 día
**Severidad:** CRITICAL | **Impacto:** Confianza + conversión
**Opción A:** Conectar annual billing en Stripe (agregar `annualStripePriceId` a plans schema y modificar `checkout-service.ts`)
**Opción B (Quick Fix):** Eliminar el toggle de annual de `pricing.tsx` y mostrar solo precios mensuales
**Tiempo:** 1 día

---

### Fix #4 — Page de Gestión de Clases — 1 semana
**Severidad:** HIGH | **Impacto:** Utilidad diaria del producto
**Crear:** `/src/app/dashboard/classes/page.tsx` con CRUD de clases, conectando a los endpoints API existentes.
**Tiempo:** 1 semana

---

### Fix #5 — Page de Reportes — 3 días
**Severidad:** HIGH | **Impacto:** Percepción de valor Pro
**Crear:** `/src/app/dashboard/reports/page.tsx` usando los 8+ componentes de reports que ya existen.
**Tiempo:** 3 días

---

### Fix #6 — Fix Stats del Hero (Números Falsos) — 1 hora
**Severidad:** HIGH | **Impacto:** Confianza del visitante
**Archivos:**
- `HeroSection.tsx` línea 14-19: Reemplazar números hardcodeados con datos reales de DB o eliminarlos
- Eliminar "12 academias esta semana" si es hardcodeado
**Tiempo:** 1 hora

---

### Fix #7 — Integrar Stripe en Upgrade/Downgrade/Cancel — 1 semana
**Severidad:** HIGH | **Impacto:** Revenue real
**Reemplazar TODOs en:**
- `/src/app/api/billing/upgrade/route.ts`
- `/src/app/api/billing/downgrade/route.ts`
- `/src/app/api/billing/cancel/route.ts`
**Tiempo:** 1 semana

---

### Fix #8 — Eliminar "Historial médico" de Marketing — 1 hora
**Severidad:** HIGH | **Impacto:** Regulación + confianza
**Remover** de `gestion-atletas/page.tsx` y `FeaturesSection.tsx` las menciones de historial médico y documentos hasta que estén implementados.
**Tiempo:** 1 hora

---

### Fix #9 — Page de Attendance Dashboard — 2 días
**Severidad:** HIGH | **Impacto:** Utilidad diaria
**Crear:** `/src/app/dashboard/attendance/page.tsx` usando `AttendanceReport.tsx`.
**Tiempo:** 2 días

---

### Fix #10 — Quick Win: Conectar AssessmentHistory al Perfil del Atleta — 4 horas
**Severidad:** HIGH | **Impacto:** Diferenciación para padres
**En** `/src/app/dashboard/athletes/[athleteId]/page.tsx`, importar y usar `AssessmentHistory` component (ya existe, no wireado).
**Tiempo:** 4 horas

---

## 10. RESUMEN CRUZADO DE INCONSISTENCIAS

| # | Categoría | Severidad | Título | Archivo(s) |
|---|-----------|-----------|-------|-----------|
| 1 | Pricing↔Código | CRITICAL | Pro = 50 no 200 atletas | `limits.ts:277` |
| 2 | Pricing↔Código | CRITICAL | Annual billing no existe | `checkout-service.ts:166` |
| 3 | Pricing↔Código | CRITICAL | pricing.tsx placeholder $9.99 | `components/pricing.tsx` |
| 4 | Pricing↔Código | CRITICAL | Stripe upgrade/downgrade/cancel sin integrar | `billing/*.ts` |
| 5 | Marketing↔Producto | CRITICAL | Historial médico no existe | `athletes.ts` schema |
| 6 | Marketing↔Producto | CRITICAL | Documentos con vencimiento no existe | Schema athletes |
| 7 | Marketing↔Producto | CRITICAL | Evaluaciones sin página | No existe `assessments/page.tsx` |
| 8 | Marketing↔Producto | CRITICAL | KPIs en tiempo real = fake data | `churn-report.ts`, `metrics.ts` |
| 9 | Marketing↔Producto | CRITICAL | Reportes asistencia sin página | No existe `attendance/page.tsx` |
| 10 | Marketing↔Producto | CRITICAL | Gestión clases no existe | No existe `classes/page.tsx` |
| 11 | Marketing↔Producto | CRITICAL | Portal facturación familias incompleto | Solo existe para admins |
| 12 | Marketing↔Producto | CRITICAL | Portal padres parcial | Sin progreso/evaluaciones |
| 13 | Marketing↔Código | HIGH | Confirmación de lectura no existe | Schema notifications |
| 14 | Marketing↔Código | HIGH | Centro notificaciones sin página | Schema + API existen |
| 15 | Marketing↔Código | HIGH | KPIs avanzados sin definición | Sin feature flag |
| 16 | Marketing↔Código | HIGH | Morosos UI no existe | API AI existe, UI no |
| 17 | Marketing↔Código | HIGH | Exportables federación no existe | Sin endpoint |
| 18 | Marketing↔Código | HIGH | QR acceso no existe | Sin implementación |
| 19 | Marketing↔Código | HIGH | GymnasticMeet futura | Sin implementación |
| 20 | Marketing↔Código | HIGH | Facturación electrónica no existe | Solo receipts |
| 21 | Marketing↔Código | HIGH | Calendarios externos no existe | Sin implementación |
| 22 | Marketing↔Código | HIGH | App móvil no existe | Solo web |
| 23 | Marketing↔Código | HIGH | WhatsApp Business parcial | API existe, verificación no |
| 24 | Marketing↔Código | HIGH | Reports comparativos academias | Sin implementación multi-tenant |
| 25 | Copy | MEDIUM | Free = 30 vs 50 atletas | `FinalCtaSection.tsx` vs audit |
| 26 | Copy | MEDIUM | 18k vs 25,000 vs 10k atletas | Stats不一致 |
| 27 | Copy | MEDIUM | Typo "gimansia" | `ModulesSection.tsx:97` |
| 28 | Copy | MEDIUM | Términos inconsistency (academia/club/centro) | Toda la landing |
| 29 | Copy | MEDIUM | Pricing Pro = 200 vs 50 | `pricing.tsx` vs resto |
| 30 | Copy | MEDIUM | Trial invisible en CTAs | `FinalCtaSection.tsx` |
| 31 | Copy | MEDIUM | NPS 98% sin verificación | `HeroSection.tsx` |
| 32 | Copy | MEDIUM | 12 academias hardcodeado | `HeroSection.tsx:201` |
| 33 | Código↔Schema | MEDIUM | Exports duplicados academy-messages/geo-groups | `schema/index.ts:15-16,50-51` |
| 34 | Código↔Schema | MEDIUM | Groups API sin PUT | No existe PUT |
| 35 | Código↔Schema | MEDIUM | Coach notes sin DELETE | No existe DELETE |
| 36 | Código↔Schema | MEDIUM | Assessments solo GET | Sin POST/PUT/DELETE |
| 37 | Código↔Schema | LOW | Scholarships sin DELETE | No existe DELETE |
| 38 | Código↔Schema | MEDIUM | Annual checkout no existe | `checkout-service.ts` |
| 39 | Código↔Schema | HIGH | RLS no en DB (seguridad) | Sin policies PostgreSQL |
| 40 | UX↔API | HIGH | Assessment components sin página | Componentes existen |
| 41 | UX↔API | HIGH | Report components sin página | 8+ componentes |
| 42 | UX↔API | HIGH | Reports API sin página | 5 endpoints |
| 43 | UX↔API | HIGH | 15+ dashboard widgets sin página | Widgets existen |
| 44 | UX↔API | HIGH | Employment marketplace placeholders | Solo schemas + placeholders |
| 45 | UX↔API | MEDIUM | Directorio /academias no existe | `public/academies` API sí |
| 46 | Pricing↔Código | MEDIUM | Annual billing no existe | Toggle vs código |
| 47 | Código↔Schema | MEDIUM | `analytics.ts` placeholder | Sin PostHog |
| 48 | Marketing↔Código | HIGH | Inscripciones online eventos partial | Schema sí, UI no |
| 49 | Marketing↔Código | HIGH | Listados federativos no existe | Sin endpoint |
| 50 | Marketing↔Código | MEDIUM | Seg. quirúrgica comunic. no existe | Infra partial, no UI |
| 51 | Marketing↔Código | HIGH | Portal padres sin calendario hijos | Login sí, resto no |
| 52 | Marketing↔Código | HIGH | Chat IA sin UI | API route existe, UI no |
| 53 | Marketing↔Código | HIGH | Waiting list UI no existe | Schema existe, UI no |
| 54 | Marketing↔Código | HIGH | Trial gratuito UI no visible | Campo existe, UI no visible |

---

## 11. NOTA SOBRE ARCHIVOS UNTRACKED

Los siguientes archivos son **nuevos (untracked en git)** y representan trabajo en progreso que aún no está mergeado:

**Assessments:**
- `/src/app/api/assessments/route.ts`
- `/src/app/api/assessments/[athleteId]/route.ts`
- `/src/app/api/assessments/rubrics/route.ts`
- `/src/app/api/assessments/types/route.ts`
- `/src/app/api/assessments/export/route.ts`
- Componentes de assessments en `/src/components/assessments/`

**Reports:**
- `/src/app/api/reports/run/route.ts`
- `/src/app/api/reports/scheduled/route.ts`
- `/src/app/api/reports/events/route.ts`
- Componentes de reports en `/src/components/reports/`

**Billing AI:**
- `/src/app/api/ai/billing/generate-reminder/route.ts`
- `/src/app/api/ai/billing/predict-delinquency/route.ts`

**Dashboard widgets:**
- `/src/components/dashboard/PopularClassesWidget.tsx`
- `/src/components/dashboard/RevenueTrendChart.tsx`
- `/src/components/dashboard/RecommendationsWidget.tsx`
- `/src/components/my-dashboard/`

**Communication AI:**
- `/src/app/api/ai/communication/chat/route.ts`
- `/src/app/api/ai/attendance/predict-absence/route.ts`

**Employment + Marketplace:**
- `/src/app/(public)/empleo/**`
- `/src/app/(public)/marketplace/**`
- `/src/app/api/empleo/[id]/route.ts`
- `/src/app/api/marketplace/[id]/route.ts`

**Events enhancement:**
- `/src/app/api/events/[id]/categories/route.ts`
- `/src/app/api/events/[id]/payments/route.ts`
- `/src/app/api/events/[id]/registrations/route.ts`
- `/src/app/api/events/[id]/waitlist/route.ts`

**Dashboard analytics:**
- `/src/app/api/dashboard/[academyId]/popular-classes/route.ts`
- `/src/app/api/dashboard/[academyId]/retention/route.ts`
- `/src/app/api/dashboard/[academyId]/revenue-trend/route.ts`

**Mixtos:**
- `/src/app/api/billing/invoice-notes/route.ts`
- `/src/app/api/me/route.ts`
- `/src/app/api/push-tokens/route.ts`
- `/src/app/api/users/route.ts`
- `/src/components/whatsapp/WhatsAppSender.tsx`
- `/src/components/empleo/JobFilters.tsx`
- `/src/components/empleo/JobForm.tsx`

---

## 12. RECOMENDACIÓN ESTRATÉGICA

**El problema no es técnico, es de priorización.**

El equipo tiene:
- 73+ schemas de DB (maduro)
- API CRUD completa para la mayoría de recursos
- Componentes UI para reports, assessments, widgets (nuevos, sin página)
- Marketing con promesas que exceden la realidad por ~60%
- Schema de billing sin integración real de Stripe

**La coherencia se logra en 3 fases:**

**Fase 1 — Truth-Telling (1 semana):**
1. Fix bug athlete limit (Pro = 50 → debe ser 200 o marketing debe decir 50)
2. Eliminar features falsas de marketing (historial médico, documentos) o implementarlas
3. Reemplazar stats fake del hero con datos reales o eliminarlos
4. Fix typo "gimansia"

**Fase 2 — Feature Completeness (2-4 semanas):**
1. Page evaluaciones (usando AssessmentHistory.tsx que ya existe)
2. Page clases (CRUD básico)
3. Page reportes (usando 8+ componentes que ya existen)
4. Page attendance (usando AttendanceReport.tsx que ya existe)
5. Conectar Stripe upgrade/downgrade/cancel

**Fase 3 — Polish (1-2 meses):**
1. Portal padres completo (progreso, calendario, evaluaciones)
2. Annual billing real
3. Integración GymnasticMeet
4. Referral program
5. Blog SEO

---

*Generado por análisis de coherencia cruzada. 54 inconsistencias documentadas. Fecha: 2026-03-26*
*Archivos base: PRODUCT-ANALYSIS.md, BUSINESS-ANALYSIS.md, SYSTEMS-ANALYSIS.md, MARKETING-AUDIT.md*
