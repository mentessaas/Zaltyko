// src/app/api/ai/attendance/analyze-risk/route.ts
import { withTenant } from '@/lib/authz';
import { getAIOrchestrator } from '@/lib/ai/orchestrator';
import { ATTENDANCE_SYSTEM_PROMPT, generateRiskAnalysisPrompt } from '@/lib/ai/prompts/attendance';
import { logger } from "@/lib/logger";
import { apiError, apiSuccess } from "@/lib/api-response";

export const POST = withTenant(async (request: Request) => {
  try {
    const body = await request.json();
    const { athleteId, name, attendanceHistory, totalClasses, lastAttendance } = body;

    if (!name || !attendanceHistory || !totalClasses) {
      return apiError("INVALID_PAYLOAD", "Missing required fields: name, attendanceHistory, totalClasses", 400);
    }

    const orchestrator = getAIOrchestrator();
    const prompt = generateRiskAnalysisPrompt({
      name,
      attendanceHistory,
      totalClasses,
      lastAttendance,
    });

    const response = await orchestrator.execute(prompt, ATTENDANCE_SYSTEM_PROMPT);

    // Parse risk level
    const lowerContent = response.content.toLowerCase();
    let riskLevel: 'low' | 'medium' | 'high' = 'medium';

    if (lowerContent.includes('bajo') || lowerContent.includes('low')) {
      riskLevel = 'low';
    } else if (lowerContent.includes('alto') || lowerContent.includes('high')) {
      riskLevel = 'high';
    }

    return apiSuccess({
      athleteId,
      riskLevel,
      analysis: response.content,
    });
  } catch (error) {
    logger.error('AI attendance risk error:', error);
    return apiError("AI_ATTENDANCE_RISK_FAILED", "Failed to analyze attendance risk", 500);
  }
});
