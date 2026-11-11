import { operationalProblem, problemResponse } from "@/app/api/v1/problem";
import { apiCreated, apiSuccess } from "@/lib/api-response";
import { confirmAthleteImport } from "@/modules/athlete-import/application/athlete-import-service";
import { OperationalError } from "@/modules/shared/domain/operational-error";

import { noStore, readImportRequest } from "../import-request";

// @auth-flexible route-guard-reason: readImportRequest authenticates the cookie session, requires the same origin, resolves the Owner scope (owner or admin with every site), applies the rate limit and checks the Idempotency-Key before reading the body; the service repeats the authorization, refuses a read-only academy and writes every row in one transaction.
export async function POST(request: Request) {
  const parsed = await readImportRequest(request, { requireIdempotencyKey: true });
  if (!parsed.ok) return parsed.response;
  const input = parsed.value;
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
  if (!input.legalBasisConfirmed) {
    return noStore(
      problemResponse({
        status: 400,
        title: "Importación no válida",
        detail: "Marca la declaración de base legal e información a las familias antes de importar.",
        type: "athlete-import-legal-basis-required",
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
      idempotencyKey: input.idempotencyKey!,
      legalBasisConfirmed: true,
    });
    return noStore(result.replayed ? apiSuccess(result) : apiCreated(result));
  } catch (error) {
    if (error instanceof OperationalError) return noStore(operationalProblem(error));
    throw error;
  }
}
