import { z } from "zod";
import { withSuperAdmin } from "@/lib/authz";
import { evidenceLink } from "@/lib/directory/evidence";
import { directoryFailure } from "@/lib/directory/auth";
import { flag } from "@/lib/directory/contracts";
import { apiError, apiSuccess } from "@/lib/api-response";
export const GET = withSuperAdmin(async (request) => {
  if (!flag("admin"))
    return apiError(
      "DIRECTORY_DISABLED",
      "Administración todavía no activa",
      503
    );
  try {
    return apiSuccess(
      await evidenceLink(
        z
          .string()
          .uuid()
          .parse(new URL(request.url).searchParams.get("claimId"))
      )
    );
  } catch (e) {
    return directoryFailure(e);
  }
});
