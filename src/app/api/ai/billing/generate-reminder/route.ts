// src/app/api/ai/billing/generate-reminder/route.ts
import { withTenant } from '@/lib/authz';
import { getAIOrchestrator } from '@/lib/ai/orchestrator';
import { BILLING_SYSTEM_PROMPT, generateReminderPrompt } from '@/lib/ai/prompts/billing';
import { logger } from "@/lib/logger";
import { apiError, apiSuccess } from "@/lib/api-response";

export const POST = withTenant(async (request: Request) => {
  try {
    const body = await request.json();
    const { athleteId, name, pendingAmount, dueDate, academyName } = body;

    if (!name || !pendingAmount || !dueDate || !academyName) {
      return apiError("INVALID_PAYLOAD", "Missing required fields", 400);
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

    return apiSuccess({
      athleteId,
      message: response.content,
      tone: 'friendly',
    });
  } catch (error) {
    logger.error('AI reminder error:', error);
    return apiError("AI_REMINDER_FAILED", "Failed to generate reminder", 500);
  }
});
