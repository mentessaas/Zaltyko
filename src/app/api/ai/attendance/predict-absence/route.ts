// src/app/api/ai/attendance/predict-absence/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { withTenant } from "@/lib/authz";
import { getAIOrchestrator } from "@/lib/ai/orchestrator";
import { ATTENDANCE_SYSTEM_PROMPT, generateAbsencePredictionPrompt } from "@/lib/ai/prompts/attendance";

export const GET = withTenant(async (request: Request) => {
  try {
    const url = new URL(request.url);
    const { searchParams } = url;
    const athleteId = searchParams.get("athleteId");
    const academyId = searchParams.get("academyId");

    if (!athleteId || !academyId) {
      return NextResponse.json(
        { error: "Missing required parameters: athleteId, academyId" },
        { status: 400 }
      );
    }

    // Obtener datos de asistencia del atleta
    const attendanceRes = await fetch(
      `${url.origin}/api/attendance/records?academyId=${academyId}&athleteId=${athleteId}`
    );

    let attendanceData: any = {};
    if (attendanceRes.ok) {
      attendanceData = await attendanceRes.json();
    }

    // Obtener patrón de días de la semana
    const records = attendanceData.records || attendanceData.items || [];
    const dayOfWeekPattern = records.map((r: any) => ({
      dayOfWeek: new Date(r.date || r.sessionDate).getDay(),
      present: r.status === "present",
    }));

    // Calcular probabilidad basada en historial simple
    const totalClasses = records.length;
    const presentClasses = records.filter((r: any) => r.status === "present").length;
    const attendanceRate = totalClasses > 0 ? presentClasses / totalClasses : 0.5;

    // Usar AI para predicción más avanzada
    const orchestrator = getAIOrchestrator();
    const prompt = generateAbsencePredictionPrompt({
      name: attendanceData.athleteName || "Atleta",
      attendancePattern: dayOfWeekPattern.slice(-20), // Últimos 20 registros
      upcomingSchedule: [], // En una implementación real, obteríamos los próximos horarios
    });

    let prediction = 1 - attendanceRate; // Probabilidad de ausencia es inverso a asistencia

    try {
      const response = await orchestrator.execute(prompt, ATTENDANCE_SYSTEM_PROMPT);
      // Intentar parsear respuesta de AI
      const content = response.content.toLowerCase();
      if (content.includes("alto") || content.includes("high")) {
        prediction = Math.max(prediction, 0.7);
      } else if (content.includes("medio") || content.includes("medium")) {
        prediction = (prediction + 0.4) / 2;
      } else if (content.includes("bajo") || content.includes("low")) {
        prediction = Math.min(prediction, 0.2);
      }
    } catch (aiError) {
      console.error("AI prediction error:", aiError);
      // Usar predicción basada en datos históricos
    }

    return NextResponse.json({
      athleteId,
      probability: prediction,
      confidence: attendanceRate > 0.8 ? 0.9 : attendanceRate > 0.5 ? 0.7 : 0.5,
      date: new Date().toISOString().split("T")[0],
    });
  } catch (error) {
    console.error("AI predict absence error:", error);
    return NextResponse.json(
      { error: "Failed to predict absence" },
      { status: 500 }
    );
  }
});
