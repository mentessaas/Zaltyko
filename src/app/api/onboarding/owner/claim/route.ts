import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { sql } from "drizzle-orm";
import { z } from "zod";

<<<<<<< HEAD
=======
import { db } from "@/db";
>>>>>>> origin/main
import { academies, memberships, profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { apiCreated, apiError } from "@/lib/api-response";
import { normalizeClaimEmail } from "@/lib/auth/claim-academy";
import { withTransaction } from "@/lib/db-transactions";

const bodySchema = z.object({
  academyId: z.string().uuid(),
});

export const dynamic = "force-dynamic";

/**
 * POST /api/onboarding/owner/claim
 *
 * Implementa la rama "claim" del onboarding owner (ZAL-130 spec v0 D-006,
 * cortada por ZAL-137). El caller (page.tsx) ya filtró que el email del
 * usuario matchea `academies.contactEmail` antes de renderizar
 * `OwnerClaimCard`; este endpoint **re-verifica** el match case-insensitive
 * como defensa en profundidad y rechaza con 403 `CLAIM_EMAIL_MISMATCH`
 * si llega un academyId cuyo `contactEmail` no es del caller.
 *
 * Concurrencia: `pg_advisory_xact_lock(hashtext(user.id))` dentro de
 * `withTransaction` previene el race de doble-click que crearía dos
 * profiles para el mismo `userId`. `onConflictDoNothing` en
 * profiles.userId + memberships(user_id, academy_id) cubre el caso donde
 * la request concurrente ya ganó el lock.
 *
 * Tenant isolation: el profile del nuevo owner recibe el `tenantId` del
 * academy (NO se genera uno nuevo) — claim cross-tenant es imposible
 * porque el email del caller debe matchear el `contactEmail` registrado.
 */
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return apiError(
      "UNAUTHENTICATED",
      "Debes iniciar sesión para confirmar la academia",
      401
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("INVALID_PAYLOAD", "academyId requerido", 400);
  }

  const callerEmail = normalizeClaimEmail(user.email);
  if (!callerEmail) {
    return apiError("INVALID_EMAIL", "Email de usuario vacío", 400);
  }

  const setup = await withTransaction(async (tx) => {
    // Serialize claim per user. Doble-click o dos requests concurrentes no
    // pueden crear dos profiles ni dos memberships para el mismo user.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${user.id}))`);

    const [academy] = await tx
      .select({
        id: academies.id,
        name: academies.name,
        tenantId: academies.tenantId,
        ownerId: academies.ownerId,
        contactEmail: academies.contactEmail,
      })
      .from(academies)
      .where(eq(academies.id, parsed.data.academyId))
      .limit(1);

    if (!academy) {
      return { error: apiError("ACADEMY_NOT_FOUND", "Academia no encontrada", 404) };
    }

    if (normalizeClaimEmail(academy.contactEmail) !== callerEmail) {
      return {
        error: apiError(
          "CLAIM_EMAIL_MISMATCH",
          "Esta academia no está registrada con tu email",
          403
        ),
      };
    }

    // Si el user ya tiene profile + membership, devolvemos redirect existente.
    const [existingMembership] = await tx
      .select({ academyId: memberships.academyId, role: memberships.role })
      .from(memberships)
      .where(eq(memberships.userId, user.id))
      .limit(1);

    if (existingMembership) {
      return {
        existingAcademyId: existingMembership.academyId,
      };
    }

<<<<<<< HEAD
    const [existingProfile] = await tx
      .select({ id: profiles.id, role: profiles.role })
      .from(profiles)
      .where(eq(profiles.userId, user.id))
      .limit(1);

    if (existingProfile && !["owner", "admin"].includes(existingProfile.role)) {
      return {
        error: apiError(
          "OWNER_SETUP_NOT_ALLOWED",
          "Tu cuenta ya pertenece a un flujo de invitación. Accede desde tu academia asignada.",
          403
        ),
      };
    }

    // Reutilizar un profile owner parcialmente creado por un reintento, o
    // crear uno nuevo. El tenant del claim siempre es el de la academia
    // registrada; no se genera ni se acepta un tenant desde el cliente.
    const fallbackName =
      user.email?.split("@")[0]?.trim() || "Owner";

    const profileId = existingProfile?.id ?? (await tx
=======
    // Upsert profile: si ya existe uno (otro flujo lo creó), onConflictDoNothing.
    const fallbackName =
      user.email?.split("@")[0]?.trim() || "Owner";

    await tx
>>>>>>> origin/main
      .insert(profiles)
      .values({
        userId: user.id,
        name: fallbackName,
        role: "owner",
        tenantId: academy.tenantId,
        activeAcademyId: academy.id,
        canLogin: true,
      })
<<<<<<< HEAD
      .onConflictDoNothing({ target: profiles.userId })
      .returning({ id: profiles.id }))[0]?.id;

    if (!profileId) {
      return {
        error: apiError(
          "CLAIM_RETRY_REQUIRED",
          "No se pudo preparar tu perfil. Inténtalo de nuevo.",
          409
        ),
      };
    }

    await tx
      .update(profiles)
      .set({
        tenantId: academy.tenantId,
        activeAcademyId: academy.id,
      })
      .where(eq(profiles.id, profileId));

    // `ownerId` es la autoridad de ownership de la academia. Actualizarlo es
    // parte del claim: la membership por sí sola no convierte una academia
    // pre-registrada en propiedad del usuario que la reclama.
    await tx
      .update(academies)
      .set({ ownerId: profileId })
      .where(eq(academies.id, academy.id));
=======
      .onConflictDoNothing({ target: profiles.userId });
>>>>>>> origin/main

    // Membership: idem onConflictDoNothing para resistir doble-click.
    // tenantId no es columna de memberships — se deriva vía academy.
    // Si por alguna razón externa el profile desapareció (admin DELETE),
    // la FK de memberships.user_id fallará y la transacción rollbackea
    // antes del commit; el caller verá un 500 con detalle.
    await tx
      .insert(memberships)
      .values({
        userId: user.id,
        academyId: academy.id,
        role: "owner",
      })
      .onConflictDoNothing();

    return {
      createdAcademyId: academy.id,
    };
  });

  if ("error" in setup) {
    return setup.error;
  }

  const academyId =
    "existingAcademyId" in setup
      ? setup.existingAcademyId
      : setup.createdAcademyId;

  return apiCreated({
    academyId,
    redirectUrl: `/app/${academyId}/dashboard`,
  });
<<<<<<< HEAD
}
=======
}
>>>>>>> origin/main
