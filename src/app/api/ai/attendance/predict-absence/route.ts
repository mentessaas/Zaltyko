import { z } from "zod";

import { withTenant } from "@/lib/authz";
import { getAIOrchestrator } from "@/lib/ai/orchestrator";
import { ATTENDANCE_SYSTEM_PROMPT, generateAbsencePredictionPrompt } from "@/lib/ai/prompts/attendance";
import { getScopedAttendanceSnapshot } from "@/lib/ai/attendance-data";
import { withRateLimit, getUserIdentifier } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { apiError, apiSuccess } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  athleteId: z.string().uuid(),
  academyId: z.string().uuid(),
});

function toIsoDate(value: string | Date): string | null {
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

const handler = withTenant(async (request, context) => {
  try {
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) {
      return apiError("INVALID_QUERY", "athleteId y academyId deben ser UUID válidos", 400);
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
    const records = snapshot.records;

    // Una ausencia justificada no debe penalizar la tasa; tampoco debe
    // considerarse una asistencia. Con menos de cinco observaciones no
    // mostramos una predicción con apariencia de certeza.
    const relevantRecords = records.filter((record) => record.status !== "excused");
    const attendedClasses = relevantRecords.filter(
      (record) => record.status === "present" || record.status === "late",
    ).length;
    const attendanceRate = relevantRecords.length > 0
      ? attendedClasses / relevantRecords.length
      : 0.5;
    let prediction = 1 - attendanceRate;
    let confidence = relevantRecords.length >= 10 ? 0.85 : relevantRecords.length >= 5 ? 0.6 : 0.25;

    if (relevantRecords.length >= 5) {
      const dayOfWeekPattern = relevantRecords.slice(0, 20).flatMap((record) => {
        const date = toIsoDate(record.sessionDate);
        if (!date) return [];
        return [{
          dayOfWeek: new Date(`${date}T00:00:00Z`).getUTCDay(),
          present: record.status === "present" || record.status === "late",
        }];
      });

      try {
        const response = await getAIOrchestrator().execute(
          generateAbsencePredictionPrompt({
            // No enviamos el nombre de un menor al proveedor de IA: la
            // predicción no necesita identidad para ser útil en el panel.
            name: "la gimnasta",
            attendancePattern: dayOfWeekPattern,
            upcomingSchedule: [],
          }),
          ATTENDANCE_SYSTEM_PROMPT,
          { temperature: 0.2, maxTokens: 256 },
        );
        const content = response.content.toLowerCase();
        if (/\b(alto|high)\b/.test(content)) {
          prediction = Math.max(prediction, 0.7);
        } else if (/\b(medio|medium)\b/.test(content)) {
          prediction = (prediction + 0.4) / 2;
        } else if (/\b(bajo|low)\b/.test(content)) {
          prediction = Math.min(prediction, 0.2);
        }
      } catch (aiError) {
        // La heurística histórica sigue siendo válida si el proveedor no está
        // disponible; no convertimos una caída de IA en una caída del panel.
        logger.warn("AI absence prediction unavailable; using attendance history", {
          error: aiError instanceof Error ? aiError.message : String(aiError),
          athleteId,
        });
        confidence = Math.min(confidence, 0.6);
      }
    }

    return apiSuccess({
      athleteId,
      probability: Math.min(1, Math.max(0, prediction)),
      confidence,
      insufficientData: relevantRecords.length < 5,
      dataPoints: relevantRecords.length,
      date: new Date().toISOString().split("T")[0],
    });
  } catch (error) {
    logger.error("AI predict absence error", error);
    return apiError("AI_ABSENCE_PREDICTION_FAILED", "No se pudo calcular el riesgo de inasistencia", 500);
  }
});

// Es una lectura cara (consulta + proveedor de IA); el límite se aplica por
// usuario/IP antes de ejecutar el handler y la autorización de academia sigue
// ocurriendo dentro de withTenant.
export const GET = withRateLimit(handler, {
  identifier: getUserIdentifier,
  limit: 15,
  window: 60,
});
