// src/app/api/ai/communication/chat/route.ts
import { withTenant } from '@/lib/authz';
import { getAIOrchestrator } from '@/lib/ai/orchestrator';
import { COMMUNICATION_SYSTEM_PROMPT, generateChatResponsePrompt } from '@/lib/ai/prompts/communication';
import { logger } from "@/lib/logger";
import { apiError, apiSuccess } from "@/lib/api-response";

export const POST = withTenant(async (request: Request) => {
  try {
    const body = await request.json();
    const { question, athleteInfo, faq } = body;

    if (!question) {
      return apiError("INVALID_PAYLOAD", "Missing required field: question", 400);
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

    return apiSuccess({
      answer: response.content,
    });
  } catch (error) {
    logger.error('AI chat error:', error);
    return apiError("AI_CHAT_FAILED", "Failed to get chat response", 500);
  }
});
