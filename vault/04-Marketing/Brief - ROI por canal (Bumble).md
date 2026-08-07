---
status: draft
owner: marketing
last_reviewed: 2026-08-02
fixes:
  - 2026-08-02: limpieza de glitches de generación en §4 y §5 (sin cambio de criterio)
source:
  - ../00-Inicio/Guia de trabajo para agentes.md
  - ./Mensajes aprobados.md
  - ./Metricas de marketing y producto.md
  - ./Buyer personas.md
---

# Brief — ROI por canal (Bumble)

> **DRAFT — uso interno.** Este brief está pensado para el rol que vaya a calcular ROI real por canal (en lo sucesivo "Bumble"). Define qué datos captura Zaltyko, qué fórmula aplica, y qué limitaciones tiene mientras no haya denominador real.
> Owner: Marketing (04643dd6). Lead proyecto GTM-DEP.

## 1. Para qué sirve este brief

Cuando el board pregunte "¿qué canal convierte más?" o "¿cuánto nos cuesta traer una academia?", este brief es la respuesta metodológica. Antes de Zaltyko GTM-DEP esa pregunta no tenía datos; ahora se puede responder con `canal_registro` + costos de campaña.

## 2. Datos disponibles al cierre de GTM-DEP

| Dato | Fuente | Tabla / columna |
|---|---|---|
| utm_source | ZAL-157 (UTM capture) | `academies.utm_source` |
| utm_medium | ZAL-157 | `academies.utm_medium` |
| utm_campaign | ZAL-157 | `academies.utm_campaign` |
| utm_term | ZAL-157 | `academies.utm_term` |
| utm_content | ZAL-157 | `academies.utm_content` |
| canal_registro (calculado) | ZAL-159 | `academies.canal_registro` |
| fecha de registro | ya en DB | `academies.created_at` |
| primer evento del visitante | ZAL-160 (page_view consentido) | `growth_events` |
| trial activado (si aplica) | ya en DB | `academies.trial_*` |
| suscripción pagada (si aplica) | ya en DB | `academies.stripe_subscription_id` |

> **Importante:** los datos page_view (ZAL-160) solo existen si el visitante aceptó consentimiento. Si rechazó, su recorrido pre-signup queda anónimo y el `canal_registro` se sigue poblando porque el signup ocurre después del rechazo/aceptación del banner y captura UTMs en sessionStorage. La atribución no se pierde.

## 3. Fórmula de ROI por canal

```
ROI_canal = (ingreso_atribuible_canal - costo_canal) / costo_canal
```

Donde:

- **ingreso_atribuible_canal** = suma del MRR (o NRR si hay anual) de las academias con `canal_registro = X` y estado activo, snapshot a la fecha de cálculo.
- **costo_canal** = inversión publicitaria pagada en `X` durante el período de análisis (input externo, no vive en Zaltyko).

**Fórmulas secundarias útiles:**

```
CAC_canal = costo_canal / academias_nuevas_con_canal_X_en_periodo
conversion_rate_canal = academias_nuevas_con_canal_X / visitantes_unicos_con_canal_X
LTV_por_canal (proxy) = ingreso_promedio_por_academia_en_canal_X * vida_util_promedio_estimada
```

> **LTV real** requiere datos de churn (≥6 meses de operación), fuera del scope inmediato.

## 4. Límites del cálculo

- **Atribución first-touch only:** una academia que llega por Instagram y luego busca Zaltyko en Google se atribuye a `social` (Instagram), no a `organic`. Esto subestima el efecto de búsqueda asistida. Cualquier interpretación comparativa con benchmarks externos debe aclarar el modelo.
- **Sin UTM = `direct`:** no sabemos si ese tráfico es boca a boca, tráfico de email sin UTMs, o tráfico sin firma. Bumble debe reportar `direct` con una sub-partición cualitativa (muestra de referral si hay, o etiquetado manual de fuentes conocidas).
- **Costo por canal es input externo:** Google Ads, Meta Ads y TikTok Ads cada uno tiene su plataforma de costos; el consolidado debe venir del registro de campañas, no de Zaltyko.
- **Período mínimo de análisis:** hasta tener ≥30 días de operación con UTM capturado por canal, los números son ruidosos. Mientras tanto, mostrar denominadores y `sin base` donde corresponda.

## 5. Canales a reportar (lista canónica)

Coherente con la taxonomía validada en [[Brief - Taxonomía y atribución GTM (DRAFT)]]:

| Canal | Incluye | Notas |
|---|---|---|
| paid | google_ads, meta_ads, tiktok_ads | Más sensible a CAC; comparar campañas dentro de canal antes que entre canales |
| social | instagram, tiktok, facebook, linkedin, whatsapp | whatsapp es social (no direct) por decisión de taxonomía |
| email | resend_email | Inbound post-onboarding; comparar contra tasas de apertura Resend |
| organic | google_organic | SEO maduración lenta; baseline antes de iniciativas de contenido |
| direct | sin UTM válido | Sub-particionar cualitativamente |

## 6. Cómo presentar al board / Bumble

Plantilla de informe (mensual o por hito):

```
Período: YYYY-MM-DD → YYYY-MM-DD
Total academias nuevas: N
Con UTM válido: N_utm (%)
Con canal_registro = paid: N_paid
Con canal_registro = social: N_social
Con canal_registro = email: N_email
Con canal_registro = organic: N_organic
Con canal_registro = direct: N_direct

CAC estimado por canal (si hay inversión publicitaria registrada):
- paid:   USD/academia
- social: USD/academia
- email:  USD/academia
- organic: USD/academia (proxi: costo contenido SEO)
- direct: no aplica (sin costo directo)

ROI estimado:
- paid:   X% (con base N_paid ≥ 5)
- social: X% (con base N_social ≥ 5)
- ...
```

Reglas de honestidad:

- Si `N_canal < 5`, marcar como `muestra insuficiente — no reportar`.
- Si `N_total < 30`, marcar el informe completo como `cohorte temprana — no comparar con benchmarks`.
- Nunca publicar cifras absolutas de ahorro o revenue sin base mínima.

## 7. Lo que NO hace este brief

- No calcula ROI multi-touch (fuera de scope MVP).
- No incluye costos de tooling externo (PostHog, Supabase, Brevo) en el cálculo de ROI por canal; son costos fijos de plataforma.
- No incluye LTV real hasta tener ≥6 meses de churn observable.
- No reemplaza el dashboard de crecimiento de Fase 4 (`growth_events`); lo complementa con `canal_registro` como atribución first-touch.

## 8. Próximos pasos

1. **Cuando `canal_registro` tenga denominador** (≥10 registros válidos), Bumble puede correr la primera versión del informe.
2. **Cuando ZAL-160 (page_view consentido) esté en producción**, añadir la tasa de conversión visitante→signup por canal como métrica secundaria.
3. **Cuando haya inversión publicitaria pagada real**, comparar CAC Zaltyko vs benchmarks de la vertical (cuidando muestra).
4. **Próximo paso inmediato (este lead)**: registrar este brief en ZAL-191 como work product de coordinación.