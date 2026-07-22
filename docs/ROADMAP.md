# Roadmap del Proyecto

> Este documento contiene un roadmap histórico de 2024/2025. Para el estado operativo vigente, consultar `docs/audit/TECHNICAL_ROADMAP.md` y `vault/00-Inicio/Estado de reconciliacion 2026-07-22.md`.

Este documento detalla la hoja de ruta para el desarrollo y evolución de **Zaltyko SaaS**.

## 📍 Estado Actual: Beta Ready
El núcleo funcional está completo. La plataforma es capaz de gestionar academias, procesar pagos y manejar operaciones diarias.

---

## 📅 Próximos Pasos (Q4 2024)

### 1. Fase de Estabilización y QA (Prioridad Alta)
- [ ] **Auditoría de Seguridad**: Revisión manual de todas las políticas RLS.
- [ ] **Tests E2E**: Implementar flujos críticos con Playwright (Login -> Crear Atleta -> Pagar).
- [ ] **Optimización de Performance**: Revisar consultas SQL lentas y optimizar imágenes.

### 2. Lanzamiento Beta (Soft Launch)
- [ ] Despliegue en entorno de Producción (Vercel Pro).
- [ ] Onboarding de 5-10 academias piloto ("Early Adopters").
- [ ] Configuración de monitoreo de errores (Sentry) en producción.

---

## 🔮 Futuro (2025)

### Q1: Expansión de Funcionalidades
- **App Móvil para Padres**: Versión PWA o nativa (React Native) para que los padres vean progreso y asistencia.
- **Reportes Avanzados**: Gráficos de retención de alumnos, ingresos recurrentes y proyecciones.
- **Tienda en Línea**: Módulo para que las academias vendan uniformes y equipamiento.

### Q2: Automatización e IA
- **Asistente Virtual**: Chatbot para responder dudas frecuentes de horarios y precios.
- **Planificación Inteligente**: Sugerencia automática de horarios de clases basada en disponibilidad de entrenadores y demanda.

---

> *Este roadmap es un documento vivo y puede cambiar según el feedback de los usuarios y las prioridades del negocio.*
