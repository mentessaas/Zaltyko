import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { getFamilyChildrenForUser } from "@/lib/family/scope-service";
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

    const children = await getFamilyChildrenForUser({
      userId: user.id,
      email: user.email,
    });

    return NextResponse.json({ children });
  } catch (error) {
    logger.error("Error fetching family children", error);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "No se pudieron obtener los hijos" },
      { status: 500 }
    );
  }
}
