# Análisis UX Completo - Zaltyko

## Fase 1: Mapeo del Journey del Usuario

### 1.1 Flujo de Onboarding Actual

**Pasos identificados:**
1. **Cuenta** - Registro de usuario (email, password, nombre)
2. **Academia** - Creación de academia (nombre, ubicación, tipo)
3. **Estructura** - Configuración de disciplinas y grupos sugeridos
4. **Primer grupo** - Creación del primer grupo con horario
5. **Atletas** - Añadir 5 atletas iniciales
6. **Entrenadores** - Invitar entrenadores
7. **Pagos** - Configuración de Stripe

**Puntos de fricción identificados:**
- 7 pasos pueden ser demasiados para un primer uso
- No hay opción clara de "saltar" pasos opcionales
- El paso 3 (Estructura) y 4 (Primer grupo) están muy relacionados pero separados
- Después del paso 7, redirige al dashboard pero no hay guía clara de qué hacer después
- El checklist post-onboarding está separado del flujo principal

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

