// src/lib/ai/client.ts
import { AIRequest, AIResponse, AIError } from './types';

const MINIMAX_API_URL = 'https://api.minimax.chat/v1/text/chatcompletion_pro';

interface MiniMaxConfig {
  apiKey: string;
  model?: string;
}

export class MiniMaxClient {
  private apiKey: string;
  private model: string;

  constructor(config: MiniMaxConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'abab6.5s-chat';
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

    return {
      content: data.choices?.[0]?.message?.content || '',
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
