# Métricas de Producto y KPIs para Zaltyko

Este documento define el framework completo de métricas y KPIs para Zaltyko, un SaaS de gestión para academias deportivas. El framework cubre métricas estándar de SaaS combinadas con indicadores específicos del dominio de gestión de academias, organizados por las fases del customer journey. El objetivo es proporcionar visibilidad sobre la salud del producto, el crecimiento del negocio y la experiencia del usuario en cada etapa del ciclo de vida del cliente.

---

## 1. Métricas por Fase del Customer Journey

### 1.1 Acquisition (Adquisición)

Esta fase abarca todas las métricas relacionadas con cómo los usuarios potenciales encuentran y conocen Zaltyko. El objetivo es entender la efectividad de los canales de adquisición y el volumen de tráfico cualificado que llega al producto.

#### 1.1.1 Métricas de Tráfico y Visitas

**Visitantes Únicos (Unique Visitors)**

- **Definición:** Número de usuarios individuales que acceden al sitio web de Zaltyko en un período determinado, sin importar cuántas veces realicen visitas.
- **Cómo se mide:** Se utiliza Google Analytics 4 o Mixpanel para contar usuarios únicos mediante cookies o IDs de usuario. Se filtra el tráfico de bots y Internal IP.
- **Target/típico:** Para un SaaS B2B en fase de crecimiento, entre 5.000 y 20.000 visitantes únicos mensuales es un rango saludable. El crecimiento debe ser month-over-month de al menos un 10 por ciento.
- **Herramienta:** Google Analytics 4, Mixpanel o Plausible.

**Tráfico Orgánico (Organic Traffic)**

- **Definición:** Visitas que llegan a través de resultados de búsqueda no pagados en Google u otros buscadores.
- **Cómo se mide:** En Google Analytics 4, se filtra por fuente/medio conteniendo "google / organic". Se complementa con datos de Google Search Console para palabras clave posicionadas.
- **Target/típico:** Representar al menos el 40 por ciento del tráfico total es un buen indicador de salud SEO. El tráfico orgánico debe crecer organáticamente sin inversión continua en contenido.
- **Herramienta:** Google Analytics 4 + Google Search Console.

**Tráfico de Referidos (Referral Traffic)**

- **Definición:** Visitas que llegan a través de enlaces externos en otros sitios web, blogs, directorios o redes sociales.
- **Cómo se mide:** En Analytics, se filtra por fuente/medio y se identifican los principales dominios referidores. Es importante trackear específicamente refers de directorios de academias deportivas y blogs de nicho.
- **Target/típico:** Entre el 15 y 25 por ciento del tráfico total es ideal para SaaS B2B. Se debe tender hacia fuentes de referencia de alta calidad (publicaciones del sector, партнеры).
- **Herramienta:** Google Analytics 4, Ahrefs o SEMrush.

#### 1.1.2 Métricas de Marketing Digital

**Costo por Lead (CPL - Cost Per Lead)**

- **Definición:** Costo promedio de adquirir un lead cualificado a través de canales de marketing.
- **Cómo se mide:** Se divide el gasto total en marketing (publicidad, herramientas, personal) entre el número de leads generados en el mismo período. CPL = Gasto total en canales de adquisición / Número de leads.
- **Target/típico:** Para SaaS B2B de gestión de academias, un CPL entre 15 y 50 dólares es razonable. El target debe reducirse un 20 por ciento trimestre tras trimestre hasta estabilizarse.
- **Herramienta:** HubSpot, Google Ads, Meta Business Suite.

**Costo por Lead Cualificado (MQL - Cost Per MQL)**

- **Definición:** Costo de adquirir un Lead Marketing Cualificado, es decir, un lead que cumple criterios específicos de interés y-fit.
- **Cómo se mide:** Similar al CPL pero solo para leads que cumplen los criterios de calificación (fit de industria, tamaño de academia, presupuesto). MQL Cost = Gasto en marketing / Número de MQLs.
- **Target/típico:** Entre 50 y 150 dólares por MQL. Este costo varía significativamente según el canal: orgánico tiene costo marginal, paid puede elevarse.
- **Herramienta:** HubSpot, Marketo o CRM propio.

**Tasa de Conversión de Visitante a Lead**

- **Definición:** Porcentaje de visitantes que proporcionan información de contacto (se convierten en leads).
- **Cómo se mide:** Se divide el número de leads generados entre el número total de visitantes únicos y se multiplica por 100. Tasa = (Leads / Visitantes únicos) × 100.
- **Target/típico:** Entre 3 y 8 por ciento es un rango saludable para SaaS B2B. Landing pages optimizadas pueden alcanzar 10-15 por ciento.
- **Herramienta:** Google Analytics 4 con eventos de conversión configurados.

#### 1.1.3 Métricas Específicas de Producto

**Usuarios que Inician Sign-up**

- **Definición:** Número de usuarios que comienzan el proceso de registro en la plataforma.
- **Cómo se mide:** Se cuenta el evento "sign_up_started" en Mixpanel o Amplitude cuando el usuario ingresa su email o datos iniciales en el formulario de registro.
- **Target/típico:** Al menos el 5 por ciento de los visitantes únicos deben iniciar sign-up. Una tasa inferior indica fricción en la página de registro o propuesta de valor poco clara.
- **Herramienta:** Mixpanel, Amplitude o PostHog.

**Ratio Visitante/Sign-up**

- **Definición:** Porcentaje de visitantes que inician el proceso de registro.
- **Cómo se mide:** Se calcula dividiendo usuarios que inician sign-up entre visitantes únicos mensuales. Ratio = (Sign-ups iniciados / Visitantes únicos) × 100.
- **Target/típico:** 5-10 por ciento. Si es menor, revisar propuesta de valor en landing y fricción en el flujo de registro.
- **Herramienta:** Mixpanel con funnels configurados.

---

### 1.2 Activation (Activación)

Esta fase mide cuándo y cómo el usuario experimenta el primer valor de Zaltyko. El objetivo es reducir el tiempo hasta el "aha moment" y maximizar el porcentaje de usuarios que alcanzan este punto crítico.

#### 1.2.1 Métricas de Onboarding

**Tiempo hasta el Primer Valor (Time to Value - TTV)**

- **Definición:** Tiempo promedio que tarda un nuevo usuario en experimentar el primer valor significativo del producto.
- **Cómo se mide:** Se define un evento como "primer valor" (por ejemplo, crear la primera academia, registrar el primer atleta, o configurar el primer horario). Se mide el tiempo entre el sign-up y este evento. TTV = Timestamp(primer evento de valor) - Timestamp(sign_up).
- **Target/típico:** Menos de 30 minutos para productos freemium, menos de 2 horas para B2B. Para Zaltyko, meta de 15 minutos: crear academia y registrar un atleta de prueba.
- **Herramienta:** Mixpanel, Amplitude o PostHog con user journeys.

**Tasa de Completar Onboarding**

- **Definición:** Porcentaje de usuarios que completan todos los pasos del flujo de onboarding guiado.
- **Cómo se mide:** Se configura un funnel en analytics desde sign-up hasta el último paso de onboarding (típicamente crear primera clase o invitar primer usuario). Tasa = (Usuarios que completan / Usuarios que inician) × 100.
- **Target/típico:** 60-80 por ciento es un buen rango. Por debajo de 50 por ciento indica que el onboarding es demasiado largo o complejo.
- **Herramienta:** Mixpanel funnels, Amplitude o Google Analytics 4 con custom events.

**Tasa de Activación (Activation Rate)**

- **Definición:** Porcentaje de usuarios que realizan la acción clave que define que han activado su cuenta.
- **Cómo se mide:** Se define una "acción de activación" crítica: para Zaltyko, podría ser crear la primera academia Y registrar al menos un atleta. Se cuentan usuarios que realizan esta acción dentro de los primeros 7 días. Activación = (Usuarios activos / Nuevos usuarios registrados) × 100.
- **Target/típico:** 40-60 por ciento para SaaS B2B. Esta tasa es uno de los mejores predictores de conversión a pago.
- **Herramienta:** Mixpanel, Amplitude o PostHog con cohort analysis.

#### 1.2.2 Métricas de Adopción de Funcionalidades

**Tasa de Adopción de Funciones Clave (Feature Adoption Rate)**

- **Definición:** Porcentaje de usuarios que utilizan cada funcionalidad principal del producto en un período determinado.
- **Cómo se mide:** Para cada feature (gestión de atletas, clases, reportes, pagos), se cuenta el número de usuarios únicos que la utilizan en los primeros 30 días. Adopción = (Usuarios que usan feature / Usuarios totales) × 100.
- **Target/típico:** Las features core deben tener >50 por ciento de adopción. Features avanzadas, 20-30 por ciento. Si una feature core tiene menos de 30 por ciento, revisar UX o valor percibido.
- **Herramienta:** Mixpanel, Amplitude o PostHog.

**Número de Atletas Registrados (para demo)**

- **Definición:** Cantidad promedio de atletas que los usuarios registran durante el período de prueba gratuita.
- **Cómo se mide:** Se cuenta el evento "athlete_created" en los primeros 14 días post-registro. Promedio = Total atletas creados / Número de cuentas activas en período.
- **Target/típico:** Mínimo 5 atletas por cuenta para considerar que el usuario probó la funcionalidad core. 15+ atletas indica uso real del producto.
- **Herramienta:** Mixpanel o query directa a Supabase.

**Tasa de Configuración de Academia**

- **Definición:** Porcentaje de usuarios que completan la configuración inicial de su academia (nombre, deporte, ubicación).
- **Cómo se mide:** Evento "academy_configured" después del registro. Se mide el porcentaje de nuevos registros que completan al menos un 80 por ciento de los campos de configuración.
- **Target/típico:** >70 por ciento. Una tasa baja indica fricción en el onboarding o campos percibidos como innecesarios.
- **Herramienta:** Mixpanel, Amplitude o PostHog.

#### 1.2.3 Métricas de Engagement Temprano

**Sesiones por Usuario en Primera Semana**

- **Definición:** Número promedio de sesiones que un nuevo usuario inicia en sus primeros 7 días.
- **Cómo se mide:** Promedio de sesiones por usuario nuevo. Se cuenta cada login o sesión activa. Sessions = Total sesiones de nuevos usuarios / Usuarios nuevos.
- **Target/típico:** Mínimo 3-5 sesiones en la primera semana. Menos sesiones indican que el usuario no encontró suficiente valor para volver.
- **Herramienta:** Google Analytics 4 o Mixpanel.

**Duración de Sesión Promedio**

- **Definición:** Tiempo promedio que un usuario pasa en la plataforma por sesión.
- **Cómo se mide:** Promedio de tiempo entre primer y último evento en una sesión. Duration = Suma(duraciones de sesión) / Número de sesiones.
- **Target/típico:** >5 minutos por sesión para usuarios activos. Menos de 2 minutos indica que los usuarios no encuentran lo que buscan o hay problemas de UX.
- **Herramienta:** Google Analytics 4 o Mixpanel.

---

### 1.3 Retention (Retención)

La retención es la métrica más crítica para un SaaS. Mide si los usuarios encuentran valor continuo en el producto y decide el crecimiento a largo plazo. Unmal churn puede destruir un negocio rentabble incluso con buen acquisition.

#### 1.3.1 Métricas de Retención de Usuarios

**Tasa de Retención Semanal (Weekly Retention)**

- **Definición:** Porcentaje de usuarios que regresan a la plataforma en una semana específica después de su registro.
- **Cómo se mide:** Se usa análisis de cohortes. Semana 1: usuarios que se loguean en su segunda semana. Semana 4: usuarios que se loguean 4 semanas después del registro. Retención = (Usuarios activos en semana N / Usuarios totales de cohorte) × 100.
- **Target/típico:** Semana 1: 50-60 por ciento, Semana 4: 30-40 por ciento, Semana 12: 20-25 por ciento. Estas tasas varían por tipo de producto.
- **Herramienta:** Mixpanel o Amplitude con cohort analysis.

**Tasa de Retención Mensual (Monthly Retention)**

- **Definición:** Porcentaje de usuarios que utilizan el producto al menos una vez al mes.
- **Cómo se mide:** Cohortes mensuales. Mes 1: usuarios activos en el mes posterior al signup. Se mide mes a mes. Retención = (Usuarios activos mes N / Usuarios del mes de signup) × 100.
- **Target/típico:** 70-80 por ciento para mes 1, 50-60 por ciento para mes 3, 40-50 por ciento para mes 6. B2B típicamente tiene mayor retención que B2C.
- **Herramienta:** Mixpanel, Amplitude o análisis manual en Supabase.

**Net Revenue Retention (NRR)**

- **Definición:** Ingresos retenidos de clientes existentes, incluyendo expansiones menos contracciones y churn. Mide si los clientes existentes generan más o menos ingresos con el tiempo.
- **Cómo se mide:** NRR = (Ingresos recurrentes al final del período - Ingresos perdidos por churn - Contracciones + Expansiones) / Ingresos recurrentes al inicio del período × 100. Un NRR mayor a 100 por ciento indica crecimiento netode la base existente.
- **Target/típico:** >100 por ciento es excelente (net dollar retention). 90-100 por ciento es bueno. <80 por ciento indica problemas con expansión o retención.
- **Herramienta:** Stripe, Chargebee o Baremetrics.

#### 1.3.2 Métricas de Churn

**Tasa de Churn de Clientes (Customer Churn Rate)**

- **Definición:** Porcentaje de clientes que cancelan su suscripción en un período determinado.
- **Cómo se mide:** Churn = (Clientes que cancelaron en el período / Clientes al inicio del período) × 100. Se mide mensual y anualmente. Customer Churn = Clientes perdidos / Clientes totales al inicio.
- **Target/típico:** Mensual: 2-5 por ciento (anual: 20-30 por ciento). SaaS B2B saludable tiene churn mensual de 1-3 por ciento.
- **Herramienta:** Stripe, Chargebee o métrica calculada desde Supabase + pagos.

**Tasa de Churn de Ingresos (Revenue Churn Rate)**

- **Definición:** Porcentaje de ingresos recurrentes perdidos por cancelaciones y downgrades.
- **Cómo se mide:** Revenue Churn = (Ingresos perdidos por churn + contracciones) / Ingresos recurrentes al inicio × 100. Es más sensible que customer churn porque captura downgrades.
- **Target/típico:** Mensual: <5 por ciento. Anual: <30 por ciento. Revenue churn > customer churn indica que clientes grandes están churneando o haciendo downgrades.
- **Herramienta:** Stripe, Chargebee o Baremetrics.

**Churn de Usuarios Activos**

- **Definición:** Porcentaje de usuarios que были activos previamente y ahora no tienen actividad en los últimos 30 días.
- **Cómo se mide:** Se define "activo" como al menos una sesión en 30 días. Churn = (Usuarios que antes were activos y ahora inactivos / Usuarios activos hace 30 días) × 100.
- **Target/típico:** <10 por ciento mensual. Un spike en churn de usuarios activos sin corresponding customer churn indica que usuarios no-facturables (de prueba) están dejando de usar el producto.
- **Herramienta:** Mixpanel o query a Supabase.

#### 1.3.3 Métricas de Engagement Continuo

**Weekly Active Users (WAU)**

- **Definición:** Número de usuarios únicos que utilizan el producto al menos una vez por semana.
- **Cómo se mide:** Se cuentan usuarios con al menos una sesión o evento en los últimos 7 días. WAU = COUNT(DISTINCT user_id) WHERE last_activity > NOW() - 7 days.
- **Target/típico:** Debe crecer mes a mes al menos 10 por ciento para SaaS en crecimiento. La ratio WAU/MAU (si se mide MAU) debe estar por encima de 40 por ciento.
- **Herramienta:** Mixpanel, Amplitude o Google Analytics 4.

**Monthly Active Users (MAU)**

- **Definición:** Número de usuarios únicos que utilizan el producto al menos una vez al mes.
- **Cómo se mide:** Se cuentan usuarios con al menos una sesión o evento en los últimos 30 días. MAU = COUNT(DISTINCT user_id) WHERE last_activity > NOW() - 30 days.
- **Target/típico:** Crecimiento mensual de 10-20 por ciento para startups. Para成熟 SaaS, 5-10 por ciento.
- **Herramienta:** Mixpanel, Amplitude o query a Supabase.

**Stickiness (DAU/MAU Ratio)**

- **Definición:** Porcentaje de usuarios mensuales que utilizan el producto diariamente.
- **Cómo se mide:** Stickiness = (Daily Active Users / Monthly Active Users) × 100. Mide qué tan frecuente es el uso.
- **Target/típico:** 20-30 por ciento es bueno para B2B. Productos de consumo pueden llegar a 50+ por ciento. Stickiness > 25 por ciento indica alto engagement.
- **Herramienta:** Mixpanel, Amplitude o Google Analytics 4.

#### 1.3.4 Métricas Específicas de Academia

**Atletas por Academia Activa**

- **Definición:** Número promedio de atletas registrados por academia que tiene al menos un usuario activo.
- **Cómo se mide:** Se cuentan todos los atletas en academias con al menos un login en los últimos 30 días y se divide por el número de esas academias. Promedio = Total atletas en academias activas / Número de academias activas.
- **Target/típico:** >20 atletas indica uso real del sistema. <10 atletas puede indicar uso superficial o academias muy pequeñas.
- **Herramienta:** Query a Supabase o Mixpanel.

**Tasa de Utilización de Clases**

- **Definición:** Porcentaje de clases programadas que tienen al menos un atleta inscrito.
- **Cómo se mide:** Utilización = (Clases con inscripciones / Total clases programadas) × 100. Se filtra por clases en las próximas 2 semanas.
- **Target/típico:** >60 por ciento de utilización indica buena gestión de cupos. <40 por ciento indica sobre-dimensionamiento o falta de demanda.
- **Herramienta:** Query a Supabase o dashboard interno.

**Tasa de Asistencia Registrada**

- **Definición:** Porcentaje de inscripciones a clases donde se registró asistencia.
- **Cómo se mide:** Asistencia = (Registros de asistencia / Total inscripciones a clases pasadas) × 100. Mide qué tan seguido los profesores registran asistencia.
- **Target/típico:** >70 por ciento indica que el flujo de asistencia funciona. <50 por ciento indica fricción en el proceso de registro de asistencia.
- **Herramienta:** Query a Supabase o analytics de eventos.

---

### 1.4 Referral (Referidos)

El referral es un multiplicador de crecimiento de bajo costo. Los usuarios satisfechos son el mejor canal de adquisición. Medir y optimizar este canal puede reducir significativamente el CAC.

#### 1.4.1 Métricas de Viralidad

**Tasa de Referral (Viral Coefficient - K)**

- **Definición:** Número promedio de nuevos usuarios que cada usuario existente refiere.
- **Cómo se mide:** K = (Número de referidos × Tasa de conversión de referidos) / Número de usuarios que refieren. Si K > 1, el producto es viral y crece orgánicamente. K = Referidos traídos por usuarios / Usuarios que refieren.
- **Target/típico:** K > 0.5 es bueno para B2B. K > 1 es excelente pero raro. La mayoría de SaaS B2B tienen K entre 0.1 y 0.3.
- **Herramienta:** Mixpanel con referrer tracking, Amplitude o PostHog.

**Tasa de Referral de Clientes (Customer Referral Rate)**

- **Definición:** Porcentaje de clientes que refieren al menos un nuevo cliente en un período.
- **Cómo se mide:** Referidos = (Clientes que realizaron al menos un referido / Total clientes) × 100. Se trackea mediante links de referido únicos o códigos de invitación.
- **Target/típico:** 5-10 por ciento de los clientes realizan al menos un referido. Programas de referral estructurados pueden elevar esto a 15-20 por ciento.
- **Herramienta:** Programa de referral interno (Zaltyko Referrals), Intercom o专门的 referral software.

**Número de Invitaciones Enviadas**

- **Definición:** Cantidad promedio de invitaciones que cada usuario envía a otros.
- **Cómo se mide:** Promedio = Total invitaciones enviadas / Usuarios que tienen acceso a 功能 de invitación. Se trackea el evento "invitation_sent".
- **Target/típico:** >2 invitaciones por usuario activo. Menos indica que la función de invitación no es visible o no tiene valor percibido.
- **Herramienta:** Mixpanel o query a Supabase (tabla de invitaciones).

#### 1.4.2 Métricas de Satisfacción

**Net Promoter Score (NPS)**

- **Definición:** Métrica de lealtad del cliente que mide la probabilidad de recomendar el producto en una escala de 0 a 10.
- **Cómo se mide:** NPS = Porcentaje de Promotores (9-10) - Porcentaje de Detractores (0-6). Se encuesta a usuarios trimestralmente. Rango: -100 a +100.
- **Target/típico:** >50 es excelente, 30-50 es bueno, <30 necesita mejora. Para SaaS B2B, NPS > 40 es un target razonable.
- **Herramienta:** Delighted, Typeform, Wootric o Hotjar.

**Customer Satisfaction Score (CSAT)**

- **Definición:** Porcentaje de clientes satisfechos con el producto o servicio.
- **Cómo se mide:** CSAT = (Respuestas positivas (4-5) / Total respuestas) × 100. Se pregunta "¿Qué tan satisfecho estás con...?" después de interacciones clave.
- **Target/típico:** >85 por ciento es excelente, 70-85 por ciento es bueno. CSAT debe mantenerse estable o mejorar.
- **Herramienta:** Hotjar, Typeform o Intercom.

**Customer Effort Score (CES)**

- **Definición:** Mide qué tan fácil es para el cliente completar una tarea con el producto.
- **Cómo se mide:** CES = Promedio de respuestas en escala de 1-7 a "¿Cuánto esfuerzo te tomó...?" Less effort es mejor. CES = Suma de puntuaciones / Número de respuestas.
- **Target/típico:** <3 en escala de 1-7 (fácil). >4 indica fricción. CES es un predictor fuerte de retención.
- **Herramienta:** Hotjar, Wootric o survey post-task.

---

### 1.5 Revenue (Ingresos)

Esta fase cubre todas las métricas financieras que determinan la salud y sostenibilidad del negocio. Son las métricas finales que definen si el SaaS es viable como negocio.

#### 1.5.1 Métricas de Ingresos Recurrentes

**Monthly Recurring Revenue (MRR)**

- **Definición:** Ingresos totales que la empresa espera recibir cada mes de sus clientes订阅.
- **Cómo se mide:** MRR = Suma de todas las suscripciones activas × precio mensual. Para anual, se divide entre 12. MRR = SUM(precio_mensual × subscriptions_activas).
- **Target/típico:** Crecimiento de 15-20 por ciento mes a mes para startups en etapas tempranas. 5-10 por ciento para empresas más órganiz.
- **Herramienta:** Stripe, Chargebee, Baremetrics o собствен calculations desde Supabase + logs de pagos.

**Annual Recurring Revenue (ARR)**

- **Definición:** Ingresos anuales proyectados basados en suscripciones actuales.
- **Cómo se mide:** ARR = MRR × 12. Para clientes anuales, se usa el valor total contratado. ARR = MRR × 12 o SUM(suscripciones_anuales).
- **Target/típico:** ARR es usado para comunicar con inversores. $1M ARR es típicamente el primer milestone para startups.
- **Herramienta:** Stripe, Chargebee o Baremetrics.

**Average Revenue Per User (ARPU)**

- **Definición:** Ingreso promedio por usuario o cuenta activa.
- **Cómo se mide:** ARPU = Ingresos totales / Número de cuentas de pago. ARPU = MRR / Número de cuentas de pago.
- **Target/típico:** Debe crecer con el tiempo (expansión). Para Zaltyko, ARPU de $50-150/mes es razonable dependiendo del tier.
- **Herramienta:** Stripe, Baremetrics o query personalizada.

#### 1.5.2 Métricas de Valor

**Customer Lifetime Value (LTV)**

- **Definición:** Ingreso total que un cliente genera durante todo su tiempo como cliente.
- **Cómo se mide:** LTV = ARPU / Tasa de churn mensual. Alternativamente: LTV = ARPU × Vida media del cliente (en meses). Vida media = 1 / Churn mensual.
- **Target/típico:** LTV > 3× CAC es la regla de oro. LTV de $2,000 con CAC de $500 es un ratio saludable de 4:1.
- **Herramienta:** Baremetrics, ProfitWell o cálculo manual con datos de Stripe.

**LTV by Customer Segment**

- **Definición:** LTV segmentado por tamaño de academia, plan de suscripción u otra dimensión.
- **Cómo se mide:** Se calcula el LTV para cada segmento: LTV_small = ARPU_small / Churn_small, LTV_enterprise = ARPU_enterprise / Churn_enterprise. Permite identificar segmentos de alto valor.
- **Target/típico:** Comparar LTV entre segmentos. Si LTV_enterprise >> LTV_small, tiene sentido invertir más en acquire enterprise.
- **Herramienta:** Baremetrics segments, Mixpanel o análisis en spreadsheets.

#### 1.5.3 Métricas de Costo

**Customer Acquisition Cost (CAC)**

- **Definición:** Costo promedio de adquirir un nuevo cliente de pago.
- **Cómo se mide:** CAC = Gasto total en adquisición (marketing + ventas) / Número de nuevos clientes adquiridos. CAC = (Marketing Spend + Sales Spend) / New Customers.
- **Target/típico:** CAC debe ser <1/3 del LTV. Para SaaS B2B, CAC entre $500 y $2,000 es común dependiendo del mercado.
- **Herramienta:** HubSpot, Google Ads, spreadsheets con datos financieros.

**CAC Payback Period**

- **Definición:** Tiempo que tarda un nuevo cliente en generar ingresos iguales al costo de adquirirlo.
- **Cómo se mide:** Payback = CAC / (ARPU × Margen de contribución). Payback = CAC / Ingresos mensuales por cliente.
- **Target/típico:** <12 meses es excelente, 12-18 meses es bueno, >24 meses indica problemas deunit economics. SaaS B2B típico: 12-15 meses.
- **Herramienta:** Baremetrics, ProfitWell o cálculo manual.

**LTV:CAC Ratio**

- **Definición:** Ratio que mide la eficiencia de adquisición de clientes.
- **Cómo se mide:** Ratio = LTV / CAC. Mide cuántos dólares de valor genera cada dólar invertido en adquisición.
- **Target/típico:** >3:1 es excelente, 2:1-3:1 es aceptable, <2:1 indica problemas. Un ratio de 4:1 o más sugiere oportunidad de invertir más en adquisición.
- **Herramienta:** Baremetrics, ProfitWell o spreadsheet.

#### 1.5.4 Métricas de Conversión

**Tasa de Conversión Free to Paid**

- **Definición:** Porcentaje de usuarios en prueba gratuita que se convierten a clientes de pago.
- **Cómo se mide:** Conversión = (Usuarios que convierten a pago / Usuarios en free trial) × 100. Se mide típicamente en ventana de 14 o 30 días.
- **Target/típico:** 5-15 por ciento es el rango típico para B2B. >15 por ciento es excelente. <3 por ciento indica que el producto no está demostrando suficiente valor.
- **Herramienta:** Mixpanel, Amplitude o análisis desde Supabase + logs de pagos.

**Conversion Rate by Plan**

- **Definición:** Tasa de conversión segmentada por el plan al que convierten los usuarios.
- **Cómo se mide:** Para cada plan (básico, profesional, enterprise), se calcula la tasa: Conversión_planX = (Usuarios que eligen plan X / Total conversiones) × 100.
- **Target/típico:** La mayoría deben elegir el plan intermedio (product-led). Si la mayoría elige básico, revisar pricing o features.
- **Herramienta:** Mixpanel, Amplitude o análisis desde Stripe.

**Expansion Revenue Rate**

- **Definición:** Ingresos adicionales generados por clientes existentes a través de upgrades, seats adicionales o módulos nuevos.
- **Cómo se mide:** Expansion = (Ingresos de upgrades + seats adicionales / Ingresos totales del período) × 100. Mide el crecimiento dentro de la base existente.
- **Target/típico:** >10 por ciento mensual de expansión es bueno. Expansion > Churn = crecimiento neto.
- **Herramienta:** Stripe, Baremetrics o análisis manual.

---

## 2. Dashboard de Métricas Recomendado

Un dashboard efectivo para Zaltyko debe mostrar las métricas más críticas en tiempo real o actualizado diariamente. A continuación se presenta la estructura recomendada con las herramientas sugeridas.

### 2.1 Dashboard Executive (Resumen Ejecutivo)

Este dashboard va dirigido a founders y equipo directivo. Debe mostrar la salud general del negocio con las métricas más importantes.

| Métrica | Valor Actual | Target | Status |
|---------|-------------|--------|--------|
| MRR | $XX,XXX | +15% MoM | 🟢/🟡/🔴 |
| ARR | $XXX,XXX | $X.XM | 🟢/🟡/🔴 |
| Customer Churn | X.X% | <3% | 🟢/🟡/🔴 |
| Revenue Churn | X.X% | <5% | 🟢/🟡/🔴 |
| NPS | XX | >40 | 🟢/🟡/🔴 |
| Activation Rate | XX% | >50% | 🟢/🟡/🔴 |
| LTV:CAC Ratio | X.X:1 | >3:1 | 🟢/🟡/🔴 |

**Herramientas recomendadas:** Metabase (open source, conectado a Supabase), Looker Studio (gratis), o Databox (SaaS).

### 2.2 Dashboard de Growth

Este dashboard se enfoca en métricas de acquisition y conversion. Es ideal para el equipo de marketing y producto.

| Sección | Métricas |
|---------|----------|
| Acquisition | Visitantes únicos, Leads, MQLs, CPL, CAC |
| Conversion | Sign-up rate, Activation rate, Free-to-paid rate |
| Funnel | Visitantes → Leads → Sign-ups → Activated → Paid |
| Canales | Tráfico por fuente, Conversión por canal, CAC por canal |

**Herramientas recomendadas:** Mixpanel (product analytics), Google Analytics 4 (tráfico), HubSpot (CRM y marketing).

### 2.3 Dashboard de Retention

Enfocado en métricas de engagement y retención. Es crítico para el equipo de producto y customer success.

| Sección | Métricas |
|---------|----------|
| Engagement | WAU, MAU, Stickiness, Sesiones por usuario |
| Retention | Weekly/Monthly retention, Churn rate, Cohort analysis |
| Product | Feature adoption, Time to value, Feature usage |
| Health | NPS, CSAT, CES, Support tickets |

**Herramientas recomendadas:** Mixpanel (product analytics), Intercom (support), Hotjar (UX feedback).

### 2.4 Dashboard Financiero

Para seguimiento de métricas financieras y unit economics.

| Sección | Métricas |
|---------|----------|
| Revenue | MRR, ARR, ARPU, Expansion revenue |
| Economics | LTV, CAC, Payback period, LTV:CAC |
| Churn | Customer churn, Revenue churn, Net Revenue Retention |
| Projections | Forecast MRR, runway, burn rate |

**Herramientas recomendadas:** Baremetrics (Stripe analytics), ProfitWell (subscription analytics), spreadsheets para projections.

---

## 3. Eventos a Trackear en Producto

Para medir todas las métricas descritas, es necesario implementar tracking de eventos en el producto. A continuación se presenta la lista de eventos recomendados con su estructura.

### 3.1 Eventos de Usuario

| Evento | Descripción | Propiedades importantes |
|--------|-------------|------------------------|
| page_viewed | Usuario visita una página | page_name, page_path, referrer |
| sign_up_started | Usuario inicia registro | method (email, google), source |
| sign_up_completed | Usuario completa registro | plan, academy_type |
| login | Usuario inicia sesión | method, success |
| logout | Usuario cierra sesión | - |
| profile_updated | Usuario actualiza perfil | fields_changed |

### 3.2 Eventos de Academia

| Evento | Descripción | Propiedades importantes |
|--------|-------------|------------------------|
| academy_created | Academia es creada | sport_type, size |
| academy_configured | Setup inicial completado | completion_percentage |
| academy_updated | Academia es editada | fields_changed |
| team_member_invited | Usuario invita a otro | role, email |
| team_member_joined | Invitado acepta | role |

### 3.3 Eventos de Atletas

| Evento | Descripción | Propiedades importantes |
|--------|-------------|------------------------|
| athlete_created | Atleta es registrado | sport, age_group |
| athlete_updated | Datos de atleta actualizados | fields_changed |
| athlete_archived | Atleta es archivado | reason |
| guardian_linked | Tutor vinculado | - |
| class_enrolled | Atleta inscrito a clase | class_id, schedule |

### 3.4 Eventos de Clases

| Evento | Descripción | Propiedades importantes |
|--------|-------------|------------------------|
| class_created | Clase programada | sport, capacity, schedule |
| class_cancelled | Clase cancelada | reason |
| class_enrollment | Inscripción a clase | athlete_id, class_id |
| attendance_registered | Asistencia registrada | class_id, athletes_count |

### 3.5 Eventos de Pagos y Suscripción

| Evento | Descripción | Propiedades importantes |
|--------|-------------|------------------------|
| trial_started | Inicio de trial | plan, duration |
| subscription_started | Suscripción iniciada | plan, billing_cycle |
| subscription_upgraded | Upgrade de plan | from_plan, to_plan |
| subscription_downgrade | Downgrade de plan | from_plan, to_plan |
| subscription_cancelled | Cancelación | reason, feedback |
| payment_succeeded | Pago exitoso | amount, method |
| payment_failed | Pago fallido | amount, reason |

### 3.6 Eventos de Onboarding

| Evento | Descripción | Propiedades importantes |
|--------|-------------|------------------------|
| onboarding_started | Comienza onboarding | step |
| onboarding_step_completed | Paso completado | step_name |
| onboarding_skipped | Onboarding saltado | step_skipped |
| first_athlete_added | Primer atleta registrado | time_from_signup |
| first_class_created | Primera clase creada | time_from_signup |

### 3.7 Eventos de Features

| Evento | Descripción | Propiedades importantes |
|--------|-------------|------------------------|
| report_generated | Reporte generado | report_type |
| schedule_published | Horario publicado | classes_count |
| message_sent | Mensaje enviado | recipient_count |
| notification_sent | Notificación push enviada | - |

---

## 4. Alertas Importantes

Establecer alertas automáticas es crítico para detectar problemas antes de que se conviertan en crisis. A continuación se presentan las alertas más importantes para Zaltyko.

### 4.1 Alertas de Negocio (Business)

| Alerta | Condición | Severidad | Acción |
|--------|-----------|-----------|--------|
| MRR decline | MRR cae >5% WoW | 🔴 Crítica | Investigar churn inmediatamente |
| Churn spike | Churn >8% en semana | 🔴 Crítica | Survey a clientes que churnearon |
| CAC increase | CAC >30% vs mes anterior | 🟡 Alta | Revisar canales de adquisición |
| NPS drop | NPS cae >15 puntos | 🟡 Alta | Revisar feedback de usuarios |

### 4.2 Alertas de Producto (Product)

| Alerta | Condición | Severidad | Acción |
|--------|-----------|-----------|--------|
| Activation drop | Activation rate <30% | 🔴 Crítica | Revisar onboarding flow |
| Sign-up drop | Sign-ups <50% del promedio | 🔴 Crítica | Verificar site/app funcionamiento |
| Feature adoption drop | Feature core <20% adopción | 🟡 Alta | Investigar UX de la feature |
| Time to value increase | TTV >2x del baseline | 🟡 Alta | Simplificar primer valor |

### 4.3 Alertas Técnicas (Technical)

| Alerta | Condición | Severidad | Acción |
|--------|-----------|-----------|--------|
| Error rate | Errors >5% de requests | 🔴 Crítica | Rollback de cambios recientes |
| Page load | Load time >3s | 🟡 Alta | Optimizar performance |
| API latency | P95 >2s | 🟡 Alta | Revisar queries y caché |
| Sign-up errors | Errors en signup >10% | 🔴 Crítica | Fix inmediato |

### 4.4 Alertas de Finance (Finance)

| Alerta | Condición | Severidad | Acción |
|--------|-----------|-----------|--------|
| Failed payments | >10% fallan | 🟡 Alta | Revisar stripe/configuración |
| Trial conversion <3% | Muy bajo | 🔴 Crítica | Revisar pricing y valor |
| Refund requests | >5% de usuarios piden | 🟡 Alta | Investigar causa raíz |

---

## 5. Plan de Implementación

Para poner en marcha este framework de métricas, se recomienda el siguiente orden de implementación.

### Fase 1: Fundamentos (Semanas 1-2)

En esta fase inicial, implementar el tracking básico de eventos en el producto. Esto incluye configurar Mixpanel, Amplitude o PostHog, e implementar los eventos de usuario y las páginas vistas descritas en la sección 3. También se debe configurar el tracking de conversiones en Google Analytics 4 y establecer los dashboards básicos de tráfico y adquisición. El objetivo es tener visibilidad básica del funnel desde el primer día.

### Fase 2: Activation y Retention (Semanas 3-4)

La segunda fase se enfoca en implementar el tracking de onboarding y activación. Esto requiere definir el "primer valor" para Zaltyko, implementar los eventos correspondientes y configurar los funnels de onboarding en Mixpanel. También se deben configurar las métricas de retención semanal y mensual, e implementar alertas de activación y churn.

### Fase 3: Revenue (Semanas 5-6)

En la tercera fase, conectar Stripe o el procesador de pagos con Baremetrics o ProfitWell para obtener métricas financieras. Implementar el tracking de conversión free-to-paid, configurar alertas de revenue y construir el dashboard financiero con proyecciones.

### Fase 4: Optimización Continua (Semanas 7+)

La fase final consiste en iterar y optimizar. Se debe ajustar los targets según los datos reales, implementar encuestas de NPS y CSAT, y crear dashboards personalizados por equipo. El objetivo es establecer un ciclo de mejora continua basado en datos.

---

## 6. Targets Iniciales Recomendados

A continuación se presentan los targets iniciales sugeridos para Zaltyko basados en benchmarks de SaaS B2B. Estos targets deben ajustarse según los datos reales después de los primeros meses de medición.

| Métrica | Target Inicial | Benchmark |
|---------|---------------|-----------|
| Monthly Churn | <5% | B2B: 3-5% |
| Revenue Churn | <7% | B2B: 5-7% |
| Activation Rate | >40% | SaaS: 40-60% |
| Free-to-Paid | >8% | B2B: 5-15% |
| NPS | >35 | B2B: 30-50 |
| LTV:CAC | >3:1 | SaaS: 3:1 |
| Payback Period | <18 meses | SaaS: 12-18 |
| NRR | >100% | SaaS: 100-120% |
| WAU/MAU | >30% | SaaS: 20-30% |

---

Este documento debe revisarse trimestralmente para ajustar targets, agregar nuevas métricas relevantes y eliminar las que pierdan relevancia. El framework de métricas es un documento vivo que debe evolucionar con el producto y el negocio.
