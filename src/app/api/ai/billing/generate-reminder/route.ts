// src/app/api/ai/billing/generate-reminder/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withTenant } from '@/lib/authz';
import { getAIOrchestrator } from '@/lib/ai/orchestrator';
import { BILLING_SYSTEM_PROMPT, generateReminderPrompt } from '@/lib/ai/prompts/billing';

export const POST = withTenant(async (request: Request) => {
  try {
    const body = await request.json();
    const { athleteId, name, pendingAmount, dueDate, academyName } = body;

    if (!name || !pendingAmount || !dueDate || !academyName) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const orchestrator = getAIOrchestrator();
    const prompt = generateReminderPrompt({
      name,
      pendingAmount,
      dueDate,
      academyName,
    });

    const response = await orchestrator.execute(prompt, BILLING_SYSTEM_PROMPT, {
      temperature: 0.5,
      maxTokens: 500,
    });

    return NextResponse.json({
      athleteId,
      message: response.content,
      tone: 'friendly',
    });
  } catch (error) {
    console.error('AI reminder error:', error);
    return NextResponse.json(
      { error: 'Failed to generate reminder' },
      { status: 500 }
    );
  }
});
