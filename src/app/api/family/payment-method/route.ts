import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz/profile-service";
import { resolveFamilyPaymentAccess } from "@/lib/family/payment-access";
import {
  getFamilyCustomer,
  removeDefaultPaymentMethod,
  saveDefaultPaymentMethod,
} from "@/lib/stripe/family-customers-service";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

async function authenticate(academyId: string) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return { error: "UNAUTHORIZED" as const, status: 401 };
  }
  const profile = await getCurrentProfile(user.id);
  if (!profile) {
    return { error: "PROFILE_NOT_FOUND" as const, status: 403 };
  }
  const access = await resolveFamilyPaymentAccess({ userId: user.id, email: user.email, academyId });
  if (!access.allowed) {
    return { error: (access.reason ?? "FORBIDDEN") as string, status: 403 };
  }
  return { user, profile, access };
}

/**
 * GET /api/family/payment-method?academyId=...
 * Devuelve la tarjeta guardada (display) de la familia para esa academia.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const academyId = url.searchParams.get("academyId");
    if (!academyId || !z.string().uuid().safeParse(academyId).success) {
      return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
    }
    const auth = await authenticate(academyId);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const customer = await getFamilyCustomer(academyId, auth.profile.id);
    return NextResponse.json({
      hasCard: !!customer?.defaultPaymentMethodId,
      connectReady: auth.access.connectReady ?? false,
      card: customer?.defaultPaymentMethodId
        ? {
            brand: customer.cardBrand,
            last4: customer.cardLast4,
            expMonth: customer.cardExpMonth,
            expYear: customer.cardExpYear,
          }
        : null,
    });
  } catch (error) {
    logger.error("Error fetching family payment method", error);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}

const SaveSchema = z.object({
  academyId: z.string().uuid(),
  paymentMethodId: z.string().min(1),
});

/**
 * POST /api/family/payment-method
 * Guarda un metodo de pago como predeterminado (tras confirmar el SetupIntent).
 */
export async function POST(request: Request) {
  try {
    const body = SaveSchema.safeParse(await request.json());
    if (!body.success) {
      return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
    }
    const auth = await authenticate(body.data.academyId);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    if (!auth.access.stripeAccountId) {
      return NextResponse.json({ error: "ACADEMY_PAYMENTS_NOT_READY" }, { status: 409 });
    }

    const updated = await saveDefaultPaymentMethod({
      academyId: body.data.academyId,
      profileId: auth.profile.id,
      paymentMethodId: body.data.paymentMethodId,
      stripeAccountId: auth.access.stripeAccountId,
    });

    return NextResponse.json({
      ok: true,
      card: {
        brand: updated.cardBrand,
        last4: updated.cardLast4,
        expMonth: updated.cardExpMonth,
        expYear: updated.cardExpYear,
      },
    });
  } catch (error) {
    logger.error("Error saving family payment method", error);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}

const DeleteSchema = z.object({ academyId: z.string().uuid() });

/**
 * DELETE /api/family/payment-method
 * Desvincula la tarjeta guardada.
 */
export async function DELETE(request: Request) {
  try {
    const body = DeleteSchema.safeParse(await request.json());
    if (!body.success) {
      return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
    }
    const auth = await authenticate(body.data.academyId);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    if (!auth.access.stripeAccountId) {
      return NextResponse.json({ ok: true });
    }

    await removeDefaultPaymentMethod({
      academyId: body.data.academyId,
      profileId: auth.profile.id,
      stripeAccountId: auth.access.stripeAccountId,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("Error removing family payment method", error);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
