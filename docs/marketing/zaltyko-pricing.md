# Estrategia de Pricing para Zaltyko

**Fecha:** 2026-03-17
**Versión:** 1.0
**Status:** Borrador para revisión

---

## 1. Análisis de Buyer Personas

### 1.1 El Emprendedor Deportivo

Este perfil corresponde al fundador o propietario de una academia individual, típicamente con una única sede. Su edad oscila entre 30 y 45 años, y suele ser un ex-deportista o entrenador que ha decidido emprender su propio proyecto. Maneja múltiples responsabilidades: desde la enseñanza hasta la administración, lo que genera una sobrecarga operativa significativa.

**Dolor principal:** Gestiona todo manualmente (WhatsApp, Excel, papel), pierde tiempo en tareas administrativas y tiene poca visibilidad de su negocio.

**Presupuesto:** Sensible al precio, pero consciente del retorno que genera un sistema que automatiza procesos. Busca soluciones simples que no requieran curva de aprendizaje pronunciada.

**Criterios de decisión:** Facilidad de uso, precio accesible, implementación rápida.

### 1.2 El Director de Operaciones

Este perfil gestiona cadenas de academias o instituciones deportivas con múltiples sedes. Su rango de edad está entre 35 y 50 años, y reporta directamente a propietarios o inversores. Su prioridad es la estandarización de procesos, la visión centralizada de datos y la escalabilidad.

**Dolor principal:** Falta de homogenización entre sedes, dificultad para consolidar reportes, procesos manuales que no escalan, dependencia de personas específicas.

**Presupuesto:** Mayor capacidad de inversión, pero exige justificación financiera y métricas claras de ROI.

**Criterios de decisión:** Funcionalidades avanzadas, capacidad de gestión multi-sede, integraciones, soporte dedicado.

---

## 2. Modelo de Pricing Propuesto

### 2.1 Modelo Híbrido: Por Academia + Por Atleta

El modelo recomendado combina dos dimensiones:

1. **Tarifa base por academia:** Cubre la infraestructura, acceso al dashboard y módulos core.
2. **Costo por atleta registrado:** Permite escalar el precio según el tamaño real del negocio.

Este modelo híbrido ofrece ventajas para ambos perfiles:

- Para el **Emprendedor Deportivo**: pagar según su tamaño actual, con posibilidad de crecer sin saltos grandes de precio.
- Para el **Director de Operaciones**: visibilidad clara del costo por sede y por atleta, con descuentos por volumen.

### 2.2 Alternativas Consideradas

| Modelo | Ventajas | Desventajas |
|--------|----------|-------------|
| Flat fee por academia | Simple, predecible | No escala, penaliza a pequeños o beneficia demasiado a grandes |
| Por usuario (per-seat) | Común en SaaS | Difícil de estimar para el cliente, usuarios inactivos generan costo |
| Por academia única | Muy simple | Penaliza el crecimiento, pricing opaco |
| Freemium con límites | Atracción inicial | Riesgo de usuarios que no convierten |

El modelo híbrido seleccionado balancea simplicidad con escalabilidad realista.

---

## 3. Estructura de Tiers

### 3.1 Visión General de Planes

| Plan | Target Principal | Modelo de Precio | Período Facturación |
|------|------------------|-------------------|----------------------|
| **Starter** | Emprendedor Deportivo nuevo | €29/mes por academia | Mensual o anual |
| **Professional** | Emprendedor Deportivo establecido | €49/mes + €1/atleta/mes | Mensual o anual |
| **Business** | Cadena pequeña (2-5 sedes) | €149/mes por academia + €0.75/atleta | Anual |
| **Enterprise** | Cadena grande (6+ sedes) | Custom (contacto ventas) | Anual |

### 3.2 Detalle del Plan Starter

**Precio:** €29/mes (facturación mensual) o €290/año (ahorro de 17%)

**Perfil:** Academia pequeña, menos de 50 atletas, inicio en digitalización.

**Incluye:**

- Gestión de atletas (hasta 50 registros)
- 1 perfil público en directorio de academias
- 1 calendario de clases básico
- Dashboard con métricas esenciales
- Envío de notificaciones (hasta 100/mes)
- Soporte por email

**Excluye:**

- Pagos automatizados (Stripe)
- Módulo de eventos y competiciones
- Reportes avanzados
- Inteligencia Artificial
- Múltiples sedes
- Marketplace y bolsa de empleo

**Justificación:** Este plan resuelve el dolor más inmediato del emprendedor: dejar Excel y WhatsApp. Es un entry point de bajo riesgo.

### 3.3 Detalle del Plan Professional

**Precio:** €49/mes + €1/atleta/mes (facturación mensual) o €490/año + €0.75/atleta/mes (facturación anual)

**Perfil:** Academia establecida, 50-200 atletas, necesita automatización de cobros y comunicación.

**Incluye:**

- Gestión de atletas (ilimitados)
- Directorio público premium (galería, horarios, contacto)
- Calendario de clases avanzado con listas de espera
- Pagos automatizados con Stripe
- Módulo de eventos y competiciones
- Centro de comunicación con padres
- Dashboard analítico completo
- Reportes exportables (Excel, PDF)
- Notificaciones ilimitadas

**Excluye:**

- Inteligencia Artificial
- Múltiples sedes
- Marketplace y bolsa de empleo
- API de integración

**Justificación:** Este es el plan de mayor volumen esperado. Automatiza lo que más tiempo consume: cobros y comunicación. El precio por atleta evita saltos grandes al crecer.

### 3.4 Detalle del Plan Business

**Precio:** €149/mes por academia + €0.75/atleta/mes (facturación anual obligatoria)

**Perfil:** Cadena pequeña de 2 a 5 academias, requiere visión centralizada y gestión multi-sede.

**Incluye:**

- Todo lo de Professional
- Gestión multi-sede (hasta 5 academias)
- Dashboard consolidado de todas las sedes
- Reportes comparativos entre sedes
- API de integración
- Marketplace propio para cada sede
- Bolsa de empleo propia
- IA básica (predicción de morosos, asistencia)
- Soporte prioritario (email + chat)

**Excluye:**

- IA avanzada (agentes autonomous)
- White-label
- SSO (Single Sign-On)
- Account manager dedicado

**Justificación:** El Director de Operaciones de cadena pequeña necesita consolidar datos y estandarizar procesos. Este plan ofrece las herramientas sin el costo completo de Enterprise.

### 3.5 Detalle del Plan Enterprise

**Precio:** Custom (contacto directo con equipo de ventas)

**Perfil:** Cadena grande con 6+ sedes, necesidades específicas de personalización.

**Incluye:**

- Todo lo de Business
- Sedes ilimitadas
- IA avanzada (asistentes autonomous, análisis predictivo completo)
- White-label (marca personalizada)
- SSO (SAML, OAuth)
- Account manager dedicado
- Soporte 24/7
- SLA garantizado
- Implementación personalizada
- Capacitación in-house

**Justificación:** Este segmento representa alto valor por cliente, pero requiere propuesta custom por la complejidad de cada caso.

---

## 4. Matriz de Features por Tier

| Feature | Starter | Professional | Business | Enterprise |
|---------|---------|--------------|----------|------------|
| **Gestión de Atletas** | Hasta 50 | Ilimitado | Ilimitado | Ilimitado |
| **Directorio Público** | Básico | Premium | Premium | Premium + White-label |
| **Calendario de Clases** | Básico | Avanzado | Avanzado | Avanzado |
| **Pagos Automatizados** | No | Sí | Sí | Sí |
| **Eventos y Competiciones** | No | Sí | Sí | Sí |
| **Comunicación con Familias** | 100 msg/mes | Ilimitado | Ilimitado | Ilimitado |
| **Dashboard Analítico** | Esencial | Completo | Consolidado | Avanzado |
| **Reportes** | Básicos | Excel/PDF | Comparativos | Custom |
| **Gestión Multi-sede** | No | No | Hasta 5 | Ilimitado |
| **API de Integración** | No | No | Sí | Sí |
| **Marketplace** | No | Propio | Propio | Multi-tenant |
| **Bolsa de Empleo** | No | Propia | Propia | Multi-tenant |
| **IA - Predicción de Morosos** | No | No | Básica | Avanzada |
| **IA - Asistentes** | No | No | No | Sí |
| **SSO** | No | No | No | Sí |
| **Soporte** | Email | Email + Chat | Prioritario | 24/7 + Account Manager |
| **Precio Mensual** | €29 | €49+ | €149+ | Custom |

---

## 5. Estrategia de Trial

### 5.1 Free Trial de 14 Días

**Mecánica:** Acceso completo al plan Professional (el más completo en features) durante 14 días, sin necesidad de tarjeta de crédito.

**Por qué sin tarjeta:** Reduce fricción en el registro inicial. La experiencia demuestra que la barrera de tarjeta no aumenta la conversión, pero sí reduce el volumen de trials.

**Objetivos del trial:**

- Demostrar valor en los primeros 3 días
- Facilitar la migración de datos (ofrecer ayuda gratuita durante el trial)
- Enviar recordatorios en día 3, 7 y 12

**Criterios de conversión:** El trial exitoso requiere que el usuario registre al menos 10 atletas y envíe una notificación durante el período.

### 5.2 Plan Free Forever (Freemium)

**Consideraciones:** Un tier gratuito permanente tiene pros y contras.

**Pros:** Atracción inicial, crecimiento orgánico, efecto red (más academias = más valiosa la plataforma para todos).

**Contras:** Canibalización de conversiones, costo de soporte alto, complejidad de producto.

**Recomendación:** No implementar free forever en fase inicial. En su lugar:

- Trial de 14 días suficientemente generoso
- Política de satisfacción garantizada (money-back de 30 días para planes anuales)

### 5.3 Money-Back Guarantee

**Política:** 30 días de garantía para planes anuales. Si el cliente no está satisfecho, reembolso completo.

**Rationale:** Reduce el riesgo percibido en la compra anual. El discount del 17% en anual ya representa un buen negocio para Zaltyko si el cliente usa el producto al menos 8 meses.

---

## 6. Incentivos para Pago Anual

### 6.1 Descuento por Anual

- **Starter:** €290/año (vs €348 mensual) = 17% descuento
- **Professional:** €490 + €0.75/atleta/mes (vs €49 + €1/atleta) = 17% descuento
- **Business:** €1,490 + €0.75/atleta/mes = 17% descuento

Este descuento del 17% es estándar en SaaS y representa aproximadamente 2 meses gratuitos.

### 6.2 Beneficio Adicional: Meses Extra

Alternativamente, ofrecer 13 meses por precio de 12 para el plan Business y Enterprise, manteniendo el cashflow anual pero con mensaje más atractivo ("compra un año, obten un mes más").

### 6.3 Descuento por Volumen en Business/Enterprise

Para cadenas grandes, negociar descuentos personalizados basados en:

- Número total de atletas (a partir de 500 atletas total)
- Número de sedes (a partir de 10 sedes)
- Compromiso de contrato (2-3 años)

---

## 7. Upsells y Cross-sells

### 7.1 Upsells Naturales

1. **De Starter a Professional:** La barrera natural surge cuando la academia supera los 50 atletas o necesita pagos automatizados. El messaging debe enfocarse en "automatiza tus cobros y recupera 5 horas semanales".

2. **De Professional a Business:** Cuando el emprendedor abre una segunda sede o ve el valor de comparar métricas entre períodos. El messaging debe enfocarse en "escala tu negocio sin perder control".

3. **De Business a Enterprise:** Cuando la cadena supera las 5 sedes o requiere integraciones custom con sistemas existentes (ERP, CRM).

### 7.2 Features como Upsell

- **Marketplace:** Cada academia quiere uno cuando tiene tráfico. Offer como add-on para Starter.
- **Bolsa de Empleo:** Valor diferenciador para Professional.
- **IA Avanzada:** Solo disponible en Business/Enterprise, con potencial de upsell muy alto.

### 7.3 Implementación Técnica

- Usage alerts cuando el cliente se acerca a límites (50 atletas en Starter).
- Upgrade prompts contextuales (al registrar más de 50 atletas).
- Anniversary email con oferta de upgrade.

---

## 8. Consideraciones de Implementación

### 8.1 Pricing en Moneda Local

Iniciar con precios en euros (EUR) para el mercado español. Considerar:

- Adaptación a pesos mexicanos (MXN) si se expande a LATAM
- Adaptación a dólares (USD) para mercados anglosajones

### 8.2 Impuestos

- Los precios mostrados son sin IVA
- En España, añadir 21% IVA para particulares
- Para B2B, возможность de reverse charge en algunos casos

### 8.3 Billing

- Facturación automática mensual o anual
- Métodos de pago: Tarjeta (Stripe), Transferencia (solo Enterprise)
- Grace period de 7 días ante fallos de pago

### 8.4 Downgrade Policy

- Downgrades efectivos al final del período de facturación
- Datos protegidos durante 30 días post-downgrade
- No hay reembolso por meses no utilizados en downgrade

---

## 9. Próximos Pasos

1. **Validar con clientes existentes:** Testar percepción de valor con 5-10 usuarios actuales.
2. **Ajustar precios:** Si el mercado responde muy sensible, considerar reducir 10-15%.
3. **Implementar metering:** Sistema de tracking de atletas para planes Professional y Business.
4. **Crear landing de pricing:** Página dedicada con comparador visual.
5. **Setup de Stripe:** Configurar productos y precios en el dashboard de Stripe.

---

## 10. Notas de Revisión

| Versión | Fecha | Cambios |
|---------|-------|---------|
| 1.0 | 2026-03-17 | Borrador inicial |

Este documento es un punto de partida y debe revisarse tras los primeros 3 meses de implementación real con datos de conversión.