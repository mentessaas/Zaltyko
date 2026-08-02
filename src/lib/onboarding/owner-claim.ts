/**
 * Owner claim helpers (D-006 v0).
 *
 * Resuelve el flujo "dueño identificado por email" usado por el onboarding
 * owner: si el email del usuario que acaba de registrarse coincide con el
 * `contactEmail` registrado de una academia ya pre-creada en la base,
 * permitimos reclamar esa academia con un solo click (sin pedir CP/teléfono
 * ni pasar por el wizard de alta).
 *
 * No toca RLS (la app conecta como `postgres` con `BYPASSRLS`); el aislamiento
 * por academy/tenant lo garantiza el caller vía `academies.tenantId` +
 * `memberships.userId`.
 */
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, memberships, profiles } from "@/db/schema";
import { apiError } from "@/lib/api-response";
import { derivar_canal } from "@/lib/gtm/canal";
import type { DatabaseClient } from "@/lib/db-transactions";

export interface ClaimableAcademy {
  id: string;
  name: string;
  tenantId: string;
  contactEmail: string | null;
  contactPhone: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  academyType: string;
  ownerId: string;
}

/**
 * Busca una academia cuyo `contactEmail` registrado coincide con el email
 * del usuario que acaba de autenticarse. La query usa el índice
 * `academies_contact_email_idx` (ver `src/db/schema/academies.ts`).
 *
 * Si hay varias coincidencias (poco probable si el seed mantiene `contactEmail`
 * únicos), devuelve la más antigua — son academias que existían antes del
 * signup del usuario.
 */
export async function findClaimableAcademyByEmail(
  email: string | null | undefined
): Promise<ClaimableAcademy | null> {
  const normalized = email?.trim().toLowerCase() ?? null;
  if (!normalized) {
    return null;
  }

  const [row] = await db
    .select({
      id: academies.id,
      name: academies.name,
      tenantId: academies.tenantId,
      contactEmail: academies.contactEmail,
      contactPhone: academies.contactPhone,
      city: academies.city,
      region: academies.region,
      country: academies.country,
      academyType: academies.academyType,
      ownerId: academies.ownerId,
      createdAt: academies.createdAt,
    })
    .from(academies)
    .where(
      and(
        eq(sql`lower(${academies.contactEmail})`, normalized),
        isNotNull(academies.contactEmail)
      )
    )
    .orderBy(academies.createdAt)
    .limit(1);

  return row ?? null;
}

export const ClaimAcademyBodySchema = z.object({
  academyId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(120),
  // ZAL-157 [GTM-DEP.1] — UTMs first-touch para atribución del canal.
  // Todos opcionales; si ninguno viene, la academia queda como `direct`
  // (resuelto por ZAL-159). Validación max 200 chars por Hermin §4.
  utm: z
    .object({
      utm_source: z.string().max(200).nullable().optional(),
      utm_medium: z.string().max(200).nullable().optional(),
      utm_campaign: z.string().max(200).nullable().optional(),
      utm_term: z.string().max(200).nullable().optional(),
      utm_content: z.string().max(200).nullable().optional(),
      utm_landing_path: z.string().max(500).nullable().optional(),
    })
    .partial()
    .optional(),
});

export interface ClaimAcademyInput {
  userId: string;
  userEmail: string;
  body: z.infer<typeof ClaimAcademyBodySchema>;
}

/**
 * Reclama una academia pre-registrada para el usuario autenticado.
 *
 * - Crea el `profile` si todavía no existe (rol = owner).
 * - Reasigna `academies.ownerId` al nuevo perfil.
 * - Inserta membership `owner` (idempotente vía unique index).
 * - Sincroniza `profile.tenantId` y `profile.activeAcademyId` para que
 *   `resolveUserHome` lo mande a la academia en lugar de devolverlo a
 *   `/onboarding/owner` en el siguiente redirect.
 *
 * Validaciones que aplican:
 * - El email autenticado debe coincidir con `academies.contactEmail`.
 *   Si no, devuelve 403 CLAIM_EMAIL_MISMATCH — no permitimos reclamar
 *   una academia que no fue pre-registrada con este email.
 */
export async function claimAcademy(
  input: ClaimAcademyInput,
  tx: DatabaseClient = db
): Promise<
  | { ok: true; academyId: string; tenantId: string; redirectUrl: string }
  | { ok: false; response: ReturnType<typeof apiError> }
> {
  const normalizedEmail = input.userEmail.trim().toLowerCase();

  // Serialize claims per account: dos pestañas concurrentes deben compartir
  // la misma transacción antes de crear perfil, membership y ownerId.
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${input.userId}))`
  );

  const [academy] = await tx
    .select({
      id: academies.id,
      tenantId: academies.tenantId,
      contactEmail: academies.contactEmail,
    })
    .from(academies)
    .where(eq(academies.id, input.body.academyId))
    .limit(1);

  if (!academy) {
    return {
      ok: false,
      response: apiError("ACADEMY_NOT_FOUND", "La academia no existe.", 404),
    };
  }

  const academyEmail = academy.contactEmail?.trim().toLowerCase() ?? null;
  if (!academyEmail || academyEmail !== normalizedEmail) {
    return {
      ok: false,
      response: apiError(
        "CLAIM_EMAIL_MISMATCH",
        "El email con el que iniciaste sesión no coincide con el contacto registrado de la academia. Si crees que es un error, contacta a soporte.",
        403
      ),
    };
  }

  const [existingProfile] = await tx
    .select({
      id: profiles.id,
      role: profiles.role,
      name: profiles.name,
    })
    .from(profiles)
    .where(eq(profiles.userId, input.userId))
    .limit(1);

  let profileId: string;
  let profileRole: string;

  if (existingProfile) {
    profileId = existingProfile.id;
    profileRole = existingProfile.role;
    if (existingProfile.name !== input.body.fullName) {
      await tx
        .update(profiles)
        .set({ name: input.body.fullName })
        .where(eq(profiles.id, existingProfile.id));
    }
  } else {
    // ON CONFLICT DO NOTHING + RETURNING: protege contra doble-click. Si dos
    // requests concurrentes intentan crear el perfil a la vez, la segunda
    // inserción entra en conflicto por la unique(user_id) y devuelve 0 filas;
    // en ese caso re-leemos el perfil que ganó la carrera.
    const [created] = await tx
      .insert(profiles)
      .values({
        userId: input.userId,
        name: input.body.fullName,
        role: "owner",
        tenantId: academy.tenantId,
        activeAcademyId: academy.id,
        canLogin: true,
      })
      .onConflictDoNothing({ target: profiles.userId })
      .returning({ id: profiles.id, role: profiles.role });

    if (created) {
      profileId = created.id;
      profileRole = created.role;
    } else {
      const [raced] = await tx
        .select({ id: profiles.id, role: profiles.role })
        .from(profiles)
        .where(eq(profiles.userId, input.userId))
        .limit(1);
      if (!raced) {
        return {
          ok: false,
          response: apiError(
            "PROFILE_CREATE_FAILED",
            "No se pudo crear el perfil del dueño.",
            500
          ),
        };
      }
      profileId = raced.id;
      profileRole = raced.role;
    }
  }

  if (!["owner", "admin"].includes(profileRole)) {
    return {
      ok: false,
      response: apiError(
        "CLAIM_ROLE_CONFLICT",
        "Tu cuenta ya pertenece a un flujo de invitación. Accede desde tu academia asignada.",
        403
      ),
    };
  }

  // ZAL-157 [GTM-DEP.1] — UTMs first-touch en el claim path. Si la academia
  // seed ya venía con UTMs del pre-registro, se respetan. Solo se escribe
  // cuando source/medium llega y ambos campos persistidos estaban vacíos.
  const shouldWriteUtm = Boolean(
    input.body.utm && (input.body.utm.utm_source || input.body.utm.utm_medium)
  );

  const updateSet: Record<string, unknown> = { ownerId: profileId };

  if (shouldWriteUtm) {
    const [currentUtm] = await tx
      .select({
        utmSource: academies.utmSource,
        utmMedium: academies.utmMedium,
      })
      .from(academies)
      .where(eq(academies.id, academy.id))
      .limit(1);

    const isEmpty = !currentUtm?.utmSource && !currentUtm?.utmMedium;
    if (isEmpty && input.body.utm) {
      updateSet.utmSource = input.body.utm.utm_source ?? null;
      updateSet.utmMedium = input.body.utm.utm_medium ?? null;
      updateSet.utmCampaign = input.body.utm.utm_campaign ?? null;
      updateSet.utmTerm = input.body.utm.utm_term ?? null;
      updateSet.utmContent = input.body.utm.utm_content ?? null;
      updateSet.utmLandingPath = input.body.utm.utm_landing_path ?? null;
      updateSet.utmCapturedAt = new Date();
      // Este claim es el signup efectivo de una academia pre-registrada sin
      // UTM. Se permite exactamente esta primera captura; cambios posteriores
      // conservan el snapshot.
      updateSet.canalRegistro = derivar_canal(
        input.body.utm.utm_source ?? null,
        input.body.utm.utm_medium ?? null
      );
    }
  }

  await tx.update(academies).set(updateSet).where(eq(academies.id, academy.id));

  await tx
    .insert(memberships)
    .values({
      userId: input.userId,
      academyId: academy.id,
      role: "owner",
    })
    .onConflictDoNothing();

  await tx
    .update(profiles)
    .set({
      tenantId: academy.tenantId,
      activeAcademyId: academy.id,
    })
    .where(eq(profiles.id, profileId));

  return {
    ok: true,
    academyId: academy.id,
    tenantId: academy.tenantId,
    redirectUrl: `/app/${academy.id}/dashboard`,
  };
}
