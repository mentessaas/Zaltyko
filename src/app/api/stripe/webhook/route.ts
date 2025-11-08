import { NextResponse } from "next/server";
import Stripe from "stripe";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { plans, subscriptions } from "@/db/schema";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2024-06-20",
});

const ALLOWED_STATUS = new Set([
  "active",
  "past_due",
  "trialing",
  "canceled",
  "incomplete",
]);

function normalizeStatus(status: string | null | undefined) {
  if (!status) return "active";
  return ALLOWED_STATUS.has(status) ? status : "active";
}

function toDate(value: number | null | undefined) {
  if (!value) return null;
  return new Date(value * 1000);
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "WEBHOOK_NOT_CONFIGURED" }, { status: 500 });
  }

  const payload = await request.text();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error: any) {
    return new NextResponse(`Webhook Error: ${error.message}`, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const data = event.data.object as Stripe.Checkout.Session | Stripe.Subscription;
      const subscription =
        "subscription" in data && typeof data.subscription === "string"
          ? await stripe.subscriptions.retrieve(data.subscription)
          : (data as Stripe.Subscription);

      const metadata = (subscription.metadata ?? data.metadata) ?? {};
      const academyId = metadata.academyId as string | undefined;
      if (!academyId) {
        break;
      }

      const priceId = subscription.items.data[0]?.price?.id;

      if (!priceId) {
        break;
      }

      const [plan] = await db.select().from(plans).where(eq(plans.stripePriceId, priceId)).limit(1);

      if (!plan) {
        break;
      }

      await db
        .insert(subscriptions)
        .values({
          academyId,
          planId: plan.id,
          status: normalizeStatus(subscription.status) as any,
          currentPeriodEnd: toDate(subscription.current_period_end ?? null),
          stripeCustomerId: subscription.customer as string,
          stripeSubscriptionId: subscription.id,
        })
        .onConflictDoUpdate({
          target: subscriptions.academyId,
          set: {
            planId: plan.id,
            status: normalizeStatus(subscription.status) as any,
            currentPeriodEnd: toDate(subscription.current_period_end ?? null),
            stripeCustomerId: subscription.customer as string,
            stripeSubscriptionId: subscription.id,
            updatedAt: new Date(),
          },
        });
      break;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const metadata = subscription.metadata ?? {};
      const academyId = metadata.academyId as string | undefined;

      if (!academyId) {
        break;
      }

      await db
        .update(subscriptions)
        .set({ status: "canceled" })
        .where(eq(subscriptions.academyId, academyId));
      break;
    }
    default: {
      break;
    }
  }

  return NextResponse.json({ received: true });
}
