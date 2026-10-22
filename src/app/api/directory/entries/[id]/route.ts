import { z } from "zod";
import { directoryRequest } from "@/lib/directory/auth";
import { getEntry, editEntry } from "@/lib/directory/service";
import { flag, EntryDataSchema } from "@/lib/directory/contracts";
import { directoryFailure } from "@/lib/directory/auth";
import { apiError, apiSuccess } from "@/lib/api-response";
export const dynamic = "force-dynamic";
// @auth-flexible route-guard-reason: verified Auth account and per-entry grant checked transactionally in editEntry.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return directoryRequest(request, async (user) => {
    const id = z
      .string()
      .uuid()
      .parse((await params).id);
    const body = z
      .object({ data: EntryDataSchema })
      .parse(await request.json());
    return apiSuccess(await editEntry(id, user.id, body.data));
  });
}

// @auth-flexible route-guard-reason: public approved projection only; no private workflow records.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!flag("catalog"))
      return apiError("DISABLED", "Directorio no activo", 503);
    const entry = await getEntry((await params).id);
    return entry
      ? apiSuccess(entry)
      : apiError("NOT_FOUND", "Ficha no disponible", 404);
  } catch (e) {
    return directoryFailure(e);
  }
}
