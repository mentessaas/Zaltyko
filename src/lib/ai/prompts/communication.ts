// src/lib/ai/prompts/communication.ts

export const COMMUNICATION_SYSTEM_PROMPT = `Eres un asistente de IA especializado en comunicación para padres de atletas en academias deportivas.
Tu objetivo es generar updates de progreso positivos, recordatorios útiles y respuestas a preguntas frecuentes.
Sé empático, motivador y transparente.`;

export function generateProgressUpdatePrompt(athleteData: {
  name: string;
  age: number;
  recentAssessments: Array<{
    date: string;
    skill: string;
    score: number;
    notes?: string;
  }>;
  attendanceRate: number;
  classesThisMonth: number;
}): string {
  return `
Genera un update de progreso para los padres del atleta ${athleteData.name} (${athleteData.age} años).

Evaluaciones recientes:
${athleteData.recentAssessments.map(a => `- ${a.date}: ${a.skill} - ${a.score}/10${a.notes ? ` (${a.notes})` : ''}`).join('\n')}

Estadísticas del mes:
- Clases asistidas: ${athleteData.classesThisMonth}
- Tasa de asistencia: ${athleteData.attendanceRate}%

El update debe:
- Ser positivo y motivador
- Destacar logros específicos
- Mencionar áreas de mejora de forma constructiva
- Incluir recomendaciones para los padres
- Ser apropiado para padres de un niño de ${athleteData.age} años
`;
}

export function generateClassReminderPrompt(classData: {
  athleteName: string;
  className: string;
  date: string;
  time: string;
  location: string;
  coachName: string;
}): string {
  return `
Genera un recordatorio de clase para los padres del atleta ${classData.athleteName}.

Detalles de la clase:
- Clase: ${classData.className}
- Fecha: ${classData.date}
- Hora: ${classData.time}
- Ubicación: ${classData.location}
- Entrenador: ${classData.coachName}

El recordatorio debe:
- Ser breve y claro
- Incluir los detalles importantes
- Tener tono amigable y motivador
`;
}

export function generateChatResponsePrompt(context: {
  question: string;
  athleteInfo?: {
    name: string;
    classes: string[];
    nextClass?: string;
  };
  faq?: Array<{ question: string; answer: string }>;
}): string {
  return `
Eres un asistente de una academia deportiva. Responde la siguiente pregunta de un padre:

Pregunta: ${context.question}

${context.athleteInfo ? `
Información del atleta:
- Nombre: ${context.athleteInfo.name}
- Clases: ${context.athleteInfo.classes.join(', ')}
${context.athleteInfo.nextClass ? `- Próxima clase: ${context.athleteInfo.nextClass}` : ''}
` : ''}

${context.faq ? `
Preguntas frecuentes de referencia:
${context.faq.map(f => `P: ${f.question}\nR: ${f.answer}`).join('\n\n')}` : ''}

Responde de manera:
- Clara y concisa
- Amigable y profesional
- Acorde basada en la información disponible
Si no tienes suficiente información, indica que el padre debe contactar a la academia directamente.
`;
}
