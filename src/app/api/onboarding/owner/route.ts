import { recordGrowthEvent } from "@/lib/growth/events";
import {
  directoryAcademyIdentityMatches,
  EntryDataSchema,
  flag,
  type DirectoryAcademyIdentity,
} from "@/lib/directory/contracts";
import {
  academyDuplicateLock,
  academyDuplicateQuery,
  academyOperationalIdentityQuery,
  rows,
} from "@/lib/directory/service";
import { directoryUser, directoryFailure } from "@/lib/directory/auth";
import { and, eq, sql } from "drizzle-orm";
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
import { trackEvent } from "@/lib/analytics";
import { enqueueOnboardingOwnerD0 } from "@/lib/onboarding-owner-integration";
import { logger } from "@/lib/logger";
import { recordOwnerSignupConsent } from "@/lib/consent/owner-consent-store";

const bodySchema = z.object({
  directoryEntryId:z.string().uuid().optional(),
  directoryActivation:z.literal(true).optional(),
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
  /**
   * ZAL-157: UTMs first-touch leídos por el cliente
   * (`sessionStorage` > URL params > fallback `direct/none/...`). Validación
   * de formato se hace en `src/lib/growth/utm.ts` antes del POST; el server
   * vuelve a validar longitud y patrón como defensa en profundidad.
   */
  utm: z
    .object({
      utm_source: z.string().trim().min(1).max(128),
      utm_medium: z.string().trim().min(1).max(128),
      utm_campaign: z.string().trim().min(1).max(128),
      utm_term: z.string().trim().min(1).max(128),
      utm_content: z.string().trim().min(1).max(128),
    })
    .partial()
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


  const duplicateIdentity = {
    name: parsed.data.academyName,
    countryCode:
      normalizeCountryCode(parsed.data.countryCode) ?? parsed.data.countryCode,
    region: parsed.data.region,
    city: parsed.data.city,
  };
  const directoryId=parsed.data.directoryEntryId;
  const requestedDirectoryIdentity: DirectoryAcademyIdentity = {
    name: parsed.data.academyName,
    countryCode:
      normalizeCountryCode(parsed.data.countryCode) ?? parsed.data.countryCode,
    region: parsed.data.region,
    city: parsed.data.city,
  };
  if (directoryId || flag("catalog")) {
    try { await directoryUser(); } catch(e) { return directoryFailure(e); }
  }
  if(directoryId){
    if(!flag('claims')||!parsed.data.directoryActivation||!user.email_confirmed_at)return apiError('ACTIVATION_REQUIRED','Confirma tu correo y la activación expresa de la gestión',403);
    const entry=(await rows(sql`SELECT d.* FROM directory_entries d JOIN directory_grants g ON g.entry_id=d.id WHERE d.id=${directoryId}::uuid AND g.user_id=${user.id}::uuid AND d.kind='academy' AND d.merged_into IS NULL`))[0];
    if(!entry)return apiError('FORBIDDEN','No tienes permisos sobre esta ficha',403);
    if(entry.academy_id)return apiCreated({academyId:entry.academy_id,redirectUrl:`/onboarding/owner?directoryEntryId=${directoryId}`});
    const identity = EntryDataSchema.safeParse(entry.data);
    if (!identity.success) {
      return apiError(
        "DIRECTORY_IDENTITY_INVALID",
        "La ficha necesita revisión antes de activar la gestión",
        409
      );
    }
    if (!directoryAcademyIdentityMatches(identity.data, requestedDirectoryIdentity)) {
      return apiError(
        "DIRECTORY_IDENTITY_MISMATCH",
        "El nombre y la sede deben coincidir con la ficha aprobada. Solicita primero la corrección de la ficha.",
        409
      );
    }
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

  if (profile && ((directoryId && profile.role!=="owner") || !["owner", "admin"].includes(profile.role))) {
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
        .innerJoin(academies, eq(academies.id, memberships.academyId))
        .where(
          and(
            eq(memberships.userId, user.id),
            eq(academies.tenantId, profile.tenantId),
            eq(academies.isSuspended, false)
          )
        )
        .limit(100)
    : [];

  if(directoryId&&existingMemberships.length)return apiError('LINK_REVIEW_REQUIRED','Ya tienes un espacio operativo. Solicita al administrador vincularlo; no se creará otro.',409);
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

  if (!directoryId && flag("catalog")) {
    const matches=await rows(academyDuplicateQuery(duplicateIdentity));
    if(matches.length) return apiError("ACADEMY_ALREADY_LISTED","Encontramos una ficha de esta sede. Revísala y solicita la reclamación o asistencia antes de crear otro espacio.",409,{entries:matches});
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
      .onConflictDoNothing({ target: profiles.userId })
      .returning({
        id: profiles.id,
        userId: profiles.userId,
        role: profiles.role,
        tenantId: profiles.tenantId,
        activeAcademyId: profiles.activeAcademyId,
        name: profiles.name,
      });
    // Dos pestañas o reintentos simultáneos pueden llegar aquí antes de que
    // cualquiera vea el profile. La unicidad de userId debe convertirse en
    // una operación idempotente, no en un 500 para el usuario.
    if (createdProfile) {
      profile = createdProfile;
    } else {
      const [existingProfile] = await db
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
      if (!existingProfile) {
        return apiError("PROFILE_SETUP_RACE", "No se pudo preparar tu perfil. Inténtalo de nuevo.", 409);
      }
      profile = existingProfile;
    }
  } else if (!profile.name) {
    await db
      .update(profiles)
      .set({ name: parsed.data.fullName })
      .where(eq(profiles.id, profile.id));
    profile = { ...profile, name: parsed.data.fullName };
  }

  try {
    await recordOwnerSignupConsent(user);
  } catch (error) {
    logger.warn("owner signup consent could not be recorded", {
      userId: user.id,
      error,
    });
    return apiError(
      "CONSENT_REQUIRED",
      "Debes aceptar los términos y la política de privacidad antes de crear tu academia.",
      400
    );
  }

  const setup = await withTransaction(async (tx) => {
    // Serialize owner setup per account. The preflight membership check above
    // is intentionally repeated under the lock so double-clicks or concurrent
    // requests cannot create two academies for the same new owner.
    let directoryIdentity: DirectoryAcademyIdentity | null = null;
    if(directoryId){
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`directory:${directoryId}`}))`);
      const entry=(await tx.execute(sql`SELECT d.* FROM directory_entries d JOIN directory_grants g ON g.entry_id=d.id WHERE d.id=${directoryId}::uuid AND g.user_id=${user.id}::uuid AND d.kind='academy' AND d.merged_into IS NULL FOR UPDATE OF d`)).rows[0];
      if(!entry)return {error:apiError('FORBIDDEN','El permiso de esta ficha ha cambiado',403)};
      if(entry.academy_id)return {existingAcademyId:String(entry.academy_id)};
      const identity = EntryDataSchema.safeParse(entry.data);
      if (!identity.success) {
        return {
          error: apiError(
            "DIRECTORY_IDENTITY_INVALID",
            "La ficha necesita revisión antes de activar la gestión",
            409
          ),
        };
      }
      if (!directoryAcademyIdentityMatches(identity.data, requestedDirectoryIdentity)) {
        return {
          error: apiError(
            "DIRECTORY_IDENTITY_MISMATCH",
            "El nombre y la sede de la ficha cambiaron. Vuelve a revisarla antes de activar la gestión.",
            409
          ),
        };
      }
      directoryIdentity = identity.data;
    }
    const identityForChecks = directoryIdentity ?? requestedDirectoryIdentity;
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`academy-identity:${academyDuplicateLock(identityForChecks)}`}))`
    );
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${user.id}))`);

    if(directoryId || flag("catalog")) {
      const current=(await tx.execute(sql`SELECT role,tenant_id,can_login,is_suspended FROM profiles WHERE id=${profile.id}::uuid FOR UPDATE`)).rows[0];
      if(!current || !current.can_login || current.is_suspended || current.role!==profile.role || current.tenant_id!==profile.tenantId) return {error:apiError("ACCOUNT_CHANGED","Los permisos de tu cuenta han cambiado. Revisa tu acceso antes de continuar.",409)};
    }

    const [membershipCreatedByAnotherRequest] = await tx
      .select({ academyId: memberships.academyId })
      .from(memberships)
      .innerJoin(academies, eq(academies.id, memberships.academyId))
      .where(
        and(
          eq(memberships.userId, user.id),
          eq(academies.tenantId, profile.tenantId),
          eq(academies.isSuspended, false)
        )
      )
      .limit(1);

    if (membershipCreatedByAnotherRequest) {
      return { existingAcademyId: membershipCreatedByAnotherRequest.academyId };
    }

    if (directoryId || flag("catalog")) {
      const matches = (
        await tx.execute(
          academyDuplicateQuery({
            ...identityForChecks,
            excludeEntryId: directoryId,
          })
        )
      ).rows;
      if (matches.length) {
        return {
          error: apiError(
            "ACADEMY_ALREADY_LISTED",
            "Encontramos otra ficha pública con esta identidad. Solicita asistencia para revisar el vínculo antes de crear un segundo espacio.",
            409,
            { entries: matches }
          ),
        };
      }
    }
    // This operational-only guard also runs while the public directory is off.
    // It returns no tenant details and prevents a second workspace when a
    // matching academy identity already exists in the operational database.
    const operationalMatch = (
      await tx.execute(academyOperationalIdentityQuery(identityForChecks))
    ).rows[0]?.exists;
    if (operationalMatch === true) {
      return {
        error: apiError(
          "ACADEMY_REVIEW_REQUIRED",
          "No creamos otro espacio porque ya puede existir una academia con estos datos. Contacta con soporte para verificar la ficha.",
          409
        ),
      };
    }

    const result = await createAcademy(
      {
        // A public listing is approved evidence. Never let the activation form
        // silently change its public name or location while linking the workspace.
        name: directoryIdentity?.name ?? parsed.data.academyName,
        academyType: mapDisciplineVariantToAcademyType(
          parsed.data.disciplineVariant
        ) as "artistica" | "ritmica" | "general",
        disciplineVariant: parsed.data.disciplineVariant,
        countryCode:
          directoryIdentity?.countryCode ??
          normalizeCountryCode(parsed.data.countryCode) ??
          parsed.data.countryCode,
        country: getCountryNameFromCode(
          directoryIdentity?.countryCode ?? parsed.data.countryCode
        ),
        region: directoryIdentity?.region ?? undefined,
        city: directoryIdentity?.city ?? undefined,
        utm: parsed.data.utm,
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

    if(directoryId){
      await tx.execute(sql`UPDATE directory_entries SET academy_id=${result.id}::uuid,updated_at=now() WHERE id=${directoryId}::uuid`);
      await tx.execute(sql`INSERT INTO directory_audit(entry_id,actor_id,action,metadata) VALUES(${directoryId}::uuid,${user.id}::uuid,'saas_activated',${JSON.stringify({academyId:result.id})}::jsonb)`);
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
    let createdStarterClassCount = 0;

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

      createdStarterClassCount += createdClasses.length;
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

    return { result, usesGenericFallback, createdStarterClassCount };
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
      utm_source: parsed.data.utm?.utm_source ?? null,
      utm_medium: parsed.data.utm?.utm_medium ?? null,
      utm_campaign: parsed.data.utm?.utm_campaign ?? null,
    },
  });

  // createAcademy se ejecutó dentro de la transacción y por eso difirió el
  // evento first-party hasta aquí, después del commit.
  await trackEvent("academy_created", {
    academyId: setup.result.id,
    tenantId: setup.result.tenantId,
    userId: user.id,
    metadata: {
      country:
        parsed.data.country ?? getCountryNameFromCode(parsed.data.countryCode),
      countryCode:
        normalizeCountryCode(parsed.data.countryCode) ??
        parsed.data.countryCode,
      academyType: setup.result.academyType,
      disciplineVariant: parsed.data.disciplineVariant,
      utm_source: parsed.data.utm?.utm_source ?? null,
      utm_medium: parsed.data.utm?.utm_medium ?? null,
      utm_campaign: parsed.data.utm?.utm_campaign ?? null,
    },
    idempotencyKey: `academy_created:v1:${setup.result.id}`,
  });

  if (setup.createdStarterClassCount > 0) {
    await trackEvent("first_class_created", {
      academyId: setup.result.id,
      tenantId: setup.result.tenantId,
      idempotencyKey: `first_class_created:v1:${setup.result.id}`,
    });
  }

  // El trigger queda conectado al evento canónico `academy_created`, pero el
  // integrador permanece fail-closed mientras el flag de secuencia esté
  // apagado. Un fallo de email nunca debe deshacer la creación de la academia.
  void enqueueOnboardingOwnerD0({ academyId: setup.result.id }).catch(
    (error) => {
      logger.warn("onboarding-owner d0 enqueue failed", {
        academyId: setup.result.id,
        error,
      });
    }
  );

  if(directoryId) await recordGrowthEvent({eventName:"directory_saas_activated",source:"directory",academyId:setup.result.id,idempotencyKey:`directory:activation:${directoryId}`,properties:{entry_id:directoryId,audience:"representative"}});
  return apiCreated({
    academyId: setup.result.id,
    redirectUrl: `/app/${setup.result.id}/dashboard`,
    tenantId: setup.result.tenantId,
    sportConfigFallback: setup.usesGenericFallback,
  });
}
