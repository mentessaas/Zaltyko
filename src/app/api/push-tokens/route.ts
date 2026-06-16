export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createBearerSupabaseClient, getBearerToken } from "@/lib/supabase/bearer-client";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token: pushToken, deviceId, platform } = body;

    if (!pushToken) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    // Get user from auth header
    const authToken = getBearerToken(request);
    if (!authToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createBearerSupabaseClient(authToken);
    const { data: { user }, error: authError } = await supabase.auth.getUser(authToken);

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Store or update push token
    const { data, error } = await supabase
      .from('push_tokens')
      .upsert({
        user_id: user.id,
        token: pushToken,
        device_id: deviceId || null,
        platform: platform || 'unknown',
        created_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,token',
      })
      .select();

    if (error) {
      logger.error('Error storing push token:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    logger.error('Error in push tokens API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    // Get user from auth header
    const tokenValue = getBearerToken(request);
    if (!tokenValue) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createBearerSupabaseClient(tokenValue);
    const { data: { user }, error: authError } = await supabase.auth.getUser(tokenValue);

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Delete push token
    const { error } = await supabase
      .from('push_tokens')
      .delete()
      .eq('user_id', user.id)
      .eq('token', token);

    if (error) {
      logger.error('Error deleting push token:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error in push tokens API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
