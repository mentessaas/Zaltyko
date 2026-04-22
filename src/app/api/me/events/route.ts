export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createBearerSupabaseClient, getBearerToken } from "@/lib/supabase/bearer-client";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createBearerSupabaseClient(token);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Get user's profile
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, role, academy_id')
      .eq('user_id', user.id)
      .limit(1);

    const profile = profiles?.[0];

    if (!profile) {
      return NextResponse.json({ data: [] });
    }

    // Get events for the user's academy
    let query = supabase
      .from('events')
      .select('*')
      .eq('academy_id', profile.academy_id);

    // Filter by date
    const today = new Date().toISOString().split('T')[0];
    query = query.gte('start_date', today);

    if (startDate) {
      query = query.gte('start_date', startDate);
    }
    if (endDate) {
      query = query.lte('end_date', endDate);
    }

    // Only show public events or events the user is invited to
    query = query.eq('is_public', true);

    const { data: events, error } = await query
      .order('start_date', { ascending: true })
      .limit(20);

    if (error) {
      logger.error('Error fetching events:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Format response
    const formattedEvents = events?.map(event => ({
      id: event.id,
      title: event.title,
      description: event.description,
      academyId: event.academy_id,
      startDate: event.start_date,
      endDate: event.end_date,
      location: event.location,
      type: event.type || 'other',
      isPublic: event.is_public,
    })) || [];

    return NextResponse.json({ data: formattedEvents });
  } catch (error) {
    logger.error('Error fetching events:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
