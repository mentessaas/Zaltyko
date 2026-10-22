// src/lib/ai/services/billing-ai.ts
import { getAIOrchestrator } from '../orchestrator';
import {
  BILLING_SYSTEM_PROMPT,
  generateDelinquencyPrompt,
  generateReminderPrompt,
  generatePaymentPlanPrompt
} from '../prompts/billing';
import { DelinquencyPrediction, PaymentReminder } from '../types';

export async function predictDelinquency(athleteData: {
  name: string;
  paymentHistory: Array<{ date: string; amount: number; status: string }>;
  lastPaymentDate?: string;
  pendingAmount?: number;
}): Promise<DelinquencyPrediction> {
  const orchestrator = getAIOrchestrator();
  const prompt = generateDelinquencyPrompt(athleteData);
  const response = await orchestrator.execute(prompt, BILLING_SYSTEM_PROMPT);

  return parseDelinquencyResponse(response.content, athleteData.name);
}

export async function generatePaymentReminder(athleteData: {
  name: string;
  pendingAmount: number;
  dueDate: string;
  academyName: string;
}): Promise<PaymentReminder> {
  const orchestrator = getAIOrchestrator();
  const prompt = generateReminderPrompt(athleteData);
  const response = await orchestrator.execute(prompt, BILLING_SYSTEM_PROMPT, {
    temperature: 0.5,
    maxTokens: 500,
  });

  return {
    athleteId: '',
    message: response.content,
    tone: 'friendly',
  };
}

export async function suggestPaymentPlan(athleteData: {
  name: string;
  pendingAmount: number;
  paymentHistory: Array<{ date: string; amount: number }>;
}): Promise<string> {
  const orchestrator = getAIOrchestrator();
  const prompt = generatePaymentPlanPrompt(athleteData);
  const response = await orchestrator.execute(prompt, BILLING_SYSTEM_PROMPT);

  return response.content;
}

function parseDelinquencyResponse(content: string, athleteName: string): DelinquencyPrediction {
  const probabilityMatch = content.match(/(\d+)%/);
  const probability = probabilityMatch ? parseInt(probabilityMatch[1]) / 100 : 0.5;

  return {
    athleteId: '',
    probability,
    factors: [],
    recommendation: content,
  };
}
