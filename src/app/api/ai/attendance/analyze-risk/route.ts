// src/app/api/ai/attendance/analyze-risk/route.ts
import { z } from "zod";

import { withTenant } from "@/lib/authz";
import { getAIOrchestrator } from "@/lib/ai/orchestrator";
import { ATTENDANCE_SYSTEM_PROMPT, generateRiskAnalysisPrompt } from "@/lib/ai/prompts/attendance";
import { getScopedAttendanceSnapshot } from "@/lib/ai/attendance-data";
import { withRateLimit, getUserIdentifier } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { apiError, apiSuccess } from "@/lib/api-response";

const bodySchema = z.object({
  athleteId: z.string().uuid(),
  academyId: z.string().uuid(),
});

const handler = withTenant(async (request: Request, context) => {
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("INVALID_PAYLOAD", "athleteId y academyId deben ser UUID válidos", 400);
    }
    const { athleteId, academyId } = parsed.data;
    const snapshot = await getScopedAttendanceSnapshot({
      tenantId: context.tenantId,
      academyId,
      athleteId,
      profile: context.profile,
    });
    if (snapshot.status === "not_found") {
      return apiError("ATHLETE_NOT_FOUND", "No se encontró el atleta en esta academia", 404);
    }
    if (snapshot.status === "forbidden") {
      return apiError("ATHLETE_ACCESS_DENIED", "No tienes permiso para consultar este atleta", 403);
    }

    const relevantRecords = snapshot.records.filter((record) => record.status !== "excused");
    if (relevantRecords.length < 3) {
      return apiSuccess({
        athleteId,
        riskLevel: "low" as const,
        analysis: "Aún no hay suficientes registros para calcular un riesgo fiable.",
        dataPoints: relevantRecords.length,
        insufficientData: true,
      });
    }

    const attendanceHistory = relevantRecords.slice(0, 20).map((record) => ({
      date: typeof record.sessionDate === "string" ? record.sessionDate : record.sessionDate.toISOString(),
      status: record.status,
    }));
    const presentCount = relevantRecords.filter(
      (record) => record.status === "present" || record.status === "late",
    ).length;
    const lastAttendance = attendanceHistory.find((record) => record.status === "present" || record.status === "late")?.date;

    const orchestrator = getAIOrchestrator();
    const prompt = generateRiskAnalysisPrompt({
      // La identidad del menor no es necesaria para generar el análisis y no
      // se envía al proveedor de IA.
      name: "la gimnasta",
      attendanceHistory,
      totalClasses: relevantRecords.length,
      lastAttendance,
    });

    const response = await orchestrator.execute(prompt, ATTENDANCE_SYSTEM_PROMPT, {
      temperature: 0.2,
      maxTokens: 500,
    });

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
      dataPoints: relevantRecords.length,
      insufficientData: false,
    });
  } catch (error) {
    logger.error("AI attendance risk error", error);
    return apiError("AI_ATTENDANCE_RISK_FAILED", "No se pudo analizar el riesgo de asistencia", 500);
  }
});

export const POST = withRateLimit(handler, {
  identifier: getUserIdentifier,
  limit: 15,
  window: 60,
});
