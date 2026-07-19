import { eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";

import { db } from "@/db";
import {
  academies,
  classes,
  classWeekdays,
  groups,
  memberships,
  profiles,
} from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { apiCreated, apiError } from "@/lib/api-response";
import { createAcademy } from "@/app/api/academies/academies.lib";
import {
  getCountryNameFromCode,
  mapDisciplineVariantToAcademyType,
  normalizeCountryCode,
  resolveAcademySpecialization,
} from "@/lib/specialization/registry";
import {
  getStarterClassPresets,
  getStarterGroupPresets,
} from "@/lib/specialization/operational-presets";
import { markChecklistItem } from "@/lib/onboarding";
import { activateAcademySportConfig } from "@/lib/sport-config/seed";
import { getSportConfigSeedByVariant } from "@/lib/sport-config/catalog";
import { withTransaction } from "@/lib/db-transactions";
import { logEvent } from "@/lib/event-logging";

const bodySchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  academyName: z.string().trim().min(3).max(120),
  disciplineVariant: z.enum([
    "artistic_female",
    "artistic_male",
    "rhythmic",
    "general",
  ]),
  activeDisciplineVariants: z
    .array(z.enum(["artistic_female", "artistic_male", "rhythmic", "general"]))
    .optional(),
  academyKind: z.enum(["recreational", "competitive", "mixed"]).optional(),
  countryCode: z.string().trim().min(2).max(8),
  country: z.string().trim().max(80).optional(),
  region: z.string().trim().max(80).optional(),
  city: z.string().trim().max(80).optional(),
  activeProgramCodesByVariant: z
    .record(z.array(z.string().trim().min(1).max(80)))
    .optional(),
  activeApparatusCodesByVariant: z
    .record(z.array(z.string().trim().min(1).max(80)))
    .optional(),
  starterGroupKeys: z.array(z.string().trim().min(1).max(80)).optional(),
  starterGroupsByVariant: z
    .record(z.array(z.string().trim().min(1).max(80)))
    .optional(),
});

const BRANCH_PREFIX: Record<string, string> = {
  artistic_female: "GAF",
  artistic_male: "GAM",
  rhythmic: "GR",
  general: "General",
};

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(
      "UNAUTHENTICATED",
      "Debes iniciar sesión para completar la configuración",
      401
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return apiError(
      "INVALID_PAYLOAD",
      "Datos inválidos para crear la academia",
      400
    );
  }

  let [profile] = await db
    .select({
      id: profiles.id,
      userId: profiles.userId,
      role: profiles.role,
      tenantId: profiles.tenantId,
      activeAcademyId: profiles.activeAcademyId,
      name: profiles.name,
    })
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  if (profile && !["owner", "admin"].includes(profile.role)) {
    return apiError(
      "OWNER_SETUP_NOT_ALLOWED",
      "Tu cuenta ya pertenece a un flujo de invitación. Accede desde tu academia asignada.",
      403
    );
  }

  const existingMemberships = profile
    ? await db
        .select({ academyId: memberships.academyId, role: memberships.role })
        .from(memberships)
        .where(eq(memberships.userId, user.id))
    : [];

  if (profile && existingMemberships.length > 0) {
    const ownerAcademy =
      existingMemberships.find(
        (membership) => membership.academyId === profile.activeAcademyId
      )?.academyId ?? existingMemberships[0]?.academyId;

    if (ownerAcademy) {
      return apiCreated({
        academyId: ownerAcademy,
        redirectUrl: `/app/${ownerAcademy}/dashboard`,
      });
    }
  }

  if (!profile) {
    const tenantId = crypto.randomUUID();
    const [createdProfile] = await db
      .insert(profiles)
      .values({
        userId: user.id,
        name: parsed.data.fullName,
        role: "owner",
        tenantId,
        activeAcademyId: null,
        canLogin: true,
      })
      .returning({
        id: profiles.id,
        userId: profiles.userId,
        role: profiles.role,
        tenantId: profiles.tenantId,
        activeAcademyId: profiles.activeAcademyId,
        name: profiles.name,
      });

    profile = createdProfile;
  } else if (!profile.name) {
    await db
      .update(profiles)
      .set({ name: parsed.data.fullName })
      .where(eq(profiles.id, profile.id));
    profile = { ...profile, name: parsed.data.fullName };
  }

  const setup = await withTransaction(async (tx) => {
    // Serialize owner setup per account. The preflight membership check above
    // is intentionally repeated under the lock so double-clicks or concurrent
    // requests cannot create two academies for the same new owner.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${user.id}))`);

    const [membershipCreatedByAnotherRequest] = await tx
      .select({ academyId: memberships.academyId })
      .from(memberships)
      .where(eq(memberships.userId, user.id))
      .limit(1);

    if (membershipCreatedByAnotherRequest) {
      return { existingAcademyId: membershipCreatedByAnotherRequest.academyId };
    }

    const result = await createAcademy(
      {
        name: parsed.data.academyName,
        academyType: mapDisciplineVariantToAcademyType(
          parsed.data.disciplineVariant
        ) as "artistica" | "ritmica" | "general",
        disciplineVariant: parsed.data.disciplineVariant,
        countryCode:
          normalizeCountryCode(parsed.data.countryCode) ??
          parsed.data.countryCode,
        country:
          parsed.data.country ??
          getCountryNameFromCode(parsed.data.countryCode),
        region: parsed.data.region,
        city: parsed.data.city,
      },
      {
        profile: {
          id: profile.id,
          userId: profile.userId,
          role: profile.role,
          tenantId: profile.tenantId,
        },
        tx,
      }
    );

    if ("error" in result) {
      return { error: result.error };
    }

    const activeVariants = Array.from(
      new Set([
        parsed.data.disciplineVariant,
        ...(parsed.data.activeDisciplineVariants ?? []),
      ])
    );
    const activeConfigByVariant = new Map<
      string,
      Awaited<ReturnType<typeof activateAcademySportConfig>>
    >();
    for (const variant of activeVariants) {
      const activeConfig = await activateAcademySportConfig(
        {
          tenantId: result.tenantId,
          academyId: result.id,
          countryCode: parsed.data.countryCode,
          disciplineVariant: variant,
          academyKind: parsed.data.academyKind ?? "mixed",
          activeProgramCodes:
            parsed.data.activeProgramCodesByVariant?.[variant],
          activeApparatusCodes:
            parsed.data.activeApparatusCodesByVariant?.[variant],
        },
        tx
      );
      activeConfigByVariant.set(variant, activeConfig);
    }

    const usesGenericFallback = Array.from(activeConfigByVariant.values()).some(
      (config) => config?.isGenericFallback
    );
    if (usesGenericFallback) {
      // El país de esta academia todavía no tiene catálogo federativo propio
      // (ver getSportConfigSeedByVariant) - dejarlo honestamente registrado en
      // vez de que quede marcado "configured" como si tuviera nomenclatura real.
      await tx
        .update(academies)
        .set({ specializationStatus: "generic_fallback" })
        .where(eq(academies.id, result.id));
    }

    let createdStarterGroupCount = 0;

    for (const variant of activeVariants) {
      const specialization = resolveAcademySpecialization({
        countryCode: parsed.data.countryCode,
        country: parsed.data.country,
        disciplineVariant: variant,
        academyType: mapDisciplineVariantToAcademyType(variant),
        specializationStatus: "configured",
      });
      const starterPresets = getStarterGroupPresets(specialization);
      const selectedKeys =
        parsed.data.starterGroupsByVariant?.[variant] ??
        (variant === parsed.data.disciplineVariant
          ? parsed.data.starterGroupKeys
          : undefined) ??
        starterPresets.map((preset) => preset.key);
      const selectedStarterGroups = starterPresets.filter((preset) =>
        selectedKeys.includes(preset.key)
      );

      if (selectedStarterGroups.length === 0) continue;

      const activeConfig = activeConfigByVariant.get(variant);
      const seed = getSportConfigSeedByVariant(
        parsed.data.countryCode,
        variant
      );
      const activeProgramCodes =
        activeConfig?.activeProgramCodes ??
        parsed.data.activeProgramCodesByVariant?.[variant] ??
        seed?.programs.map((program) => program.code) ??
        [];
      const activeApparatusCodes =
        activeConfig?.activeApparatusCodes ??
        parsed.data.activeApparatusCodesByVariant?.[variant] ??
        seed?.evaluation.apparatus.map((item) => item.code) ??
        [];
      const prefix =
        activeVariants.length > 1
          ? `${BRANCH_PREFIX[variant] ?? specialization.labels.disciplineName} · `
          : "";

      const createdGroups = await tx
        .insert(groups)
        .values(
          selectedStarterGroups.map((preset, index) => ({
            id: crypto.randomUUID(),
            academyId: result.id,
            tenantId: result.tenantId,
            name: `${prefix}${preset.name}`,
            discipline: mapDisciplineVariantToAcademyType(variant),
            sportConfigId: activeConfig?.id ?? null,
            programCode:
              activeProgramCodes[0] ?? seed?.programs[0]?.code ?? null,
            level: preset.level,
            apparatus:
              activeApparatusCodes.length > 0 ? activeApparatusCodes : null,
            color: ["#2563eb", "#db2777", "#059669", "#7c3aed", "#ea580c"][
              index % 5
            ],
          }))
        )
        .returning();

      createdStarterGroupCount += createdGroups.length;
      const groupByPresetKey = new Map(
        selectedStarterGroups.map((preset, index) => [
          preset.key,
          createdGroups[index],
        ])
      );
      const starterClassPresets = getStarterClassPresets(
        specialization,
        selectedStarterGroups
      );

      const createdClasses = await tx
        .insert(classes)
        .values(
          starterClassPresets.map((preset) => ({
            id: crypto.randomUUID(),
            academyId: result.id,
            tenantId: result.tenantId,
            name: `${prefix}${preset.name}`,
            startTime: preset.startTime,
            endTime: preset.endTime,
            capacity: preset.capacity,
            groupId: preset.groupPresetKey
              ? (groupByPresetKey.get(preset.groupPresetKey)?.id ?? null)
              : null,
            sportConfigId: activeConfig?.id ?? null,
            waitingListEnabled: true,
            allowsFreeTrial: false,
            cancellationHoursBefore: 24,
            cancellationPolicy: "standard",
          }))
        )
        .returning();

      if (createdClasses.length > 0) {
        await tx.insert(classWeekdays).values(
          createdClasses.flatMap((createdClass, index) =>
            starterClassPresets[index].weekdays.map((weekday) => ({
              id: crypto.randomUUID(),
              classId: createdClass.id,
              tenantId: result.tenantId,
              weekday,
            }))
          )
        );
      }
    }

    if (createdStarterGroupCount > 0) {
      await markChecklistItem({
        academyId: result.id,
        tenantId: result.tenantId,
        key: "setup_weekly_schedule",
        tx,
      });

      await markChecklistItem({
        academyId: result.id,
        tenantId: result.tenantId,
        key: "create_first_group",
        tx,
      });
    }

    return { result, usesGenericFallback };
  });

  if ("existingAcademyId" in setup) {
    return apiCreated({
      academyId: setup.existingAcademyId,
      redirectUrl: `/app/${setup.existingAcademyId}/dashboard`,
    });
  }

  if ("error" in setup) {
    return setup.error;
  }

  await logEvent({
    academyId: setup.result.id,
    eventType: "academy_created",
    metadata: {
      country:
        parsed.data.country ?? getCountryNameFromCode(parsed.data.countryCode),
      countryCode:
        normalizeCountryCode(parsed.data.countryCode) ??
        parsed.data.countryCode,
      academyType: setup.result.academyType,
      disciplineVariant: parsed.data.disciplineVariant,
    },
  });

  return apiCreated({
    academyId: setup.result.id,
    redirectUrl: `/app/${setup.result.id}/dashboard`,
    tenantId: setup.result.tenantId,
    sportConfigFallback: setup.usesGenericFallback,
  });
}
