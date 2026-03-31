export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jegxfahsvugilbthbked.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request: NextRequest) {
  try {
    // Get user from auth header
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
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
    console.error('Error fetching user classes:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
