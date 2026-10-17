import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";

import { operationalProblem, problemResponse } from "@/app/api/v1/problem";
import { db } from "@/db";
import { locations } from "@/db/zaltyko-schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  academyTargetProfileSchema,
  saveAcademyTargetProfile,
} from "@/modules/health-score/application/academy-target-profile";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const bodySchema = academyTargetProfileSchema.pick({
  organizationId: true,
  targets: true,
});

// @auth-flexible route-guard-reason: verifies session, resolves tenant scope, then application service enforces owner/admin and location authorization transactionally.
export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) {
    return problemResponse({
      status: 401,
      title: "Autenticación requerida",
      detail: "Inicia sesión para configurar objetivos del Health Score.",
      type: "authentication-required",
    });
  }
  const payload = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(payload);
  const idempotencyKey = request.headers.get("idempotency-key") ?? "";
  if (
    !parsed.success ||
    idempotencyKey.length < 8 ||
    idempotencyKey.length > 150
  ) {
    return problemResponse({
      status: 400,
      title: "Configuración inválida",
      detail: "Indica un objetivo entre 1 % y 100 % para cada indicador.",
      type: "invalid-health-score-targets",
      ...(parsed.success ? {} : { errors: parsed.error.flatten() }),
    });
  }
  try {
    const scope = await resolveOwnerScope({
      userId: user.id,
      organizationId: parsed.data.organizationId,
    });
    const accessibleLocationIds = scope.locations.map(
      (location) => location.id
    );
    const [authorizationLocation] = accessibleLocationIds.length
      ? await db
          .select({ id: locations.id })
          .from(locations)
          .where(
            and(
              eq(locations.organizationId, scope.organization.id),
              eq(locations.isActive, true),
              inArray(locations.id, accessibleLocationIds)
            )
          )
          .limit(1)
      : [];
    const authorizationLocationId = authorizationLocation?.id;
    if (!authorizationLocationId) {
      throw new OperationalError(
        "LOCATION_SCOPE_DENIED",
        "La academia necesita al menos una sede activa para continuar",
        403
      );
    }
    const profile = await saveAcademyTargetProfile({
      organizationId: scope.organization.id,
      authorizationLocationId,
      actor: { userId: user.id, memberId: scope.member.id },
      targets: parsed.data.targets,
      idempotencyKey,
    });
    return NextResponse.json(profile, {
      status: profile.replayed ? 200 : 201,
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}
