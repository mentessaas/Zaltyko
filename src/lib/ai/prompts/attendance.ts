// src/lib/ai/prompts/attendance.ts

export const ATTENDANCE_SYSTEM_PROMPT = `Eres un asistente de IA especializado en análisis de asistencia para academias deportivas.
Tu objetivo es identificar atletas en riesgo de abandono, predecir inasistencias y analizar patrones de grupos.
Sé analítico y proporciona recomendaciones concretas.`;

export function generateRiskAnalysisPrompt(athleteData: {
  name: string;
  attendanceHistory: Array<{ date: string; status: string }>;
  totalClasses: number;
  lastAttendance?: string;
}): string {
  const presentCount = athleteData.attendanceHistory.filter(a => a.status === 'present').length;
  const attendanceRate = athleteData.totalClasses > 0
    ? Math.round((presentCount / athleteData.totalClasses) * 100)
    : 0;

  return `
Analiza el riesgo de abandono del atleta ${athleteData.name}:

Historial de asistencia:
${athleteData.attendanceHistory.slice(-10).map(a => `- ${a.date}: ${a.status}`).join('\n')}

Estadísticas:
- Tasa de asistencia: ${attendanceRate}%
- Total de clases: ${athleteData.totalClasses}
${athleteData.lastAttendance ? `- Última asistencia: ${athleteData.lastAttendance}` : ''}

Responde:
1. Nivel de riesgo: bajo, medio o alto
2. Factores que contribuyen al riesgo
3. Recomendaciones específicas para retener al atleta
`;
}

export function generateAbsencePredictionPrompt(athleteData: {
  name: string;
  attendancePattern: {
    dayOfWeek: number;
    present: boolean;
  }[];
  upcomingSchedule: string[];
}): string {
  return `
Basándote en los patrones de asistencia del atleta ${athleteData.name}:

Patrones históricos:
${athleteData.attendancePattern.map(p => `- Día ${p.dayOfWeek}: ${p.present ? 'presente' : 'ausente'}`).join('\n')}

Próximas sesiones programadas:
${athleteData.upcomingSchedule.join('\n')}

Predice:
1. Probabilidad de ausencia para cada próxima sesión
2. Qué días son más propensos a faltar
3. Nivel de confianza en la predicción
`;
}

export function generateGroupInsightsPrompt(groupData: {
  name: string;
  athletes: Array<{
    name: string;
    attendanceRate: number;
    avgPerformance: number;
  }>;
}): string {
  return `
Analiza el grupo "${groupData.name}" con los siguientes atletas:

${groupData.athletes.map(a => `- ${a.name}: ${a.attendanceRate}% asistencia, rendimiento ${a.avgPerformance}/10`).join('\n')}

Proporciona insights sobre:
1. Distribución de rendimiento
2. Patrones de asistencia del grupo
3. Recomendaciones para mejorar el grupo
4. Atletas que destacan o necesitan atención
`;
}
