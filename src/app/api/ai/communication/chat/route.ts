// src/app/api/ai/communication/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAIOrchestrator } from '@/lib/ai/orchestrator';
import { COMMUNICATION_SYSTEM_PROMPT, generateChatResponsePrompt } from '@/lib/ai/prompts/communication';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { question, athleteInfo, faq } = body;

    if (!question) {
      return NextResponse.json(
        { error: 'Missing required field: question' },
        { status: 400 }
      );
    }

    const orchestrator = getAIOrchestrator();
    const prompt = generateChatResponsePrompt({
      question,
      athleteInfo,
      faq,
    });

    const response = await orchestrator.execute(prompt, COMMUNICATION_SYSTEM_PROMPT, {
      temperature: 0.7,
      maxTokens: 500,
    });

    return NextResponse.json({
      answer: response.content,
    });
  } catch (error) {
    console.error('AI chat error:', error);
    return NextResponse.json(
      { error: 'Failed to get chat response' },
      { status: 500 }
    );
  }
}
