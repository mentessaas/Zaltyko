export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { logger } from "@/lib/logger";

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

    // Get profile
    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .limit(1);

    const profile = profiles?.[0];

    if (!profile) {
      return NextResponse.json({ data: [] });
    }

    // Get athlete's enrolled classes
    const { data: enrollments } = await supabase
      .from('class_enrollments')
      .select(`
        class_session_id,
        class_sessions (
          id,
          start_time,
          end_time,
          day_of_week,
          location,
          classes (
            id,
            name,
            coach_id,
            profiles!classes_coach_id_fkey (
              first_name,
              last_name
            )
          )
        )
      `)
      .eq('athlete_id', profile.id);

    // Format schedule
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const schedule = (enrollments as any[])?.map(e => {
      const session = e.class_sessions as any;
      const cls = session.classes;
      return {
        id: session.id,
        className: cls.name,
        day: days[session.day_of_week],
        time: `${session.start_time} - ${session.end_time}`,
        location: session.location || 'Por asignar',
        coach: cls.profiles ? `${cls.profiles.first_name} ${cls.profiles.last_name}` : 'Por asignar',
      };
    }) || [];

    return NextResponse.json({ data: schedule });
  } catch (error) {
    logger.error('Error fetching user schedule:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
