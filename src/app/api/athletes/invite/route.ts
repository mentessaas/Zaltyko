import { z } from "zod";

import { withTenant } from "@/lib/authz";
import { apiError, apiSuccess } from "@/lib/api-response";
import { handleApiError } from "@/lib/api-error-handler";
import { logger } from "@/lib/logger";
import {
  ATHLETE_INVITE_BULK_MAX,
  ATHLETE_INVITE_DEFAULT_EXPIRES_DAYS,
  ATHLETE_INVITE_MAX_EXPIRES_DAYS,
  createAthleteInviteBatch,
  listAthleteInvitations,
} from "@/lib/athletes/magic-link-invite-service";
import { verifyAcademyAccess } from "@/lib/permissions";

// Schema compartido: el límite máximo se valida en el schema Zod (defense in
// depth) Y en el servicio (segunda barrera). Si alguien cambia la constante,
// el Zod cap también.
const inviteBodySchema = z.object({
  academyId: z.string().uuid(),
  emails: z
    .array(z.string().trim().min(3))
    .min(1, "Incluye al menos un email")
    .max(ATHLETE_INVITE_BULK_MAX, `Máximo ${ATHLETE_INVITE_BULK_MAX} emails por lote`),
  customMessage: z.string().max(500).optional(),
  expiresInDays: z
    .number()
    .int()
    .min(1)
    .max(ATHLETE_INVITE_MAX_EXPIRES_DAYS)
    .optional()
    .default(ATHLETE_INVITE_DEFAULT_EXPIRES_DAYS),
});

/**
 * POST /api/athletes/invite
 *
 * Body: { academyId, emails[], customMessage?, expiresInDays? }
 *
 * - Hasta 10 emails por llamada (validación Zod + servicio).
 * - Sólo el owner/admin de la academia puede invitar.
 * - Idempotente: si ya hay invitación activa, reenvía con cooldown.
 * - Reusa Supabase magic links vía auth.admin.generateLink; nunca envía el
 *   OTP por email de Supabase — nosotros mandamos plantilla propia vía
 *   Brevo (sendEmailWithLogging) para tener control sobre el template.
 * - Devuelve { results[], sent, resent, skipped, errors[] }. NO incluye
 *   tokens ni action_links.
 */
export const POST = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
  }
  if (!["owner", "admin", "super_admin"].includes(context.profile.role)) {
    return apiError("FORBIDDEN", "Prohibido", 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_JSON", "JSON inválido", 400);
  }

  const parsed = inviteBodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError("INVALID_PAYLOAD", "Payload inválido", 400, {
      issues: parsed.error.issues,
    });
  }

  const access = await verifyAcademyAccess(parsed.data.academyId, context.tenantId);
  if (!access.allowed) {
    return apiError("FORBIDDEN", access.reason ?? "Prohibido", 403);
  }

  try {
    const result = await createAthleteInviteBatch({
      academyId: parsed.data.academyId,
      tenantId: context.tenantId,
      invitedBy: context.profile.userId,
      emails: parsed.data.emails.map((email) => ({ email })),
      customMessage: parsed.data.customMessage ?? null,
      expiresInDays: parsed.data.expiresInDays,
    });

    return apiSuccess({
      batch: {
        total: parsed.data.emails.length,
        sent: result.sent,
        resent: result.resent,
        skipped: result.skipped,
      },
      results: result.results,
      errors: result.errors,
    });
  } catch (err) {
    logger.error("[athletes-invite] batch failed", {
      academyId: parsed.data.academyId,
      tenantId: context.tenantId,
      err: err instanceof Error ? err.message : String(err),
    });
    return handleApiError(err, { endpoint: "/api/athletes/invite", method: "POST" });
  }
});

/**
 * GET /api/athletes/invite?academyId=<uuid>
 *
 * Lista invitaciones de atletas de una academia. Devuelve TODOS los status
 * (pending, opened, profile_complete, cancelled, expired) — el UI puede
 * filtrar.
 */
export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
  }
  const url = new URL(request.url);
  const academyId = url.searchParams.get("academyId");
  if (!academyId) {
    return apiError("ACADEMY_REQUIRED", "academyId requerido", 400);
  }

  const access = await verifyAcademyAccess(academyId, context.tenantId);
  if (!access.allowed) {
    return apiError("FORBIDDEN", access.reason ?? "Prohibido", 403);
  }

  const invites = await listAthleteInvitations(academyId);

  return apiSuccess({
    invitations: invites.map((inv) => ({
      id: inv.id,
      email: inv.email,
      status: inv.status,
      sentAt: inv.sentAt?.toISOString() ?? null,
      openedAt: inv.openedAt?.toISOString() ?? null,
      profileCompletedAt: inv.profileCompletedAt?.toISOString() ?? null,
      resendCount: inv.resendCount,
      expiresAt: inv.expiresAt.toISOString(),
      athleteId: inv.athleteId,
      confirmed: inv.status === "profile_complete",
    })),
  });
});