import { NextResponse } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { getRemainingLimits, LimitResource } from "@/lib/limits";
import { handleApiError } from "@/lib/api-error-handler";

const QuerySchema = z.object({
  academyId: z.string().uuid(),
  resource: z.enum(["athletes", "classes", "groups", "academies"]),
});

export const GET = withTenant(async (request, context) => {
  try {
    const url = new URL(request.url);
    const params = QuerySchema.safeParse(Object.fromEntries(url.searchParams));

    if (!params.success) {
      return NextResponse.json(
        {
          error: "INVALID_QUERY",
          message: "Parámetros de consulta inválidos",
          details: params.error.issues,
        },
        { status: 400 }
      );
    }

    const { academyId, resource } = params.data;

    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    const remainingLimits = await getRemainingLimits(
      context.tenantId,
      academyId,
      resource as LimitResource
    );

    return NextResponse.json({ limits: remainingLimits });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/limits/remaining", method: "GET" });
  }
});

