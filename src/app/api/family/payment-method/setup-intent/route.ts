import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz/profile-service";
import { getOptionalEnvVar } from "@/lib/env";
import { resolveFamilyPaymentAccess } from "@/lib/family/payment-access";
import {
  createFamilySetupIntent,
  getOrCreateFamilyCustomer,
} from "@/lib/stripe/family-customers-service";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const BodySchema = z.object({ academyId: z.string().uuid() });

/**
 * POST /api/family/payment-method/setup-intent
 *
 * Crea (o reutiliza) el customer de la familia en la cuenta conectada de la
 * academia y devuelve un SetupIntent client_secret para que Stripe Elements
 * guarde la tarjeta. La captura de la tarjeta ocurre 100% en Stripe (hosted).
 */
export async function POST(request: Request) {
  try {
    const publishableKey = getOptionalEnvVar("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
    if (!publishableKey) {
      return NextResponse.json({ error: "STRIPE_NOT_CONFIGURED" }, { status: 503 });
    }

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

    const access = await resolveFamilyPaymentAccess({
      userId: user.id,
      email: user.email,
      academyId: body.data.academyId,
    });
    if (!access.allowed) {
      return NextResponse.json({ error: access.reason ?? "FORBIDDEN" }, { status: 403 });
    }
    if (!access.stripeAccountId || !access.connectReady) {
      return NextResponse.json({ error: "ACADEMY_PAYMENTS_NOT_READY" }, { status: 409 });
    }

    const customer = await getOrCreateFamilyCustomer({
      academyId: body.data.academyId,
      tenantId: profile.tenantId,
      profileId: profile.id,
      stripeAccountId: access.stripeAccountId,
      email: user.email,
      name: profile.name,
    });

    const clientSecret = await createFamilySetupIntent(
      customer.stripeCustomerId,
      access.stripeAccountId
    );

    return NextResponse.json({
      clientSecret,
      publishableKey,
      stripeAccountId: access.stripeAccountId,
    });
  } catch (error) {
    logger.error("Error creating family setup intent", error);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
