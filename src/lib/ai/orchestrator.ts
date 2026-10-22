// src/lib/ai/orchestrator.ts
import { getMiniMaxClient } from './client';
import { AIRequest, AIResponse } from './types';

// Simple in-memory cache
const cache = new Map<string, { response: AIResponse; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export interface OrchestratorOptions {
  useCache?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export class AIOrchestrator {
  private static instance: AIOrchestrator;

  static getInstance(): AIOrchestrator {
    if (!AIOrchestrator.instance) {
      AIOrchestrator.instance = new AIOrchestrator();
    }
    return AIOrchestrator.instance;
  }

  async execute(
    prompt: string,
    systemPrompt: string,
    options: OrchestratorOptions = {}
  ): Promise<AIResponse> {
    const { useCache = true, temperature = 0.7, maxTokens = 1024 } = options;

    // Check cache
    if (useCache) {
      const cached = cache.get(prompt);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.response;
      }
    }

    const client = getMiniMaxClient();
    const request: AIRequest = {
      prompt,
      systemPrompt,
      temperature,
      maxTokens,
    };

    const response = await client.chat(request);

    // Cache result
    if (useCache) {
      cache.set(prompt, { response, timestamp: Date.now() });
    }

    return response;
  }

  clearCache(): void {
    cache.clear();
  }
}

export function getAIOrchestrator(): AIOrchestrator {
  return AIOrchestrator.getInstance();
}
