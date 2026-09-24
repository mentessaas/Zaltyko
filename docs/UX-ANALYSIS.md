# Análisis UX Completo - Zaltyko

> **Reconciliación 13/09/2026:** este documento conserva hallazgos de una versión anterior del onboarding. El flujo implementado ya no es un wizard obligatorio de siete pasos: registro → espacio de trabajo corto → dashboard con checklist. Las observaciones históricas siguen siendo útiles para priorizar, pero no describen la interfaz actual; validar cualquier afirmación contra `src/components/onboarding/OwnerOnboardingForm.tsx`, `src/components/dashboard/OnboardingChecklist.tsx` y `docs/PRODUCT-READINESS-ROADMAP.md`.

## Fase 1: Mapeo del Journey del Usuario

### 1.1 Flujo de Onboarding Actual

**Flujo implementado:**
1. **Cuenta** — registro y autenticación.
2. **Espacio de trabajo** — nombre, país, disciplina y tipo; los ajustes avanzados son opcionales y están colapsados.
3. **Dashboard** — checklist para grupo, atletas, calendario, equipo, cobros y comunicación.
4. **Activación** — primera clase + primer atleta + primera asistencia dentro de siete días.

**Puntos de fricción identificados:**
- Los datos avanzados siguen siendo una oportunidad de simplificación futura si el usuario no desea presets.
- El checklist post-onboarding es el flujo principal de activación y debe medirse con cohortes reales.

### 1.2 Flujo Post-Onboarding

**Puntos de entrada:**
- `/app/[academyId]/dashboard` - Dashboard principal
- `/dashboard/academies` - Lista de academias (para usuarios con múltiples)
- `/dashboard` - Redirige según rol

**Problemas identificados:**
- El dashboard muestra mucha información pero no guía al usuario
- El checklist de onboarding está presente pero puede pasar desapercibido
- No hay indicadores claros de "próximos pasos"
- Las funciones importantes pueden estar "ocultas" en el menú

### 1.3 Navegación Actual

**Estructura del sidebar:**
- Resumen: Dashboard
- Operación: Atletas, Entrenadores, Grupos, Clases, Asistencia, Eventos
- Reportes: Asistencia, Financiero, Progreso
- Negocio: Facturación, Becas, Descuentos, Recibos, Evaluaciones
- Administración: Analítica Avanzada, Logs de Auditoría

**Problemas:**
- Muchas opciones pueden abrumar
- No hay indicadores de qué secciones son más importantes
- No hay búsqueda rápida
- No hay atajos de teclado visibles

### 1.4 Funciones Difíciles de Descubrir

- Configuración de sesiones recurrentes (dentro de clases)
- Perfiles públicos de entrenadores
- Notas de entrenadores
- Historial de atletas
- Reportes avanzados
- Configuración de alertas

---

## Puntos de Fricción Críticos

1. **Onboarding demasiado largo** - 7 pasos sin opción clara de pausar
2. **Falta de contexto post-onboarding** - Usuario no sabe qué hacer después
3. **Navegación abrumadora** - Demasiadas opciones sin jerarquía clara
4. **Funciones ocultas** - Características importantes difíciles de encontrar
5. **Falta de guías contextuales** - No hay ayuda cuando el usuario la necesita
6. **Feedback insuficiente** - No siempre está claro si una acción fue exitosa

---

## Prioridades de Mejora

1. **Alta prioridad:**
   - Dashboard inteligente con guías contextuales
   - Simplificación del onboarding
   - Sistema de tooltips y ayuda

2. **Media prioridad:**
   - Navegación mejorada
   - Flujos simplificados
   - Feedback mejorado

3. **Baja prioridad:**
   - Testing exhaustivo
   - Documentación detallada
