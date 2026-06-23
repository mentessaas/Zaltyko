export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { withBearerTenant } from '@/lib/authz';
import { withErrorHandler } from '@/lib/api-error-handler';
import { apiSuccess, apiError } from '@/lib/api-response';
import { getBearerToken } from '@/lib/supabase/bearer-client';
import { db } from '@/db';
import { pushTokens } from '@/db/schema/push-tokens';
import { eq, and } from 'drizzle-orm';

const pushTokenBodySchema = z.object({
  token: z.string().min(1, 'Token is required'),
  platform: z.enum(['ios', 'android', 'web', 'unknown']).optional().default('unknown'),
});

export const POST = withErrorHandler(withBearerTenant(async (request, context) => {
  const authToken = getBearerToken(request);
  if (!authToken) {
    return apiError('UNAUTHENTICATED', 'Bearer token required', 401);
  }

  const body = await request.json();
  const { token: pushToken, platform } = pushTokenBodySchema.parse(body);

  await db
    .insert(pushTokens)
    .values({
      userId: context.userId,
      token: pushToken,
      platform: platform,
    })
    .onConflictDoUpdate({
      target: [pushTokens.userId, pushTokens.token],
      set: {
        platform: platform,
      },
    });

  return apiSuccess({ ok: true, userId: context.userId });
}));

const deleteBodySchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

export const DELETE = withErrorHandler(withBearerTenant(async (request, context) => {
  const body = await request.json();
  const { token } = deleteBodySchema.parse(body);

  await db
    .delete(pushTokens)
    .where(and(eq(pushTokens.userId, context.userId), eq(pushTokens.token, token)));

  return apiSuccess({ ok: true });
}));

