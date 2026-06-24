---
status: active
owner: negocio
last_reviewed: 2026-06-22
source:
  - ../BUSINESS-ANALYSIS.md
  - ../docs/marketing/zaltyko-pricing.md
---
# Modelo de negocio

## Tesis

Zaltyko busca **construir la mayor comunidad de academias de gimnasia hispanohablantes del mundo**. El SaaS es la loss-leader: el revenue por academia via suscripcion es bajo (Free util + Starter a 19 €/mes) y el grueso del valor economico vendra despues por upsells, marketplace, eventos, publicidad y partnerships. Esta tesis es la opuesta al modelo Mindbody/GymDesk (SaaS caro) y se alinea con Playtomic (freemium agresivo + monetizacion por red).

El ICP (academias pequenas/medianas de gimnasia artistica/ritmica en espanol, hoy con Excel + WhatsApp + papel + transferencias) tiene presupuesto low-touch, alta sensibilidad al lock-in de precio y mucho valor percibido cuando ve a otras academias creciendo juntas. Esto define todas las decisiones de pricing, onboarding, comunicacion y roadmap.

## Modelo de revenue (multi-linea)

### Linea primaria - Suscripciones SaaS (mes 0+)

| Plan | Precio | Gimnastas | Caracteristica |
| --- | --- | --- | --- |
| Trial 7 dias | 0 € (sin tarjeta) | ilimitado | Todas las funciones del Starter. Downgrade automatico a Free. |
| Free | 0 €/mes | hasta 30 | Operar academia basica sin pagar. Loss-leader. |
| Starter | **19 €/mes** | hasta 75 | SaaS completo: pagos recurrentes, portal padres, progresion. |
| Growth | 49 €/mes | hasta 200 | Automatizaciones + reportes ejecutivos. |
| Network | 99 €/mes | multi-sede | Bajo onboarding acompanado. |

Fee de procesamiento: 0 € markup sobre Stripe directo. Sin fees ocultos.

Pricing **unico equilibrado para todo el mercado hispano** (Espana + LATAM). Conversion de divisa la hace el PSP/banco del cliente.

Ver [[Pricing]] y [[Tarea - Pricing escalonado, free util y trial sin tarjeta]] para detalle.

### Linea 1 - Upsells / Add-ons (mes 3-6 post-lanzamiento)

Features premium que se cobran aparte del plan:

| Add-on | Precio | Lección aprendida |
| --- | --- | --- |
| Make-up Tokens ilimitados | +5 €/mes | Free: 5/mes, Starter: 20/mes, Growth+: ilimitado. |
| App branded por academia | +9 €/mes | iClassPro cobra 299 USD/mes por esto. Zaltyko a 9 €/mes. |
| Reportes ejecutivos avanzados | +7 €/mes | Prediccion de abandono, segmentacion por aparato. |
| Multi-sede (cuando este listo) | +20 €/mes/sede extra | Network + extras. |
| Integraciones premium | +5-15 €/mes | Zapier, Mailchimp, contabilidad regional. |
| Soporte prioritario | +10 €/mes | Respuesta < 24h, account manager. |

Estimacion: 30-40% de paid users compran >=1 add-on → ARPU real 25-30 € en Starter.

### Linea 2 - Marketplace B2B de proveedores (mes 6-12)

Las academias necesitan comprar:

- Calleras / grips (**sinergia directa con PAWSGRIP** = Zaltyko se convierte en canal de distribucion de PAWSGRIP)
- Maillot, mallas, ropa de entrenamiento
- Aparatos (aros, cintas, mazas, pelotas, cuerdas)
- Software complementario (musica, edicion de video)
- Seguros deportivos, fisios, nutricionistas
- Eventos, clinics, campus

Modelo: directorio + transaccional opcional.
Pricing: 5-10% comision por venta, o cuota mensual al proveedor.

### Linea 3 - Marketplace de padres / `/descubre` (mes 6-12)

Directorio publico de academias Zaltyko con SEO local. Ya planeado en [[Tarea - Marketplace Zaltyko y multi-idioma]].

Modelo: Academias pagan por aparecer en posiciones destacadas (Google Ads-style).
Pricing: CPC 0,10-0,50 € o CPM.
Activacion: requiere >=500 academias publicas.

### Linea 4 - Eventos y competiciones (mes 12-18)

- Torneos inter-academia online (categorias, niveles, aparato).
- Campus / clinics / masterclass.
- Competiciones federativas no oficiales.

Pricing: 2-5 € por inscripcion o % sobre el evento.
Sinergia clave: cada academia ya tiene skill tracking + gestion de atletas. Inscribir a torneo Zaltyko = 3 clicks. NO existe en iClassPro/Jackrabbit/Clupik.

### Linea 5 - Datos, insights y partnerships (mes 18+)

- Reporte anual del sector gimnasia hispano (gratis = marketing, premium = venta).
- Partnerships con federaciones: Zaltyko provee SaaS gratis/barato a cambio de ser "tecnologia oficial".
- Insights para proveedores ("60% de academias de ritmica en Espana compran cintas italianas").

Pricing: 500-5.000 €/ano por informe premium. Partnerships federaciones pueden ser 6 cifras.

## Segmentos

| Segmento | Necesidad | Plan esperado | Monetizacion complementaria |
| --- | --- | --- | --- |
| Academia pequena (Free) | Ordenar operaciones sin pagar | Free | Marketplace B2B (compra calleras, mallas, etc). |
| Academia pequena que cobra cuotas | SaaS completo accesible | Starter 19 € | Upsells + marketplace. |
| Academia establecida | Escalar y reportes | Growth 49 € | Upsells + eventos + advertising en `/descubre`. |
| Cadena pequena | Multi-sede y reporting | Network 99 € | Partnerships con federaciones. |
| Enterprise/federacion | Tecnologia oficial | Network custom | Contratos 6 cifras. |

## Casos de referencia (no copiar, aprender)

- **Playtomic** (Espana/EU padel): freemium + 5-10% fee por reserva. Adquirida por Garmin 2024. SaaS gratis para clubes; dinero en la red (reservas, eventos, ligas). **Modelo mas cercano a Zaltyko**.
- **Calendly** (B2B global): freemium. Free hasta 1 evento, paid desde $8/mes. 40M+ usuarios, $350M+ revenue.
- **HubSpot** (B2B SaaS): free CRM + paid marketing/sales hubs. Free es la loss-leader que llena el funnel. >$1B revenue.
- **ClassPass** (global fitness): suscriptores pagan por acceder a estudios; estudios pagan comision por cliente nuevo. Academia no paga SaaS cuando hay demanda del lado del consumidor.
- **Spotify** (consumer): 70%+ usuarios en free. Monetizacion por ads + conversion. Valida free agresivo si hay modelo de ads/upsell.
- **Mindbody** (USA premium wellness): opuesto a Zaltyko. SaaS caro, academias premium. IPO 2015, adquirida por Vista Equity.

## Riesgos de negocio

- Free util + Starter 19 € genera trafico pero poco revenue → hay que activar Lineas 1-2 rapido.
- Si la comunidad no crece rapido, las Lineas 3-5 no son viables.
- Pricing unico EUR/USD puede dejar fuera paises con PPP muy bajo (Bolivia, Paraguay) → monitorizar.
- El marketplace B2B requiere equipo de partnerships/ventas que hoy no hay → empezar solo con PAWSGRIP.
- Stripe markup 0 € significa que el revenue real de suscripcion es bajo (~19 € ARPU); hay que crecer volumen rapido para llegar a break-even operativo.

## Oportunidades

- Comunidad masiva de academias = efecto red inmejorable para Zaltyko (retencion por comunidad, no por feature).
- Cross-sell PAWSGRIP a traves del marketplace Zaltyko (sinergia unica entre los proyectos de Elvis).
- Datos agregados del sector gimnasia hispano son un activo unico una vez que hay masa.
- Partnerships con federaciones nacionales y regionales pueden dar contratos estables.
