export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createBearerSupabaseClient, getBearerToken } from "@/lib/supabase/bearer-client";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    // Get user from auth header
    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createBearerSupabaseClient(token);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Get user's classes based on their role
    // First get profile to know the role and academy
    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .limit(1);

    const profile = profiles?.[0];

    if (!profile) {
      return NextResponse.json({ data: [] });
    }

    let classes = [];

    if (profile.role === 'coach') {
      // Get classes where user is the coach
      const { data: coachClasses } = await supabase
        .from('classes')
        .select(`
          *,
          class_sessions(*)
        `)
        .eq('coach_id', profile.id);

      classes = coachClasses || [];
    } else if (profile.role === 'athlete') {
      // Get classes where user is enrolled
      const { data: enrollments } = await supabase
        .from('class_enrollments')
        .select(`
          class_session_id,
          class_sessions (
            *,
            classes (*)
          )
        `)
        .eq('athlete_id', profile.id);

      classes = enrollments?.map(e => e.class_sessions) || [];
    }

    return NextResponse.json({ data: classes });
  } catch (error) {
    logger.error('Error fetching user classes:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
