import { eq } from "drizzle-orm";
import type { User } from "@supabase/supabase-js";

import { db } from "@/db";
import { profiles } from "@/db/schema";
import { isProfileRole, type ProfileRole } from "@/lib/product/roles";

const OPEN_REGISTRATION_ROLES: ProfileRole[] = [
  "owner",
  "coach",
  "parent",
  "athlete",
  "provider",
];

export function isOpenRegistrationRole(value: unknown): value is ProfileRole {
  return typeof value === "string" && isProfileRole(value) && OPEN_REGISTRATION_ROLES.includes(value);
}

function resolveInitialRole(value: unknown): ProfileRole {
  if (isOpenRegistrationRole(value)) {
    return value;
  }

  return "owner";
}

export async function ensureGlobalProfile(user: User) {
  const [existingProfile] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  if (existingProfile) {
    return existingProfile;
  }

  const role = resolveInitialRole(user.user_metadata?.initial_role);
  const name =
    typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim().length > 0
      ? user.user_metadata.full_name.trim()
      : user.email?.split("@")[0] ?? "Usuario";

  const [createdProfile] = await db
    .insert(profiles)
    .values({
      userId: user.id,
      name,
      role,
      tenantId: crypto.randomUUID(),
      activeAcademyId: null,
      canLogin: true,
    })
    .returning({ id: profiles.id });

  return createdProfile;
}
