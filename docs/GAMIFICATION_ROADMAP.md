# Roadmap de Gamificación - Zaltyko SaaS

## 📋 Resumen Ejecutivo

Este documento define la estrategia de gamificación para Zaltyko SaaS, diseñada para aumentar el engagement de atletas, coaches y academias mediante mecánicas de juego que fomenten el progreso, la competencia saludable y el reconocimiento de logros.

## 🎯 Objetivos

1. **Aumentar retención de atletas**: Reducir churn en un 25% mediante engagement continuo
2. **Motivar progreso**: Incentivar asistencia regular y mejora de habilidades
3. **Fomentar comunidad**: Crear sentido de pertenencia y competencia saludable
4. **Diferenciación**: Posicionar Zaltyko como la plataforma más innovadora del sector

## 🎮 Mecánicas de Gamificación Propuestas

### 1. Sistema de Puntos y Niveles

**Atletas**:
- **Puntos de Experiencia (XP)**: Ganados por asistencia, completar evaluaciones, mejorar habilidades
- **Niveles**: Principiante → Intermedio → Avanzado → Experto → Maestro
- **Visualización**: Barra de progreso en perfil y dashboard

**Implementación**:
```typescript
// Tabla: athlete_gamification
{
  athleteId: uuid,
  totalXP: number,
  currentLevel: number,
  nextLevelXP: number,
  streak: number, // días consecutivos de asistencia
  lastActivityDate: date
}
```

**Reglas de XP**:
- Asistencia a clase: +10 XP
- Racha de 7 días: +50 XP bonus
- Completar evaluación: +25 XP
- Mejorar skill rating: +15 XP por nivel
- Participar en evento: +30 XP

### 2. Sistema de Logros (Achievements)

**Categorías**:
- **Asistencia**: "Nunca falta", "Madrugador", "Guerrero del fin de semana"
- **Progreso**: "Primera voltereta", "Maestro del equilibrio", "Campeón de flexibilidad"
- **Social**: "Compañero ejemplar", "Mentor", "Líder de equipo"
- **Eventos**: "Competidor", "Medallista", "Campeón"

**Implementación**:
```typescript
// Tabla: achievements
{
  id: uuid,
  code: string, // "attendance_streak_30"
  name: string,
  description: string,
  category: enum,
  icon: string,
  xpReward: number,
  criteria: jsonb // condiciones para desbloquear
}

// Tabla: athlete_achievements
{
  athleteId: uuid,
  achievementId: uuid,
  unlockedAt: timestamp,
  progress: number // 0-100%
}
```

**Ejemplos de Logros**:
1. **"Racha Imparable"**: 30 días consecutivos de asistencia
2. **"Maestro de Habilidades"**: Alcanzar nivel 5 en 10 habilidades diferentes
3. **"Madrugador"**: Asistir a 20 clases antes de las 8 AM
4. **"Competidor Nato"**: Participar en 5 eventos competitivos

### 3. Tablas de Clasificación (Leaderboards)

**Tipos**:
- **Por Academia**: Ranking de atletas dentro de cada academia
- **Por Grupo**: Competencia entre grupos de edad/nivel
- **Global**: Top atletas a nivel plataforma (opcional)
- **Temporal**: Semanal, mensual, anual

**Métricas**:
- Total XP acumulado
- Racha de asistencia actual
- Número de logros desbloqueados
- Puntuación en evaluaciones

**Implementación**:
```typescript
// Vista materializada para performance
CREATE MATERIALIZED VIEW leaderboard_weekly AS
SELECT 
  athlete_id,
  academy_id,
  SUM(xp_earned) as weekly_xp,
  COUNT(DISTINCT session_date) as sessions_attended,
  RANK() OVER (PARTITION BY academy_id ORDER BY SUM(xp_earned) DESC) as rank
FROM athlete_activity
WHERE session_date >= NOW() - INTERVAL '7 days'
GROUP BY athlete_id, academy_id;
```

### 4. Recompensas y Badges

**Sistema de Badges**:
- **Visuales**: Iconos coleccionables mostrados en perfil
- **Niveles**: Bronce, Plata, Oro, Platino
- **Rareza**: Común, Raro, Épico, Legendario

**Recompensas Tangibles** (opcional para academias):
- Descuentos en mensualidad
- Merchandising exclusivo
- Clases especiales con coaches invitados
- Prioridad en inscripción a eventos

### 5. Desafíos y Misiones

**Desafíos Semanales**:
- "Asiste a 5 clases esta semana"
- "Mejora tu puntuación en flexibilidad"
- "Ayuda a un compañero nuevo"

**Misiones Personalizadas**:
- Basadas en nivel del atleta
- Adaptadas a objetivos individuales
- Progreso trackeable en tiempo real

**Implementación**:
```typescript
// Tabla: challenges
{
  id: uuid,
  type: enum, // 'weekly', 'monthly', 'personal'
  title: string,
  description: string,
  startDate: date,
  endDate: date,
  criteria: jsonb,
  xpReward: number,
  badgeReward: uuid?
}

// Tabla: athlete_challenges
{
  athleteId: uuid,
  challengeId: uuid,
  progress: number,
  completedAt: timestamp?
}
```

## 📱 Interfaz de Usuario

### Dashboard de Gamificación

**Componentes**:
1. **Barra de Nivel**: Progreso visual hacia siguiente nivel
2. **XP Reciente**: Últimas actividades que generaron puntos
3. **Logros Destacados**: 3-4 logros más recientes o próximos a desbloquear
4. **Ranking**: Posición en leaderboard de academia
5. **Desafíos Activos**: Progreso en desafíos actuales

**Mockup**:
```
┌─────────────────────────────────────┐
│ 🏆 Nivel 12 - Atleta Avanzado      │
│ ████████████░░░░ 1,250 / 1,500 XP  │
├─────────────────────────────────────┤
│ 🎯 Desafíos Activos                │
│ • Asiste 5 veces (3/5) ████░░      │
│ • Mejora flexibilidad ██████       │
├─────────────────────────────────────┤
│ 🏅 Logros Recientes                │
│ [🔥] Racha de 14 días              │
│ [⭐] Primera competencia            │
│ [🎖️] 50 clases completadas         │
├─────────────────────────────────────┤
│ 📊 Tu Ranking                      │
│ #5 en tu academia (↑2)             │
│ #12 en tu grupo de edad            │
└─────────────────────────────────────┘
```

### Notificaciones

**Eventos que disparan notificaciones**:
- Logro desbloqueado
- Subida de nivel
- Nuevo desafío disponible
- Cambio en ranking (top 10)
- Racha en peligro (no asistencia en 2 días)

## 🔧 Implementación Técnica

### Fase 1: Fundamentos (2-3 semanas)

**Backend**:
- [ ] Crear tablas de gamificación
- [ ] Implementar sistema de XP
- [ ] Crear calculadora de niveles
- [ ] API endpoints para gamificación

**Frontend**:
- [ ] Componente de barra de nivel
- [ ] Dashboard de gamificación
- [ ] Perfil con badges

### Fase 2: Logros y Desafíos (2-3 semanas)

**Backend**:
- [ ] Sistema de logros
- [ ] Motor de evaluación de criterios
- [ ] Desafíos semanales automáticos

**Frontend**:
- [ ] Galería de logros
- [ ] Vista de desafíos activos
- [ ] Animaciones de desbloqueo

### Fase 3: Leaderboards (1-2 semanas)

**Backend**:
- [ ] Vistas materializadas
- [ ] Cálculo de rankings
- [ ] Caché de leaderboards

**Frontend**:
- [ ] Componente de leaderboard
- [ ] Filtros por periodo/categoría
- [ ] Perfil público de atletas

### Fase 4: Optimización (1 semana)

- [ ] Performance tuning
- [ ] A/B testing de mecánicas
- [ ] Analytics de engagement
- [ ] Ajuste de balanceo (XP, niveles)

## 📊 Métricas de Éxito

**KPIs a trackear**:
- Tasa de retención de atletas (objetivo: +25%)
- Frecuencia de asistencia (objetivo: +15%)
- Engagement con features de gamificación (objetivo: 60% usuarios activos)
- Tiempo en plataforma (objetivo: +30%)
- NPS de atletas (objetivo: >8.5)

**Analytics**:
```typescript
// Eventos a trackear
{
  'gamification.xp_earned': { source, amount },
  'gamification.level_up': { oldLevel, newLevel },
  'gamification.achievement_unlocked': { achievementId },
  'gamification.challenge_completed': { challengeId },
  'gamification.leaderboard_viewed': { type, period }
}
```

## 🎨 Consideraciones de Diseño

**Principios**:
1. **No intrusivo**: Gamificación como complemento, no distracción
2. **Inclusivo**: Todos los niveles pueden progresar y ganar
3. **Transparente**: Reglas claras de cómo ganar XP y logros
4. **Balanceado**: Evitar "grind" excesivo o progreso demasiado rápido
5. **Significativo**: Logros que reflejen progreso real en gimnasia

**Evitar**:
- Pay-to-win (comprar XP o logros)
- Comparaciones tóxicas entre atletas
- Presión excesiva por competir
- Gamificación que eclipse el objetivo principal (mejorar en gimnasia)

## 🔮 Futuras Expansiones

**V2 Features**:
- Sistema de equipos y competencias entre academias
- Logros colaborativos (toda la clase debe lograr algo)
- Temporadas con recompensas especiales
- Integración con wearables (Apple Watch, Fitbit)
- Realidad aumentada para visualizar progreso

**Gamificación para Coaches**:
- Puntos por engagement con atletas
- Logros por retención y progreso de estudiantes
- Ranking de coaches más efectivos

## 📝 Notas de Implementación

**Prioridad**: Media-Alta (después de features core)
**Esfuerzo estimado**: 6-8 semanas
**Dependencias**: Sistema de evaluaciones, asistencia, eventos
**Riesgo**: Medio (requiere balanceo cuidadoso)

---

*Documento creado: 2025-11-27*
*Próxima revisión: Trimestral*
