export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { athletes, charges } from "@/db/schema";
import { createBearerSupabaseClient, getBearerToken } from "@/lib/supabase/bearer-client";
import { getCurrentProfile } from "@/lib/authz/profile-service";
import { canAccessFamilyFinancialData } from "@/lib/family/access-policy";
import { getFamilyChildrenForUser } from "@/lib/family/scope-service";
import { logger } from "@/lib/logger";

/**
 * GET /api/me/charges (bearer / móvil)
 *
 * Devuelve las cuotas de las cuentas dependientes del usuario autenticado.
 * El bearer sólo se usa para identificar al usuario; los datos se leen con
 * Drizzle server-side (aislamiento por la relación familia→atleta), evitando el
 * antiguo drift de esquema (first_name/last_name, guardians.user_id, amount…).
 */
export async function GET(request: NextRequest) {
  try {
    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createBearerSupabaseClient(token);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user || !user.email) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const profile = await getCurrentProfile(user.id);
    if (!profile || !canAccessFamilyFinancialData(profile.role)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    // Hijos del padre/madre/tutor (via guardians/family_contacts por email).
    const children = await getFamilyChildrenForUser({ userId: user.id, email: user.email });
    const athleteIds = new Set(children.map((c) => c.id));

    if (athleteIds.size === 0) {
      return NextResponse.json({ data: [], total: 0 });
    }

    const rows = await db
      .select({
        id: charges.id,
        athleteId: charges.athleteId,
        athleteName: athletes.name,
        academyId: charges.academyId,
        amountCents: charges.amountCents,
        currency: charges.currency,
        label: charges.label,
        status: charges.status,
        dueDate: charges.dueDate,
        paidAt: charges.paidAt,
        period: charges.period,
        createdAt: charges.createdAt,
      })
      .from(charges)
      .innerJoin(athletes, eq(charges.athleteId, athletes.id))
      .where(and(inArray(charges.athleteId, Array.from(athleteIds))))
      .orderBy(desc(charges.dueDate));

    const data = rows.map((c) => ({
      id: c.id,
      athleteId: c.athleteId,
      athleteName: c.athleteName ?? "Sin nombre",
      academyId: c.academyId,
      amountCents: c.amountCents,
      currency: c.currency,
      label: c.label,
      status: c.status,
      dueDate: c.dueDate,
      paidAt: c.paidAt,
      period: c.period,
      createdAt: c.createdAt,
    }));

    return NextResponse.json({ data, total: data.length });
  } catch (error) {
    logger.error("Error fetching charges:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
