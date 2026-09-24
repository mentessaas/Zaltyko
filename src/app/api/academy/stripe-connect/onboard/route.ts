import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, stripeAccounts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getStripeClient } from "@/lib/stripe/client";
import { mapOnboardingStatus } from "@/lib/stripe/connect-service";

/**
 * POST /api/academy/stripe-connect/onboard
 * Body: { academyId, country, returnUrl }
 *
 * Crea (o reutiliza) una Stripe Connect Standard account para la academia y
 * devuelve la URL de onboarding Express. Si la academia ya tiene cuenta
 * conectada, reutiliza y solo genera un nuevo AccountLink si hace falta.
 *
 * Sin esta conexión, la academia NO puede vender en la tienda ni en el
 * marketplace. Es el gate de toda la feature commerce.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { academyId, country, returnUrl } = body ?? {};
  if (!academyId || typeof academyId !== "string") {
    return NextResponse.json({ error: "missing_academyId" }, { status: 400 });
  }

  // Permiso: solo el owner del academy.
  const [academy] = await db
    .select({
      id: academies.id,
      name: academies.name,
      ownerId: academies.ownerId,
      tenantId: academies.tenantId,
    })
    .from(academies)
    .innerJoin(sql`profiles`, sql`${academies.ownerId} = ${sql.raw("profiles.id")}`)
    .where(
      sql`${academies.id} = ${academyId} AND ${sql.raw("profiles.user_id")} = ${user.id}`
    )
    .limit(1);
  if (!academy) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Buscar si ya tiene stripe_accounts
  const [existing] = await db
    .select()
    .from(stripeAccounts)
    .where(eq(stripeAccounts.academyId, academyId))
    .limit(1);

  const stripe = getStripeClient();
  let accountId = existing?.stripeAccountId ?? null;

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "standard",
      country: typeof country === "string" ? country : "ES",
      email: user.id, // placeholder; la academia actualiza en onboarding
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: { academyId, tenantId: academy.tenantId },
    });
    accountId = account.id;
    await db.insert(stripeAccounts).values({
      tenantId: academy.tenantId,
      academyId,
      stripeAccountId: accountId,
      country: typeof country === "string" ? country : null,
      defaultCurrency: "EUR",
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      onboardingStatus: "pending",
      lastSyncedAt: new Date(),
    });
  }

  // Crear AccountLink para onboarding
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://zaltyko.com";
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${baseUrl}/app/${academyId}/store/onboarding?refresh=1`,
    return_url: returnUrl ?? `${baseUrl}/app/${academyId}/store/onboarding?done=1`,
    type: "account_onboarding",
    collect: "eventually_due",
  });

  return NextResponse.json({
    url: link.url,
    stripeAccountId: accountId,
  });
}

import { sql } from "drizzle-orm";
