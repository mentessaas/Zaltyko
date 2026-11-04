import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit, rateLimitExceededResponse } from "@/lib/rate-limit";
import { getProductDiscovery, recordProductDiscovery } from "@/modules/product-discovery/application/product-discovery";
import { discoveryCommandSchema } from "@/modules/product-discovery/domain/feature-catalog";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const querySchema = z.object({ organizationId: z.string().uuid(), locationId: z.string().uuid().optional() }).strict();
function noStore(response: Response) { response.headers.set("cache-control", "private, no-store"); return response; }

async function handle(request: Request, write: boolean): Promise<Response> {
  const user = await getCurrentUser(request);
  if (!user) return apiError("UNAUTHENTICATED", "Inicia sesión para continuar", 401);
  const url = new URL(request.url);
  if (write && (request.headers.get("origin") !== url.origin || request.headers.get("sec-fetch-site") === "cross-site")) {
    return apiError("FORBIDDEN", "La selección debe enviarse desde el mismo origen", 403);
  }
  if ([...url.searchParams.keys()].some(key => url.searchParams.getAll(key).length !== 1)) return apiError("VALIDATION_ERROR", "Solicitud no válida", 400);
  const query = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!query.success) return apiError("VALIDATION_ERROR", "Solicitud no válida", 400);
  const limit = await rateLimit({ identifier: `product-discovery:${user.id}`, limit: 60, window: 60 });
  if (!limit.success) return rateLimitExceededResponse(limit);
  try {
    const input = { userId: user.id, ...query.data };
    if (!write) return apiSuccess(await getProductDiscovery(input));
    if (!request.headers.get("content-type")?.startsWith("application/json")) return apiError("VALIDATION_ERROR", "Envía una selección JSON", 415);
    const text = await request.text();
    if (text.length > 2048) return apiError("VALIDATION_ERROR", "Solicitud demasiado grande", 413);
    let body: unknown;
    try { body = JSON.parse(text); } catch { return apiError("VALIDATION_ERROR", "Solicitud no válida", 400); }
    const command = discoveryCommandSchema.safeParse(body);
    if (!command.success) return apiError("VALIDATION_ERROR", "Selección no válida", 400);
    return apiSuccess(await recordProductDiscovery(input, command.data));
  } catch (error) {
    if (error instanceof OperationalError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}

// @auth-flexible route-guard-reason: canonical active membership and selected-site access are revalidated in the service transaction; reads expose only this user's structured discovery selection.
export async function GET(request: Request) { return noStore(await handle(request, false)); }
// @auth-flexible route-guard-reason: same-origin authenticated discovery commands revalidate canonical membership/site scope; no operational, commercial or subscription mutations are performed.
export async function POST(request: Request) { return noStore(await handle(request, true)); }
