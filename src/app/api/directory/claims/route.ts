import { recordGrowthEvent } from "@/lib/growth/events";
import { directoryRequest } from "@/lib/directory/auth";
import { submitClaim } from "@/lib/directory/service";
import { ClaimSchema, flag } from "@/lib/directory/contracts";
import { apiCreated, apiError } from "@/lib/api-response";
export const dynamic = "force-dynamic";
// @auth-flexible route-guard-reason: verified Auth user plus directory claim validation and limits; does not assign workspace ownership.
export async function POST(request: Request) {
  return directoryRequest(request, async (user) => {
    if (!flag("claims"))
      return apiError(
        "CLAIMS_DISABLED",
        "Las solicitudes todavía no están activas",
        503
      );
    const body = ClaimSchema.parse(await request.json());
    const claim = await submitClaim(
      body.entryId,
      user.id,
      body.relationship,
      body.evidence,
      body.evidencePath
    );
    await recordGrowthEvent({
      eventName: "directory_claim_requested",
      source: "directory",
      idempotencyKey: `directory:claim:${claim.id}`,
      properties: { entry_id: body.entryId, audience: "representative" },
    });
    return apiCreated(claim);
  });
}
