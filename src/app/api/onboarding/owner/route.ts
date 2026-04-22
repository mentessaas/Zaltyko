import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";

import { db } from "@/db";
import { classes, classWeekdays, groups, memberships, profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { apiCreated, apiError } from "@/lib/api-response";
import { createAcademy } from "@/app/api/academies/academies.lib";
import { getCountryNameFromCode, mapDisciplineVariantToAcademyType, normalizeCountryCode } from "@/lib/specialization/registry";
import { getStarterClassPresets, getStarterGroupPresets } from "@/lib/specialization/operational-presets";
import { markChecklistItem } from "@/lib/onboarding";

const bodySchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  academyName: z.string().trim().min(3).max(120),
  disciplineVariant: z.enum(["artistic_female", "artistic_male", "rhythmic"]),
  countryCode: z.string().trim().min(2).max(8),
  country: z.string().trim().max(80).optional(),
  region: z.string().trim().max(80).optional(),
  city: z.string().trim().max(80).optional(),
  starterGroupKeys: z.array(z.string().trim().min(1).max(80)).optional(),
});

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError("UNAUTHENTICATED", "Debes iniciar sesión para completar la configuración", 401);
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return apiError("INVALID_PAYLOAD", "Datos inválidos para crear la academia", 400);
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
      existingMemberships.find((membership) => membership.academyId === profile.activeAcademyId)?.academyId ??
      existingMemberships[0]?.academyId;

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

  const result = await createAcademy(
    {
      name: parsed.data.academyName,
      academyType: mapDisciplineVariantToAcademyType(parsed.data.disciplineVariant) as "artistica" | "ritmica" | "trampolin" | "general",
      disciplineVariant: parsed.data.disciplineVariant,
      countryCode: normalizeCountryCode(parsed.data.countryCode) ?? parsed.data.countryCode,
      country: parsed.data.country ?? getCountryNameFromCode(parsed.data.countryCode),
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
    }
  );

  if ("error" in result) {
    return result.error;
  }

  const starterPresets = getStarterGroupPresets({
    countryCode: normalizeCountryCode(parsed.data.countryCode) ?? "ES",
    countryName: parsed.data.country ?? getCountryNameFromCode(parsed.data.countryCode),
    discipline: parsed.data.disciplineVariant === "rhythmic" ? "rhythmic" : "artistic",
    disciplineVariant: parsed.data.disciplineVariant,
    locale: "es-ES",
    timezone: "Europe/Madrid",
    federationConfigVersion: "rfeg-2026-v1",
    status: "configured",
    academyType: mapDisciplineVariantToAcademyType(parsed.data.disciplineVariant),
    key: {
      countryCode: normalizeCountryCode(parsed.data.countryCode) ?? "ES",
      discipline: parsed.data.disciplineVariant === "rhythmic" ? "rhythmic" : "artistic",
      disciplineVariant: parsed.data.disciplineVariant,
    },
    labels: {
      disciplineName:
        parsed.data.disciplineVariant === "rhythmic"
          ? "Gimnasia rítmica"
          : parsed.data.disciplineVariant === "artistic_male"
            ? "Gimnasia artística masculina"
            : "Gimnasia artística femenina",
      athleteSingular: "Gimnasta",
      athletesPlural: "Gimnastas",
      groupLabel: parsed.data.disciplineVariant === "rhythmic" ? "Conjunto" : "Equipo",
      classLabel: "Entrenamiento",
      sessionLabel: parsed.data.disciplineVariant === "rhythmic" ? "Pase" : "Sesión",
      levelLabel: parsed.data.disciplineVariant === "rhythmic" ? "Categoría" : "Nivel técnico",
      coachLabel:
        parsed.data.disciplineVariant === "artistic_male" ? "Entrenador" : "Entrenadora",
      dashboardHeadline: "Panel técnico de la academia",
      familyHeadline: "Seguimiento deportivo familiar",
    },
    evaluation: { apparatus: [], assessmentTypes: [] },
    categories: { levelOptions: [], levelPlaceholder: "" },
  });
  const selectedStarterGroups = starterPresets.filter((preset) =>
    (parsed.data.starterGroupKeys ?? []).includes(preset.key)
  );

  if (selectedStarterGroups.length > 0) {
    const createdGroups = await db
      .insert(groups)
      .values(
        selectedStarterGroups.map((preset, index) => ({
          id: crypto.randomUUID(),
          academyId: result.id,
          tenantId: result.tenantId,
          name: preset.name,
          discipline: result.academyType,
          level: preset.level,
          color: ["#2563eb", "#db2777", "#059669"][index % 3],
        }))
      )
      .returning();

    const groupByName = new Map(createdGroups.map((group) => [group.name, group]));
    const starterClassPresets = getStarterClassPresets(
      {
        countryCode: normalizeCountryCode(parsed.data.countryCode) ?? "ES",
        countryName: parsed.data.country ?? getCountryNameFromCode(parsed.data.countryCode),
        discipline: parsed.data.disciplineVariant === "rhythmic" ? "rhythmic" : "artistic",
        disciplineVariant: parsed.data.disciplineVariant,
        locale: "es-ES",
        timezone: "Europe/Madrid",
        federationConfigVersion: "rfeg-2026-v1",
        status: "configured",
        academyType: mapDisciplineVariantToAcademyType(parsed.data.disciplineVariant),
        key: {
          countryCode: normalizeCountryCode(parsed.data.countryCode) ?? "ES",
          discipline: parsed.data.disciplineVariant === "rhythmic" ? "rhythmic" : "artistic",
          disciplineVariant: parsed.data.disciplineVariant,
        },
        labels: {
          disciplineName:
            parsed.data.disciplineVariant === "rhythmic"
              ? "Gimnasia rítmica"
              : parsed.data.disciplineVariant === "artistic_male"
                ? "Gimnasia artística masculina"
                : "Gimnasia artística femenina",
          athleteSingular: "Gimnasta",
          athletesPlural: "Gimnastas",
          groupLabel: parsed.data.disciplineVariant === "rhythmic" ? "Conjunto" : "Equipo",
          classLabel: "Entrenamiento",
          sessionLabel: parsed.data.disciplineVariant === "rhythmic" ? "Pase" : "Sesión",
          levelLabel: parsed.data.disciplineVariant === "rhythmic" ? "Categoría" : "Nivel técnico",
          coachLabel:
            parsed.data.disciplineVariant === "artistic_male" ? "Entrenador" : "Entrenadora",
          dashboardHeadline: "Panel técnico de la academia",
          familyHeadline: "Seguimiento deportivo familiar",
        },
        evaluation: { apparatus: [], assessmentTypes: [] },
        categories: { levelOptions: [], levelPlaceholder: "" },
      },
      selectedStarterGroups
    );

    const createdClasses = await db
      .insert(classes)
      .values(
        starterClassPresets.map((preset) => ({
          id: crypto.randomUUID(),
          academyId: result.id,
          tenantId: result.tenantId,
          name: preset.name,
          startTime: preset.startTime,
          endTime: preset.endTime,
          capacity: preset.capacity,
          groupId: preset.groupPresetKey
            ? (selectedStarterGroups.find((groupPreset) => groupPreset.key === preset.groupPresetKey)
                ? groupByName.get(
                    selectedStarterGroups.find((groupPreset) => groupPreset.key === preset.groupPresetKey)!.name
                  )?.id ?? null
                : null)
            : null,
          waitingListEnabled: true,
          allowsFreeTrial: false,
          cancellationHoursBefore: 24,
          cancellationPolicy: "standard",
        }))
      )
      .returning();

    if (createdClasses.length > 0) {
      await db.insert(classWeekdays).values(
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

    await markChecklistItem({
      academyId: result.id,
      tenantId: result.tenantId,
      key: "setup_weekly_schedule",
    });

    await markChecklistItem({
      academyId: result.id,
      tenantId: result.tenantId,
      key: "create_first_group",
    });
  }

  return apiCreated({
    academyId: result.id,
    redirectUrl: `/app/${result.id}/dashboard`,
    tenantId: result.tenantId,
  });
}
