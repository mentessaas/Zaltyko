/**
 * GET /api/messages/recipients - Listar destinatarios elegibles para iniciar una
 * conversación nueva en una academia.
 *
 * Solo el staff (owner/admin/coach/super_admin) puede iniciar conversaciones
 * libres; las familias/atletas solo reciben mensajes ya iniciados por el staff
 * (ver emptyStateHint en MessagesPage). Devuelve dos grupos:
 * - Compañeros de staff de la misma academia (memberships).
 * - Tutores con acceso al portal (profileId asignado) vinculados a algún
 *   gimnasta de la academia.
 */
import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { z } from "zod";

import { withTenant } from "@/lib/authz";
import { apiSuccess, apiError } from "@/lib/api-response";
import { db } from "@/db";
import { academies, athletes, guardianAthletes, guardians, memberships, profiles } from "@/db/schema";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  academyId: z.string().uuid(),
});

const STAFF_ROLES = new Set(["owner", "admin", "coach", "super_admin"]);

export const GET = withTenant(async (request, context) => {
  try {
    const profile = context.profile;
    if (!profile) return apiError("UNAUTHORIZED", "No autenticado", 401);

    const { searchParams } = new URL(request.url);
    const parsed = QuerySchema.safeParse({ academyId: searchParams.get("academyId") });
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "academyId inválido", 400);
    }
    const { academyId } = parsed.data;

    if (!STAFF_ROLES.has(profile.role)) {
      // Familias/atletas no inician conversaciones libres desde este panel.
      return apiSuccess({ items: [] });
    }

    const tenantId = context.tenantId || profile.tenantId;
    if (!tenantId) return apiError("TENANT_REQUIRED", "Tenant ID es requerido", 400);

    const [academy] = await db
      .select({ id: academies.id })
      .from(academies)
      .where(and(eq(academies.id, academyId), eq(academies.tenantId, tenantId)))
      .limit(1);
    if (!academy) return apiError("FORBIDDEN", "Academia no válida para este tenant", 403);

    const staffMembers = await db
      .select({
        profileId: profiles.id,
        name: profiles.name,
        role: profiles.role,
        photoUrl: profiles.photoUrl,
      })
      .from(memberships)
      .innerJoin(profiles, eq(memberships.userId, profiles.userId))
      .where(
        and(
          eq(memberships.academyId, academyId),
          eq(profiles.tenantId, tenantId),
          ne(profiles.id, profile.id)
        )
      );

    const academyAthletes = await db
      .select({ id: athletes.id, name: athletes.name })
      .from(athletes)
      .where(and(eq(athletes.academyId, academyId), eq(athletes.tenantId, tenantId)));

    const athleteIds = academyAthletes.map((a) => a.id);
    const athleteNameById = new Map(academyAthletes.map((a) => [a.id, a.name]));

    const guardianRows =
      athleteIds.length > 0
        ? await db
            .select({
              profileId: guardians.profileId,
              name: guardians.name,
              athleteId: guardianAthletes.athleteId,
            })
            .from(guardianAthletes)
            .innerJoin(guardians, eq(guardianAthletes.guardianId, guardians.id))
            .where(
              and(
                inArray(guardianAthletes.athleteId, athleteIds),
                eq(guardians.tenantId, tenantId),
                isNotNull(guardians.profileId)
              )
            )
        : [];

    // Un tutor puede tener varios gimnastas; agrupamos por profileId y
    // acumulamos los nombres de los gimnastas para dar contexto en la UI.
    const guardianByProfileId = new Map<
      string,
      { profileId: string; name: string; athleteNames: string[] }
    >();
    for (const row of guardianRows) {
      if (!row.profileId) continue;
      const athleteName = athleteNameById.get(row.athleteId) ?? "Gimnasta";
      const existing = guardianByProfileId.get(row.profileId);
      if (existing) {
        existing.athleteNames.push(athleteName);
      } else {
        guardianByProfileId.set(row.profileId, {
          profileId: row.profileId,
          name: row.name,
          athleteNames: [athleteName],
        });
      }
    }

    const items = [
      ...staffMembers.map((member) => ({
        profileId: member.profileId,
        name: member.name ?? "Sin nombre",
        photoUrl: member.photoUrl,
        group: "staff" as const,
        subtitle: STAFF_ROLE_LABELS[member.role] ?? member.role,
      })),
      ...Array.from(guardianByProfileId.values()).map((guardian) => ({
        profileId: guardian.profileId,
        name: guardian.name,
        photoUrl: null,
        group: "family" as const,
        subtitle: guardian.athleteNames.join(", "),
      })),
    ];

    return apiSuccess({ items });
  } catch (error) {
    return apiError("INTERNAL_ERROR", error instanceof Error ? error.message : "Error inesperado", 500);
  }
});

const STAFF_ROLE_LABELS: Record<string, string> = {
  owner: "Dirección",
  admin: "Administración",
  coach: "Entrenador/a",
  super_admin: "Super admin",
};
