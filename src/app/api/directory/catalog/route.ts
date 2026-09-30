import { flag, QuerySchema } from "@/lib/directory/contracts";
import { listEntries } from "@/lib/directory/service";
import { directoryFailure } from "@/lib/directory/auth";
import { apiError, apiSuccess } from "@/lib/api-response";
export const dynamic = "force-dynamic";
// @auth-flexible route-guard-reason: validated public projection; no private records.
export async function GET(request: Request) {
  try {
    if (!flag("catalog"))
      return apiError("DISABLED", "Directorio no activo", 503);
    return apiSuccess(
      await listEntries(
        QuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))
      )
    );
  } catch (e) {
    return directoryFailure(e);
  }
}
