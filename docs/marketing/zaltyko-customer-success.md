# Estrategia de Customer Success para Zaltyko

Este documento define la estrategia de Customer Success (CS) para Zaltyko, diseñada para maximizar el valor delivered a cada cliente mientras se optimiza la retención y expansión de revenue. La estrategia está alineada con los planes de pricing existentes (Starter, Professional, Business, Enterprise) y los dos buyer personas identificados: el Emprendedor Deportivo y el Director de Operaciones.

---

## 1. Estructura de Soporte

La estructura de soporte está diseñada para escalar con el valor del cliente, asegurando que cada plan reciba un nivel de servicio apropiado a su inversión.

### 1.1 Canales por Plan

| Canal | Starter | Professional | Business | Enterprise |
|-------|---------|--------------|----------|------------|
| Email | ✓ (respuesta 24h) | ✓ (respuesta 12h) | ✓ (respuesta 8h) | ✓ (respuesta 4h) |
| Chat en vivo | — | ✓ (horario laboral) | ✓ (extendido) | ✓ (24/7) |
| Teléfono | — | — | — | ✓ (dedicado) |
| Manager de cuenta | — | — | Asignado | Dedicado |
| Kickoff call | — | ✓ | ✓ | ✓ (presencial opcional) |
| Revisiones trimestrales | — | — | ✓ | ✓ (mensual) |

### 1.2 Horarios de Operación

El equipo de soporte opera en horarios diferenciados según el plan. El plan Starter recibe soporte vía email con respuesta en 24 horas hábiles, lo cual es apropiado para usuarios que están evaluando el producto y tienen menor urgencia. El plan Professional incluye chat en vivo durante horario laboral (9am-6pm GMT-5), alineado con las horas típicas de operación de academias pequeñas. El plan Business extiende el horario de chat hasta 10pm y añade soporte por WhatsApp para comunicación asíncrona. El plan Enterprise cuenta con soporte telefónico 24/7 y un número dedicado con respuesta inmediata para bloques críticos.

### 1.3 Service Level Agreements

Los SLAs están diseñados para reflejar la criticidad del servicio para cada tipo de cliente. Para Starter, el tiempo de respuesta inicial es de 24 horas hábiles y la resolución objetivo de issues críticos es de 48 horas. Professional reduce estos tiempos a 12 y 24 horas respectivamente. Business establece 8 horas para respuesta inicial y 12 horas para resolución crítica, además de un SLA de uptime del 99.5%. Enterprise tiene los SLAs más estrictos: 4 horas de respuesta, 8 horas de resolución crítica, uptime del 99.9%, y un buffer de datos de 48 horas para disaster recovery.

### 1.4 Equipo de Soporte

La organización del equipo de CS sigue un modelo mixto que combina especialistas por tier con generalistas que pueden cubrir múltiples niveles. El equipo de Tier 1 maneja Starter y Professional, resuelviendo el 80% de los tickets sin escalar. El equipo de Tier 2 se enfoca en Business y problemas técnicos complejos. El equipo de Enterprise tiene Customer Success Managers dedicados que manejan relaciones estratégicas. Todos los miembros del equipo undergo un proceso de onboarding de 2 semanas que incluye product training, understanding de buyer personas, y certificación en el framework deValue Realization.

---

## 2. Onboarding Success

El objetivo del onboarding es asegurar que cada cliente alcance su "aha moment" dentro de los primeros 14 días, donde comprende claramente el valor de Zaltyko para su operación.

### 2.1 Journey de Onboarding por Plan

El onboarding de Starter está diseñado para ser self-service pero guiado. Incluye un email de bienvenida automatizado con links a tutoriales en video, un checklist interactivo en-app que guía la configuración inicial (crear academia, invitar primer usuario, registrar primer atleta), y email sequence de 7 días con tips progresivos. El objetivo es que el usuario complete el registro de su primer atleta y vea su primera clase agendada dentro de las primeras 48 horas.

Professional añade un onboarding guiado con acceso a webinars grupales semanales donde se walk through la configuración. Incluye también templates de configuración recomendados por tipo de academia (fútbol, natación, artes marciales) y un health score que tracking el progreso de setup. El objetivo es que el cliente configure al menos 3 clases y 10 atletas en la primera semana.

Business incluye un kickoff call de 60 minutos con un CSM que incluye review de objetivos de negocio, mapping de procesos actuales, y un plan de implementación personalizado. También recebe acceso a workshops mensuales de mejores prácticas y un assigned account manager que hace check-ins semanales el primer mes. El objetivo es que el cliente tenga su operación completa (usuarios, atletas, clases, reportes) funcionando en 14 días.

Enterprise tiene un onboarding intensivo con项目经理 dedicado, workshop de requirements de 2 días (presencial o virtual), integración con sistemas existentes via API, y training personalizado para todo el equipo. Incluye también go-live support con alguien presente durante la primera semana de operación completa. El objetivo es tener migración completa y operación estable en 30 días.

### 2.2 Aha Moments Definidos

Para el Emprendedor Deportivo (buyer persona principal de Starter y Professional), el aha moment ocurre cuando puede mostrar a un padre o atleta que su pago fue procesado correctamente y ver el registro en su dashboard. Este momento demuestra valor tangible inmediatamente. Para el Director de Operaciones (buyer de Business y Enterprise), el aha moment es cuando genera su primer reporte consolidado que antes le tomaba horas hacer manualmente en Excel. Ambos momentos están diseñados para ser alcanzados muy temprano en el journey y son celebrados por el sistema con micro-interacciones positivas.

### 2.3 Health Scores

Implementamos un sistema de health score que mide el engagement del cliente en múltiples dimensiones. El usage score tracking frecuencia de login, features usadas, y volumen de operaciones. El adoption score evalúa qué features del plan están activas versus disponibles. El outcome score mide si el cliente está logrando los objetivos que expresó en su onboarding. Los scores se calculan semanalmente y generan alerts cuando un cliente cae por debajo de umbrales definidos, permitiendo intervención proactiva.

---

## 3. Recursos de Help

Los recursos de help están estructurados en un modelo de self-service que escala mientras mantiene opciones de soporte directo para quienes lo necesitan.

### 3.1 Documentación

La base de conocimiento está organizada en tres niveles. El nivel de getting started incluye guías rápidas de 5 minutos para las tareas más comunes, videos cortos de不超过3 minutos, y decision trees visuales para guiar al usuario. El nivel de cómo hacer (how-to) tiene tutorials paso a paso para features específicas, con screenshots y videos cuando aplica. El nivel de referencia incluye documentación técnica de API, schema de integraciones, y FAQs avanzadas. Todo el contenido está disponible en español con versiones en inglés, y se actualiza con cada release majeure.

### 3.2 Centro de Aprendizaje

El Learning Center de Zaltyko ofrece múltiples formatos para diferentes estilos de aprendizaje. Los video tutorials están categorizados por función (administración, clases, reportes, pagos) y nivel (básico, intermedio, avanzado). Los webinars se ofrecen mensualmente con temas rotatorios: sesiones de producto nuevo, mejores prácticas por vertical, y cases de éxito de clientes similares. Las certificaciones permiten a usuarios avanzados obtener badges que validan su expertise, creando advocates internos en las academias clientes.

### 3.3 FAQ y Comunidad

Las FAQs se organizan por área funcional y se actualizan mensualmente basándose en los tickets de soporte más comunes. Para Business y Enterprise, existe un forum privado donde clientes pueden hacer preguntas y compartir soluciones entre sí, moderado por el equipo de CS. Este forum tiene un average response time de 4 horas y actúa como primer línea de soporte peer-to-peer.

### 3.4 Recursos por Plan

| Recurso | Starter | Professional | Business | Enterprise |
|---------|---------|--------------|----------|------------|
| Base de conocimientos | ✓ | ✓ | ✓ | ✓ |
| Video tutorials | ✓ | ✓ | ✓ | ✓ |
| Webinars mensuales | — | ✓ | ✓ | ✓ |
| Documentación API | — | ✓ | ✓ | ✓ |
| Forum privado | — | — | ✓ | ✓ |
| Training in-house | — | — | 4h/año | Ilimitado |
| CSM dedicado | — | — | ✓ | ✓ |

---

## 4. Proactive Engagement

La intervención proactiva es crítica para prevenir churn. Identificamos señales tempranas de riesgo y actuamos antes de que el cliente decida cancelar.

### 4.1 Early Warning System

El sistema de alertas tempranas monitoriza patrones de comportamiento que predicen churn. Las métricas que tracking incluyen decline en usage frequency (más de 40% decrease en logins durante 2 semanas), incomplete onboarding (sin actividad por 7 días después de signup), failed payments recurrentes, negative NPS responses, y baja adopción de features clave del plan. Cuando cualquier métrica cruza un threshold, se activa un workflow de intervención específico.

### 4.2 Intervention Playbooks

Para usage decline, el playbook incluye un email personalizado del CSM con tips de productividad y un ofrecimiento de demo de features que el usuario no ha descubierto. Para incomplete onboarding, el outreach es más directo: llamada telefónica para entender blockers y ofrecer help específico. Para failed payments, el sistema automatiza reminders pero escala a llamada personal si persisten por más de 5 días. Para negative NPS, el CSM reach out personalmente dentro de 48 horas para entender la preocupación y aplicar solución.

### 4.3 Quarterly Business Reviews

Para clientes Business y Enterprise, las QBRs son un touchpoint proactivo clave. La agenda estándar incluye review de objetivos establecidos, análisis de métricas de usage y adopción, identificación de nuevos use cases, y planificación del siguiente quarter. Las QBRs son conducidas por el CSM assigned y típicamente duran 60 minutos. El output es un documento compartido con action items y compromisos de ambas partes.

### 4.4 Churn Prevention Timeline

El timeline de prevención de churn tiene múltiples capas. A los 7 días de signup sin activity, se envía email de nudge con recursos. A los 14 días, si no hay activity, el equipo de CS hace outreach personal. A los 30 días, se hace check-in independientemente del usage para entender la experiencia inicial. Mensualmente, se hace health check para clientes con scores medios. Trimestralmente, QBR para Business y Enterprise. Este approach asegura que nunca esperamos a que el cliente contacte con problemas.

---

## 5. Expansion Revenue

Las estrategias de expansion revenue se diseñan para crear valor antes de pedir más inversión, asegurando que los upsells y cross-sells sean naturales y beneficiosos para el cliente.

### 5.1 Identificación de Oportunidades

El sistema tracking signals de expansion readiness. Los triggers incluyen uso consistente acima del 80% de los límites del plan (usuarios, atletas, clases), request de features que pertenecen a tiers superiores, crecimiento documentado en la operación del cliente (nueva ubicación, más atletas), y engagement alto con NPS promoters. Cuando un trigger se activa, el CSM recibe una alerta con talking points para la próxima conversación.

### 5.2 Estrategias de Upsell

Para Starter hacia Professional, el pitch se basa en value agregad: más usuarios, reportes básicos, y soporte por chat. El timing ideal es cuando el cliente alcanza 15 atletas o 2 usuarios, mostrando que ya está outgrowing el plan actual. El pricing differential se presenta como inversión con ROI claro (horas ahorradas, pagos cobrados que antes se perdían).

Para Professional hacia Business, el focus es en scale: reportes avanzados, múltiples ubicaciones, y automations. El trigger natural es cuando el cliente quiere reportes consolidados o necesita más de 5 usuarios. El CSM guía el conversation hacia pain points que Business resuelve y hace el business case concreto.

Para Business hacia Enterprise, el trigger es típicamente un event de crecimiento (nueva academia, adquisición) o necesidad de custom integrations. El conversation es más estratégica, frecuentemente involucrando al sponsor executive del cliente.

### 5.3 Cross-Sell Strategy

Zaltyko tiene oportunidades naturales de cross-sell. Marketplace y Empleo (los nuevos módulos) se posicionan como extensiones naturales: Marketplace permite a academias generar revenue adicional vendiendo equipamiento; Empleo ayuda a encontrar coaches. El timing para cross-sell es cuando el cliente demuestra stable operation y busca growth levers. El CSM introduce estos módulos como "bonus value" del plan actual o como upgrade natural cuando demuestran adopción.

### 5.4 Expansion Revenue Targets

Establecemos metas claras de expansion para el equipo de CS. El objetivo de net revenue retention (NRR) es 110% para Enterprise, 105% para Business, y 100% para Professional. El target de expansion revenue como porcentaje del revenue total es 30%, con la mayoría vindo de Professional hacia Business. Cada CSM tiene quotas de expansion assignadas basadas en su portfolio.

---

## 6. Feedback Loop

El feedback de clientes es un activo estratégico que informa desarrollo de producto, marketing, y la estrategia de CS misma.

### 6.1 Collection Channels

Múltiples canales capturan feedback en diferentes momentos del journey. El NPS survey se envía trimestralmente a todos los clientes activos, segmentado por plan. Los CSAT surveys se envían post-interacción de soporte (cada ticket cerrado). Los CES (Customer Effort Score) surveys miden la facilidad de completar tareas específicas en-app. Las entrevistas profundas se conducen mensualmente con 5-10 clientes selectos, alternando entre promoters y detractors. El feedback button in-app está siempre visible para捕获 suggestions espontáneas.

### 6.2 Análisis y Priorización

Todo feedback se centraliza en un dashboard donde se categoriza por área (producto, UX, pricing, soporte, docs) y se prioriza automáticamente basándose en frecuencia y NPS impact. El equipo de producto revisa el feedback semanalmente y selecciona items para el backlog. El equipo de CS revisa monthly para identificar patrones y ajustar procesos.

### 6.3 Closing the Loop

Cada piece de feedback merece una respuesta. Para suggestions implementadas, notificamos al cliente que propuso y credit en release notes. Para suggestions no implementadas, explicamos el reasoning y guardamos para consideración futura. Para complaints resueltos, hacemos follow-up para confirmar satisfacción. Este approach de closing the loop convierte clientes en advocates y aumenta response rates en surveys futuros.

### 6.4 Voice of Customer Program

El programa VOC formaliza la retroalimentación más valiosa. Los VOC champions son clientes selectos que acceden a beta features y dan feedback early. A cambio, reciben acceso prioritario a nuevas features, directo line con el product team, y reconocimiento público como early adopters. El programa tiene 20-30 miembros activos, reprezentando cada tier y vertical.

---

## 7. Comunidad

La comunidad de usuarios de Zaltyko es un diferenciador competitivo que genera valor más allá del producto.

### 7.1 Forum Privado

El forum (para Business y Enterprise) funciona como espacio de peer-to-peer support y networking profesional. Las categorías incluyen casos de éxito, mejores prácticas por vertical, feature requests, y off-topic (para construir relaciones). El equipo de CS modera activamente y responde a preguntas sin respuesta después de 24 horas. El forum tiene un engagement target de 40% de clientes Business activos mensuales.

### 7.2 Grupo de WhatsApp/Slack

Para Professional y arriba, un grupo de comunicación instantánea permite resolución rápida de dudas y networking. El grupo tiene reglas claras de engagement (no spam, respeto, relevancia) y es moderado por un community manager. El tone es friendly y profesional, reflejando la cultura de Zaltyko.

### 7.3 Eventos

Los eventos son pillar de la estrategia de comunidad. El Zaltyko Summit es un evento anual (virtual o híbrido) con keynotes, workshops, y networking. Los regional meetups son gatherings trimestrales en ciudades clave donde hay concentración de clientes. Los webinars mensuales mantienen engagement continuo y education. Los user groups permiten a clientes con interests similares (ej. academias de natación, sports complexes) conectar y compartir.

### 7.4 Ambassador Program

El Ambassador Program identifica y recompensa clientes que representan activamente Zaltyko en su red. Los ambassadors reciben beneficios como discounts en su subscription, acceso early a features, swag, y feature en canales de marketing. A cambio, proporcionan referrals, testmonials, y participation en casos de estudio. El programa tiene 10-15 ambassadors activos con target de generar 20% de nuevas ventas de clientes existentes.

---

## 8. Customer Success Metrics

Las métricas de CS proporcionan visibilidad del health de la base de clientes y efectividad de nuestros esfuerzos.

### 8.1 Métricas Principales

| Métrica | Definición | Target |
|---------|------------|--------|
| NPS | Net Promoter Score (-100 a 100) | +50 o mayor |
| CSAT | Customer Satisfaction (1-5) | 4.5 o mayor |
| CES | Customer Effort Score (1-7) | 3 o menor |
| NRR | Net Revenue Retention | 110%+ |
| GRR | Gross Revenue Retention | 95%+ |
| Time to Value | Días hasta primer aha moment | <7 días |
| Time to Adoption | Días hasta uso regular | <30 días |
| Churn Rate | % clientes que cancelan monthly | <2% |
| Logo Retention | % clientes retenidos | >95% |

### 8.2 Targets por Plan

| Métrica | Starter | Professional | Business | Enterprise |
|---------|---------|--------------|----------|------------|
| NPS target | +30 | +45 | +60 | +70 |
| CSAT target | 4.0 | 4.5 | 4.7 | 4.8 |
| TTV target | 7 días | 5 días | 3 días | 2 días |
| Churn target | <3% | <2% | <1% | <0.5% |
| NRR target | 95% | 105% | 110% | 115% |

### 8.3 Reporting y Dashboards

El equipo de CS tiene acceso a dashboards en tiempo real que muestran health de la base, progress hacia metas, y alertas de riesgo. El dashboard ejecutivo se revisa weekly en leadership meeting con drill-down en churn, NRR, y NPS trends. El dashboard operacional se usa daily por el equipo de CS para manage su portfolio y priorize intervenciones.

### 8.4 Compensation Alignment

Los incentivos del equipo de CS están alineados con métricas de éxito del cliente. El compensation tiene componentes de base salary, quota de retention, y quota de expansion. Para CSMs de Enterprise, el peso mayor es en retention y expansion. Para CSMs de starter/professional, el peso está en TTV y adoption. Este alignment asegura que el equipo esté motivado por las right outcomes.

---

## Resumen de Nivel de Servicio por Plan

| Capability | Starter | Professional | Business | Enterprise |
|------------|---------|--------------|----------|------------|
| **Soporte** | Email 24h | Chat horario laboral | Chat extendido + WhatsApp | 24/7 + Teléfono |
| **Onboarding** | Self-service guiado | Webinar + health score | Kickoff + CSM semanal | Kickoff dedicado + training |
| **Recursos** | Docs + videos | + Webinars | + Forum + 4h training | + Training ilimitado |
| **Proactive** | Emails automatizados | Check-in 30 días | QBR trimestral | QBR mensual + revisiones |
| **Account Manager** | — | — | Asignado | Dedicado |
| **API Access** | — | ✓ | ✓ | ✓ Completo |
| **SLA** | — | 99% | 99.5% | 99.9% |
| **Health Monitoring** | Básico | Intermedio | Avanzado | Completo |
| **Expansion** | Upgrade path | Upsell guiado | Strategic planning | Growth partnership |

---

## Prioridades de Implementación

Para implementar esta estrategia de forma gradual y con recursos limitados inicialmente, recomendamos el siguiente order de prioridad:

1. **Fase 1 (Mes 1-2)**: Establecer baseline de métricas (NPS, CSAT), crear base de conocimientos inicial, y configurar onboarding emails para Starter.

2. **Fase 2 (Mes 3-4)**: Implementar health scores básicos, activar webinars mensuales, y configurar feedback loop con surveys básicos.

3. **Fase 3 (Mes 5-6)**: Lanzar forum para Business, implementar QBRs, y crear expansion playbooks.

4. **Fase 4 (Mes 7-12)**: Escalar equipo de CS según crecimiento, implementar Ambassador Program, y lanzar primer Zaltyko Summit.

---

*Documento creado: Marzo 2026*
*Próxima revisión: Junio 2026*
