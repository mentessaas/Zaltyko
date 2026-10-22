// src/lib/ai/types.ts

export interface AIRequest {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AIResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AIError {
  message: string;
  code?: string;
}

// Billing AI Types
export interface DelinquencyPrediction {
  athleteId: string;
  probability: number;
  factors: string[];
  recommendation: string;
}

export interface PaymentReminder {
  athleteId: string;
  message: string;
  tone: 'friendly' | 'urgent' | 'formal';
}

// Attendance AI Types
export interface RiskAnalysis {
  athleteId: string;
  riskLevel: 'low' | 'medium' | 'high';
  factors: string[];
  recommendations: string[];
}

export interface AbsencePrediction {
  athleteId: string;
  probability: number;
  date: string;
  confidence: number;
}

// Communication AI Types
export interface ProgressUpdate {
  athleteId: string;
  summary: string;
  highlights: string[];
  recommendations: string[];
}

export interface ChatResponse {
  message: string;
  suggestedActions?: string[];
}
