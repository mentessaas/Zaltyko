# AI Integration Design - Zaltyko

**Fecha:** 2026-03-10
**Status:** Aprobado
**Tipo:** Integración de IA de nivel intermedio

---

## 1. Visión General y Propósito

### 1.1 Objetivo

Integrar IA de nivel intermedio en el workflow del dashboard de Zaltyko, comenzando con casos de alto impacto (cobros, asistencia, comunicación) con arquitectura preparada para escalar a agentes autonomous en el futuro.

### 1.2 Problemas a Resolver

| Usuario | Dolor | Solución IA |
|---------|-------|-------------|
| Administradores | Tareas repetitivas, difícil tomar decisiones sin datos | Análisis automático, reportes inteligentes, predicción de morosos |
| Entrenadores | Seguimiento individual difícil, mucho papeleo | Updates automáticos de progreso, análisis de grupos |
| Atletas/Padres | Comunicación lenta, falta de visibilidad del progreso | Notificaciones proativas, chatbot 24/7 |
| Administradores | Cobros complicados | Predicción de morosos, recordatorios personalizados |

### 1.3 Alcance

- **Inicio:** Integraciones específicas por módulo
- **Futuro:** Agentes autonomous que ejecuten tareas complejas

---

## 2. Arquitectura del Sistema

### 2.1 Diagrama de Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                      Dashboard UI                            │
│  (Componentes IA existentes dentro del flow normal)        │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                    AI Service Layer                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │  AI Agent   │  │  AI Agent   │  │  AI Agent   │          │
│  │  (Billing)  │  │ (Attendance)│  │ (Communication)│         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘          │
│         │                │                │                  │
│  ┌──────▼────────────────▼────────────────▼──────┐          │
│  │              AI Orchestrator                   │          │
│  │     (Coordina llamadas, caching, rate limits)  │          │
│  └──────────────────────┬─────────────────────────┘          │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│              External AI Providers                            │
│         (MiniMax API - Proveedor primario)                   │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Proveedor de AI

**Primario:** MiniMax API
- API Key configurada en `.env.local`
- Documentación: https://platform.minimax.io/
- Buena relación calidad/precio para prototipos y producción inicial

---

## 3. Casos de Uso por Módulo

### 3.1 Cobros Inteligentes (Billing AI)

| Feature | Descripción | Beneficio Admin |
|---------|-------------|-----------------|
| **Predicción de Morosos** | Analiza historial para predecir qué atletas no pagarán | Proactivo, reduce pérdidas |
| **Recordatorios Personalizados** | Mensajes generados por IA adaptados al tono del academy | Mayor efectividad, menos fricción |
| **Sugerencias de Planes** | Recomienda opciones de pago/freno según perfil | Flexibilidad, cobra más |
| **Generación de Reportes** | Resúmenes inteligentes de finances en lenguaje natural | Toma decisiones más rápido |

### 3.2 Análisis de Asistencia (Attendance AI)

| Feature | Descripción | Beneficio |
|---------|-------------|-----------|
| **Alertas de Riesgo** | Detecta patrones de ausentismo antes de que abandonen | Retención de atletas |
| **Análisis de Grupos** | Compara asistencia entre grupos/horarios | Optimiza clases |
| **Predicción de Inasistencias** | предупреждает sobre probable ausencia | Mejor planificación |

### 3.3 Comunicación Automatizada

| Feature | Descripción | Beneficio |
|---------|-------------|-----------|
| **Notificaciones de Progreso** | IA genera updates personalizados a padres | Engagement |
| **Recordatorios Inteligentes** | Recordatorios proactivos (clase mañana, pago vence) | Reduce trabajo admin |
| **Respuestas Automáticas** | Chatbot para preguntas frecuentes de padres | 24/7 disponibilidad |

---

## 4. Implementación Técnica

### 4.1 Estructura de Archivos

```
/
│   ├──src/
├── lib ai/
│   │   ├── client.ts              # Cliente configurado de MiniMax
│   │   ├── orchestrator.ts        # Coordina requests
│   │   ├── prompts/
│   │   │   ├── billing.ts         # Prompts para cobros
│   │   │   ├── attendance.ts      # Prompts para asistencia
│   │   │   └── communication.ts  # Prompts para comunicación
│   │   ├── services/
│   │   │   ├── billing-ai.ts      # Lógica de cobros
│   │   │   ├── attendance-ai.ts   # Lógica de asistencia
│   │   │   └── communication-ai.ts # Lógica de comunicación
│   │   └── types.ts               # Tipos compartidos
│   └── ...
```

### 4.2 API Routes

```
/api/ai/
├── billing/
│   ├── predict-delinquency     # Predice morosos
│   ├── generate-reminder       # Genera recordatorio
│   └── suggest-payment-plan    # Sugiere plan de pago
├── attendance/
│   ├── analyze-risk            # Analiza riesgo de abandono
│   ├── predict-absence         # Predice ausencia
│   └── group-insights          # Insights de grupos
└── communication/
    ├── generate-progress-update  # Genera update de progreso
    └── chat-response              # Respuesta de chatbot
```

### 4.3 Flujo de Datos

```
1. Frontend llama a API route
2. API route valida input y auth
3. Orchestrator recibe request
4. Selecciona prompt apropiado
5. Envía a proveedor AI (MiniMax)
6. Procesa respuesta
7. Cachea resultado (opcional)
8. Retorna al frontend
9. Frontend muestra resultado
```

### 4.4 Variables de Entorno

```env
MINIMAX_API_KEY=sk-***
```

---

## 5. Prioridad de Implementación

### Fase 1: Foundation (Semanas 1-2)
- Cliente AI base + Orchestrator
- API routes fundamentales
- Cache básico (en memoria)

### Fase 2: Billing AI (Semanas 3-4)
- Predicción de morosos
- Generación de recordatorios
- Reportes inteligentes

### Fase 3: Attendance AI (Semanas 5-6)
- Detección de riesgo de abandono
- Análisis de grupos
- Predicción de inasistencias

### Fase 4: Communication AI (Semanas 7-8)
- Updates de progreso automáticos
- Chatbot para padres

---

## 6. Costos Estimados

| Fase | Llamadas estimadas/mes | Costo aprox. |
|------|----------------------|--------------|
| Foundation | 1,000 | $1-2/mes |
| Billing AI | 5,000 | $5-10/mes |
| Attendance AI | 3,000 | $3-6/mes |
| Communication AI | 10,000 | $10-15/mes |

*Basado en precios de MiniMax. Ajustable según uso.*

---

## 7. Consideraciones de Seguridad

- API key almacenada en variables de entorno
- Rate limiting en endpoints AI
- Validación de inputs antes de enviar a AI
- Sanitización de respuestas antes de mostrar

---

## 8. Métricas de Éxito

- **Adoption:** % de admins que usan features IA
- **Engagement:** Frecuencia de uso de asistente
- **ROI:** Reducción de morosos, retención de atletas
- **Satisfaction:** Feedback de usuarios

---

## 9. Próximos Pasos

1. Aprobar este documento
2. Crear plan de implementación detallado
3. Iniciar Fase 1: Foundation
