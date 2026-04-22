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
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '10');

    // Get user's profile
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('user_id', user.id)
      .limit(1);

    const profile = profiles?.[0];

    if (!profile) {
      return NextResponse.json({ data: [], total: 0 });
    }

    if (profile.role !== 'athlete') {
      return NextResponse.json({ data: [], total: 0 });
    }

    // Get attendance records for this athlete
    let query = supabase
      .from('attendance_records')
      .select(`
        *,
        class_sessions (
          id,
          start_time,
          end_time,
          day_of_week,
          classes (name)
        )
      `)
      .eq('athlete_id', profile.id);

    if (startDate) {
      query = query.gte('recorded_at', startDate);
    }
    if (endDate) {
      query = query.lte('recorded_at', endDate);
    }

    const { data: records, error } = await query
      .order('recorded_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (error) {
      logger.error('Error fetching attendance:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get total count
    let countQuery = supabase
      .from('attendance_records')
      .select('*', { count: 'exact', head: true })
      .eq('athlete_id', profile.id);

    if (startDate) {
      countQuery = countQuery.gte('recorded_at', startDate);
    }
    if (endDate) {
      countQuery = countQuery.lte('recorded_at', endDate);
    }

    const { count } = await countQuery;

    // Format response
    const formattedRecords = records?.map(record => ({
      id: record.id,
      classSessionId: record.class_session_id,
      className: record.class_sessions?.classes?.name || 'Unknown',
      athleteId: record.athlete_id,
      status: record.status,
      notes: record.notes,
      recordedAt: record.recorded_at,
      recordedBy: record.recorded_by,
      date: record.class_sessions ? `${record.class_sessions.day_of_week} ${record.class_sessions.start_time}` : null,
    })) || [];

    return NextResponse.json({
      data: formattedRecords,
      total: count || 0,
    });
  } catch (error) {
    logger.error('Error fetching attendance:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
