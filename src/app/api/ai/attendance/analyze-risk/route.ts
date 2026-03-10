// src/app/api/ai/attendance/analyze-risk/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAIOrchestrator } from '@/lib/ai/orchestrator';
import { ATTENDANCE_SYSTEM_PROMPT, generateRiskAnalysisPrompt } from '@/lib/ai/prompts/attendance';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { athleteId, name, attendanceHistory, totalClasses, lastAttendance } = body;

    if (!name || !attendanceHistory || !totalClasses) {
      return NextResponse.json(
        { error: 'Missing required fields: name, attendanceHistory, totalClasses' },
        { status: 400 }
      );
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

    return NextResponse.json({
      athleteId,
      riskLevel,
      analysis: response.content,
    });
  } catch (error) {
    console.error('AI attendance risk error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze attendance risk' },
      { status: 500 }
    );
  }
}
