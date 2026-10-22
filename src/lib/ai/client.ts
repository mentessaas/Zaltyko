// src/lib/ai/client.ts
import { AIRequest, AIResponse, AIError } from './types';

// Endpoint v2 vigente de MiniMax. El endpoint `api.minimax.chat` y el modelo
// `abab6.5s-chat` dejaron de ser una combinación fiable para cuentas nuevas.
const MINIMAX_API_URL = process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/v1/text/chatcompletion_v2';

interface MiniMaxConfig {
  apiKey: string;
  model?: string;
}

export class MiniMaxClient {
  private apiKey: string;
  private model: string;

  constructor(config: MiniMaxConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'MiniMax-M2.7';
  }

  async chat(request: AIRequest): Promise<AIResponse> {
    const response = await fetch(MINIMAX_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          ...(request.systemPrompt ? [{ role: 'system', content: request.systemPrompt }] : []),
          { role: 'user', content: request.prompt }
        ],
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 1024,
      }),
    });

    if (!response.ok) {
      const error: AIError = {
        message: `MiniMax API error: ${response.status}`,
        code: response.status.toString(),
      };
      throw error;
    }

    const data = await response.json();
    const providerStatus = data?.base_resp?.status_code;
    if (providerStatus !== undefined && providerStatus !== 0) {
      throw {
        message: `MiniMax API error: ${data?.base_resp?.status_msg || providerStatus}`,
        code: String(providerStatus),
      } satisfies AIError;
    }

    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw { message: 'MiniMax returned an empty response', code: 'EMPTY_RESPONSE' } satisfies AIError;
    }

    return {
      content,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
    };
  }
}

// Singleton instance
let clientInstance: MiniMaxClient | null = null;

export function getMiniMaxClient(): MiniMaxClient {
  if (!clientInstance) {
    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) {
      throw new Error('MINIMAX_API_KEY is not configured');
    }
    clientInstance = new MiniMaxClient({ apiKey });
  }
  return clientInstance;
}
