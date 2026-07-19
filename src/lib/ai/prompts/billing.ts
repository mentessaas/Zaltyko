// src/lib/ai/prompts/billing.ts

export const BILLING_SYSTEM_PROMPT = `Eres un asistente de IA especializado en gestión de cobros para academias deportivas.
Tu objetivo es ayudar a predecir morosos, generar recordatorios efectivos y sugerir planes de pago.
Sé profesional, empático y orientado a soluciones.`;

export function generateDelinquencyPrompt(athleteData: {
  name: string;
  paymentHistory: Array<{ date: string; amount: number; status: string }>;
  lastPaymentDate?: string;
  pendingAmount?: number;
}): string {
  return `
Analiza el siguiente historial de pagos del atleta ${athleteData.name}:

Historial de pagos:
${athleteData.paymentHistory.map(p => `- ${p.date}: $${p.amount} - ${p.status}`).join('\n')}

${athleteData.lastPaymentDate ? `Último pago: ${athleteData.lastPaymentDate}` : ''}
${athleteData.pendingAmount ? `Monto pendiente: $${athleteData.pendingAmount}` : ''}

Basándote en el historial, responde:
1. ¿Cuál es la probabilidad de que este atleta no pague? (0-100%)
2. ¿Qué factores contribuyen a esta evaluación?
3. ¿Qué recomendación das al administrador?
`;
}

export function generateReminderPrompt(athleteData: {
  name: string;
  pendingAmount: number;
  dueDate: string;
  academyName: string;
}): string {
  return `
Genera un recordatorio de pago personalizado para el atleta ${athleteData.name} de la academia ${athleteData.academyName}.

Detalles:
- Monto pendiente: $${athleteData.pendingAmount}
- Fecha de vencimiento: ${athleteData.dueDate}

El recordatorio debe ser:
- Profesional pero amigable
- Claro sobre el monto y fecha
- Incluir llamada a la acción
- Breve (máximo 2 párrafos)

Devuelve solo el mensaje del recordatorio.
`;
}

export function generatePaymentPlanPrompt(athleteData: {
  name: string;
  pendingAmount: number;
  paymentHistory: Array<{ date: string; amount: number }>;
}): string {
  return `
El atleta ${athleteData.name} tiene un saldo pendiente de $${athleteData.pendingAmount}.

Historial de pagos:
${athleteData.paymentHistory.map(p => `- ${p.date}: $${p.amount}`).join('\n')}

Sugiere un plan de pago personalizado considerando:
1. Capacidad de pago basada en historial
2. Opciones de cuotas
3. Incentivos por pago anticipado
4. Consecuencias de no pagar

Sé práctico y orientado a soluciones.
`;
}
