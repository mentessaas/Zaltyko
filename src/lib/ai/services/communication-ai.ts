// src/lib/ai/services/communication-ai.ts
import { getAIOrchestrator } from '../orchestrator';
import {
  COMMUNICATION_SYSTEM_PROMPT,
  generateProgressUpdatePrompt,
  generateClassReminderPrompt,
  generateChatResponsePrompt
import { ProgressUpdate, ChatResponse } from '../types';

export async function generateProgressUpdate(athleteData: {
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
}): Promise<ProgressUpdate> {
  const orchestrator = getAIOrchestrator();
  const prompt = generateProgressUpdatePrompt(athleteData);
  const response = await orchestrator.execute(prompt, COMMUNICATION_SYSTEM_PROMPT, {
    temperature: 0.7,
    maxTokens: 800,
  });

  return {
    athleteId: '',
    summary: response.content,
    highlights: [],
    recommendations: [],
  };
}

export async function generateClassReminder(classData: {
  athleteName: string;
  className: string;
  date: string;
  time: string;
  location: string;
  coachName: string;
}): Promise<string> {
  const orchestrator = getAIOrchestrator();
  const prompt = generateClassReminderPrompt(classData);
  const response = await orchestrator.execute(prompt, COMMUNICATION_SYSTEM_PROMPT, {
    temperature: 0.5,
    maxTokens: 300,
  });

  return response.content;
}

export async function getChatResponse(context: {
  question: string;
  athleteInfo?: {
    name: string;
    classes: string[];
    nextClass?: string;
  };
}): Promise<ChatResponse> {
  const orchestrator = getAIOrchestrator();
  const prompt = generateChatResponsePrompt(context);
  const response = await orchestrator.execute(prompt, COMMUNICATION_SYSTEM_PROMPT, {
    temperature: 0.6,
    maxTokens: 500,
  });

  return {
    message: response.content,
    suggestedActions: [],
  };
}
