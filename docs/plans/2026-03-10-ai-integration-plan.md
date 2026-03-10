# AI Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implementar la integración de IA en Zaltyko comenzando con la Fase 1: Foundation (cliente, orchestrator, API routes básicos)

**Architecture:** Cliente MiniMax como wrapper, Orchestrator centralizado para coordinar requests, API routes en /api/ai/*

**Tech Stack:** Next.js 14 (App Router), TypeScript, MiniMax API

---

## Fase 1: Foundation (Semanas 1-2)

### Task 1: Create AI Types

**Files:**
- Create: `src/lib/ai/types.ts`

**Step 1: Create the types file**

```typescript
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
```

**Step 2: Commit**

```bash
git add src/lib/ai/types.ts
git commit -m "feat: add AI types definitions"
```

---

### Task 2: Create MiniMax Client

**Files:**
- Create: `src/lib/ai/client.ts`

**Step 1: Create the MiniMax client**

```typescript
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
```

**Step 2: Commit**

```bash
git add src/lib/ai/client.ts
git commit -m "feat: add MiniMax client"
```

---

### Task 3: Create AI Orchestrator

**Files:**
- Create: `src/lib/ai/orchestrator.ts`

**Step 1: Create the orchestrator**

```typescript
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
```

**Step 2: Commit**

```bash
git add src/lib/ai/orchestrator.ts
git commit -m "feat: add AI orchestrator with caching"
```

---

### Task 4: Create AI Prompts Library

**Files:**
- Create: `src/lib/ai/prompts/billing.ts`
- Create: `src/lib/ai/prompts/attendance.ts`
- Create: `src/lib/ai/prompts/communication.ts`

**Step 1: Create billing prompts**

```typescript
// src/lib/ai/prompts/billing.ts

export const BILLING_SYSTEM_PROMPT = `Eres un asistente de IA especializado en gestión de cobros para academias deportivas.
Tu objetivo es ayudar a predecir morosos, generar recordatorios efectivos y sugerir planes de pago.
Sé profesional, empático y orientado a soluciones.`;

export function generateDelinquencyPrompt(athleteData: {
  name: string;
  paymentHistory: Array<{ date: string; amount: number; status: string }>;
  lastPaymentDate?: string;
  pendingAmount?: number;
}): string {
  return `
Analiza el siguiente historial de pagos del atleta ${athleteData.name}:

Historial de pagos:
${athleteData.paymentHistory.map(p => `- ${p.date}: $${p.amount} - ${p.status}`).join('\n')}

${athleteData.lastPaymentDate ? `Último pago: ${athleteData.lastPaymentDate}` : ''}
${athleteData.pendingAmount ? `Monto pendiente: $${athleteData.pendingAmount}` : ''}

Basándote en el historial, responde:
1. ¿Cuál es la probabilidad de que este atleta no pague? (0-100%)
2. ¿Qué factores contribuyen a esta evaluación?
3. ¿Qué recomendación das al administrador?
`;
}

export function generateReminderPrompt(athleteData: {
  name: string;
  pendingAmount: number;
  dueDate: string;
  academyName: string;
}): string {
  return `
Genera un recordatorio de pago personalizado para el atleta ${athleteData.name} de la academia ${athleteana academyName}.

Detalles:
- Monto pendiente: $${athleteData.pendingAmount}
- Fecha de vencimiento: ${athleteData.dueDate}

El recordatorio debe ser:
- Profesional pero amigable
- Claro sobre el monto y fecha
- Incluir llamada a la acción
- Breve (máximo 2 párrafos)

Devuelve solo el mensaje del recordatorio.
`;
}

export function generatePaymentPlanPrompt(athleteData: {
  name: string;
  pendingAmount: number;
  paymentHistory: Array<{ date: string; amount: number }>;
}): string {
  return `
El atleta ${athleteData.name} tiene un saldo pendiente de $${athleteData.pendingAmount}.

Historial de pagos:
${athleteData.paymentHistory.map(p => `- ${p.date}: $${p.amount}`).join('\n')}

Sugiere un plan de pago personalizado considerando:
1. Capacidad de pago basada en historial
2. Opciones de cuotas
3. Incentivos por pago anticipado
4. Consecuencias de no pagar

Sé práctico y orientado a soluciones.
`;
}
```

**Step 2: Create attendance prompts**

```typescript
// src/lib/ai/prompts/attendance.ts

export const ATTENDANCE_SYSTEM_PROMPT = `Eres un asistente de IA especializado en análisis de asistencia para academias deportivas.
Tu objetivo es identificar atletas en riesgo de abandono, predecir inasistencias y analizar patrones de grupos.
Sé analítico y proporciona recomendaciones concretas.`;

export function generateRiskAnalysisPrompt(athleteData: {
  name: string;
  attendanceHistory: Array<{ date: string; status: string }>;
  totalClasses: number;
  lastAttendance?: string;
}): string {
  const presentCount = athleteData.attendanceHistory.filter(a => a.status === 'present').length;
  const attendanceRate = athleteData.totalClasses > 0
    ? Math.round((presentCount / athleteData.totalClasses) * 100)
    : 0;

  return `
Analiza el riesgo de abandono del atleta ${athleteData.name}:

Historial de asistencia:
${athleteData.attendanceHistory.slice(-10).map(a => `- ${a.date}: ${a.status}`).join('\n')}

Estadísticas:
- Tasa de asistencia: ${attendanceRate}%
- Total de clases: ${athleteData.totalClasses}
${athleteData.lastAttendance ? `- Última asistencia: ${athleteData.lastAttendance}` : ''}

Responde:
1. Nivel de riesgo: bajo, medio o alto
2. Factores que contribuyen al riesgo
3. Recomendaciones específicas para retener al atleta
`;
}

export function generateAbsencePredictionPrompt(athleteData: {
  name: string;
  attendancePattern: {
    dayOfWeek: number;
    present: boolean;
  }[];
  upcomingSchedule: string[];
}): string {
  return `
Basándote en los patrones de asistencia del atleta ${athleteData.name}:

Patrones históricos:
${athleteData.attendancePattern.map(p => `- Día ${p.dayOfWeek}: ${p.present ? 'presente' : 'ausente'}`).join('\n')}

Próximas sesiones programadas:
${athleteData.upcomingSchedule.join('\n')}

Predice:
1. Probabilidad de ausencia para cada próxima sesión
2. Qué días son más propensos a faltar
3. Nivel de confianza en la predicción
`;
}

export function generateGroupInsightsPrompt(groupData: {
  name: string;
  athletes: Array<{
    name: string;
    attendanceRate: number;
    avgPerformance: number;
  }>;
}): string {
  return `
Analiza el grupo "${groupData.name}" con los siguientes atletas:

${groupData.athletes.map(a => `- ${a.name}: ${a.attendanceRate}% asistencia, rendimiento ${a.avgPerformance}/10`).join('\n')}

Proporciona insights sobre:
1. Distribución de rendimiento
2. Patrones de asistencia del grupo
3. Recomendaciones para mejorar el grupo
4. Atletas que destacan o necesitan atención
`;
}
```

**Step 3: Create communication prompts**

```typescript
// src/lib/ai/prompts/communication.ts

export const COMMUNICATION_SYSTEM_PROMPT = `Eres un asistente de IA especializado en comunicación para padres de atletas en academias deportivas.
Tu objetivo es generar updates de progreso positivos, recordatorios útiles y respuestas a preguntas frecuentes.
Sé empático, motivador y transparente.`;

export function generateProgressUpdatePrompt(athleteData: {
  name: string;
  age: number;
  recentAssessments: Array<{
    date: string;
    skill: string;
    score: number;
    notes?: string;
  }>;
  attendanceRate: number;
  classesThisMonth: number;
}): string {
  return `
Genera un update de progreso para los padres del atleta ${athleteData.name} (${athleteData.age} años).

Evaluaciones recientes:
${athleteData.recentAssessments.map(a => `- ${a.date}: ${a.skill} - ${a.score}/10${a.notes ? ` (${a.notes})` : ''}`).join('\n')}

Estadísticas del mes:
- Clases asistidas: ${athleteData.classesThisMonth}
- Tasa de asistencia: ${athleteData.attendanceRate}%

El update debe:
- Ser positivo y motivador
- Destacar logros específicos
- Mencionar áreas de mejora de forma constructiva
- Incluir recomendaciones para los padres
- Ser apropiado para padres de un niño de ${athleteData.age} años
`;
}

export function generateClassReminderPrompt(classData: {
  athleteName: string;
  className: string;
  date: string;
  time: string;
  location: string;
  coachName: string;
}): string {
  return `
Genera un recordatorio de clase para los padres del atleta ${classData.athleteName}.

Detalles de la clase:
- Clase: ${classData.className}
- Fecha: ${classData.date}
- Hora: ${classData.time}
- Ubicación: ${classData.location}
- Entrenador: ${classData.coachName}

El recordatorio debe:
- Ser breve y claro
- Incluir los detalles importantes
- Tener tono amigable y motivador
- Incluir recordatorio de bring Equipment o ropa necesaria si aplica
`;
}

export function generateChatResponsePrompt(context: {
  question: string;
  athleteInfo?: {
    name: string;
    classes: string[];
    nextClass?: string;
  };
  faq?: Array<{ question: string; answer: string }>;
}): string {
  return `
Eres un asistente de una academia deportiva. Responde la siguiente pregunta de un padre:

Pregunta: ${context.question}

${context.athleteInfo ? `
Información del atleta:
- Nombre: ${context.athleteInfo.name}
- Clases: ${context.athleteInfo.classes.join(', ')}
${context.athleteInfo.nextClass ? `- Próxima clase: ${context.athleteInfo.nextClass}` : ''}
` : ''}

${context.faq ? `
Preguntas frecuentes de referencia:
${context.faq.map(f => `P: ${f.question}\nR: ${f.answer}`).join('\n\n')}` : ''}

Responde de manera:
- Clara y concisa
- Amigable y profesional
- Accurate basada en la información disponible
Si no tienes suficiente información, indica que el padre debe contactar a la academia directamente.
`;
}
```

**Step 4: Commit**

```bash
git add src/lib/ai/prompts/
git commit -m "feat: add AI prompts library"
```

---

### Task 5: Create AI Service Layer

**Files:**
- Create: `src/lib/ai/services/billing-ai.ts`
- Create: `src/lib/ai/services/attendance-ai.ts`
- Create: `src/lib/ai/services/communication-ai.ts`

**Step 1: Create billing AI service**

```typescript
// src/lib/ai/services/billing-ai.ts
import { getAIOrchestrator } from '../orchestrator';
import {
  BILLING_SYSTEM_PROMPT,
  generateDelinquencyPrompt,
  generateReminderPrompt,
  generatePaymentPlanPrompt
} from '../prompts/billing';
import { DelinquencyPrediction, PaymentReminder } from '../types';

export async function predictDelinquency(athleteData: {
  name: string;
  paymentHistory: Array<{ date: string; amount: number; status: string }>;
  lastPaymentDate?: string;
  pendingAmount?: number;
}): Promise<DelinquencyPrediction> {
  const orchestrator = getAIOrchestrator();
  const prompt = generateDelinquencyPrompt(athleteData);
  const response = await orchestrator.execute(prompt, BILLING_SYSTEM_PROMPT);

  // Parse response - in production, use structured output
  return parseDelinquencyResponse(response.content, athleteData.name);
}

export async function generatePaymentReminder(athleteData: {
  name: string;
  pendingAmount: number;
  dueDate: string;
  academyName: string;
}): Promise<PaymentReminder> {
  const orchestrator = getAIOrchestrator();
  const prompt = generateReminderPrompt(athleteData);
  const response = await orchestrator.execute(prompt, BILLING_SYSTEM_PROMPT, {
    temperature: 0.5,
    maxTokens: 500,
  });

  return {
    athleteId: '', // Will be set by caller
    message: response.content,
    tone: 'friendly',
  };
}

export async function suggestPaymentPlan(athleteData: {
  name: string;
  pendingAmount: number;
  paymentHistory: Array<{ date: string; amount: number }>;
}): Promise<string> {
  const orchestrator = getAIOrchestrator();
  const prompt = generatePaymentPlanPrompt(athleteData);
  const response = await orchestrator.execute(prompt, BILLING_SYSTEM_PROMPT);

  return response.content;
}

function parseDelinquencyResponse(content: string, athleteName: string): DelinquencyPrediction {
  // Simple parsing - in production, use structured output or JSON
  const probabilityMatch = content.match(/(\d+)%/);
  const probability = probabilityMatch ? parseInt(probictionMatch[1]) / 100 : 0.5;

  return {
    athleteId: '', // Will be set by caller
    probability,
    factors: [],
    recommendation: content,
  };
}
```

**Step 2: Create attendance AI service**

```typescript
// src/lib/ai/services/attendance-ai.ts
import { getAIOrchestrator } from '../orchestrator';
import {
  ATTENDANCE_SYSTEM_PROMPT,
  generateRiskAnalysisPrompt,
  generateAbsencePredictionPrompt,
  generateGroupInsightsPrompt
} from '../prompts/attendance';
import { RiskAnalysis, AbsencePrediction } from '../types';

export async function analyzeAttendanceRisk(athleteData: {
  name: string;
  attendanceHistory: Array<{ date: string; status: string }>;
  totalClasses: number;
  lastAttendance?: string;
}): Promise<RiskAnalysis> {
  const orchestrator = getAIOrchestrator();
  const prompt = generateRiskAnalysisPrompt(athleteData);
  const response = await orchestrator.execute(prompt, ATTENDANCE_SYSTEM_PROMPT);

  return parseRiskAnalysisResponse(response.content);
}

export async function predictAbsence(athleteData: {
  name: string;
  attendancePattern: Array<{ dayOfWeek: number; present: boolean }>;
  upcomingSchedule: string[];
}): Promise<AbsencePrediction[]> {
  const orchestrator = getAIOrchestrator();
  const prompt = generateAbsencePredictionPrompt(athleteData);
  const response = await orchestrator.execute(prompt, ATTENDANCE_SYSTEM_PROMPT);

  // Parse response
  return [{
    athleteId: '', // Will be set by caller
    probability: 0.5,
    date: athleteData.upcomingSchedule[0] || '',
    confidence: 0.5,
  }];
}

export async function getGroupInsights(groupData: {
  name: string;
  athletes: Array<{
    name: string;
    attendanceRate: number;
    avgPerformance: number;
  }>;
}): Promise<string> {
  const orchestrator = getAIOrchestrator();
  const prompt = generateGroupInsightsPrompt(groupData);
  const response = await orchestrator.execute(prompt, ATTENDANCE_SYSTEM_PROMPT);

  return response.content;
}

function parseRiskAnalysisResponse(content: string): RiskAnalysis {
  const lowerContent = content.toLowerCase();
  let riskLevel: 'low' | 'medium' | 'high' = 'medium';

  if (lowerContent.includes('bajo') || lowerContent.includes('low')) {
    riskLevel = 'low';
  } else if (lowerContent.includes('alto') || lowerContent.includes('high')) {
    riskLevel = 'high';
  }

  return {
    athleteId: '',
    riskLevel,
    factors: [],
    recommendations: content.split('\n').filter(l => l.trim()),
  };
}
```

**Step 3: Create communication AI service**

```typescript
// src/lib/ai/services/communication-ai.ts
import { getAIOrchestrator } from '../orchestrator';
import {
  COMMUNICATION_SYSTEM_PROMPT,
  generateProgressUpdatePrompt,
  generateClassReminderPrompt,
  generateChatResponsePrompt
} from '../prompts/communication';
import { ProgressUpdate, ChatResponse } from '../types';

export async function generateProgressUpdate(athleteData: {
  name: string;
  age: number;
  recentAssessments: Array<{
    date: string;
    skill: string;
    score: number;
    notes?: string;
  }>;
  attendanceRate: number;
  classesThisMonth: number;
}): Promise<ProgressUpdate> {
  const orchestrator = getAIOrchestrator();
  const prompt = generateProgressUpdatePrompt(athleteData);
  const response = await orchestrator.execute(prompt, COMMUNICATION_SYSTEM_PROMPT, {
    temperature: 0.7,
    maxTokens: 800,
  });

  return {
    athleteId: '',
    summary: response.content,
    highlights: [],
    recommendations: [],
  };
}

export async function generateClassReminder(classData: {
  athleteName: string;
  className: string;
  date: string;
  time: string;
  location: string;
  coachName: string;
}): Promise<string> {
  const orchestrator = getAIOrchestrator();
  const prompt = generateClassReminderPrompt(classData);
  const response = await orchestrator.execute(prompt, COMMUNICATION_SYSTEM_PROMPT, {
    temperature: 0.5,
    maxTokens: 300,
  });

  return response.content;
}

export async function getChatResponse(context: {
  question: string;
  athleteInfo?: {
    name: string;
    classes: string[];
    nextClass?: string;
  };
}): Promise<ChatResponse> {
  const orchestrator = getAIOrchestrator();
  const prompt = generateChatResponsePrompt(context);
  const response = await orchestrator.execute(prompt, COMMUNICATION_SYSTEM_PROMPT, {
    temperature: 0.6,
    maxTokens: 500,
  });

  return {
    message: response.content,
    suggestedActions: [],
  };
}
```

**Step 4: Commit**

```bash
git add src/lib/ai/services/
git commit -m "feat: add AI service layer"
```

---

### Task 6: Create AI API Routes

**Files:**
- Create: `src/app/api/ai/billing/predict-delinquency/route.ts`
- Create: `src/app/api/ai/billing/generate-reminder/route.ts`
- Create: `src/app/api/ai/attendance/analyze-risk/route.ts`
- Create: `src/app/api/ai/communication/generate-progress-update/route.ts`

**Step 1: Create billing predict-delinquency route**

```typescript
// src/app/api/ai/billing/predict-delinquency/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAIOrchestrator } from '@/lib/ai/orchestrator';
import { BILLING_SYSTEM_PROMPT, generateDelinquencyPrompt } from '@/lib/ai/prompts/billing';

// Rate limiting (simple in-memory)
const rateLimit = new Map<string, { count: number; timestamp: number }>();
const RATE_LIMIT = 100;
const RATE_WINDOW = 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimit.get(ip);

  if (!record || now - record.timestamp > RATE_WINDOW) {
    rateLimit.set(ip, { count: 1, timestamp: now });
    return true;
  }

  if (record.count >= RATE_LIMIT) {
    return false;
  }

  record.count++;
  return true;
}

export async function POST(req: NextRequest) {
  // Rate limit check
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429 }
    );
  }

  try {
    const body = await req.json();
    const { athleteId, name, paymentHistory, lastPaymentDate, pendingAmount } = body;

    if (!name || !paymentHistory) {
      return NextResponse.json(
        { error: 'Missing required fields: name, paymentHistory' },
        { status: 400 }
      );
    }

    const orchestrator = getAIOrchestrator();
    const prompt = generateDelinquencyPrompt({
      name,
      paymentHistory,
      lastPaymentDate,
      pendingAmount,
    });

    const response = await orchestrator.execute(prompt, BILLING_SYSTEM_PROMPT);

    // Parse simple response
    const probabilityMatch = response.content.match(/(\d+)%/);
    const probability = probabilityMatch
      ? parseInt(probabilityMatch[1]) / 100
      : 0.5;

    return NextResponse.json({
      athleteId,
      probability,
      analysis: response.content,
    });
  } catch (error) {
    console.error('AI billing error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze delinquency risk' },
      { status: 500 }
    );
  }
}
```

**Step 2: Create billing generate-reminder route**

```typescript
// src/app/api/ai/billing/generate-reminder/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAIOrchestrator } from '@/lib/ai/orchestrator';
import { BILLING_SYSTEM_PROMPT, generateReminderPrompt } from '@/lib/ai/prompts/billing';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
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
}
```

**Step 3: Create attendance analyze-risk route**

```typescript
// src/app/api/ai/attendance/analyze-risk/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAIOrchestrator } from '@/lib/ai/orchestrator';
import { ATTENDANCE_SYSTEM_PROMPT, generateRiskAnalysisPrompt } from '@/lib/ai/prompts/attendance';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { athleteId, name, attendanceHistory, totalClasses, lastAttendance } = body;

    if (!name || !attendanceHistory || !totalClasses) {
      return NextResponse.json(
        { error: 'Missing required fields: name, attendanceHistory, totalClasses' },
        { status: 400 }
      );
    }

    const orchestrator = getAIOrchestrator();
    const prompt = generateRiskAnalysisPrompt({
      name,
      attendanceHistory,
      totalClasses,
      lastAttendance,
    });

    const response = await orchestrator.execute(prompt, ATTENDANCE_SYSTEM_PROMPT);

    // Parse risk level
    const lowerContent = response.content.toLowerCase();
    let riskLevel: 'low' | 'medium' | 'high' = 'medium';

    if (lowerContent.includes('bajo') || lowerContent.includes('low')) {
      riskLevel = 'low';
    } else if (lowerContent.includes('alto') || lowerContent.includes('high')) {
      riskLevel = 'high';
    }

    return NextResponse.json({
      athleteId,
      riskLevel,
      analysis: response.content,
    });
  } catch (error) {
    console.error('AI attendance risk error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze attendance risk' },
      { status: 500 }
    );
  }
}
```

**Step 4: Create communication generate-progress-update route**

```typescript
// src/app/api/ai/communication/generate-progress-update/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAIOrchestrator } from '@/lib/ai/orchestrator';
import { COMMUNICATION_SYSTEM_PROMPT, generateProgressUpdatePrompt } from '@/lib/ai/prompts/communication';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { athleteId, name, age, recentAssessments, attendanceRate, classesThisMonth } = body;

    if (!name || !age || !recentAssessments) {
      return NextResponse.json(
        { error: 'Missing required fields: name, age, recentAssessments' },
        { status: 400 }
      );
    }

    const orchestrator = getAIOrchestrator();
    const prompt = generateProgressUpdatePrompt({
      name,
      age,
      recentAssessments,
      attendanceRate: attendanceRate || 0,
      classesThisMonth: classesThisMonth || 0,
    });

    const response = await orchestrator.execute(prompt, COMMUNICATION_SYSTEM_PROMPT, {
      temperature: 0.7,
      maxTokens: 800,
    });

    return NextResponse.json({
      athleteId,
      summary: response.content,
    });
  } catch (error) {
    console.error('AI progress update error:', error);
    return NextResponse.json(
      { error: 'Failed to generate progress update' },
      { status: 500 }
    );
  }
}
```

**Step 5: Commit**

```bash
git add src/app/api/ai/
git commit -m "feat: add AI API routes"
```

---

### Task 7: Verify Implementation

**Step 1: Run build to verify no errors**

```bash
npm run build
```

Expected: Build completes successfully

**Step 2: Test API route**

```bash
curl -X POST http://localhost:3000/api/ai/billing/generate-reminder \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Juan Pérez",
    "pendingAmount": 50,
    "dueDate": "2026-03-15",
    "academyName": "Gimnasia Elite"
  }'
```

Expected: JSON response with generated reminder message

**Step 3: Commit**

```bash
git add .
git commit -m "feat: complete Fase 1 AI Foundation"
```

---

## Resumen de Tasks Completados

| Task | Descripción |
|------|-------------|
| Task 1 | AI Types definitions |
| Task 2 | MiniMax Client |
| Task 3 | AI Orchestrator con cache |
| Task 4 | Prompts library (billing, attendance, communication) |
| Task 5 | AI Services layer |
| Task 6 | API Routes |
| Task 7 | Verificación |

---

## Próximas Fases (No implementadas en este plan)

### Fase 2: Billing AI
- Integración con dashboard de cobros
- UI para predicción de morosos
- Recordatorios automatizados

### Fase 3: Attendance AI
- Alertas de riesgo en dashboard
- Widget de análisis de grupos

### Fase 4: Communication AI
- Chatbot para padres
- Notificaciones automáticas
