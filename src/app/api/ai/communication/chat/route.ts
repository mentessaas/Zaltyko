// src/app/api/ai/communication/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAIOrchestrator } from "@/lib/ai/orchestrator";
import { COMMUNICATION_SYSTEM_PROMPT, generateChatResponsePrompt } from "@/lib/ai/prompts/communication";
import { db } from "@/db";
import { athletes, classSessions, classes, coaches } from "@/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";

// Rate limiting (simple in-memory)
const rateLimit = new Map<string, { count: number; timestamp: number }>();
const RATE_LIMIT = 50;
const RATE_WINDOW = 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimit.get(ip);

  if (!record || now - record.timestamp > RATE_WINDOW) {
    rateLimit.set(ip, { count: 1, timestamp: now });
    return true;
  }

  if (record.count >= RATE_LIMIT) {
    return false;
  }

  record.count++;
  return true;
}

// POST /api/ai/communication/chat
export async function POST(req: NextRequest) {
  // Rate limit check
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  try {
    const body = await req.json();
    const { question, athleteId, parentId, academyId } = body;

    if (!question) {
      return NextResponse.json({ error: "Question is required" }, { status: 400 });
    }

    // Get context about the athlete if provided
    let athleteInfo = null;

    if (athleteId) {
      const athleteData = await db
        .select({
          id: athletes.id,
          name: athletes.name,
        })
        .from(athletes)
        .where(eq(athletes.id, athleteId))
        .limit(1);

      if (athleteData.length > 0) {
        const athlete = athleteData[0];

        // Get upcoming classes
        const upcomingClasses = await db
          .select({
            className: classes.name,
            sessionDate: classSessions.sessionDate,
            startTime: classSessions.startTime,
            coachName: coaches.name,
          })
          .from(classSessions)
          .innerJoin(classes, eq(classes.id, classSessions.classId))
          .leftJoin(coaches, eq(coaches.id, classSessions.coachId))
          .where(
            and(
              gte(classSessions.sessionDate, new Date().toISOString().split("T")[0])
            )
          )
          .orderBy(classSessions.sessionDate)
          .limit(3);

        athleteInfo = {
          name: athlete.name,
          classes: upcomingClasses.map((c) => c.className || "Clase"),
          nextClass: upcomingClasses.length > 0
            ? `${upcomingClasses[0].className} el ${upcomingClasses[0].sessionDate}`
            : undefined,
        };
      }
    }

    // FAQ for common questions
    const faq = [
      {
        question: "¿Cuándo es la próxima clase?",
        answer: "Puedes verificar los horarios en la aplicación o contactando a la academia.",
      },
      {
        question: "¿Cómo puedo pagar las mensualidades?",
        answer: "Las mensualidades se pagan a través de la aplicación en la sección de facturación.",
      },
      {
        question: "¿Mi hijo puede faltar a clase?",
        answer: "Sí, puedes informar ausencias. Las clases no se pierden pero tampoco se recuperan.",
      },
    ];

    const orchestrator = getAIOrchestrator();
    const prompt = generateChatResponsePrompt({
      question,
      athleteInfo: athleteInfo || undefined,
      faq,
    });

    const response = await orchestrator.execute(prompt, COMMUNICATION_SYSTEM_PROMPT, {
      temperature: 0.7,
      maxTokens: 500,
    });

    // Generate suggested actions based on the question
    const suggestedActions = generateSuggestedActions(question);

    return NextResponse.json({
      message: response.content,
      suggestedActions,
      athleteId,
    });
  } catch (error) {
    console.error("AI chat error:", error);
    return NextResponse.json({ error: "Failed to process chat message" }, { status: 500 });
  }
}

function generateSuggestedActions(question: string): Array<{ label: string; action: string }> {
  const lowerQuestion = question.toLowerCase();
  const suggestions: Array<{ label: string; action: string }> = [];

  if (lowerQuestion.includes("pago") || lowerQuestion.includes("factura") || lowerQuestion.includes("cobro")) {
    suggestions.push({ label: "Ver facturación", action: "billing" });
  }

  if (lowerQuestion.includes("clase") || lowerQuestion.includes("horario")) {
    suggestions.push({ label: "Ver calendario", action: "schedule" });
  }

  if (lowerQuestion.includes("progreso") || lowerQuestion.includes("evaluación")) {
    suggestions.push({ label: "Ver evaluaciones", action: "assessments" });
  }

  // Always add a way to contact the academy
  suggestions.push({ label: "Contactar academia", action: "contact" });

  return suggestions.slice(0, 3);
}
