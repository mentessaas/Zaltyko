import { flag } from "@/lib/directory/contracts";
import { getEntry } from "@/lib/directory/service";
import { calendarFile } from "@/lib/directory/calendar";
import { directoryFailure } from "@/lib/directory/auth";
import { apiError } from "@/lib/api-response";
// @auth-flexible route-guard-reason: public projection only; no participant data or registration operations.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!flag("catalog"))
      return apiError("DISABLED", "Directorio no activo", 503);
    const entry = await getEntry((await params).id);
    if (!entry) return apiError("NOT_FOUND", "Evento no disponible", 404);
    return new Response(calendarFile(entry), {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="evento-${entry.id}.ics"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return directoryFailure(e);
  }
}
