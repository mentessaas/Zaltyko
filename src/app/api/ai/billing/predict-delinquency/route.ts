// src/app/api/ai/billing/predict-delinquency/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { withTenant } from '@/lib/authz';
import { getAIOrchestrator } from '@/lib/ai/orchestrator';
import { BILLING_SYSTEM_PROMPT, generateDelinquencyPrompt } from '@/lib/ai/prompts/billing';
import { logger } from "@/lib/logger";

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

export const POST = withTenant(async (request: Request) => {
  // Rate limit check
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
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
    logger.error('AI billing error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze delinquency risk' },
      { status: 500 }
    );
  }
});
