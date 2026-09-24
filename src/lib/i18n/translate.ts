import { getMiniMaxClient } from "@/lib/ai/client";

/**
 * Auto-translate de bloques de contenido de actor_pages.
 *
 * T14: usa MiniMax (mismo provider que el resto de Zaltyko IA).
 * MVP: traduce los campos de texto de cada bloque (heading, text).
 * NO traduce email/teléfono/web (esos no se traducen).
 *
 * Cache in-memory con TTL para no llamar al provider en cada render.
 */

export type TranslatableBlock = {
  type?: string;
  heading?: string;
  text?: string;
  level?: number;
};

const cache = new Map<string, { result: TranslatableBlock[]; ts: number }>();
const TTL = 10 * 60 * 1000;

const SYSTEM_PROMPT_ES_TO_EN =
  "You are a professional translator for a sports academy website. Translate the following JSON array of content blocks from Spanish to English. Keep brand names, sport terms (apparatus names, skill codes), URLs, emails and phone numbers unchanged. Return ONLY the JSON array, no markdown, no explanations.";

const SYSTEM_PROMPT_EN_TO_ES =
  "Eres un traductor profesional para una web de academia de gimnasia. Traduce el siguiente array JSON de bloques de contenido de inglés a español. Mantén nombres de marca, términos deportivos (nombres de aparatos, códigos de habilidad), URLs, emails y teléfonos sin cambios. Devuelve SOLO el array JSON, sin markdown, sin explicaciones.";

function buildPrompt(blocks: TranslatableBlock[]): string {
  const truncated = blocks.map((b) => ({
    type: b.type,
    heading: b.heading?.slice(0, 300),
    text: b.text?.slice(0, 600),
    level: b.level,
  }));
  return JSON.stringify({ blocks: truncated });
}

function hashKey(source: string, target: "en" | "es", blocks: unknown[]): string {
  return `${source}-${target}-${JSON.stringify(blocks).slice(0, 2000)}`;
}

function pickSystemPrompt(target: "en" | "es"): string {
  return target === "en" ? SYSTEM_PROMPT_ES_TO_EN : SYSTEM_PROMPT_EN_TO_ES;
}

export async function translateBlocks(
  blocks: TranslatableBlock[],
  source: "es" | "en",
  target: "en" | "es"
): Promise<TranslatableBlock[]> {
  if (source === target) return blocks;
  if (!process.env.MINIMAX_API_KEY) {
    return blocks;
  }

  const key = hashKey(source, target, blocks);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < TTL) return cached.result;

  const client = getMiniMaxClient();
  const prompt = buildPrompt(blocks);

  try {
    const res = await client.chat({
      prompt,
      systemPrompt: pickSystemPrompt(target),
      temperature: 0.2,
      maxTokens: 2048,
    });
    const text = res.content;
    if (typeof text !== "string") return blocks;

    const cleaned = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();

    const parsed = JSON.parse(cleaned) as TranslatableBlock[];
    cache.set(key, { result: parsed, ts: Date.now() });
    return parsed;
  } catch {
    return blocks;
  }
}
