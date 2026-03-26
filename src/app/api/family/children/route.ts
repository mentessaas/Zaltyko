import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

import { db } from "@/db";
import { familyContacts, athletes, academies } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/family/children
 * Returns the athletes (children) linked to the authenticated parent user.
 * Links are established via family_contacts.email matching the parent's auth email.
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = await createClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !user.email) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const parentEmail = user.email.toLowerCase();

    const children = await db
      .select({
        id: athletes.id,
        name: athletes.name,
        level: athletes.level,
        status: athletes.status,
        academyId: athletes.academyId,
        academyName: academies.name,
      })
      .from(familyContacts)
      .innerJoin(athletes, eq(familyContacts.athleteId, athletes.id))
      .innerJoin(academies, eq(athletes.academyId, academies.id))
      .where(eq(familyContacts.email, parentEmail));

    return NextResponse.json({ children });
  } catch (error) {
    logger.error("Error fetching family children", error);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "No se pudieron obtener los hijos" },
      { status: 500 }
    );
  }
}
