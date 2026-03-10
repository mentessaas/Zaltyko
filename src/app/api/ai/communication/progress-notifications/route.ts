// src/app/api/ai/communication/progress-notifications/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAIOrchestrator } from "@/lib/ai/orchestrator";
import { COMMUNICATION_SYSTEM_PROMPT, generateProgressUpdatePrompt } from "@/lib/ai/prompts/communication";
import { db } from "@/db";
import { athletes, profiles } from "@/db/schema";
import { eq, and } from "drizzle-orm";

// POST /api/ai/communication/progress-notifications
// Body: { academyId: string, athleteId?: string }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { academyId, athleteId } = body;

    if (!academyId) {
      return NextResponse.json({ error: "academyId is required" }, { status: 400 });
    }

    // Get athletes for the academy
    const athletesQuery = athleteId
      ? db.select().from(athletes).where(and(eq(athletes.id, athleteId), eq(athletes.academyId, academyId)))
      : db.select().from(athletes).where(and(eq(athletes.academyId, academyId), eq(athletes.status, "active")));

    const athletesList = await athletesQuery.limit(20);

    const results = [];

    const now = new Date();

    for (const athlete of athletesList) {
      try {
        // Get parent info if available
        const parentInfo = athlete.userId
          ? await db.select({ name: profiles.name }).from(profiles).where(eq(profiles.userId, athlete.userId)).limit(1)
          : [];

        // Calculate age from DOB
        let age = 10;
        if (athlete.dob) {
          const dob = new Date(athlete.dob);
          age = Math.floor((now.getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        }

        // Generate progress update using AI
        const orchestrator = getAIOrchestrator();
        const prompt = generateProgressUpdatePrompt({
          name: athlete.name,
          age,
          recentAssessments: [],
          attendanceRate: 85, // Default value
          classesThisMonth: 8, // Default value
        });

        const response = await orchestrator.execute(prompt, COMMUNICATION_SYSTEM_PROMPT, {
          temperature: 0.7,
          maxTokens: 800,
        });

        results.push({
          athleteId: athlete.id,
          athleteName: athlete.name,
          parentName: parentInfo[0]?.name || null,
          parentEmail: null,
          progressUpdate: response.content,
          generated: true,
        });
      } catch (error) {
        console.error(`Error generating progress for athlete ${athlete.id}:`, error);
        results.push({
          athleteId: athlete.id,
          athleteName: athlete.name,
          error: "Failed to generate progress update",
          generated: false,
        });
      }
    }

    const successful = results.filter((r) => r.generated).length;
    const failed = results.filter((r) => !r.generated).length;

    return NextResponse.json({
      results,
      summary: {
        total: results.length,
        successful,
        failed,
      },
    });
  } catch (error) {
    console.error("Error generating progress notifications:", error);
    return NextResponse.json({ error: "Failed to generate progress notifications" }, { status: 500 });
  }
}
