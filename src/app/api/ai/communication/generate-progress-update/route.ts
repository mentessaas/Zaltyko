import { NextRequest } from "next/server";
import { getAIOrchestrator } from "@/lib/ai/orchestrator";
import { COMMUNICATION_SYSTEM_PROMPT, generateProgressUpdatePrompt } from "@/lib/ai/prompts/communication";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { athleteId, name, age, recentAssessments, attendanceRate, classesThisMonth } = body;

    if (!name || !age || !recentAssessments) {
      return apiError("VALIDATION_ERROR", "Faltan campos requeridos: name, age, recentAssessments", 400);
    }

    const orchestrator = getAIOrchestrator();
    const prompt = generateProgressUpdatePrompt({
      name,
      age,
      recentAssessments,
      attendanceRate: attendanceRate || 0,
      classesThisMonth: classesThisMonth || 0,
    });

    const response = await orchestrator.execute(prompt, COMMUNICATION_SYSTEM_PROMPT, {
      temperature: 0.7,
      maxTokens: 800,
    });

    return apiSuccess({
      athleteId,
      summary: response.content,
    });
  } catch (error) {
    console.error("AI progress update error:", error);
    return apiError("INTERNAL_ERROR", "Error al generar la actualización", 500);
  }
}
