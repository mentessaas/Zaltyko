// src/lib/ai/services/attendance-ai.ts
import { getAIOrchestrator } from '../orchestrator';
import {
  ATTENDANCE_SYSTEM_PROMPT,
  generateRiskAnalysisPrompt,
  generateAbsencePredictionPrompt,
  generateGroupInsightsPrompt
} from '../prompts/attendance';
import { RiskAnalysis, AbsencePrediction } from '../types';

export async function analyzeAttendanceRisk(athleteData: {
  name: string;
  attendanceHistory: Array<{ date: string; status: string }>;
  totalClasses: number;
  lastAttendance?: string;
}): Promise<RiskAnalysis> {
  const orchestrator = getAIOrchestrator();
  const prompt = generateRiskAnalysisPrompt(athleteData);
  const response = await orchestrator.execute(prompt, ATTENDANCE_SYSTEM_PROMPT);

  return parseRiskAnalysisResponse(response.content);
}

export async function predictAbsence(athleteData: {
  name: string;
  attendancePattern: Array<{ dayOfWeek: number; present: boolean }>;
  upcomingSchedule: string[];
}): Promise<AbsencePrediction[]> {
  const orchestrator = getAIOrchestrator();
  const prompt = generateAbsencePredictionPrompt(athleteData);
  const response = await orchestrator.execute(prompt, ATTENDANCE_SYSTEM_PROMPT);

  return [{
    athleteId: '',
    probability: 0.5,
    date: athleteData.upcomingSchedule[0] || '',
    confidence: 0.5,
  }];
}

export async function getGroupInsights(groupData: {
  name: string;
  athletes: Array<{
    name: string;
    attendanceRate: number;
    avgPerformance: number;
  }>;
}): Promise<string> {
  const orchestrator = getAIOrchestrator();
  const prompt = generateGroupInsightsPrompt(groupData);
  const response = await orchestrator.execute(prompt, ATTENDANCE_SYSTEM_PROMPT);

  return response.content;
}

function parseRiskAnalysisResponse(content: string): RiskAnalysis {
  const lowerContent = content.toLowerCase();
  let riskLevel: 'low' | 'medium' | 'high' = 'medium';

  if (lowerContent.includes('bajo') || lowerContent.includes('low')) {
    riskLevel = 'low';
  } else if (lowerContent.includes('alto') || lowerContent.includes('high')) {
    riskLevel = 'high';
  }

  return {
    athleteId: '',
    riskLevel,
    factors: [],
    recommendations: content.split('\n').filter(l => l.trim()),
  };
}
