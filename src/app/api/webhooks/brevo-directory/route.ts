import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { rows } from "@/lib/directory/service";
import { apiError, apiSuccess } from "@/lib/api-response";
import { directoryFailure } from "@/lib/directory/auth";
// @auth-flexible route-guard-reason: provider webhook authenticated by configured Bearer secret; denies all unauthenticated events.
export async function POST(request: Request) {
  const secret = process.env.DIRECTORY_BREVO_WEBHOOK_SECRET;
  if (!secret || secret.length < 32)
    return apiError("NOT_CONFIGURED", "Webhook no configurado", 503);
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (
    !timingSafeEqual(
      digest(request.headers.get("authorization") ?? ""),
      digest(`Bearer ${secret}`)
    )
  )
    return apiError("UNAUTHORIZED", "No autorizado", 401);
  try {
    const body = z
      .object({
        event: z.enum(["hard_bounce", "soft_bounce", "spam", "unsubscribed"]),
        email: z.string().email(),
        "message-id": z.string().max(300),
      })
      .parse(await request.json());
    const column =
      body.event === "spam"
        ? sql`complaint_at`
        : body.event === "unsubscribed"
          ? sql`withdrawn_at`
          : sql`bounce_at`;
    // Only act on a message issued by this module, not a forged address-only event.
    await rows(
      sql`UPDATE directory_subscriptions s SET ${column}=now() WHERE lower(s.email)=lower(${body.email}) AND EXISTS(SELECT 1 FROM directory_deliveries d WHERE d.subscription_id=s.id AND d.provider_id=${body["message-id"]})`
    );
    return apiSuccess({ received: true });
  } catch (e) {
    return directoryFailure(e);
  }
}
