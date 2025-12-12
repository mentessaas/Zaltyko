import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, academies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = await createClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const [profile] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.userId, user.id))
      .limit(1);

    if (!profile) {
      return NextResponse.json({ academies: [], hasAcademies: false });
    }

    const userAcademies = await db
      .select({
        id: academies.id,
        name: academies.name,
        academyType: academies.academyType,
      })
      .from(academies)
      .where(eq(academies.ownerId, profile.id));

    return NextResponse.json({
      academies: userAcademies,
      hasAcademies: userAcademies.length > 0,
      count: userAcademies.length,
    });
  } catch (error: any) {
    logger.error("Error fetching user academies", error);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: error?.message ?? "Error al obtener academias" },
      { status: 500 }
    );
  }
}

