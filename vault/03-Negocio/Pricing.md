---
status: active
owner: negocio
last_reviewed: 2026-07-12
source:
  - ../BUSINESS-ANALYSIS.md
  - ../docs/marketing/zaltyko-pricing.md
  - ../src/lib/limits.ts
  - ../04-Marketing/Estrategia competitiva gimnasia.md
---
# Pricing

## Fuente de verdad comercial

Esta nota debe revisarse antes de cambiar landing, checkout, limites de plan o discurso de ventas.

## Planes documentados

| Fuente | Planes | Nota |
| --- | --- | --- |
| Catalogo actual | Free, Starter, Growth, Network | `src/lib/plans/catalog.ts` mapea `free` = Free, `pro` = Starter, `premium` = Growth y `network` = oferta comercial acompanada. |
| DB/checkout | `free`, `pro`, `premium` | `plans.code` y `/api/billing/checkout` usan estos codigos internos. Network no tiene checkout autoservicio en v3.0. |
| Estrategia antigua | Starter, Professional, Business, Enterprise | Documento de marketing; no es la implementacion actual. |
| Analisis antiguo | Free, Pro, Premium | Detectaba bug historico; parte ya esta corregida por `PRODUCT_PLANS`. |

## Fuente de verdad tecnica actual

| Capa | Fuente | Estado |
| --- | --- | --- |
| Copy publico | `src/app/(site)/pricing.tsx` + `src/lib/plans/catalog.ts` | Usa Free/Starter/Growth/Network v3.0. |
| Limites de producto | `src/lib/plans/catalog.ts` y tabla `plans` | Free 30 gimnastas, Starter 75, Growth 200; todos con 1 academia. Network multi-sede acompanado. |
| Enforcements | `src/lib/limits.ts` | Lee limites desde el catalogo canonico y permite override de atletas/academias desde `plans`. |
| Checkout activo | `src/app/api/billing/checkout/route.ts` | Owner-only, usa `plans.stripePriceId`, `mode: subscription`, metadata de academia e idempotencia. |
| Checkout viejo | `src/app/api/stripe/checkout/route.ts` | Deprecated 410. |
| Sync Stripe | `src/lib/stripe/sync-plans.ts` | Solo acepta metadata `plan_code` explícita y precios canónicos mensuales 19/49 EUR; no sobrescribe límites de producto. |

## Inconsistencias a resolver

| Tema | Riesgo | Accion |
| --- | --- | --- |
| Annual billing | UI muestra anual solo como "proximamente", sin calcular precio ni descuento; checkout usa un `stripePriceId` mensual por plan. | Implementar price anual real antes de permitir compra o anunciar descuento. |
| DB seed placeholders | `scripts/seed.ts` usa `price_pro_PLACEHOLDER` y `price_premium_PLACEHOLDER` si faltan env vars. | En entornos reales ejecutar `pnpm stripe:sync` o setear `SEED_STRIPE_PRICE_*`. |
| Cambios de plan | Checkout contrata; Stripe Billing Portal cambia o cancela. Los endpoints manuales legacy devuelven 410. | Mantener una sola fuente de verdad y tests de webhooks. |
| Nombres historicos | Docs antiguas hablan de Professional/Business o Free/Pro/Premium publico. | Usar Starter/Growth/Network en marketing; free/pro/premium solo interno. |
| Growth multi-academia | Growth ya no promete academias ilimitadas en v1 comercial. | Mantener `academyLimit: 1` y vender Network para multi-sede acompanado. |
| Network | Valor diferencial ligado a multi-sede acompanada, limites amplios, reportes y soporte. | Sin checkout ni promesa de integraciones custom/SLA hasta tener alcance firmado. |

Nota de ejecucion 2026-07-12: inicio, anti-abuso, expiracion a Free, conversion y avisos del trial ya estan implementados y su migracion esta aplicada. El claim puede publicarse junto con la promocion verificada de Fase 1; antes de esa promocion, el código sigue siendo release candidate.

Los registros `plans` de Supabase quedaron sincronizados e idempotentes: Free 30, Starter (`pro`) 75 y Growth (`premium`) 200, una academia cada uno. Los Prices Stripe live conservan 19/49 EUR mensuales y sus productos/metadata ya usan Starter/Growth.

## Pricing v3.0 activo

Estado: decision activa desde 2026-06-24. Se publica sin esperar entrevistas.

Zaltyko adopta una estrategia freemium agresiva con monetizacion diferida por comunidad. La investigacion competitiva muestra que ninguna herramienta del segmento ofrece plan free util (Clupik tiene free limitado, iClassPro/Jackrabbit/Sawyer no tienen free, WellnessLiving/Amilia solo demo). Ademas, el ICP (academias pequenas/medianas de gimnasia artistica/ritmica en espanol que hoy operan con Excel + WhatsApp + papel) tiene presupuesto low-touch y mucha friccion a pagar antes de ver valor.

La tesis estrategica de Zaltyko no es maximizar revenue por academia sino **construir la mayor comunidad de academias de gimnasia hispanohablantes del mundo**. El SaaS es la loss-leader; el dinero viene despues por upsells, marketplace, eventos, publicidad y partnerships. Por eso el free debe ser agresivo y el starter muy bajo.

Regla clave: **un solo precio equilibrado para todo el mercado hispano (Espana + LATAM)**. Sin diferenciacion por pais para reforzar la identidad de comunidad global y simplificar operaciones.

## Empaquetado oficial v3.0

Estado: oficial para producto, marketing, landing y limites.

**Trial + Free + planes pagados unicos para todo el mercado hispano.**

| Plan | Precio unico | Gimnastas | Sedes | Feature principal | Disparador de upgrade |
| --- | --- | --- | --- | --- | --- |
| **Trial 7 dias** | 0 € (sin tarjeta) | hasta 75 | 1 | Todas las funciones y limites del Starter activas. | Downgrade automatico a Free al dia 7. Un trial por academia cada 12 meses. |
| **Free** | 0 €/mes perpetuo | hasta 30 | 1 | Crear academia, gimnastas, grupos/clases, asistencia basica, comunicacion interna limitada. | >30 gimnastas O activar portal padres completo O activar pagos recurrentes. |
| **Starter** | **19 €/mes** (≈ 20 USD) | hasta 75 | 1 | Pagos/cuotas recurrentes, portal padres completo, reportes basicos, progresion tecnica, comunicacion interna. | >75 gimnastas O necesidad de automatizaciones O reportes ejecutivos. |
| **Growth** | 49 €/mes (≈ 52 USD) | hasta 200 | 1 | Todo Starter + automatizaciones, reportes ejecutivos, add-ons premium, soporte prioritario. | >200 gimnastas O multi-sede. |
| **Network** | 99 €/mes (≈ 105 USD) | ilimitado | multi-sede | Todo Growth + multi-sede acompanada, reportes de direccion y soporte prioritario. | Bajo onboarding acompanado (ver [[Decisiones#2026-06-22 - V1 comercial con una academia por cliente]]). |

Fee de procesamiento: **0 € markup sobre Stripe directo**. La promesa es "pagas lo que Stripe cobra, sin sorpresas".

### Por que 19 €/mes unico para Espana + LATAM

- **Espana**: 19 € esta claramente por debajo de Clupik Basic (35-39 €) y Clupik Pro (49 €). Posiciona Zaltyko como "asequible, no barato" (cumple principio de [[Estrategia competitiva gimnasia]]).
- **LATAM**: ~20 USD = ~370 MXN / ~80.000 COP / ~20.000 ARS. Para una academia mexicana de 30 gimnastas que factura ~30.000 MXN/mes, 370 MXN (1,2%) es invisible. Para una academia argentina, ~20 USD es accesible.
- **Jackrabbit Starter**: $49 USD (~46 €). Zaltyko a 19 € es **60% mas barato** que el SaaS infantil/gimnasia mas accesible de USA.
- **Redondo y memorable**: 19 €/$20 USD es un numero facil de defender y explicar en demo.

### Por que Free hasta 30 gimnastas + Trial 7 dias sin tarjeta

- **Free 30 gimnastas** cubre la academia que hoy NO cobra cuotas mensuales (vive de masterclass/eventos) o la academia recien creada. Cuando llega a 31 gimnastas regulares, ya esta cobrando cuotas → upgrade natural.
- **Trial 7 dias sin tarjeta** elimina la friccion "¿y si pago y no me sirve?". El ICP (entrenadora ocupada) abandona si le pides tarjeta. Un trial por academia cada 12 meses evita abuso.
- **Diferenciador unico**: ningun competidor serio del segmento (Clupik, iClassPro, Jackrabbit, Sawyer, ClassForKids, Amilia) combina free util + trial sin tarjeta + starter bajo. Zaltyko tendra la barrera de entrada mas baja del mercado hispano.

## Monetizacion diferida por comunidad (post-lanzamiento)

El SaaS es la loss-leader. Las siguientes lineas se activan secuencialmente una vez Zaltyko tenga masa critica de academias (objetivo: 500+ academias activas en 12-18 meses).

### Linea 1 - Upsells / Add-ons (mes 3-6)

Features premium que se cobran aparte del plan.

| Add-on | Precio | Notas |
| --- | --- | --- |
| Make-up Tokens ilimitados | +5 €/mes | Free: 5 tokens/mes. Starter: 20/mes. Growth+: ilimitado. |
| App branded por academia | +9 €/mes | Logo + colores propios en portal padres. iClassPro cobra 299 USD/mes por esto. |
| Reportes ejecutivos avanzados | +7 €/mes | Prediccion de abandono, segmentacion por aparato, comparativas interanual. |
| Multi-sede (cuando este listo) | +20 €/mes/sede extra | Network + extras. |
| Integraciones premium | +5-15 €/mes | Zapier, Mailchimp, contabilidad regional. |
| Soporte prioritario | +10 €/mes | Respuesta < 24h, account manager dedicado. |

**Estimacion**: 30-40% de los paid users compran ≥1 add-on → ARPU real 25-30 € en Starter.

### Linea 2 - Marketplace B2B de proveedores (mes 6-12)

Las academias necesitan comprar cosas que Zaltyko puede agregar valor:

- **Calleras / grips** (sinergia directa con PAWSGRIP, canal de distribucion natural)
- **Maillot, mallas, ropa de entrenamiento**
- **Aparatos** (aros, cintas, mazas, pelotas, cuerdas)
- **Software complementario** (musica para coreografias, edicion de video)
- **Seguros deportivos, fisioterapeutas, nutricionistas**
- **Eventos, clinics, campus**

**Modelo Zaltyko**: directorio + transaccional opcional.
**Pricing**: 5-10% de comision por venta, o cuota mensual al proveedor por estar en el directorio.
**Sinergia estrategica**: PAWSGRIP dentro del marketplace Zaltyko = Zaltyko se convierte en canal de distribucion de PAWSGRIP. Esto es una de las razones por las que Zaltyko debe crecer rapido.

### Linea 3 - Marketplace de padres / `/descubre` (mes 6-12)

Directorio publico de academias Zaltyko con SEO local ("academia gimnasia ritmica Madrid", "gimnasio artistico Barcelona"). Ya planeado en [[Tarea - Marketplace Zaltyko y multi-idioma]].

**Modelo**: Academias pagan por aparecer en posiciones destacadas (Google Ads-style).
**Pricing**: CPC 0,10-0,50 € o CPM.
**Activacion**: requiere masa critica (≥500 academias publicas) para que el marketplace tenga valor.

### Linea 4 - Eventos y competiciones (mes 12-18)

- **Torneos inter-academia online** (categorias, niveles, aparato). Inscripcion a traves de Zaltyko.
- **Campus / clinics / masterclass** con entrenadores reconocidos. Zaltyko cobra fee por inscripcion.
- **Competiciones federativas no oficiales**: Zaltyko genera calendario, academias inscriben gimnastas, Zaltyko cobra fee + retransmision.
- **Pricing**: 2-5 € por inscripcion o % sobre el evento.
- **Sinergia clave**: cada academia Zaltyko ya tiene skill tracking + gestion de atletas. Inscribir a un torneo Zaltyko es 3 clicks. Esto NO existe en iClassPro/Jackrabbit/Clupik.

### Linea 5 - Datos, insights y partnerships (mes 18+)

- **Reporte anual del sector gimnasia hispano** (gratis = marketing, premium = venta).
- **Partnerships con federaciones**: Zaltyko provee SaaS gratis/barato a cambio de ser "tecnologia oficial".
- **Insights para proveedores**: "el 60% de academias de ritmica en Espana compran cintas italianas" → vender informe.
- **Pricing**: 500-5.000 €/ano por informe premium. Partnerships federaciones pueden ser 6 cifras.

## Casos de referencia (no copiar, aprender)

- **Playtomic**: freemium + 5-10% fee por reserva. Adquirida por Garmin 2024. SaaS gratis para clubes; dinero en la red (reservas, eventos, ligas).
- **Calendly**: freemium B2B. Free hasta 1 evento, paid desde $8/mes. 40M+ usuarios, $350M+ revenue.
- **HubSpot**: free CRM + paid marketing/sales hubs. Free es la loss-leader que llena el funnel. >$1B revenue.
- **ClassPass**: suscriptores pagan por acceder a estudios; estudios pagan comision por cliente nuevo. Modelo opuesto al Zaltyko pero valida que academia no paga SaaS cuando hay demanda de consumidores.
- **Spotify**: 70%+ usuarios en free. Monetizacion por ads + conversion. Valida que free agresivo funciona si hay modelo de ads/upsell.

## Validaciones post-lanzamiento

- Medir conversion Free -> Starter al llegar a 30 gimnastas.
- Medir conversion Starter -> Growth al acercarse a 75 gimnastas.
- Confirmar que trial sin tarjeta no genera abuso academias pequenas que renuevan cada 11 meses.
- Confirmar que el disparador de upgrade "portal padres completo" funciona (que active suficiente valor para pagar).
- Confirmar pricing LATAM unico a 19 € (no PPP diferenciado) es bien recibido.
- Confirmar interes en add-ons Make-up Tokens, App branded, Reportes ejecutivos.

## Regla

No publicar cambios de pricing sin actualizar esta nota, [[Mensajes aprobados]] y las pruebas/manual QA del checkout.
