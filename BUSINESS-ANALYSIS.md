# Business Model Analysis: Zaltyko SaaS

**Producto:** Zaltyko — Software de gestión para academias de gimnasia
**Fecha:** 2026-03-26
**Analista:** Claude Code
**MRR estimado actual:** ~€570-1,140/mes (30-60 academias Pro de ~150+ activas)

---

## Business Model Score: 52/100

> Grade: D+ — Freemium funcional pero con grietas críticas en monetización, conversión y retention

| Dimensión | Score | Peso | Ponderado |
|---|---|---|---|
| Modelo de Ingresos | 58/100 | 25% | 14.5 |
| Unit Economics | 45/100 | 20% | 9.0 |
| Customer Segments | 62/100 | 15% | 9.3 |
| Growth Strategy | 38/100 | 15% | 5.7 |
| Churn & Retention | 50/100 | 15% | 7.5 |
| Revenue Operations | 40/100 | 10% | 4.0 |
| **TOTAL** | | **100%** | **50.0** |

---

## 1. Modelo de Ingresos

### Estructura de planes actual

| Plan | Precio mensual | Precio anual | Ahorro anual | Límite atletas | Diferenciador clave |
|---|---|---|---|---|---|
| **Free** | 0€ | 0€ | — | 50 atletas | 1 academia + 5 coaches |
| **Pro** | 19€ | 182€ | 46€ (-20%) | 200 atletas | Academias ilimitadas + KPIs + evaluaciones |
| **Premium** | 49€ | 470€ | 118€ (-20%) | Ilimitados | API + soporte prioritario + auditoría multi-sede |

### Límites internos por plan (desde `src/lib/limits.ts`)

| Recurso | Free | Pro | Premium |
|---|---|---|---|
| Atletas | 50 | 50 (not 200*) | null |
| Clases | 10 | 40 | null |
| Grupos | 3 | 10 | null |
| Academias | 1 | null | null |

> **BUG CRÍTICO:** La landing (`pricing.tsx`) dice "200 atletas" en Pro, pero `limits.ts` aplica `athleteLimit: row?.athleteLimit ?? 50` con el plan Free defaults. El límite real de atletas para Pro es **50** según el schema DB (`athleteLimit: 50` hardcodeado en `getUserSubscription`), no 200. Esta inconsistencia destruiría confianza al hacer upgrade.

### Pricing Anchoring

- El modelo es correct pero el **annual-first toggle** en la UI fuerza a ver precios anuales (182€ Pro, 470€ Premium) sin alternativa mensual clara en la vista por defecto.
- El anchor "19€ → 29€ en Q3 2026" es una táctica inteligente de urgencia, pero llega 9 meses tarde.
- **Problema:** No hay **pricing tier for growing academies**. La brecha Free(50) → Pro(50*) → Premium(∞) no tiene un puente natural para academias con 51-100 atletas.

### Annual vs Monthly

- Descuento del 20% está implementado y visible, pero el **checkout de Stripe no tiene modo de subscription anual** configurado (ver `checkout-service.ts` — solo monthly price ID). Si un usuario selecciona "annual" en la UI, el checkout probablemente falla silenciosamente o cobra mensual.

### Trial Mechanics

- Trial de 14 días disponible en plan Pro (`pricing.tsx` → CTA "Probar 14 días gratis")
- Trial flag en `academies.isTrialActive` + `academies.trialEndsAt`
- `syncTrialStatus()` actualiza el flag si el trial expiró
- Sin embargo: **no hay email de recordatorio de trial approaching** (7 días, 3 días, 1 día antes)
- El trial otorga acceso completo a features Pro, pero no hay trackeo de usage para identificar churn risk durante el trial

### Hallazgo clave
**La mayor debilidad del modelo de ingresos es que la monetización es 100% por academia/plan y 0% por uso o valor.** No hay revenue adicional por: volumen de atletas facturados, coaches adicionales, integraciones, exportación de datos, o servicios de valor añadido.

---

## 2. Unit Economics

### ARPU Objetivo

```
ARPU = (Academias Free × 0€ + Academias Pro × 19€ + Academias Premium × 49€) / Total academias

Asumiendo 150+ academias totales, ~20% conversión Pro:
- Escenario conservador: 120 Free + 28 Pro + 2 Premium
- ARPU = (0 + 532 + 98) / 150 = 4.2€/mes
- ARPU anual = 50.4€

Esenario target: 60% Free + 30% Pro + 10% Premium:
- ARPU = (0 + 171 + 490) / 150 = 4.4€/mes
```

**ARPU objetivo realista: 4-8€/mes.** Muy bajo para un SaaS sostenible con el volumen actual.

### Free to Paid Conversion Math

```
Para que 1 academia Pro se autofinancie considerando el costo de servir Free:
- Costo Marginal de servir Free por academia ≈ 0 (pricing por academia, no por atleta)
- Costo real = overhead de infraestructura + soporte
- Para costo de servidor infra ≈ 2-5€/mes por academia activa

=> Necesitas ~150 Free para pagar 1 Pro en términos de infra
=> Necesitas ~500-1,000 Free para justificar 1 FTE de soporte
=> Con 150 academias actuales y 30 Pro, el modelo apenas se sostiene
```

**Ratio Free:Pro para sostenibilidad real: ~3:1 mínimo.** Con 150 academias y 30 Pro, el ratio es 4:1 — marginalmente sostenible si el CAC de Pro es bajo (es inbound).

### Pricing Competitivo en el Mercado Español

Comparativa con SaaS de nicho español:

| Producto | Rango precio | Target |
|---|---|---|
| Holded | 15-40€/mes | PYMEs generalistas |
| Factorial | 10-35€/mes | RRHH generalistas |
| Trainerize (intl) | $35-99/mes | Fitness coaches |
| **Zaltyko Pro** | **19€/mes** | **Academias gymnastics** |

**El pricing de 19€/mes es competitivo** para el mercado español — está por debajo de Holded y significativamente por debajo de Trainerize. La decisión de pricing es correcta para el posicionamiento Freemium en España/LATAM.

### Oportunidades de Upsell No Explotadas

1. **Cuota por atleta facturado:** La infraestructura existe (`athlete-fees.ts`) pero no se monetiza. Si Zaltyko cobrara 1-2€/atleta/mes a academias que ya gestionan cobros, el MRR se multiplicaría.
2. **Marketplace de integraciones:** GimnasticMeet (mencionado como "integración futura"), apps de streaming, apps de nutrición → revenue compartido.
3. **Módulo de competiciones:** Federaciones pagan por acceso a dati di atletas en formato estándar.
4. **API access monetizado:** Pro tiene "KPIs avanzados" pero Premium tiene "API extendida" — la diferencia no está clara en valor.

---

## 3. Customer Segments

### Segmentos Identificados

| Segmento | Plan | Tamaño real | Características |
|---|---|---|---|
| **Sedes satélite / iniciación** | Free | ~60% | 1-50 atletas, 1 academia, dueño=entrenador |
| **Academias establecidas** | Pro | ~20% | 50-150 atletas, 1-2 sedes, staff 3-5 coaches |
| **Redes y programas élite** | Premium | ~2% | 200+ atletas, 3+ sedes, director técnico |
| **No atendidos** | — | ~18% | — |

### Free: Academias en Formación

**Perfil:** Entrenador que abre academia propia, o academia con <50 atletas donde el dueño es trainer.

**Problema:** El plan Free es **demasiado generoso** para este segmento. 50 atletas + 5 coaches + 10 clases + 3 grupos cubre el 80% de las necesidades de una academia pequeña. La académica promedio española tiene 40-80 atletas (Fuente: contexto del proyecto). Esto significa que la mayoría de academias potenciales **nunca necesitan hacer upgrade**.

**Fix potencial:** Reducir Free a 20 atletas + 3 coaches + 5 clases para crear presión de upgrade natural.

### Pro: Academias Established

**Perfil:** Academia con 50-200 atletas, 2-3 coaches, necesidad de exportar datos para federaciones.

**El bug de los 50 atletas** afecta directamente a este segmento: si el límite real de Pro es 50 (no 200), entonces Pro no sirve para academias que说要 tener más de 50. Este es un ** blocker de revenue devastador**.

### Premium: Redes y Élite

**Perfil:** Grupo empresarial con 3-5 academias bajo una marca, o academia de élite que necesita auditoria multi-sede y soporte dedicado.

**Problema:** La propuesta de valor de Premium es vaga ("API extendida", "Auditoría multi-sede"). No hay un **case de uso concreto** para justificar 49€/mes vs 19€/mes. El "contactar a ventas" sugiere que Premium es realmente un producto enterprise disfrazado.

### Segmentos No Atendidos

1. **Clubes escolares/deporte federado** — gimnastic teams en schools/universidades tienen necesidades similares
2. **Academias de países LATAM** — el producto está en español pero no hay pricing en USD ni adaptaciones de billing (SEPA solo, sin MercadoPago/Stripe LATAM)
3. **Federaciones como clientes directos** — un contrato con RFEG podría ser 5,000-50,000€/año pero requiere features de datos agregados que no existen

---

## 4. Growth Strategy

### Estado Actual (del Marketing Audit: 69/100)

| Canal | Estado | Eficacia |
|---|---|---|
| SEO Orgánico | Base técnica buena, blog inexistente | Moderada |
| Redes sociales | Sin presencia activa documentada | Nula |
| Referral | No existe | Nula |
| Outbound | No existe | Nula |
| Partnerships/Federaciones | No iniciado | Nula |
| Paid ads | No documentado | Desconocido |

### Lo que Fuciona

- Inbound de academias que buscan en Google "software gestión gimnasio"
- Diferenciación vertical clara (software específico vs Excel)
- Freemium con barrera de entrada cero (trial sin tarjeta)
- Pricing launch price anchoring (19→29€ Q3 2026)

### Lo que Falta (Gaps Críticos)

**1. Referral Program (Impacto: ALTO, Esfuerzo: BAJO)**
No hay ningún loop de growth. Cada academia conoce 5-10 otras academias. Un programa "Invita a una academia → 1 mes gratis en Pro" es el growth loop con mayor leverage para este mercado niche.

**2. Federaciones como Canal B2B (Impacto: MUY ALTO, Esfuerzo: ALTO)**
RFEG + federaciones autonómicas (Cataluña, Andalucía, C. Valenciana...) son el canal B2B más poderoso:
- RFEG tiene ~300 clubs federados
- Cada club = 1 potencial Zaltyko (efecto cascada)
- Contrato institucional = MRR predecible de €5,000-50,000/año
- Viabilidad: Media-alta. Requiere: propuesta de datos agregados para selección de talento, módulo de competiciones federadas, y pitch a comités técnicos.

**3. Blog SEO (Impacto: MEDIO-ALTO, Esfuerzo: MEDIO)**
0 artículos, 0 páginas informacionales. Keywords de alto valor:
- "software para academias de gimnasia" (alta intención)
- "gestionar academia de gimnasia con Excel" (educacional, baja competencia)
- "cómo elegir programa para club de gymnastics"

**4. Integración GymnasticMeet (Mencionada en Premium)**
GymnasticMeet es la plataforma de resultados de competiciones de la RGEE. La integración es un **lock-in competitivo** enorme — si Zaltyko es la única forma de exportar datos a GymnasticMeet, se convierte en el proveedor obligatorio para clubs federados.

### Growth Math

```
Si 150 academias × 1 referencia por academia/año × 10% conversión referral × 19€/mes × 12 meses
= 150 × 0.1 × 0.1 × 228 = 342€/año en MRR incremental
= 28.5€/mes — marginal

Pero si federaciones: 1 contrato RFEG = 5,000-50,000€/año
= 417-4,167€/mes — 15-150x más que todo el referral program
```

**Conclusión:** El growth priority debería ser federaciones, no referral. Son 2-3 sales calls con ROI de 100x.

---

## 5. Churn & Retention

### Causas Probables de Churn

Basado en el análisis del codebase y el contexto de mercado:

| Causa | Probabilidad | Señal en código |
|---|---|---|
| Academia cierra / cambia de negocio | Alta | Sin tracking de churn reason |
| migration a competidor | Media | Sin diferenciador de lock-in claro |
| Percepción de "demasiado complejo" | Media-Alta | Onboarding de 6 pasos pero sin email de activación |
| No ven valor suficiente | Alta | Sin usage tracking, no hay NPS loops |
| Método de pago falla + no recovery | Media | Webhook de failed payment existe pero sin retry logic |
| Fin de trial sin follow-up | Alta | No hay email sequences de trial |

### Churn Report: MOCK DATA

El archivo `src/lib/reports/churn-report.ts` contiene **mock data hardcoded**:

```typescript
// Default reasons — hardcoded, not from real data
const reasons: ChurnReason[] = [
  { reason: "financial", count: Math.floor(totalChurned * 0.3), percentage: 30 },
  { reason: "relocation", count: Math.floor(totalChurned * 0.2), percentage: 20 },
  { reason: "dissatisfaction", count: Math.floor(totalChurned * 0.15), percentage: 15 },
  { reason: "other", count: totalChurned - Math.floor(totalChurned * 0.65), percentage: 35 },
];
```

**Esto es un indicador de que NO HAY churn analysis real implementada.** No hay forma de medir si el churn está mejorando o empeorando.

### Feature Retention Analysis

| Feature | Retención estimada | Por qué |
|---|---|---|
| Cobros automáticos | Muy alta | Elimina trabajo manual del director |
| Agenda semanal | Alta | Reemplaza WhatsApp/Spreadsheet |
| Evaluaciones técnicas | Media-Alta | Diferenciador, único en nicho |
| Seguimiento competir | Media | Solo para clubs federados |
| Dashboard KPIs | Media | Requiere contexto para ver valor |
| Registro competiciones | Baja | No hay integraciones federadas activas |

**La mayor feature de retención sería la integración real con GymnasticMeet + RFEG** — si los datos de atletas deben pasar por Zaltyko para competir, es casi imposible churning.

### ¿Es Free Demasiado Generoso?

**Sí, pero por la razón equivocada.**

50 atletas gratis cubre el 80% de las necesidades del segmento Free. El problema no es que sea "demasiado" en volumen, sino que **no hay progresión natural** hacia Pro. El upgrade solo se activa cuando:

1. Quieren una segunda academia (no saben que lo necesitan al inicio)
2. Quieren exportar para federación (no saben que lo necesitan)
3. Alcanzan los 50 atletas (pero la academia típica no crece linealmente)

**Free no tiene ningún "cebo de upgrade" implementado.** No hay trial de Pro con todas sus features visible desde el inicio. No hay un momento de "ahora necesitas federated export" que forcing a upgrade.

---

## 6. Revenue Operations

### Estado de las Revenue Operations

| Proceso | Implementado | Calidad |
|---|---|---|
| Trial start | Sí | Funcional |
| Trial end detection | Sí | `syncTrialStatus()` |
| Trial follow-up emails | **NO** | 0 emails de reminder |
| Trial-to-paid upgrade | Parcial | Checkout incompleto para annual |
| Payment failed recovery | Parcial | Email existe, retry logic no |
| Cancellation flow | **Parcial** | Marca en DB pero no cancela en Stripe |
| Usage tracking | **NO** | Analytics es placeholder |
| Churn detection | **NO** | Churn report = mock data |
| Upgrade nudges | **NO** | Solo LimitError en 402 |
| NPS / satisfaction surveys | **NO** | NPS 98% autodeclarado sin datos |

### Trial Follow-up Sequences

**No existen.** Solo hay:
1. `welcome-email.tsx` — email de bienvenida genérico (sin personalización por plan)
2. `trial_ended` event tracking (sin acción asociada)
3. No hay: email de día 1, día 3, día 7, día 10, día 13 de trial

### Onboarding y su Relación con Upgrade

El onboarding tiene 7 pasos con trackeo de eventos:

```
academy_activated = first_group_created + add_5_athletes + invite_first_coach
```

**Esto es bueno.** Pero:
- No hay correlación entre pasos completados y likelihood de upgrade
- No hay email basado en onboarding progress
- No hay "celebration" emails cuando se completa onboarding

### Usage Tracking

El archivo `analytics.ts` es un **placeholder real**:

```typescript
// Placeholder for future analytics provider integration (PostHog, Segment, etc.)
```

Todos los eventos se loggean pero no se miden. No hay:
- Feature adoption rates por plan
- Activation rate (academies que llegan a academy_activated)
- Time-to-value metrics
- Engagement scoring para churn prediction

**Sin datos de usage no hay forma de:**
1. Identificar churn risk antes de que cancelen
2. A/B test onboarding flows
3. Medir qué features generan mayor retención
4. Crear usage-based upgrade triggers

---

## 7. Revenue Opportunities (Prioritized by MRR Impact)

### Oportunidades de Revenue Ranked

| # | Oportunidad | MRR Impacto potencial | Confianza | Timeline |
|---|---|---|---|---|
| 1 | **Integración RFEG/Federaciones** | +€5,000-50,000/mes | Baja | 3-6 meses |
| 2 | **Fix bug athlete limit Pro (50→200)** | +€500-2,000/mes | Alta | 1 día |
| 3 | **Annual billing real en Stripe** | +€200-600/mes | Alta | 1 semana |
| 4 | **Trial email sequences (7-10 emails)** | +€300-800/mes | Media | 2 semanas |
| 5 | **Cancel flow real en Stripe** | +€100-300/mes | Alta | 1 semana |
| 6 | **Referral program** | +€100-500/mes | Media | 1 mes |
| 7 | **Cuota por atleta gestionado** | +€500-5,000/mes | Baja | 2-3 meses |
| 8 | **Payment retry logic** | +€100-300/mes | Alta | 1 semana |
| 9 | **Usage tracking (PostHog)** | +€200-600/mes (indirecto) | Media | 1 mes |
| 10 | **Blog SEO** | +€300-1,000/mes | Baja | 2-3 meses |

---

## 8. Top 5 Recommendations

### #1 — FIX CRITICAL BUG: Athlete Limit de Pro (IMMEDIATO)

**Archivo:** `src/lib/limits.ts`, línea 277

**Problema:** El `athleteLimit` de Pro es 50 según `getUserSubscription()`, pero la landing dice 200. Esta inconsistencia destruye confianza en el momento de upgrade y puede causar chargebacks.

**Fix:**
```typescript
// En getUserSubscription o en el schema plans para Pro:
// athleteLimit: 50 (Free) → 200 (Pro) → null (Premium)
```

**Impacto:** Sin fix, cualquier academia que upgrade a Pro esperando 200 atletas y se encuentra limitada a 50 churneara inmediatamente con sense de "me engañaron".

---

### #2 — INTEGRACIÓN STRIPE REAL: Annual Billing + Cancel Flow (1 semana)

**Archivos:** `src/app/api/billing/upgrade/route.ts`, `src/app/api/billing/cancel/route.ts`

**Problema:** Ambos endpoints tienen `TODO: integrate with Stripe` comments. Las suscripciones no se cancelan ni se cobran correctamente.

```typescript
// upgrade/route.ts línea 54:
// TODO: Integrar con Stripe para realizar el cobro del monto prorrateado

// cancel/route.ts línea 26:
// TODO: Integrate with Stripe to cancel subscription
```

**Fix:** Integrar `stripe.subscriptions.update()` para upgrade con prorrateo real y `stripe.subscriptions.cancel()` para cancel. Sin esto, el revenue se pierde en cada failed transaction.

---

### #3 — TRIAL EMAIL SEQUENCES (2 semanas)

**Agregar 6 emails al trial de 14 días:**

| Día | Email | Objetivo |
|---|---|---|
| 1 | Bienvenida + guía de inicio rápido | Reducir friction-to-value |
| 3 | "Ya tienes [X] atletas cargados" + tips | Aumentar activation |
| 7 | Mid-trial: "Cómo [academy similar] ahorró 10h/semana" | Conversion nudge |
| 10 | "Te quedan 4 días de trial" | Urgencia |
| 13 | "1 día restante — qué necesitas para decidir?" | Last-chance conversion |
| 15 | "Trial finalizado" + plan de acción para Free | Retention de downgrade |

**Impacto estimado:** Las secuencias de trial son el momento de mayor conversión en SaaS B2B. Un email de día 7 bien timed puede generar +10-20% conversión trial-to-paid.

---

### #4 — USAGE TRACKING: Implementar PostHog (1 mes)

**Archivo:** `src/lib/analytics.ts` — reemplazar placeholder con PostHog

```typescript
// Implementar:
// - trackEvent() → PostHog.capture()
// - identify() en signup/onboarding
// - feature flags para Pro/Premium features
```

**Métricas críticas a trackear:**
- `onboarding_completed` rate (target: >60% en 7 días)
- `first_payment_made` conversion
- `athlete_limit_reached` — trigger de upgrade
- `academy_activated` — activation event

**Impacto:** Sin esto, es imposible saber qué features generan retención, qué causa churn, o si el onboarding está funcionando.

---

### #5 — FEDERACIONES: Sales Motion B2B (3-6 meses)

**Estrategia:**
1. Crear landing page `/federaciones` con pitch específico
2. Preparar propuesta de "datos agregados de selección de talento"
3. Contactar RFEG + 3 federaciones autonómicas (Cataluña, Andalucía, C. Valenciana)
4. Ofrecer acceso enterprise para equipos técnicos federativos

**Pitch deck básico:**
- "Zaltyko tiene datos de 150+ clubs y 10,000+ atletas"
- "Podemos ayudar a identificar talento emergente para [competición]"
- "Integración GymnasticMeet = datos limpios para jueces"

**Impacto:** 1 contrato de federación = 1-3 años de MRR de 150 academias Pro.

---

## Anexo: Hallazgos Técnicos de Revenue

### Archivos con deuda de billing

| Archivo | Tipo de deuda | Prioridad |
|---|---|---|
| `src/lib/reports/churn-report.ts` | Mock data hardcoded | ALTA |
| `src/app/api/billing/upgrade/route.ts` | Stripe no integrado | ALTA |
| `src/app/api/billing/cancel/route.ts` | Stripe no integrado | ALTA |
| `src/lib/analytics.ts` | Placeholder, sin PostHog | ALTA |
| `src/lib/limits.ts` | athleteLimit Pro = 50 no 200 | ALTA |
| `src/lib/stripe/checkout-service.ts` | Solo monthly prices | MEDIA |
| `src/lib/billing/proration.ts` | Implementado pero no usado | MEDIA |
| `src/lib/email/triggers.ts` | Solo transactional, sin nurture | MEDIA |
| `src/lib/email/templates/welcome-email.tsx` | Genérico, sin referencia a trial/plan | BAJA |

### Schema DB — Observaciones

- `subscriptions` tiene `cancelAtPeriodEnd` pero no se usa en downgrade flow
- `academies.isTrialActive` + `trialEndsAt` es la forma correcta de tracking trial
- `plans` schema es correcto pero `priceEur` está en euros (integer, cents)
- No hay tabla de `subscription_changes` o `plan_change_history` para audit trail
- `billing_events` es excelente para debugging de Stripe

---

*Generado por Claude Code — Analysis Agent — 2026-03-26*
