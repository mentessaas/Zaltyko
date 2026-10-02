import { directoryRequest } from "@/lib/directory/auth";
import { uploadEvidence } from "@/lib/directory/evidence";
import { apiCreated, apiError } from "@/lib/api-response";
import { flag } from "@/lib/directory/contracts";
// @auth-flexible route-guard-reason: verified account, private storage, actual file validation and fail-closed security scanner.
export async function POST(request: Request) {
  return directoryRequest(request, async (user) => {
    if (!flag("claims"))
      return apiError("DISABLED", "Reclamaciones no activas", 503);
    if (Number(request.headers.get("content-length") ?? 0) > 5500000)
      return apiError("TOO_LARGE", "Máximo 5 MB", 413);
    const form = await request.formData(),
      file = form.get("file");
    if (!(file instanceof File))
      return apiError("INVALID_FILE", "Selecciona un archivo", 400);
    return apiCreated(await uploadEvidence(file, user.id));
  });
}
