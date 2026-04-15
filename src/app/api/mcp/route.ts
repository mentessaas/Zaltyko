import { createMcpHandler } from 'mcp-handler';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getCurrentProfile } from '@/lib/authz/profile-service';
import { getTenantId } from '@/lib/authz/tenant-resolver';
import { db } from '@/db';
import { academies } from '@/db/schema';
import {
  registerAcademyTools,
  registerAthleteTools,
  registerUserTools,
  registerSystemTools,
} from '@/lib/mcp/tools';
import type { McpAuthContext } from '@/lib/mcp/types';

/**
 * Verify authentication from request headers
 * Checks Bearer token in Authorization header
 */
async function verifyAuth(request: Request): Promise<McpAuthContext | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);
  if (!token) {
    return null;
  }

  try {
    const adminClient = getSupabaseAdminClient();
    const { data: { user }, error } = await adminClient.auth.getUser(token);

    if (error || !user) {
      return null;
    }

    const profile = await getCurrentProfile(user.id);
    if (!profile) {
      return null;
    }

    const tenantId = await getTenantId(user.id);
    return { userId: user.id, profile, tenantId };
  } catch {
    return null;
  }
}

/**
 * Check if user has access to an academy
 */
async function hasAcademyAccess(userId: string, academyId: string): Promise<boolean> {
  const tenantId = await getTenantId(userId, academyId);
  if (!tenantId) {
    return false;
  }

  const [academy] = await db
    .select({ tenantId: academies.tenantId })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  return academy?.tenantId === tenantId;
}

const handler = createMcpHandler(
  (server) => {
    // Register all MCP tools from organized modules
    registerAcademyTools(server);
    registerAthleteTools(server);
    registerUserTools(server);
    registerSystemTools(server);
  },
  {
    // Server options
  },
  {
    // MCP Server configuration
    basePath: '/api/mcp',
    maxDuration: 60,
    verboseLogs: process.env.NODE_ENV === 'development',
  }
);

/**
 * Auth wrapper for MCP handler
 * Verifies Bearer token before processing requests
 */
async function authHandler(request: Request): Promise<Response> {
  // Skip auth for GET requests (MCP protocol uses POST for tool calls)
  if (request.method === 'GET') {
    return handler(request);
  }

  // Verify authentication
  const auth = await verifyAuth(request);
  if (!auth) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Valid authentication token required' },
      { status: 401 }
    );
  }

  try {
    return await handler(request);
  } catch (error) {
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export { authHandler as GET, authHandler as POST };
