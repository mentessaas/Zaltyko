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

    // Get user's profile to find athlete record
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, role, academy_id')
      .eq('user_id', user.id)
      .limit(1);

    const profile = profiles?.[0];

    if (!profile) {
      return NextResponse.json({ data: [], total: 0 });
    }

    let charges = [];

    if (profile.role === 'athlete') {
      // Get charges for this athlete
      const { data: athleteCharges } = await supabase
        .from('charges')
        .select(`
          *,
          athletes (first_name, last_name)
        `)
        .eq('athlete_id', profile.id)
        .order('due_date', { ascending: false });

      charges = athleteCharges || [];
    } else if (profile.role === 'parent' || profile.role === 'guardian') {
      // Get charges for dependents
      const { data: guardians } = await supabase
        .from('guardians')
        .select('athlete_id')
        .eq('user_id', user.id);

      const athleteIds = guardians?.map(g => g.athlete_id) || [];

      if (athleteIds.length > 0) {
        const { data: guardianCharges } = await supabase
          .from('charges')
          .select(`
            *,
            athletes (first_name, last_name)
          `)
          .in('athlete_id', athleteIds)
          .order('due_date', { ascending: false });

        charges = guardianCharges || [];
      }
    }

    // Format response
    const formattedCharges = charges.map(charge => ({
      id: charge.id,
      athleteId: charge.athlete_id,
      athleteName: charge.athletes
        ? `${charge.athletes.first_name} ${charge.athletes.last_name}`
        : 'Unknown',
      academyId: charge.academy_id,
      amount: parseFloat(charge.amount),
      description: charge.description,
      status: charge.status,
      dueDate: charge.due_date,
      paidDate: charge.paid_date,
      createdAt: charge.created_at,
    }));

    return NextResponse.json({
      data: formattedCharges,
      total: formattedCharges.length,
    });
  } catch (error) {
    logger.error('Error fetching charges:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
