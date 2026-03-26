# Onboarding Flow - Zaltyko

## Resumen Ejecutivo

Este documento define el flujo de onboarding para Zaltyko, diseñado para convertir nuevos usuarios en clientes activos y retentivos. El onboarding está optimizado para dos buyer personas principales: el Emprendedor Deportivo (más práctico, orientado a resultados rápidos) y el Director de Operaciones (más analítico, requiere datos y procesos estructurados).

**Objetivo principal:** Reducir el tiempo hasta el primer valor (time-to-value) y maximizar la activación de usuarios.

---

## 1. Signup Flow

### 1.1 Flujo de Registro Optimizado

```
Landing Page → Pricing/Plan → Crear Cuenta → Setup Inicial → Dashboard
```

### 1.2 Landing Page (Punto de Entrada)

**Elementos clave:**
- Hero con value proposition clara: "Gestiona tu academia deportiva en un solo lugar"
- Demo interactiva o video de 60 segundos
- CTA primario: "Comenzar prueba gratuita" (no requiere tarjeta)
- CTA secundario: "Hablar con ventas" (para Enterprise)
- Trust signals: logos de academias, testimonios, garantías

**Flujo:**
1. Usuario llega a landing desde ads orgánicos o referrals
2. Explora funcionalidades sin fricción (sin login requerido)
3. Accede a pricing o langsung ke signup

### 1.3 Selección de Plan

**Opciones de planes:**

| Plan | Precio | target | Ideal Para |
|------|--------|--------|------------|
| Starter | $29/mes | Emprendedor Deportivo | 1-50 atletas, 1 academia |
| Professional | $79/mes | Pequeña empresa | 51-200 atletas, múltiples ubicaciones |
| Business | $199/mes | Director de Operaciones | 201-500 atletas, equipo de 5+ |
| Enterprise | Custom | Enterprise | 500+ atletas, múltiples ubicaciones, custom integrations |

**Flujo de selección:**
1. Comparación visual de planes (recomendación basada en respuestas de 2 preguntas)
2. Pregunta 1: "¿Cuántos atletas gestionas?" → Filtra planes
3. Pregunta 2: "¿Cuántas ubicaciones tienes?" → Afina recomendación
4. Selección de plan → Redirect a signup

### 1.4 Proceso de Signup (3 pasos máximo)

**Paso 1: Credenciales**
- Email (validación en tiempo real de disponibilidad)
- Contraseña (con medidor de fortaleza)
-Checkbox términos y condiciones

**Paso 2: Datos Básicos de la Academia**
- Nombre de la academia
- Sport (selección múltiple: fútbol, natación, tenis, etc.)
- Ciudad/País
- Nombre del owner/admin

**Paso 3: Configuración Rápida (opcional, puede ser post-signup)**
- Número aproximado de atletas
- ¿Ya usas otro sistema? (Sí/No)
- ¿Cómo nos conociste?

**Total tiempo estimado:** 90 segundos

### 1.5 Activación Immediate

Post-signup:
1. Verificación de email (opcional, con bypass para trial)
2. Acceso inmediato al dashboard con datos demo
3. Modal de setup guidado (overlay no intrusivo)

---

## 2. Welcome Experience

### 2.1 Primer Login - Dashboard con Datos Demo

**Qué ve el usuario al crear su cuenta:**

```
┌─────────────────────────────────────────────────────────────┐
│  ¡Bienvenido a Zaltyko, [Nombre]! 🎉                        │
│                                                             │
│  We've created a demo academy para que explores             │
│  las funcionalidades. ¿Listo para configurar la tuya?        │
│                                                             │
│  [Comenzar Setup] [Explorar Demo]                           │
└─────────────────────────────────────────────────────────────┘
```

**Dashboard Demo incluye:**
- 15 atletas ficticios con datos realistic
- 3 clases programadas
- 5 pagos registrados
- 1 evento próximo
- Métricas de ejemplo

### 2.2 Onboarding Tour (Overlay Interactivo)

**Tour de 4 pasos (no bloqueante):**

1. **Navegación Principal** - "Aquí está tu menú principal"
2. **Atletas** - "Gestiona todos tus atletas aquí"
3. **Calendario** - "Programa clases y eventos"
4. **Configuración** - "Personaliza tu academia"

**Comportamiento:**
- Aparece solo una vez
- Puede saltarse en cualquier momento
- Progress indicator (1/4, 2/4, etc.)
- Botón "Siguiente" y "Saltar"

### 2.3 Panel de Bienvenida Persistente

**Sidebar del dashboard incluye:**

```
┌────────────────────────────┐
│  Tareas de Setup           │
│  ├─ Completar perfil       │ ✓
│  ├─ Agregar atletas       │ ◐ 3/10
│  ├─ Configurar clases      │ ○
│  ├─ Personalizar marca     │ ○
│  └─ Invitar equipo         │ ○
│                            │
│  [Ver todas las tareas]    │
└────────────────────────────┘
```

### 2.4 Adaptación por Buyer Persona

**Emprendedor Deportivo:**
- Menos texto, más acciones
- Emphasis en "cómo empezar a cobrar hoy"
- Quick actions prominentes

**Director de Operaciones:**
- Más contexto y datos
- Emphasis en "cómo optimizar procesos"
- Reports y métricas visibles

---

## 3. Setup Guidado

### 3.1 Wizard de Configuración (7 pasos)

El setup guidado se presenta como un wizard no obligatorio pero recomendado:

```
Setup de tu Academia
━━━━━━━━━━━━━━━━━━━━━
[1] Perfil [2] Atletas [3] Clases [4] Pagos [5] Equipo [6] Marca [7] Completar
```

### 3.2 Paso 1: Perfil de la Academia

**Campos requeridos:**
- Nombre oficial de la academia
- Logo (upload o drag-drop)
- Colores de marca (selección de palette predefinida + custom)
- Información de contacto (email, teléfono, dirección)
- Horario de operación

**Campos opcionales:**
- Redes sociales
- Website externo

**Tiempo estimado:** 3 minutos

### 3.3 Paso 2: Agregar Atletas

**Opciones de importación:**

| Método | Descripción | Tiempo |
|--------|-------------|--------|
| Importar Excel/CSV | Upload de archivo con template | 2-5 min |
| Importar desde otro sistema | Integración con sistemas populares | 5-10 min |
| Agregar manualmente | Formulario uno por uno | 10-15 min |
| Importar desde WhatsApp | Enviar link de registro a atletas | 1-2 min |

**Template de Excel para importación:**
```
Nombre | Apellido | Email | Teléfono | Fecha Nac | Nivel | Fecha Inicio | Estado
```

**Quick start:** Si el usuario no tiene datos, ofrece "Agregar 5 atletas de prueba" para explorar funcionalidades.

### 3.4 Paso 3: Configurar Clases

**Settings de clase:**
- Nombre de la clase
- Sport/Disciplina
- Día y hora
- Duración
- Ubicación (cancha/piscina/sala)
- Cupo máximo
- Nivel (iniciante/intermedio/avanzado)
- Instructor asignado
- Precio (si aplica)

**Plantillas predefinidas:**
- Fútbol infantil (3-6 años)
- Fútbol juvenil (7-12 años)
- Fútbol adulto
- Natación
- Tenis
- Custom

### 3.5 Paso 4: Configurar Pagos

**Payment setup:**
- Métodos de pago aceptados (efectivo, transferencia, MercadoPago, Stripe, etc.)
- Planes de membresía (mensual, trimestral, anual)
- Descuentos por pago anticipado
- Notas y políticas de cancelación

**Integraciones sugeridas según plan:**
- Starter: Efectivo + Transferencia
- Professional: + MercadoPago
- Business: + Stripe
- Enterprise: Custom integrations

### 3.6 Paso 5: Invitar Equipo

**Roles disponibles:**
- Administrador: Acceso completo
- Instructor: Gestion de clases y asistencia
- Reception: Registro de atletas y pagos
- Coach: Vista de sus atletas y clases

**Invitación:**
- Email con link de aceptación
- Mensaje personalizado opcional
- Permisos granulares

### 3.7 Paso 6: Personalizar Marca

**Opciones de branding:**
- Color primario (desde palette o custom hex)
- Logo (si no se subió en paso 1)
- Mensajes personalizados en comunicaciones
- Custom domain (solo en Business+)

### 3.8 Paso 7: Completar y Activar

**Checklist final:**
- [x] Perfil completado
- [x] Atletas importados (X atletas)
- [x] Clases configuradas (X clases)
- [x] Pagos activados
- [x] Equipo invitado (X miembros)

**Celebración:**
```
🎉 ¡Tu academia está lista!

Ya puedes:
• Registrar atletas
• Tomar asistencia
• Cobrar membresías
• Ver reportes

[Ir al Dashboard] [Ver Tutorial en Video]
```

---

## 4. Migración de Datos

### 4.1 Opciones de Importación

**Opción 1: Excel/CSV (Más común)**

```
Importar Atletas
├── Descargar template
├── Llenar datos
├── Validar formato
├── Upload
└── Mapeo de campos
```

**Proceso detallado:**
1. Usuario descarga template de Excel
2. Prepara datos siguiendo estructura
3. Upload del archivo
4. Sistema valida:
   - Emails únicos
   - Fechas válidas
   - Campos requeridos
5. Preview de datos antes de confirmar
6. Mapeo de campos (si headers no coinciden)
7. Import con progress bar
8. Reporte de resultados (X exitosos, Y errores)

**Errores comunes y soluciones:**
| Error | Solución |
|-------|----------|
| Email duplicado | Actualizar existente o skip |
| Fecha inválida | Highlight y propuesta de corrección |
| Campo requerido vacío | Solicitar valor antes de proceed |
| Formato de teléfono | Auto-formateo |

**Opción 2: Desde Otros Sistemas**

**Sistemas soportados:**
- SportsManager (export to CSV → import)
- TeamReach
- Excel manual
- Google Sheets

**Proceso:**
1. Usuario selecciona sistema origen
2. Instructions específicas para exportar
3. Upload del export
4. Mapeo automático de campos
5. Import

**Opción 3: Integración API (Enterprise)**

Para clientes Enterprise:
- Conexión directa a DB del cliente
- Sincronización periódica
- Mapping personalizado
- Soporte técnico dedicado

### 4.2 Migración de Historial de Pagos

**Datos a migrar:**
- Membresías activas
- Historial de pagos
- Planes de facturación
- Deudas pendientes

**Proceso:**
1. Template de pagos separado
2. Validación de estados (activo/pendiente/cancelado)
3. Import con transición de estado

### 4.3 Validación y Calidad de Datos

**Pre-import:**
- Detección de duplicados
- Validación de formatos
- Normalización de datos (nombres, teléfonos)

**Post-import:**
- Reporte detallado
- Sugerencias de limpieza
- Flagging de anomalías

### 4.4 Soporte para Migración

**Nivel de soporte según plan:**

| Plan | Soporte de Migración |
|------|---------------------|
| Starter | Template auto-serve, FAQ |
| Professional | Email support, 1 sesión de onboarding |
| Business | Priority support, migration assistance |
| Enterprise | Dedicated CSM, migration personalizada |

---

## 5. Primer Valor (Quick Wins)

### 5.1 Quick Wins por Buyer Persona

**Emprendedor Deportivo - Quick Wins:**

| Quick Win | Descripción | Tiempo |
|-----------|-------------|--------|
| Registrar primer atleta | Alta en menos de 60 segundos | 1 min |
| Cobrar primera mensualidad | Generar invoice y registrar pago | 2 min |
| Tomar asistencia | Check-in de clase en 30 segundos | 30 seg |
| Enviar mensaje a padres | Notificación por WhatsApp/email | 30 seg |

**Quick Win principal:** "En 5 minutos puedes registrar tu primer atleta y cobrarle"

**Director de Operaciones - Quick Wins:**

| Quick Win | Descripción |
|-----------|-------------|
| Dashboard de métricas | Vista de KPIs críticos desde day 1 |
| Reporte de ingresos | Ver ingresos del mes actual |
| Asignación de clases | Asignar instructors a clases |
| Automatización decobranza | Configurar recordatorios automáticos |

### 5.2 Feature de Activación Inmediata

**"Registra tu primer atleta en 60 segundos"**

```
┌─────────────────────────────────────────┐
│  ➕ Agregar Atleta (Rápido)             │
├─────────────────────────────────────────┤
│  Nombre: [____________]                 │
│  Teléfono: [____________]               │
│  Email: [____________]                  │
│  [Guardar] [Guardar y agregar otro]     │
└─────────────────────────────────────────┘
```

### 5.3 Value Demonstration

**Dashboard con datos reales vs demo:**

```
Semana 1:
├── Dashboard con 0 datos
│   ├── "Aún no hay datos. ¡Registra tu primer atleta!"
│   ├── Quick action: "Registrar Atleta"
│   └── "Tip: Importa tu lista actual desde Excel"
│
├── Después de 1 atleta
│   ├── Card: "1 atleta registrado"
│   ├── "Próximo paso: Agrega una clase"
│   └── Suggested class template
│
└── Después de primera clase
    ├── Card: "1 clase esta semana"
    └── "Incrustar o compartir con atletas"
```

### 5.4 Success Metrics Visibles

**Métricas que se muestran pronto:**
- Total atletas
- Asistencias esta semana
- Ingresos del mes
- Proximo evento

**Métricas que requieren setup:**
- Tasa de retención
- Rotación de atletas
- Revenue growth
- Ocupación de clases

### 5.5 Gamificación del Onboarding

**Progress indicator visible:**
- Setup progress bar
- Badges por completar secciones
- Celebraciones (confetti, animations) en hitos

**Hitos y recompensas:**
- 1er atleta registrado → "¡Bienvenido, manager!"
- 1er cobro realizado → "¡Generando ingresos!"
- Setup completo → "Academia lista para operar"
- 30 días activo → Badge "Pro User"

---

## 6. Timeline de Onboarding

### 6.1 Timeline Estimado

```
Día 0 (Signup):       Account creado, dashboard demo activo
Día 0-1:              Completar perfil básico (15 min)
Día 1-3:              Importar atletas (30-60 min)
Día 3-7:              Configurar clases (30 min)
Día 7-14:             Setup de pagos (15 min)
Día 14-21:            Invitar equipo (15 min)
Día 21-30:            Explorar features avanzados
```

### 6.2 Time-to-Value por Plan

| Plan | Tiempo hasta valor básico | Tiempo hasta valor completo |
|------|---------------------------|------------------------------|
| Starter | 30 minutos | 3 días |
| Professional | 1 hora | 7 días |
| Business | 2 horas | 14 días |
| Enterprise | 1 día | 30 días |

**Valor básico:** Registro de atletas y clases funcionando
**Valor completo:** Todos los features del plan activos

### 6.3 Factores que Afectan Timeline

**Acelera el onboarding:**
- Importación desde Excel existente
- Equipo pequeño (1-2 personas)
- Solo un sport
- 사용经验丰富 con software

**Retrasa el onboarding:**
- Setup desde cero (sin datos)
- Equipo grande a invitar
- Múltiples ubicaciones
- Necesidad de customizaciones

---

## 7. Puntos de Fricción y Soluciones

### 7.1 Fricciones Identificadas

| # | Fricción | Impacto | Frecuencia |
|---|----------|---------|------------|
| 1 | Largo tiempo de signup | Alta | Media |
| 2 | No entender valor inmediatamente | Alta | Alta |
| 3 | Dificultad para importar datos | Alta | Alta |
| 4 | Confusion sobre qué hacer primero | Media | Alta |
| 5 | No saber usar features | Media | Media |
| 6 | Setup técnico (payments, integrations) | Alta | Media |
| 7 | Equipo no adopta el sistema | Alta | Media |
| 8 | Olvidar usar la herramienta | Alta | Alta |

### 7.2 Soluciones para Fricciones

**Fricción 1: Largo tiempo de signup**

*Solución:*
- Reducir signup a 90 segundos (implementado)
- Allow "explorar primero" sin signup
- Social login (Google, Apple)
- Skip email verification initially

**Fricción 2: No entender valor inmediatamente**

*Solución:*
- Dashboard demo con datos visuales
- Quick tour no intrusivo
- "Mostrar valor" checklist con shortcuts
- Onboarding emails con tips de valor

**Fricción 3: Dificultad para importar datos**

*Solución:*
- Plantillas claras con ejemplos
- Video tutorial de importación
- Soporte in-app chat durante import
- Auto-detección de errores con sugerencias
- Importación desde Google Sheets (directo)

**Fricción 4: Confusion sobre qué hacer primero**

*Solución:*
- Setup wizard con progress claro
- Prioritized task list en dashboard
- "Next best action" recommendations
- Contextual help en cada paso

**Fricción 5: No saber usar features**

*Solución:*
- Tooltips contextuales
- Video tutorials嵌入ados en la UI
- Help center searchable
- Live chat en-app
- Webinars semanales(opcional)

**Fricción 6: Setup técnico de pagos**

*Solución:*
- Starter: Solo efectivo/transferencia (sin setup)
- Professional+: Setup guiado de payment processor
- FAQ específica por método de pago
- Screenshots paso a paso

**Fricción 7: Equipo no adopta el sistema**

*Solución:*
- Invitación con training materials
- Role-based tutorials
- Incentivos para adopción (gamificación)
- Reports de adopción para admin

**Fricción 8: Olvidar usar la herramienta**

*Solución:*
- Email reminders post-signup (secuencia)
- In-app notifications para acciones pendientes
- Slack/WhatsApp integration para alerts
- Weekly digest con summary

### 7.3 Sistema de Alertas

**Triggers para intervención:**

| Trigger | Condición | Acción |
|---------|-----------|--------|
| No login | 3+ días sin login | Email "Te echamos de menos" |
| Setup incompleto | 7+ días sin completar | Email con help, offer call |
| Low usage | <5 minutos/día por 7 días | Tips de optimización |
| Feature no usada | 30+ días sin usar feature | Tutorial de esa feature |
| At risk | Inactividad >14 días | Re-engagement campaign |

---

## 8. Email Sequence Post-Signup

### 8.1 Secuencia de Emails

**Día 0 (Inmediato):**

```
Subject: ¡Bienvenido a Zaltyko! 🎉
Body:
├── Gracias por registrarte
├── Tu dashboard está listo para explorar
├── Link al dashboard
├── Quick tour link (video 2 min)
└── Soporte si necesita ayuda
```

**Día 1:**

```
Subject: [Nombre], completa el setup de tu academia
Body:
├── Resumen de lo que falta por hacer
├── Time estimate: 15 minutos
├── Links directos a cada paso
├── "Te ayudamos" con screenshots
└── CTA: Completar setup
```

**Día 3:**

```
Subject: ¿Ya registraste tus primeros atletas?
Body:
├── Tips para registrar rápido
├── Template de Excel link
├── "Quick win" reminder
├── Video: Cómo importar desde Excel
└── CTA: Importar atletas
```

**Día 7:**

```
Subject: [Nombre], ¿cómo va tu academia?
Body:
├── Resumen de setup actual
├── Stats de academias similares
├── Feature destacado del plan
├── Help article relevante
└── CTA: Schedule onboarding call (para Professional+)
```

**Día 14:**

```
Subject: Optimiza tu gestión con estas funciones
Body:
├── 3 tips para mejorar operaciones
├── Feature highlight del plan
├── Success story relevante
├── Invite team reminder
└── CTA: Ver tutoriales
```

**Día 21:**

```
Subject: [Nombre], ¿necesitas algo?
Body:
├── "Estamos aquí para ayudar"
├── 1-on-1 onboarding offer
├── Common questions answered
├── Feedback request
└── CTA: Responder este email
```

**Día 30:**

```
Subject: Tu primer mes con Zaltyko
Body:
├── Summary de uso
├── Comparativa con inicio
├── Tips para mes 2
├── Upgrade suggestion if relevant
└── CTA: Renew or upgrade
```

### 8.2 Emails Transaccionales

**Welcome email ( Day 0 ):**
- Confirmación de cuenta
- Credenciales de acceso
- Link a setup wizard
- Video tutorial de 2 min

**Email de completación de setup:**
- Felicitaciones
- Feature unlock celebration
- Quick wins recalcados
- Invite team CTA

**Email de primer pago registrado:**
- Congratulación
- Dashboard con nuevo dato
- "What's next" suggestion

**Email de recordatorio de renovación (3 días antes):**
- Beneficios del plan
- Usage summary
- Upgrade options

### 8.3 Personalización por Plan

**Starter:**
- Emphasis en simplicidad
- Quick wins focus
- Upgrade path to Professional

**Professional:**
- Feature deep-dives
- Integration tips
- Business growth tips

**Business:**
- Advanced features tutorials
- Team adoption resources
- Executive reporting tips

**Enterprise:**
- Dedicated CSM intro
- Custom onboarding timeline
- Integration status updates

### 8.4 Behavioral Triggers

| Trigger | Email |
|---------|-------|
| User invited team | "Tu equipo se unió" |
| User added 10+ athletes | "¡Gestionas 10+ atletas!" |
| User logged in after 5 days | "Bienvenido de vuelta" |
| User hasn't completed setup after 7 days | "Setup incompleto - te ayudamos" |
| User is about to churn (inactive) | "Te echamos de menos" |

---

## 9. Métricas de Éxito del Onboarding

### 9.1 KPIs Principales

| Métrica | Target | Descripción |
|---------|--------|-------------|
| Activation rate | >70% | % usuarios que completan setup en 7 días |
| Time to value | <24 horas | Tiempo hasta primer uso de feature core |
| Time to setup complete | <7 días | Tiempo hasta setup 100% |
| Day 7 retention | >60% | % usuarios activos en día 7 |
| Day 30 retention | >40% | % usuarios activos en día 30 |
| NPS onboarding | >50 | NPS post-setup |

### 9.2 Dashboards de Monitoreo

**Weekly onboarding metrics:**
- Signups vs activations
- Funnel conversion rates
- Time in each step
- Drop-off points identification
- Support tickets by topic

**Monthly reviews:**
- Cohort analysis
- Feature adoption by plan
- Onboarding time trends
- Satisfaction scores

---

## 10. Consideraciones de Implementación

### 10.1 Priorización de Features

**MVP (Mes 1):**
- Signup flow de 3 pasos
- Dashboard con datos demo
- Setup wizard básico
- Importación Excel
- Email sequence básica

**Fase 2 (Mes 2-3):**
- Onboarding tour interactivo
- Gamificación
- Behavioral triggers
- Progress tracking detallado

**Fase 3 (Mes 4-6):**
- Integración con más sistemas
- Onboarding calls automatizados
- Personalización avanzada por buyer persona

### 10.2 Testing y Optimización

- A/B testing de signup flow
- Survey post-setup
- User interviews en día 30
- Análisis de funnels
- Iteration basada en datos

---

## 11. Anexos

### A. Checklist de Setup por Plan

**Starter:**
- [x] Perfil de academia
- [x] Agregar/clasificar atletas
- [x] Crear clases
- [x] Configurar métodos de pago básicos

**Professional:**
- [ ] Todo de Starter
- [ ] Integración de pagos
- [ ] Configurar ubicación múltiple
- [ ] Invitar equipo (hasta 5)

**Business:**
- [ ] Todo de Professional
- [ ] Custom branding
- [ ] Reportes avanzados
- [ ] Automatizaciones
- [ ] Integraciones API

**Enterprise:**
- [ ] Todo de Business
- [ ] Custom onboarding
- [ ] Dedicated support
- [ ] SLA guarantee
- [ ] Custom integrations

### B. Plantillas de Email

(Disponibles en docs/marketing/email-templates/)

### C. Videos de Tutorial

- Video 1: Registro de atletas (2 min)
- Video 2: Crear y gestionar clases (3 min)
- Video 3: Cobrar membresías (2 min)
- Video 4: Invitar tu equipo (2 min)
- Video 5: Importar desde Excel (3 min)

---

*Documento creado: 2026-03-17*
*Versión: 1.0*
*Próxima revisión: 2026-06-17*