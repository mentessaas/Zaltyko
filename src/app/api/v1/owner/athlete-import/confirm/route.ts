import { z } from "zod";

import { operationalProblem, problemResponse } from "@/app/api/v1/problem";
import { apiCreated, apiSuccess } from "@/lib/api-response";
import { confirmAthleteImport } from "@/modules/athlete-import/application/athlete-import-service";
import { OperationalError } from "@/modules/shared/domain/operational-error";

import { noStore, readImportRequest } from "../import-request";

const idempotencyKeySchema = z.string().trim().min(8).max(150);

// @auth-flexible route-guard-reason: readImportRequest authenticates the cookie session, requires the same origin and resolves the Owner scope; the service repeats role and site authorization, refuses a read-only academy and writes every row in one transaction keyed by Idempotency-Key.
export async function POST(request: Request) {
  const parsed = await readImportRequest(request);
  if (!parsed.ok) return parsed.response;
  const input = parsed.value;
  const idempotencyKey = idempotencyKeySchema.safeParse(request.headers.get("idempotency-key") ?? "");
  if (!idempotencyKey.success) {
    return noStore(
      problemResponse({
        status: 400,
        title: "Importación no válida",
        detail: "Falta la clave de la operación (Idempotency-Key, de 8 a 150 caracteres).",
        type: "invalid-athlete-import-request",
      })
    );
  }
  if (!input.mapping || !input.previewToken) {
    return noStore(
      problemResponse({
        status: 400,
        title: "Importación no válida",
        detail: "Genera la vista previa antes de confirmar la importación.",
        type: "invalid-athlete-import-request",
      })
    );
  }
  try {
    const result = await confirmAthleteImport({
      organizationId: input.organizationId,
      userId: input.userId,
      actor: { userId: input.userId, memberId: input.memberId },
      fileBytes: input.fileBytes,
      mapping: input.mapping,
      previewToken: input.previewToken,
      idempotencyKey: idempotencyKey.data,
    });
    return noStore(result.replayed ? apiSuccess(result) : apiCreated(result));
  } catch (error) {
    if (error instanceof OperationalError) return noStore(operationalProblem(error));
    throw error;
  }
}
