import { NextResponse } from "next/server";

import { type TenantContext, withTenant } from "@/lib/authz";
import { apiSuccess, apiError } from "@/lib/api-response";
import {
  InviteFirstAthletesBodySchema,
  MAX_BULK_INVITES,
  inviteFirstAthletes,
  listInvitationsForAcademy,
} from "@/lib/athletes/invitations";

export const dynamic = "force-dynamic";

type RouteContext = TenantContext<{ params?: { academyId?: string } }>;

function getOrigin(request: Request): string {
  // Origen público para construir el redirectTo del magic link.
  // Prioriza el header del edge (respetando proxies), fallback a la URL.
  const fromHeader = request.headers.get("origin");
  if (fromHeader) return fromHeader;
  try {
    return new URL(request.url).origin;
  } catch {
    return "";
  }
}

const postHandler = withTenant(async (request, context) => {
  const ctx = context as RouteContext;
  const academyId = ctx.params?.academyId;

  if (!academyId || typeof academyId !== "string") {
    return apiError("ACADEMY_ID_REQUIRED", "Falta el academyId", 400);
  }
  if (!ctx.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return apiError("INVALID_PAYLOAD", "JSON inválido", 400);
  }

  const parsed = InviteFirstAthletesBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return apiError(
      "INVALID_INVITE_PAYLOAD",
      firstIssue?.message ?? "Datos inválidos",
      400,
      {
        issues: parsed.error.issues.slice(0, 5),
        maxAllowed: MAX_BULK_INVITES,
      }
    );
  }

  const origin = getOrigin(request);
  if (!origin) {
    return apiError(
      "ORIGIN_REQUIRED",
      "No se pudo determinar el origen del request",
      400
    );
  }

  // Aislamiento defensivo: la academia debe pertenecer al tenant resuelto
  // por withTenant. Si no coincide, devolvemos 403 sin filtrar info.
  if (ctx.profile.role !== "super_admin" && ctx.profile.tenantId !== ctx.tenantId) {
    return apiError(
      "TENANT_CONTEXT_CONFLICT",
      "El academyId no pertenece a tu academia activa",
      403
    );
  }

  const result = await inviteFirstAthletes(parsed.data, {
    tenantId: ctx.tenantId,
    academyId,
    invitedBy: ctx.userId,
    origin,
  });

  // 207 si hubo rechazos parciales. Si todo falló → 400.
  const hasSent = result.sent.length > 0;
  const hasRejected = result.rejected.length > 0;
  const status = hasSent ? (hasRejected ? 207 : 201) : 400;

  if (!hasSent && hasRejected) {
    return apiError(
      "INVITE_ALL_REJECTED",
      "Ninguna invitación pudo enviarse",
      status,
      result
    );
  }

  return NextResponse.json(
    {
      ok: true,
      data: {
        sent: result.sent,
        rejected: result.rejected,
        limits: { maxBulkInvites: MAX_BULK_INVITES },
      },
    },
    { status }
  );
});

const getHandler = withTenant(async (request, context) => {
  const ctx = context as RouteContext;
  const academyId = ctx.params?.academyId;

  if (!academyId || typeof academyId !== "string") {
    return apiError("ACADEMY_ID_REQUIRED", "Falta el academyId", 400);
  }
  if (!ctx.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
  }

  const invitations = await listInvitationsForAcademy(
    academyId,
    ctx.tenantId
  );

  // Devolvemos también el KPI calculado (D-006 v0 gate 1) para que el owner
  // vea el avance en su panel sin recalcular en cliente.
  const confirmed = invitations.filter(
    (i) => i.magicLinkOpenedAt && i.profileCompletedAt
  ).length;

  return apiSuccess({
    items: invitations,
    summary: {
      total: invitations.length,
      confirmed,
    },
  });
});

export const POST = postHandler;
export const GET = getHandler;
