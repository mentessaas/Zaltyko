import { and, asc, eq, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { academies, memberships, profiles } from "@/db/schema";

export type LegacyAcademySchemaState = "absent" | "present";

export async function inspectLegacyAcademySchema(
  execute: (query: SQL) => Promise<{ rows: unknown[] }>
): Promise<LegacyAcademySchemaState> {
  const result = await execute(sql`
    select
      to_regclass('public.profiles') is not null as profiles_present,
      to_regclass('public.academies') is not null as academies_present,
      to_regclass('public.memberships') is not null as memberships_present
  `);
  if (result.rows.length !== 1) {
    throw new Error("No se pudo verificar el esquema legacy de academias.");
  }
  const row = result.rows[0] as
    | {
        profiles_present: boolean;
        academies_present: boolean;
        memberships_present: boolean;
      }
    | undefined;
  if (
    !row ||
    typeof row.profiles_present !== "boolean" ||
    typeof row.academies_present !== "boolean" ||
    typeof row.memberships_present !== "boolean"
  ) {
    throw new Error("No se pudo verificar el esquema legacy de academias.");
  }

  const present = [
    row.profiles_present,
    row.academies_present,
    row.memberships_present,
  ];
  if (present.every(Boolean)) return "present";
  if (present.every((value) => !value)) return "absent";

  throw new Error(
    "El esquema legacy de academias está incompleto; se bloquea el acceso automático."
  );
}

export async function findLegacyAcademyMemberships(
  userId: string,
  knownSchemaState?: LegacyAcademySchemaState
) {
  const schemaState =
    knownSchemaState ??
    (await inspectLegacyAcademySchema((query) => db.execute(query)));
  if (schemaState === "absent") return [];

  return db
    .select({
      profileId: profiles.id,
      profileUserId: profiles.userId,
      profileRole: profiles.role,
      profileTenantId: profiles.tenantId,
      profileCanLogin: profiles.canLogin,
      profileIsSuspended: profiles.isSuspended,
      academyId: academies.id,
      academyName: academies.name,
      academyTenantId: academies.tenantId,
      academyOwnerId: academies.ownerId,
      academyStatus: academies.status,
      academyIsSuspended: academies.isSuspended,
      academyCreatedAt: academies.createdAt,
      membershipUserId: memberships.userId,
      membershipRole: memberships.role,
    })
    .from(profiles)
    .innerJoin(academies, eq(academies.tenantId, profiles.tenantId))
    .leftJoin(
      memberships,
      and(
        eq(memberships.academyId, academies.id),
        eq(memberships.userId, profiles.userId)
      )
    )
    .where(
      and(
        eq(profiles.userId, userId),
        or(
          eq(academies.ownerId, profiles.id),
          eq(memberships.userId, profiles.userId)
        )
      )
    )
    .orderBy(asc(academies.createdAt), asc(academies.id))
    .limit(1000);
}

export function isAvailableLegacyAcademy(
  academy: Awaited<ReturnType<typeof findLegacyAcademyMemberships>>[number]
): boolean {
  return (
    academy.profileCanLogin &&
    !academy.profileIsSuspended &&
    !academy.academyIsSuspended &&
    (academy.academyStatus === "active" || academy.academyStatus === "trial")
  );
}

export async function getLegacyOwnerAcademyAccess(
  userId: string,
  academyId: string
) {
  const schemaState = await inspectLegacyAcademySchema((query) =>
    db.execute(query)
  );
  if (schemaState === "absent") return null;

  const [profile] = await db
    .select({
      id: profiles.id,
      userId: profiles.userId,
      name: profiles.name,
      role: profiles.role,
      tenantId: profiles.tenantId,
      canLogin: profiles.canLogin,
      isSuspended: profiles.isSuspended,
    })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  if (!profile) return null;

  const isSuperAdmin = profile.role === "super_admin";
  const [academy] = await db
    .select({
      id: academies.id,
      name: academies.name,
      tenantId: academies.tenantId,
      academyType: academies.academyType,
      country: academies.country,
      status: academies.status,
      isSuspended: academies.isSuspended,
      ownerId: academies.ownerId,
    })
    .from(academies)
    .where(
      isSuperAdmin
        ? eq(academies.id, academyId)
        : and(
            eq(academies.id, academyId),
            eq(academies.tenantId, profile.tenantId)
          )
    )
    .limit(1);

  if (!academy)
    return { profile, academy: null, membershipRole: null, allowed: false };

  const [membership] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(
      and(eq(memberships.academyId, academyId), eq(memberships.userId, userId))
    )
    .limit(1);

  const academyIsAvailable =
    !academy.isSuspended &&
    (academy.status === "active" || academy.status === "trial");
  const profileCanAccess =
    !profile.isSuspended && (profile.canLogin || isSuperAdmin);
  // El enum legacy solo tiene owner/coach/viewer; el rol global admin no basta.
  const hasOwnerLink =
    academy.ownerId === profile.id || membership?.role === "owner";

  return {
    profile,
    academy,
    membershipRole: membership?.role ?? null,
    allowed:
      profileCanAccess &&
      academyIsAvailable &&
      (isSuperAdmin ||
        ((profile.role === "owner" || profile.role === "admin") &&
          hasOwnerLink)),
  };
}
