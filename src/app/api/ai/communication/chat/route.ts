// src/app/api/ai/communication/chat/route.ts
import { withTenant } from '@/lib/authz';
import { getAIOrchestrator } from '@/lib/ai/orchestrator';
import { COMMUNICATION_SYSTEM_PROMPT, generateChatResponsePrompt } from '@/lib/ai/prompts/communication';
import { logger } from "@/lib/logger";
import { apiError, apiSuccess } from "@/lib/api-response";
import { withRateLimit, getUserIdentifier } from "@/lib/rate-limit";
import { z } from "zod";

const chatBodySchema = z.object({
  question: z.string().trim().min(1, "La pregunta no puede estar vacía").max(2000),
});

function unavailableAssistantAnswer(question: string): string {
  const normalized = question.toLocaleLowerCase("es");
  if (/(pago|cuota|cobro|factura)/u.test(normalized)) {
    return "Puedo ayudarte con las cuotas. Abre Cobros para revisar pendientes, vencimientos y recibos. Si necesitas asistencia con un pago concreto, crea un ticket desde Soporte para que el equipo pueda revisarlo con seguridad.";
  }
  if (/(clase|horario|entrenamiento|grupo)/u.test(normalized)) {
    return "Para consultar clases y horarios, entra en Clases o en el calendario de tu academia. Ahí verás grupos, entrenadores y sesiones próximas.";
  }
  if (/(progreso|evaluaci|nota|compet)/u.test(normalized)) {
    return "El progreso se consulta desde la ficha de cada gimnasta, en Evaluaciones e Historial. Si falta una valoración, pide al entrenador que la registre en la sesión correspondiente.";
  }
  return "Estoy aquí para ayudarte. El asistente inteligente se está conectando; mientras tanto puedes consultar Clases, Gimnastas, Cobros o Soporte desde el menú. Si me dices qué necesitas, te indico la ruta más rápida.";
}

const handler = withTenant(async (request: Request) => {
  try {
    const parsed = chatBodySchema.safeParse(await request.json());
    if (!parsed.success) return apiError("INVALID_PAYLOAD", "La pregunta no es válida", 400, parsed.error.issues);
    const { question } = parsed.data;

    // Producción puede desplegarse antes de provisionar la clave del proveedor.
    // Devolvemos una respuesta útil y honesta en vez de dejar el widget sin
    // respuesta; cuando exista la clave se usa el modelo automáticamente.
    if (!process.env.MINIMAX_API_KEY) {
      return apiSuccess({ answer: unavailableAssistantAnswer(question), provider: "fallback" });
    }

    const orchestrator = getAIOrchestrator();
    const prompt = generateChatResponsePrompt({
      question,
    });

    try {
      const response = await orchestrator.execute(prompt, COMMUNICATION_SYSTEM_PROMPT, {
        temperature: 0.7,
        maxTokens: 500,
      });

      return apiSuccess({
        answer: response.content,
        provider: "minimax",
      });
    } catch (providerError) {
      // A provider outage must not make the assistant appear frozen. Keep the
      // incident observable while returning actionable guidance to the user.
      logger.warn("AI provider unavailable; returning conversational fallback", {
        error: providerError instanceof Error ? providerError.message : String(providerError),
      });
      return apiSuccess({
        answer: unavailableAssistantAnswer(question),
        provider: "fallback_error",
      });
    }
  } catch (error) {
    logger.error('AI chat error:', error);
    return apiError("AI_CHAT_FAILED", "Failed to get chat response", 500);
  }
});

// AI calls are expensive; bound them per authenticated user/IP and reject
// oversized prompts before they reach the provider.
export const POST = withRateLimit(handler, {
  identifier: getUserIdentifier,
  limit: 20,
  window: 60,
});
