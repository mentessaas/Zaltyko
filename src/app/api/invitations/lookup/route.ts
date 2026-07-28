export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, invitations } from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/api-response";
import { getUserIdentifier, withRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

/**
 * GET /api/invitations/lookup?token=<uuid> (público, sin auth)
 *
 * Vista previa de una invitación por token — mismo dato que renderiza
 * `/invite/[role]` en la web (email, rol, academias), reexpuesto en JSON
 * para que la app móvil pueda mostrar la pantalla nativa de aceptación
 * al abrir el deep link, sin necesitar sesión todavía.
 */
const QuerySchema = z.object({ token: z.string().min(1) });

const lookupHandler = async (request: NextRequest) => {
  try {
    const parsed = QuerySchema.safeParse({ token: request.nextUrl.searchParams.get("token") });
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Token requerido", 400);
    }

    const [invitation] = await db
      .select({
        email: invitations.email,
        role: invitations.role,
        status: invitations.status,
        expiresAt: invitations.expiresAt,
        academyIds: invitations.academyIds,
      })
      .from(invitations)
      .where(eq(invitations.token, parsed.data.token))
      .limit(1);

    if (!invitation || invitation.status !== "pending") {
      return apiError("INVITATION_NOT_FOUND", "Invitación no encontrada", 404);
    }

    const expired = Boolean(invitation.expiresAt && invitation.expiresAt < new Date());

    const academyRows = invitation.academyIds?.length
      ? await db
          .select({ name: academies.name })
          .from(academies)
          .where(inArray(academies.id, invitation.academyIds))
      : [];

    return apiSuccess({
      email: invitation.email,
      role: invitation.role,
      expired,
      academyNames: academyRows.map((a) => a.name),
    });
  } catch (error) {
    logger.error("Error looking up invitation:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
};

export const GET = withRateLimit(lookupHandler, { identifier: getUserIdentifier, limit: 20, window: 60 });
