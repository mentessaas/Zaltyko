import { z } from "zod";
import { withdrawSubscription } from "@/lib/directory/communications";
import { directoryFailure } from "@/lib/directory/auth";
import { apiSuccess, apiError } from "@/lib/api-response";
// @auth-flexible route-guard-reason: signed subscription action token; POST avoids automatic confirmation by link scanners.
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      return apiError("INVALID_ORIGIN", "Origen no permitido", 403);
    const { id, token } = z
      .object({
        id: z.string().uuid(),
        token: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .parse(await request.json());
    return apiSuccess(await withdrawSubscription(id, token));
  } catch (e) {
    return directoryFailure(e);
  }
}
