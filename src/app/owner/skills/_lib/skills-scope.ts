import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { createClient } from "@/lib/supabase/server";
import { resolveOwnerScope, type OwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { isSkillLevelsAvailableForPage } from "@/modules/skill-levels/application/skill-level-service";

const querySchema = z.object({
  organizationId: z.guid().optional(),
  locationId: z.guid().optional(),
});

export type SkillsPageScope = {
  userId: string;
  scope: OwnerScope;
  /** Sede con la que se trabaja: la pedida, o la primera de su alcance. */
  locationId: string;
  raw: Record<string, string | undefined>;
};

function firstString(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

/**
 * Entrada común de las páginas de Niveles y progresión. Sin sesión va al
 * acceso; sin alcance sobre la academia o la sede, a 404; y sin la bandera o
 * sin el candidato SQL, a 404 (la función no existe). El equipo técnico entra
 * con la superficie operativa del equipo (dirección, administración,
 * coordinación y entrenadores de su sede): quien edita plantillas se decide
 * en el servicio, no aquí.
 */
export async function requireSkillsScope(input: {
  path: string;
  searchParams: Record<string, string | string[] | undefined>;
}): Promise<SkillsPageScope> {
  const supabase = await createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/login?next=${encodeURIComponent(input.path)}`);

  const raw: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(input.searchParams)) raw[key] = firstString(value);
  const query = querySchema.safeParse({ organizationId: raw.organizationId, locationId: raw.locationId });
  if (!query.success) notFound();

  let scope: OwnerScope;
  try {
    scope = await resolveOwnerScope({
      userId: user.id,
      organizationId: query.data.organizationId,
      locationId: query.data.locationId,
      surface: "coach_operations",
    });
  } catch (error) {
    if (error instanceof OperationalError) {
      if (error.code === "FORBIDDEN" && !query.data.organizationId) redirect("/owner/setup");
      if (error.code === "FORBIDDEN" || error.code === "LOCATION_SCOPE_DENIED" || error.code === "INVALID_RELATION") {
        notFound();
      }
    }
    throw error;
  }

  if (!(await isSkillLevelsAvailableForPage(db))) notFound();
  const locationId = scope.selectedLocationId ?? scope.locations[0]?.id;
  if (!locationId) notFound();
  return { userId: user.id, scope, locationId, raw };
}
