import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { requestSubscription } from "@/lib/directory/communications";
import { directoryFailure, directoryUser } from "@/lib/directory/auth";
import { apiSuccess, apiError } from "@/lib/api-response";
// @auth-flexible route-guard-reason: public double-opt-in request, rate-limited and validated; never sends marketing before confirmation.
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      return apiError("INVALID_ORIGIN", "Origen no permitido", 403);
    const input = await request.json();
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    const allowed = await rateLimit({
      identifier: `directory-subscription:${ip}`,
      limit: 3,
      window: 3600,
    });
    if (!allowed.success)
      return apiError(
        "RATE_LIMITED",
        "Espera antes de solicitar otro correo",
        429
      );
    const client = await createClient(await cookies());
    const {
      data: { user },
    } = await client.auth.getUser();
    const id =
      user?.email_confirmed_at &&
      user.email?.toLowerCase() === String(input.email).toLowerCase()
        ? user.id
        : null;
    if (["favorite_changes", "claim_updates"].includes(input.purpose)) {
      const verified = await directoryUser();
      if (verified.id !== id)
        return apiError(
          "EMAIL_MISMATCH",
          "Utiliza el correo confirmado de tu cuenta",
          403
        );
    }
    return apiSuccess(await requestSubscription(input, id));
  } catch (e) {
    return directoryFailure(e);
  }
}
