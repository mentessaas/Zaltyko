import { directoryRequest } from "@/lib/directory/auth";
import { myDirectory } from "@/lib/directory/service";
import { apiSuccess } from "@/lib/api-response";
export const dynamic = "force-dynamic";
// @auth-flexible route-guard-reason: directoryRequest validates verified Auth account; directory grants never confer tenant access.
export async function GET(request: Request) {
  return directoryRequest(request, async (user) =>
    apiSuccess(await myDirectory(user.id))
  );
}
