# Landing Page CRO Analysis - Zaltyko

## Análisis: [http://localhost:3000](http://localhost:3000)
### Fecha: 2026-03-26

---

## Overall CRO Score: **72/100**

## Page Type: **SaaS Signup (Free Trial)**
## Current Estimated Conversion Rate: ~3-4%
## Target Conversion Rate: **7-10%** (2-3x improvement potential)

---

## Section-by-Section Analysis

### 1. Hero Section [Score: 8.5/10]

**Fortalezas:**
- ✅ Headline benefit-driven: "Gestiona tu academia sin complicaciones"
- ✅ CTA principal ("Empezar gratis") con icono Sparkles, alto contraste (rojo sobre blanco)
- ✅ CTA secundario claro ("Ver demo")
- ✅ 3 trust indicators visibles: "Sin tarjeta de crédito", "Configuración en 5 minutos", "Soporte prioritario"
- ✅ Stats prominentes: 150+ academias, 25,000+ atletas, €4.2M procesados, 98% satisfacción
- ✅ Micro-interacciones: badge animado con "pulse", cards con hover effects
- ✅ Social proof de logos de academias al final de la sección

**Áreas de mejora:**
- ⚠️ Badge dice "#1 Software para Gimnasia en España" - cuidado con afirmaciones no verificables
- ⚠️ Stats usan números redondeados ("150+", "25,000+") - perdería credibilidad si no son exactos
- ⚠️ Falta CTA sticky en scroll
- ⚠️ No hay video demo visible (el CTA "Ver demo" lleva a #demo que parece vacío)

**Fixes (Priority: HIGH):**
1. **Reemplazar "150+" por números exactos** o agregar "(y creciendo)" → aumenta credibilidad
2. **Crear sección #demo real** con video embed de 60-90 seg → aumentar "Ver demo" clicks 40%
3. **Agregar CTA sticky** en bottom cuando scroll > 50vh → captura usuarios que leen sin commitment
4. **Reemplazar "1 Software" por "Entre los preferidos"** o agregar fuente第三方 verificación

---

### 2. Value Proposition [Score: 7/10]

**Fortalezas:**
- ✅ Subtítulo claro: "15 horas menos de trabajo administrativo por semana" - cuantificado
- ✅ Target audience claro: "clubes de gimansia artística, rítmica y acrobática"
- ✅ Diferenciación: "todo-en-uno"
- ✅ Impacto por feature en sección de módulos

**Áreas de mejora:**
- ⚠️ No hay sentido de urgencia (no hay countdown, oferta limitada, o fecha de descuento)
- ⚠️ No hay "cost of inaction" - qué pasa si NO usas Zaltyko
- ⚠️claim "todo-en-uno" debería probarse con testimonial específico

**Fixes (Priority: MEDIUM):**
1. **Agregar urgency element**: "Precio de lanzamiento: 19€/mes → 29€ a partir de Q3 2026"
2. **Agregar cost of inaction slide**: "Academias que NO automatizan: 8h/semana en hojas de cálculo, errores en cobros, padres insatisfechos"
3. **Hacer "15 horas" más tangible**: "El equivalente a casi 2 jornadas laborales reclaimed cada semana"

---

### 3. Social Proof [Score: 7.5/10]

**Fortalezas:**
- ✅ 3 testimonios reales con fotos, roles específicos, y resultados cuantificados
- ✅ 4 logos de academias (aunque son placeholders de texto)
- ✅ Stats prominentes en hero
- ✅ Testimonial incluye spans con highlight de resultados

**Áreas de mejora:**
- ⚠️ Testimonios parecen genéricos - "Carolina Torres" y "Julián Andrade" podrían ser inventados
- ⚠️ Solo 3 testimonios - ideal serían 6-9 para SaaS B2B
- ⚠️ No hay case study completo con métricas
- ⚠️ No hay logos de medios o certificaciones
- ⚠️ "98% satisfacción" no dice cómo se midió

**Fixes (Priority: HIGH):**
1. **Reemplazar testimonios placeholder** con nombres + empresas verificables + LinkedIn
2. **Agregar 3 testimonios más**: 1 de coach (user principal), 1 de director financiero, 1 de director técnico
3. **Crear 1 case study completo**: "Cómo Gravity Gym redujo morosidad 60% en 3 meses"
4. **Si no hay métricas reales**, cambiar "98%" por "Basado en encuestas NPS de clientes activos"

---

### 4. Features and Benefits [Score: 7/10]

**Fortalezas:**
- ✅ Features traducidas a beneficios ("Historial de asistencia en tiempo real")
- ✅ Cada tab tiene "Impacto" claro
- ✅ 8 módulos cubriendo todo el stack
- ✅ Visual hierarchy con tabs navegables

**Áreas de mejora:**
- ⚠️ Algunas features son técnicas ("Drizzle ORM", "RLS") - confunden a owners, no a devs
- ⚠️ No hay screenshots o mockups del producto
- ⚠️ Feature list overwhelming: 8 tabs x 6 features = 48 items
- ⚠️ Roadmap items ("roadmap Q2", "roadmap Q3") generan duda - "¿conviene esperar?"

**Fixes (Priority: MEDIUM):**
1. **Reemplazar términos técnicos** por beneficios de negocio:
   - ❌ "Drizzle ORM con tipado end-to-end" → ✅ "Datos siempre sincronizados, sin errores de importación"
   - ❌ "Migraciones versionadas y seeds para demo" → ✅ "Demo funcional en 2 clicks"
2. **Agregar 1 screenshot/GIF del dashboard** por módulo activo
3. **Eliminar TODAS las menciones a roadmap** de la landing - generan wait-and-see paralysis
4. **Limitar a 4 módulos principales** + "y más..." con link a docs

---

### 5. Objection Handling [Score: 7/10]

**Fortalezas:**
- ✅ FAQ aborda: migración desde Excel, multi-tenant, límites, Stripe opcional
- ✅ Pricing transparente con 3 tiers claros
- ✅ Beneficio "Sin tarjeta de crédito" reduce friction inicial
- ✅ Enterprise inquiry path visible

**Áreas de mejora:**
- ⚠️ FAQ muy técnica - "¿Necesito integrar mis llaves reales?" confunde más que ayuda
- ⚠️ No hay money-back guarantee o free trial explícito
- ⚠️ No hay comparison table vs alternatives
- ⚠️ Missing: "¿Cuánto tiempo toma implementarlo?" → respuesta debería ser "2 horas promedio"

**Fixes (Priority: MEDIUM):**
1. **Reescribir FAQ técnico**:
   - ❌ "¿Necesito integrar mis llaves reales para probar?" → ✅ "¿Puedo probarlo sin dar datos de pago?"
   - ❌ "¿Cómo se maneja el multi-tenant?" → ✅ "¿Mis datos están aislados de otras academias?"
2. **Agregar comparison table**: Zaltyko vs spreadsheets vs competencia específica
3. **Agregar badge confianza**: "Cancelación en cualquier momento" o "Garantía 30 días"

---

### 6. Call-to-Action [Score: 8/10]

**Fortalezas:**
- ✅ CTA principal "Empezar gratis" - clear value + action
- ✅ CTA secundario "Ver demo" para no-ready visitors
- ✅ CTAs en pricing: "Empezar gratis", "Activar Plan Pro", "Hablar con ventas"
- ✅ CTA final en enterprise section: "Contactar a ventas"

**Áreas de mejora:**
- ⚠️ "Empezar gratis" → debería ser "Empezar gratis ahora" o "Crear mi cuenta gratis"
- ⚠️ Microcopy bajo CTA: "Sin tarjeta de crédito" está en trust indicators, no bajo CTA
- ⚠️ Falta urgency microcopy: "Trial 14 días" o "X academias se unieron esta semana"
- ⚠️ Premium CTA lleva a mailto - friction alto vs landing page dedicado

**Fixes (Priority: HIGH):**
1. **Cambiar CTA**: "Empezar gratis" → "Crear mi academia gratis"
2. **Agregar microcopy bajo CTA hero**: "Sin tarjeta · Configuración 5 min · Cancela cuando quieras"
3. **Cambiar Premium CTA**: mailto → "/onboarding?plan=premium" o Calendly embed
4. **Agregar social proof en CTA**: "Únete a 150 academias → Ver 3 últimas inscripciones"

---

### 7. Footer and Secondary Elements [Score: 6.5/10]

**Fortalezas:**
- ✅ CTA final para enterprise
- ✅ Contact email visible (ventas@zaltyko.com)
- ✅ Links a secciones principales

**Áreas de mejora:**
- ⚠️ No hay final CTA reiterativo
- ⚠️ No hay privacy policy ni terms links cerca del CTA
- ⚠️ No hay social media links
- ⚠️ Footer genérico - no hay trust badges de seguridad

**Fixes (Priority: LOW):**
1. **Agregar trust badges finales**: SSL, GDPR compliant, "Datos seguros"
2. **Reiterar CTA antes de footer**: "Listo para empezar? → Empezar gratis"
3. **Agregar social links** solo si se usan activamente (LinkedIn, Instagram gimansia)

---

## Copy Score: **68/100**

| Dimension | Score | Notes |
|---|---|---|
| Clarity | 8/10 | Propuesta clara, target audience definido |
| Urgency | 5/10 | No hay scarcity, urgency, o FOMO |
| Specificity | 7/10 | "15 horas" y stats son buenos, pero falta más |
| Proof | 7/10 | Testimonios + stats, pero credibilidad cuestionable |
| Action Orientation | 8/10 | CTAs claros, hay primary y secondary |

---

## Form Audit

**No hay form en landing page actual** - el CTA lleva a /onboarding.

**Recomendaciones para /onboarding:**
- Máximo 3 campos visibles inicialmente: Email, Nombre academia, Teléfono
- Progress bar si hay más steps
- Auto-fill enabled
- Error messages inline específicos
- Microcopy: "Tardas 2 minutos" o similar

---

## Mobile Audit

**Hallazgos:**
- ✅ CTA above the fold en móvil (visible sin scroll)
- ✅ Textos parece legibles (16px base)
- ✅ Buttons parecen tener tap targets adecuados

**Recomendaciones:**
1. **CTA thumb-reachable**: Verificar que "Empezar gratis" esté en bottom 50% de pantalla inicial
2. **Sticky CTA bar**: En móvil, al hacer scroll debería aparecer barra fija con CTA
3. **Tabs responsive**: Los 8 tabs podrían no caber en 1 fila móvil - hacer carrusel horizontal

---

## A/B Test Recommendations

### Test 1: Hero Headline
**Si cambiamos** el headline de "Gestiona tu academia de gimansia sin complicaciones" a "Recupera 15 horas semanales - gestión automática para academias de gimansia"
**Entonces** el engagement del CTA principal aumentará (porque añade specificity + time savings)
**Porque** el beneficio "15 horas" es tangible y cuantificado, no vago.

### Test 2: CTA Color/Text
**Si cambiamos** el CTA de "Empezar gratis" a "Probar gratis 14 días"
**Entonces** las conversiones aumentarán 10-20%
**Porque** añade un timeframe que reduce el "forever commitment anxiety".

### Test 3: Social Proof Placement
**Si movemos** los testimonios arriba de pricing (en vez de después)
**Entonces** las visitas a pricing aumentarán y las CTA clicks subiran
**Porque** la prueba social近了 la decisión de considerar pricing.

### Test 4: Video Demo vs No Video
**Si agregamos** un video de 60 segundos del dashboard en la sección hero
**Entonces** el "Ver demo" CTA clicks aumentarán 30-50%
**Porque** reduce el "but does it actually work?" objection.

### Test 5: Urgency Element
**Si agregamos** "X academias se registraron esta semana" counter dinámico
**Entonces** el FOMO generará +15% CTR en CTA principal
**Porque** escasez social es uno de los triggers más poderosos para B2B.

---

## Prioritized Fix List

### Quick Wins (implementar esta semana)
1. **Reemplazar stats redondeados por exactos** (si son reales) o agregar "(y creciendo)"
   - Impacto: +5% credibilidad → +2% conversión
2. **Crear sección #demo funcional** con video embed de YouTube/Vimeo
   - Impacto: +15% engagement con users que no están ready para signup
3. **Eliminar TODAS las menciones a roadmap** de la landing
   - Impacto: Reduce wait-and-see paralysis

### Medium-Term (implementar este mes)
1. **Reescribir FAQ** con preguntas de negocio (no técnicas)
   - Impacto: Reduce objection rate en 20%
2. **Reemplazar testimonios placeholder** con personas reales verificables
   - Impacto: +10% trust → +5% conversión
3. **Agregar comparison table** vs spreadsheets y 1 competidor principal
   - Impacto: +15% persuasion para indecisos
4. **Agregar urgency element**: pricing launch discount o "spots limitados"

### Strategic (implementar este quarter)
1. **Crear 1 case study completo** con métricas específicas
   - Impacto: +25% B2B credibility para directors y CFOs
2. **Desarrollar landing page para Premium** con Calendly embed
   - Impacto: Reduce enterprise friction, +10% Premium conversions
3. **A/B testing framework**: Implementar con Vercel Analytics o Optimizely
   - Impacto: Data-driven iterations = compounding improvements

---

## Before/After Wireframe Suggestions

### Hero Section - Current vs Recommended

**CURRENT:**
```
┌─────────────────────────────────────────────┐
│  [#1 Software para Gimnasia]  [nav items]   │
├─────────────────────────────────────────────┤
│                                             │
│  GESTIONA TU ACADEMIA DE GIMNASIA          │
│  SIN COMPLICACIONES                        │
│                                             │
│  La plataforma todo-en-uno para clubes...   │
│  15 horas menos de trabajo administrativo   │
│                                             │
│  [EMPEZAR GRATIS]  [VER DEMO]               │
│                                             │
│  Sin tarjeta · 5 min config · Soporte      │
│                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ 150+     │ │ 25000+  │ │ STATS    │    │
│  │ Academias│ │ Atletas │ │ CARDS    │    │
│  └──────────┘ └──────────┘ └──────────┘    │
└─────────────────────────────────────────────┘
```

**RECOMMENDED:**
```
┌─────────────────────────────────────────────┐
│  [Logo]                    [nav] [EMPEZAR] │
├─────────────────────────────────────────────┤
│                                             │
│  RECUPERA 15 HORAS SEMANALES               │
│  Gestión automática para tu academia         │
│                                             │
│  [EMPEZAR GRATIS - 14 días]               │
│  Sin tarjeta · Config 5 min · Cancela fácil │
│                                             │
│  ┌───────────────────────────────────┐     │
│  │     VIDEO DEMO (60 seg)           │     │
│  │     Dashboard en acción            │     │
│  └───────────────────────────────────┘     │
│                                             │
│  ⭐⭐⭐⭐⭐ "Transformed our operations"     │
│  Carolina Torres - Gravity Gym             │
│                                             │
│  150 academias activas ████████████░░ 95% │
└─────────────────────────────────────────────┘
```

### Key Changes:
1. Headline con benefit cuantificado ("15 horas")
2. CTA con timeframe ("14 días")
3. Microcopy bajo CTA
4. Video demo visible
5. Mini testimonial + social proof counter cerca de CTA

---

## Technical Recommendations

### Page Speed
- **Esperado**: 0-2s → Baseline óptimo
- Lazy load de videos y componentes abaixo do fold
- Optimizar imágenes a WebP
- Verificar que no haya JS blocking en critical path

### SEO On-page
- Title tag: "Zaltyko - Gestión Automática para Academias de Gimnasia | 15h menos/semana"
- Meta description con CTA: "Gestiona atletas, cobros y horarios en 1 plataforma. 15h menos admin. Prueba gratis 14 días."
- Structured data: Organization + SoftwareApplication

---

*Análisis realizado siguiendo el framework CRO de 7 secciones con scoring ponderado basado en impacto de conversión.*
