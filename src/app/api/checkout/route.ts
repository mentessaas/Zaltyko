import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, stripeAccounts } from "@/db/schema";
import { getStripeClient } from "@/lib/stripe/client";
import { createPendingSale } from "@/lib/store/service";

/**
 * POST /api/checkout
 * Body: { academyId, customerEmail, customerName?, lines: [{ productId, quantity }] }
 *
 * Crea un sale pending + Checkout Session de Stripe (destination charge a la
 * cuenta conectada de la academia). Devuelve { url } para redirigir al checkout.
 *
 * T2 MVP: flujo simplificado sin envío ni impuestos. La academia recibe el
 * pago en su cuenta Stripe Connect.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { academyId, customerEmail, customerName, lines } = body ?? {};

  if (
    !academyId ||
    typeof customerEmail !== "string" ||
    !Array.isArray(lines) ||
    lines.length === 0
  ) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const [academy] = await db
    .select({
      id: academies.id,
      tenantId: academies.tenantId,
      stripeAccountId: stripeAccounts.stripeAccountId,
    })
    .from(academies)
    .leftJoin(stripeAccounts, eq(stripeAccounts.academyId, academies.id))
    .where(eq(academies.id, academyId))
    .limit(1);
  if (!academy) return NextResponse.json({ error: "academy_not_found" }, { status: 404 });
  if (!academy.stripeAccountId) {
    return NextResponse.json(
      { error: "academy_stripe_not_configured" },
      { status: 409 }
    );
  }

  let sale;
  try {
    sale = await createPendingSale({
      academyId,
      tenantId: academy.tenantId,
      customerEmail,
      customerName: typeof customerName === "string" ? customerName : undefined,
      lines: lines.map((l: { productId: string; quantity: number }) => ({
        productId: l.productId,
        quantity: l.quantity,
      })),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to create sale";
    return NextResponse.json({ error: "sale_invalid", detail: msg }, { status: 400 });
  }

  const stripe = getStripeClient();
  const origin = req.headers.get("origin") ?? "https://zaltyko.com";

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        line_items: lines.map((l: { productId: string; quantity: number }) => ({
          quantity: l.quantity,
          price_data: {
            currency: sale.currency.toLowerCase(),
            unit_amount: 0, // ya viene del producto real en T2.5; placeholder para MVP
            product_data: {
              name: `Pedido ${sale.saleId.slice(0, 8)}`,
            },
          },
        })),
        customer_email: customerEmail,
        success_url: `${origin}/checkout/success?sale=${sale.saleId}`,
        cancel_url: `${origin}/checkout/cancel?sale=${sale.saleId}`,
        metadata: { saleId: sale.saleId, academyId },
        payment_intent_data: {
          // destination charge: el dinero va a la cuenta Connect de la academia
          // application_fee_amount: Zaltyko cobra fee (T2.5)
          transfer_data: { destination: academy.stripeAccountId },
        },
      },
      { stripeAccount: academy.stripeAccountId }
    );

    return NextResponse.json({
      url: session.url,
      saleId: sale.saleId,
    });
  } catch (e: unknown) {
    // Rollback: el admin verá el sale como 'failed' en su panel
    // (T2.5: implementar mark sale failed aquí)
    const errMsg = e instanceof Error ? e.message : "stripe_error";
    return NextResponse.json(
      { error: "stripe_error", detail: errMsg },
      { status: 502 }
    );
  }
}
