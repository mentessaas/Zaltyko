import { operationalProblem } from "@/app/api/v1/problem";
import { apiSuccess } from "@/lib/api-response";
import { previewAthleteImport } from "@/modules/athlete-import/application/athlete-import-service";
import { OperationalError } from "@/modules/shared/domain/operational-error";

import { noStore, readImportRequest } from "../import-request";

// @auth-flexible route-guard-reason: readImportRequest authenticates the cookie session, requires the same origin, resolves the Owner scope (owner or admin with every site) and applies the rate limit before reading the body; the service rechecks the member in its read transaction. Nothing is written.
export async function POST(request: Request) {
  const parsed = await readImportRequest(request);
  if (!parsed.ok) return parsed.response;
  const input = parsed.value;
  try {
    const preview = await previewAthleteImport({
      organizationId: input.organizationId,
      userId: input.userId,
      actor: { userId: input.userId, memberId: input.memberId },
      fileBytes: input.fileBytes,
      mapping: input.mapping,
    });
    return noStore(apiSuccess(preview));
  } catch (error) {
    if (error instanceof OperationalError) return noStore(operationalProblem(error));
    throw error;
  }
}
