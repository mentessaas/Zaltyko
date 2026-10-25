import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz/profile-service";
import { resolveFamilyPaymentScope } from "@/lib/family/payment-access";
import { logger } from "@/lib/logger";
import {
  FAMILY_AUTOMATIC_COLLECTION_DISABLED,
  FAMILY_AUTOMATIC_COLLECTION_DISABLED_MESSAGE,
} from "@/lib/stripe/family-automatic-collection-disabled";

export const dynamic = "force-dynamic";

const BodySchema = z.object({ academyId: z.guid() });

/**
 * POST /api/family/payment-method/setup-intent
 *
 * Conserva autenticación y scope familiar; no crea Customers ni SetupIntents en
 * el lanzamiento manual-only.
 */
export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = await createClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !user.email) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = BodySchema.safeParse(await request.json());
    if (!body.success) {
      return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
    }

    const profile = await getCurrentProfile(user.id);
    if (!profile) {
      return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 403 });
    }

    const access = await resolveFamilyPaymentScope({
      userId: user.id,
      email: user.email,
      academyId: body.data.academyId,
    });
    if (!access.allowed) {
      return NextResponse.json(
        { error: access.reason ?? "FORBIDDEN" },
        { status: 403 }
      );
    }
    return NextResponse.json(
      {
        error: FAMILY_AUTOMATIC_COLLECTION_DISABLED,
        code: FAMILY_AUTOMATIC_COLLECTION_DISABLED,
        message: FAMILY_AUTOMATIC_COLLECTION_DISABLED_MESSAGE,
      },
      { status: 410, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    logger.error("Error creating family setup intent", error);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
