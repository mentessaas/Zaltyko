import { z } from "zod";

import { getAIOrchestrator } from "@/lib/ai/orchestrator";
import { COMMUNICATION_SYSTEM_PROMPT, generateProgressUpdatePrompt } from "@/lib/ai/prompts/communication";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { withTenant } from "@/lib/authz";
import { getScopedAttendanceSnapshot } from "@/lib/ai/attendance-data";
import { withRateLimit, getUserIdentifier } from "@/lib/rate-limit";

const assessmentSchema = z.object({
  date: z.string().trim().min(1).max(40),
  skill: z.string().trim().min(1).max(160),
  score: z.number().finite().min(0).max(10),
  notes: z.string().trim().max(1200).optional(),
});

const bodySchema = z.object({
  athleteId: z.string().uuid(),
  academyId: z.string().uuid(),
  recentAssessments: z.array(assessmentSchema).max(20),
});

function calculateAge(dob: string | Date | null): number | null {
  if (!dob) return null;
  const birthDate = dob instanceof Date ? dob : new Date(`${dob}T00:00:00Z`);
  if (Number.isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDelta = today.getUTCMonth() - birthDate.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getUTCDate() < birthDate.getUTCDate())) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

const handler = withTenant(async (req: Request, context) => {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return apiError("INVALID_PAYLOAD", "Los datos del progreso no son válidos", 400);
    }
    const { athleteId, academyId, recentAssessments } = parsed.data;
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
    if (recentAssessments.length === 0) {
      return apiSuccess({
        athleteId,
        summary: "Aún no hay evaluaciones suficientes para generar una actualización de progreso.",
        dataPoints: 0,
        insufficientData: true,
      });
    }

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthRecords = snapshot.records.filter((record) => {
      const value = record.sessionDate instanceof Date
        ? record.sessionDate
        : new Date(`${record.sessionDate}T00:00:00Z`);
      return !Number.isNaN(value.getTime()) && value >= monthStart;
    });
    const attendedThisMonth = monthRecords.filter(
      (record) => record.status === "present" || record.status === "late",
    ).length;
    const attendanceRate = monthRecords.length > 0
      ? Math.round((attendedThisMonth / monthRecords.length) * 100)
      : 0;

    const orchestrator = getAIOrchestrator();
    const prompt = generateProgressUpdatePrompt({
      name: "la gimnasta",
      age: calculateAge(snapshot.athlete.dob),
      recentAssessments,
      attendanceRate,
      classesThisMonth: monthRecords.length,
    });

    const response = await orchestrator.execute(prompt, COMMUNICATION_SYSTEM_PROMPT, {
      temperature: 0.3,
      maxTokens: 800,
    });

    return apiSuccess({
      athleteId,
      summary: response.content,
      dataPoints: recentAssessments.length,
      insufficientData: false,
    });
  } catch (error) {
    logger.error("AI progress update error:", error);
    return apiError("AI_PROGRESS_UPDATE_FAILED", "No se pudo generar la actualización", 500);
  }
});

export const POST = withRateLimit(handler, {
  identifier: getUserIdentifier,
  limit: 10,
  window: 60,
});
