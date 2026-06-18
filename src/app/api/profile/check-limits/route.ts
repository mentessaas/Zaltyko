import { cookies } from "next/headers";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { profiles, subscriptions, plans } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { checkPlanLimitViolations } from "@/lib/limits";
import { apiError, apiSuccess } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError("UNAUTHENTICATED", "No autenticado", 401);
  }

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  if (!profile) {
    return apiError("PROFILE_NOT_FOUND", "Perfil no encontrado", 404);
  }

  // Get current subscription
  const [subscription] = await db
    .select({
      planId: subscriptions.planId,
      planCode: plans.code,
    })
    .from(subscriptions)
    .leftJoin(plans, eq(subscriptions.planId, plans.id))
    .where(eq(subscriptions.userId, user.id))
    .limit(1);

  if (!subscription || !subscription.planCode) {
    return apiSuccess({ violations: null, requiresAction: false });
  }

  // Check for violations
  const violations = await checkPlanLimitViolations(
    user.id,
    subscription.planCode as "free" | "pro" | "premium"
  );

  return apiSuccess(violations);
}
