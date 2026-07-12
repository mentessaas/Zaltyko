import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  academies,
  academySportConfigs,
  athleteAssessments,
  athletes,
  classes,
  competitionResults,
  groups,
  sportLocaleConfigs,
} from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { apiSuccess, apiError } from "@/lib/api-response";
import { handleApiError } from "@/lib/api-error-handler";
import { logger } from "@/lib/logger";
import { activateAcademySportConfig } from "@/lib/sport-config/seed";
import { getAcademySportConfigOptions } from "@/lib/sport-config/service";
import { filterSeedCodes, getSportConfigSeedByVariant } from "@/lib/sport-config/catalog";
import {
  getCountryNameFromCode,
  inferDisciplineFromVariant,
  mapDisciplineVariantToAcademyType,
  normalizeCountryCode,
} from "@/lib/specialization/registry";
import { sanitizeTerminologyOverrides } from "@/lib/sport-config/terminology";

const ACADEMY_TYPES = ["artistica", "ritmica", "general"] as const;
const DISCIPLINE_VARIANTS = ["artistic_female", "artistic_male", "rhythmic", "general"] as const;

const BrandingSchema = z.object({
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  accentColor: z.string().optional(),
  fontHeading: z.string().optional(),
  fontBody: z.string().optional(),
  logoUrl: z.string().url().optional().or(z.literal("")),
  faviconUrl: z.string().url().optional().or(z.literal("")),
});

const ScheduleSlotSchema = z.object({
  id: z.string(),
  dayOfWeek: z.number().min(0).max(6),
  startTime: z.string(),
  endTime: z.string(),
});

const ScheduleSchema = z.object({
  slots: z.array(ScheduleSlotSchema),
});

const ContactSchema = z.object({
  website: z.string().url().optional().or(z.literal("")).nullable(),
  contactEmail: z.string().email().optional().or(z.literal("")).nullable(),
  contactPhone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  socialInstagram: z.string().url().optional().or(z.literal("")).nullable(),
  socialFacebook: z.string().url().optional().or(z.literal("")).nullable(),
  socialTwitter: z.string().url().optional().or(z.literal("")).nullable(),
  socialYoutube: z.string().url().optional().or(z.literal("")).nullable(),
  logoUrl: z.string().url().optional().or(z.literal("")).nullable(),
});

const SettingsSchema = z.object({
  // Basic info
  name: z.string().min(3).optional(),
  publicDescription: z.string().optional().nullable(),
  isPublic: z.boolean().optional(),
  academyType: z.enum(ACADEMY_TYPES).optional(),
  countryCode: z.string().optional(),
  disciplineVariant: z.enum(DISCIPLINE_VARIANTS).optional(),
  activeDisciplineVariants: z.array(z.enum(DISCIPLINE_VARIANTS)).optional(),
  activeProgramCodesByVariant: z.record(z.array(z.string().trim().min(1).max(80))).optional(),
  activeApparatusCodesByVariant: z.record(z.array(z.string().trim().min(1).max(80))).optional(),
  terminologyOverridesByVariant: z
    .record(z.record(z.string().trim().max(80)))
    .optional(),

  // Branding
  branding: BrandingSchema.optional(),

  // Schedule
  schedule: ScheduleSchema.optional(),

  // Contact & Social
  contact: ContactSchema.optional(),

  // Timezone
  timezone: z.string().optional(),

  // Billing
  stripePublicKey: z.string().optional(),
  stripeSecretKey: z.string().optional(),
  stripeWebhookSecret: z.string().optional(),
  taxId: z.string().optional(),
  invoicePrefix: z.string().optional(),
});

async function findSportConfigUsageConflict(params: {
  academyId: string;
  tenantId: string;
  sportConfigId: string;
  programCodes?: string[];
  apparatusCodes?: string[];
}) {
  if (params.programCodes) {
    const allowedPrograms = new Set(params.programCodes);
    const [athleteProgramRows, groupProgramRows] = await Promise.all([
      db
        .select({ programCode: athletes.programCode })
        .from(athletes)
        .where(and(
          eq(athletes.academyId, params.academyId),
          eq(athletes.tenantId, params.tenantId),
          eq(athletes.primarySportConfigId, params.sportConfigId),
          isNull(athletes.deletedAt)
        )),
      db
        .select({ programCode: groups.programCode })
        .from(groups)
        .where(and(
          eq(groups.academyId, params.academyId),
          eq(groups.tenantId, params.tenantId),
          eq(groups.sportConfigId, params.sportConfigId),
          isNull(groups.deletedAt)
        )),
    ]);
    const usedProgram = [...athleteProgramRows, ...groupProgramRows]
      .map((row) => row.programCode)
      .find((code): code is string => Boolean(code && !allowedPrograms.has(code)));

    if (usedProgram) {
      return `No puedes desactivar el programa "${usedProgram}" porque ya está usado en atletas o grupos.`;
    }
  }

  if (params.apparatusCodes) {
    const allowedApparatus = new Set(params.apparatusCodes);
    const [groupRows, classRows, assessmentRows, resultRows] = await Promise.all([
      db
        .select({ apparatus: groups.apparatus })
        .from(groups)
        .where(and(
          eq(groups.academyId, params.academyId),
          eq(groups.tenantId, params.tenantId),
          eq(groups.sportConfigId, params.sportConfigId),
          isNull(groups.deletedAt)
        )),
      db
        .select({ apparatus: classes.apparatus })
        .from(classes)
        .where(and(
          eq(classes.academyId, params.academyId),
          eq(classes.tenantId, params.tenantId),
          eq(classes.sportConfigId, params.sportConfigId),
          isNull(classes.deletedAt)
        )),
      db
        .select({ apparatus: athleteAssessments.apparatus })
        .from(athleteAssessments)
        .where(and(
          eq(athleteAssessments.academyId, params.academyId),
          eq(athleteAssessments.tenantId, params.tenantId),
          eq(athleteAssessments.sportConfigId, params.sportConfigId)
        )),
      db
        .select({ apparatus: competitionResults.apparatus })
        .from(competitionResults)
        .where(and(
          eq(competitionResults.tenantId, params.tenantId),
          eq(competitionResults.sportConfigId, params.sportConfigId)
        )),
    ]);

    const usedApparatus = [
      ...groupRows.flatMap((row) => row.apparatus ?? []),
      ...classRows.flatMap((row) => row.apparatus ?? []),
      ...assessmentRows.map((row) => row.apparatus),
      ...resultRows.map((row) => row.apparatus),
    ].find((code): code is string => Boolean(code && !allowedApparatus.has(code)));

    if (usedApparatus) {
      return `No puedes desactivar el aparato "${usedApparatus}" porque ya está usado en grupos, clases, evaluaciones o resultados.`;
    }
  }

  return null;
}

async function getSportConfigUsageById(params: {
  academyId: string;
  tenantId: string;
  sportConfigIds: string[];
}) {
  const usageById = new Map<string, { programCodes: Set<string>; apparatusCodes: Set<string> }>();
  const uniqueIds = Array.from(new Set(params.sportConfigIds));

  const ensureUsage = (sportConfigId?: string | null) => {
    if (!sportConfigId) return null;
    const existing = usageById.get(sportConfigId);
    if (existing) return existing;
    const created = { programCodes: new Set<string>(), apparatusCodes: new Set<string>() };
    usageById.set(sportConfigId, created);
    return created;
  };

  uniqueIds.forEach((id) => ensureUsage(id));
  if (uniqueIds.length === 0) return usageById;

  let athleteRows: Array<{ sportConfigId: string | null; programCode: string | null }> = [];
  let groupRows: Array<{ sportConfigId: string | null; programCode: string | null; apparatus: string[] | null }> = [];
  let classRows: Array<{ sportConfigId: string | null; apparatus: string[] | null }> = [];
  let assessmentRows: Array<{ sportConfigId: string | null; apparatus: string | null }> = [];
  let resultRows: Array<{ sportConfigId: string | null; apparatus: string | null }> = [];

  try {
    athleteRows = await db
      .select({ sportConfigId: athletes.primarySportConfigId, programCode: athletes.programCode })
      .from(athletes)
      .where(and(
        eq(athletes.academyId, params.academyId),
        eq(athletes.tenantId, params.tenantId),
        isNull(athletes.deletedAt),
        inArray(athletes.primarySportConfigId, uniqueIds)
      ));
  } catch {
    athleteRows = [];
  }

  try {
    groupRows = await db
      .select({ sportConfigId: groups.sportConfigId, programCode: groups.programCode, apparatus: groups.apparatus })
      .from(groups)
      .where(and(
        eq(groups.academyId, params.academyId),
        eq(groups.tenantId, params.tenantId),
        isNull(groups.deletedAt),
        inArray(groups.sportConfigId, uniqueIds)
      ));
  } catch {
    groupRows = [];
  }

  try {
    classRows = await db
      .select({ sportConfigId: classes.sportConfigId, apparatus: classes.apparatus })
      .from(classes)
      .where(and(
        eq(classes.academyId, params.academyId),
        eq(classes.tenantId, params.tenantId),
        isNull(classes.deletedAt),
        inArray(classes.sportConfigId, uniqueIds)
      ));
  } catch {
    classRows = [];
  }

  try {
    assessmentRows = await db
      .select({ sportConfigId: athleteAssessments.sportConfigId, apparatus: athleteAssessments.apparatus })
      .from(athleteAssessments)
      .where(and(
        eq(athleteAssessments.academyId, params.academyId),
        eq(athleteAssessments.tenantId, params.tenantId),
        inArray(athleteAssessments.sportConfigId, uniqueIds)
      ));
  } catch {
    assessmentRows = [];
  }

  try {
    resultRows = await db
      .select({ sportConfigId: competitionResults.sportConfigId, apparatus: competitionResults.apparatus })
      .from(competitionResults)
      .where(and(
        eq(competitionResults.tenantId, params.tenantId),
        inArray(competitionResults.sportConfigId, uniqueIds)
      ));
  } catch {
    resultRows = [];
  }

  athleteRows.forEach((row) => {
    if (row.programCode) ensureUsage(row.sportConfigId)?.programCodes.add(row.programCode);
  });

  groupRows.forEach((row) => {
    const usage = ensureUsage(row.sportConfigId);
    if (!usage) return;
    if (row.programCode) usage.programCodes.add(row.programCode);
    (row.apparatus ?? []).forEach((code) => usage.apparatusCodes.add(code));
  });

  classRows.forEach((row) => {
    const usage = ensureUsage(row.sportConfigId);
    row.apparatus?.forEach((code) => usage?.apparatusCodes.add(code));
  });

  assessmentRows.forEach((row) => {
    if (row.apparatus) ensureUsage(row.sportConfigId)?.apparatusCodes.add(row.apparatus);
  });

  resultRows.forEach((row) => {
    if (row.apparatus) ensureUsage(row.sportConfigId)?.apparatusCodes.add(row.apparatus);
  });

  return usageById;
}

async function withSportConfigUsage<T extends { id: string }>(params: {
  academyId: string;
  tenantId: string;
  sportConfigs: T[];
}) {
  const usageById = await getSportConfigUsageById({
    academyId: params.academyId,
    tenantId: params.tenantId,
    sportConfigIds: params.sportConfigs.map((config) => config.id),
  });

  return params.sportConfigs.map((config) => {
    const usage = usageById.get(config.id);
    return {
      ...config,
      usedProgramCodes: Array.from(usage?.programCodes ?? []),
      usedApparatusCodes: Array.from(usage?.apparatusCodes ?? []),
    };
  });
}

/**
 * GET /api/academies/[academyId]/settings
 *
 * Obtiene la configuración completa de una academia.
 */
export const GET = withTenant(async (request, context) => {
  try {
    const academyId = (context.params as { academyId?: string })?.academyId;

    if (!academyId) {
      return apiError("ACADEMY_ID_REQUIRED", "academyId es requerido", 400);
    }

    const [academy] = await db
      .select({
        id: academies.id,
        name: academies.name,
        academyType: academies.academyType,
        country: academies.country,
        countryCode: academies.countryCode,
        region: academies.region,
        city: academies.city,
        discipline: academies.discipline,
        disciplineVariant: academies.disciplineVariant,
        federationConfigVersion: academies.federationConfigVersion,
        specializationStatus: academies.specializationStatus,
        publicDescription: academies.publicDescription,
        isPublic: academies.isPublic,
        logoUrl: academies.logoUrl,
        website: academies.website,
        contactEmail: academies.contactEmail,
        contactPhone: academies.contactPhone,
        address: academies.address,
        socialInstagram: academies.socialInstagram,
        socialFacebook: academies.socialFacebook,
        socialTwitter: academies.socialTwitter,
        socialYoutube: academies.socialYoutube,
        tenantId: academies.tenantId,
        ownerId: academies.ownerId,
        timezone: academies.timezone,
        brandingColors: academies.brandingColors,
        scheduleConfig: academies.scheduleConfig,
        stripePublicKey: academies.stripePublicKey,
        stripeSecretKey: academies.stripeSecretKey,
        stripeWebhookSecret: academies.stripeWebhookSecret,
        taxId: academies.taxId,
        invoicePrefix: academies.invoicePrefix,
      })
      .from(academies)
      .where(eq(academies.id, academyId))
      .limit(1);

    if (!academy) {
      return apiError("ACADEMY_NOT_FOUND", "Academia no encontrada", 404);
    }

    // Verificar permisos
    const isSuperAdmin = context.profile.role === "super_admin";
    const isOwner = academy.ownerId === context.profile.id;
    const isSameTenant = academy.tenantId === context.tenantId;

    if (!isSuperAdmin && !isOwner && !isSameTenant) {
      return apiError("FORBIDDEN", "No tienes permisos para ver esta academia", 403);
    }

    // Parsear branding colors
    let branding = {
      logoUrl: academy.logoUrl || "",
      primaryColor: "#DC2626",
      secondaryColor: "#EF4444",
      accentColor: "#F59E0B",
      fontHeading: "Inter",
      fontBody: "Inter",
      faviconUrl: "",
    };
    if (academy.brandingColors) {
      try {
        branding = { ...branding, ...JSON.parse(academy.brandingColors) };
      } catch (e) {
        logger.error("Error parsing branding colors:", e);
      }
    }

    // Parsear schedule config
    let schedule = { slots: [] };
    if (academy.scheduleConfig) {
      try {
        schedule = JSON.parse(academy.scheduleConfig);
      } catch (e) {
        logger.error("Error parsing schedule config:", e);
      }
    }

    const sportConfigs = await withSportConfigUsage({
      academyId,
      tenantId: academy.tenantId,
      sportConfigs: await getAcademySportConfigOptions(academyId),
    });

    // Devolver configuración completa
    return apiSuccess({
      name: academy.name,
      academyType: academy.academyType,
      country: academy.country,
      countryCode: academy.countryCode || academy.country || "",
      region: academy.region || "",
      city: academy.city || "",
      disciplineVariant: academy.disciplineVariant || "rhythmic",
      activeDisciplineVariants: sportConfigs.map((config) => config.defaultDisciplineVariant),
      sportConfigs,
      federationConfigVersion: academy.federationConfigVersion || "legacy-default-v1",
      specializationStatus: academy.specializationStatus,
      publicDescription: academy.publicDescription,
      isPublic: academy.isPublic,
      branding,
      schedule,
      contact: {
        website: academy.website,
        contactEmail: academy.contactEmail,
        contactPhone: academy.contactPhone,
        address: academy.address,
        socialInstagram: academy.socialInstagram,
        socialFacebook: academy.socialFacebook,
        socialTwitter: academy.socialTwitter,
        socialYoutube: academy.socialYoutube,
        logoUrl: academy.logoUrl,
      },
      timezone: academy.timezone || "America/Mexico_City",
      stripePublicKey: academy.stripePublicKey || "",
      stripeSecretKeyConfigured: !!academy.stripeSecretKey,
      stripeWebhookSecretConfigured: !!academy.stripeWebhookSecret,
      taxId: academy.taxId || "",
      invoicePrefix: academy.invoicePrefix || "INV",
    });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/academies/[academyId]/settings", method: "GET" });
  }
});

/**
 * PATCH /api/academies/[academyId]/settings
 *
 * Actualiza la configuración de una academia.
 * Solo el propietario o admin puede actualizar.
 */
export const PATCH = withTenant(async (request, context) => {
  try {
    const academyId = (context.params as { academyId?: string })?.academyId;

    if (!academyId) {
      return apiError("ACADEMY_ID_REQUIRED", "academyId es requerido", 400);
    }

    // Verificar que la academia existe y pertenece al tenant
    const [academy] = await db
      .select({
        id: academies.id,
        tenantId: academies.tenantId,
        ownerId: academies.ownerId,
        country: academies.country,
        countryCode: academies.countryCode,
        disciplineVariant: academies.disciplineVariant,
        specializationStatus: academies.specializationStatus,
      })
      .from(academies)
      .where(eq(academies.id, academyId))
      .limit(1);

    if (!academy) {
      return apiError("ACADEMY_NOT_FOUND", "Academia no encontrada", 404);
    }

    // Verificar permisos
    const isSuperAdmin = context.profile.role === "super_admin";
    const isOwner = academy.ownerId === context.profile.id;
    const isSameTenant = academy.tenantId === context.tenantId;

    if (!isSuperAdmin && !isOwner && !isSameTenant) {
      return apiError("FORBIDDEN", "No tienes permisos para ver esta academia", 403);
    }

    const body = await request.json();
    const parsed = SettingsSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(
        "VALIDATION_ERROR",
        "Los datos proporcionados no son válidos",
        400
      );
    }

    const data = parsed.data;
    const updates: Record<string, unknown> = {};
    const normalizedCountryCode =
      normalizeCountryCode(data.countryCode ?? academy.countryCode ?? academy.country) ?? "ES";

    // Mapeo de campos básicos
    if (data.name !== undefined) {
      updates.name = data.name;
    }
    if (data.publicDescription !== undefined) {
      updates.publicDescription = data.publicDescription || null;
    }
    if (data.isPublic !== undefined) {
      updates.isPublic = data.isPublic;
    }
    if (data.academyType !== undefined) {
      updates.academyType = data.academyType;
    }
    if (data.countryCode !== undefined) {
      updates.countryCode = normalizeCountryCode(data.countryCode) ?? null;
      updates.country = data.countryCode ? getCountryNameFromCode(data.countryCode) : academy.country;
    }
    if (data.disciplineVariant !== undefined) {
      const specializationChanged =
        academy.specializationStatus === "configured" &&
        academy.disciplineVariant &&
        academy.disciplineVariant !== data.disciplineVariant;

      if (specializationChanged) {
        return apiError(
          "SPECIALIZATION_MIGRATION_REQUIRED",
          "Cambiar la disciplina principal requiere una migración guiada. Por ahora crea una academia nueva o solicita la migración.",
          409
        );
      }

      updates.disciplineVariant = data.disciplineVariant;
      updates.discipline = inferDisciplineFromVariant(data.disciplineVariant);
      updates.academyType = mapDisciplineVariantToAcademyType(data.disciplineVariant);

      // No adivinar aquí si el país+variante tiene catálogo propio: preguntarle
      // a la misma fuente de verdad que decide qué config real se activa
      // (getSportConfigSeedByVariant, ver src/lib/sport-config/catalog.ts).
      const matchingSeed = getSportConfigSeedByVariant(normalizedCountryCode, data.disciplineVariant);
      updates.federationConfigVersion = matchingSeed?.configVersion ?? "legacy-default-v1";
      updates.specializationStatus = matchingSeed?.isGenericFallback ? "generic_fallback" : "configured";
    }

    if (
      data.activeDisciplineVariants !== undefined ||
      data.activeProgramCodesByVariant !== undefined ||
      data.activeApparatusCodesByVariant !== undefined ||
      data.terminologyOverridesByVariant !== undefined
    ) {
      const currentConfigs = await db
        .select({
          academySportConfigId: academySportConfigs.id,
          defaultDisciplineVariant: sportLocaleConfigs.defaultDisciplineVariant,
          isActive: academySportConfigs.isActive,
        })
        .from(academySportConfigs)
        .innerJoin(sportLocaleConfigs, eq(academySportConfigs.sportLocaleConfigId, sportLocaleConfigs.id))
        .where(eq(academySportConfigs.academyId, academyId));

      const uniqueVariants = Array.from(
        new Set(
          data.activeDisciplineVariants ??
          currentConfigs
            .filter((config) => config.isActive)
            .map((config) => config.defaultDisciplineVariant as typeof DISCIPLINE_VARIANTS[number])
        )
      );
      if (uniqueVariants.includes("general") && uniqueVariants.length > 1) {
        return apiError(
          "INVALID_SPORT_CONFIG",
          "La configuración general no puede combinarse con ramas deportivas específicas",
          400
        );
      }

      let usesGenericFallback = false;
      for (const variant of uniqueVariants) {
        const seed = getSportConfigSeedByVariant(normalizedCountryCode, variant);
        if (seed?.isGenericFallback) usesGenericFallback = true;
        const activeProgramCodes =
          seed && data.activeProgramCodesByVariant?.[variant] !== undefined
            ? filterSeedCodes(seed.programs, data.activeProgramCodesByVariant[variant])
            : undefined;
        const activeApparatusCodes =
          seed && data.activeApparatusCodesByVariant?.[variant] !== undefined
            ? filterSeedCodes(seed.evaluation.apparatus, data.activeApparatusCodesByVariant[variant])
            : undefined;
        const terminologyOverrides =
          data.terminologyOverridesByVariant?.[variant] !== undefined
            ? sanitizeTerminologyOverrides(data.terminologyOverridesByVariant[variant])
            : undefined;
        const currentConfig = currentConfigs.find(
          (config) => config.defaultDisciplineVariant === variant
        );

        if (currentConfig && (activeProgramCodes || activeApparatusCodes)) {
          const conflict = await findSportConfigUsageConflict({
            academyId,
            tenantId: academy.tenantId,
            sportConfigId: currentConfig.academySportConfigId,
            programCodes: activeProgramCodes,
            apparatusCodes: activeApparatusCodes,
          });

          if (conflict) {
            return apiError("SPORT_CONFIG_IN_USE", conflict, 409);
          }
        }

        await activateAcademySportConfig({
          tenantId: academy.tenantId,
          academyId,
          countryCode: normalizedCountryCode,
          disciplineVariant: variant,
          academyKind: "mixed",
          activeProgramCodes,
          activeApparatusCodes,
          terminologyOverrides,
        });
      }

      if (usesGenericFallback) {
        updates.specializationStatus = "generic_fallback";
      }

      if (data.activeDisciplineVariants !== undefined) {
        for (const currentConfig of currentConfigs) {
          if (!uniqueVariants.includes(currentConfig.defaultDisciplineVariant as typeof DISCIPLINE_VARIANTS[number])) {
            await db
              .update(academySportConfigs)
              .set({ isActive: false, updatedAt: new Date() })
              .where(eq(academySportConfigs.id, currentConfig.academySportConfigId));
          }
        }
      }
    }

    // Mapeo de contacto
    if (data.contact) {
      if (data.contact.website !== undefined) {
        updates.website = data.contact.website || null;
      }
      if (data.contact.contactEmail !== undefined) {
        updates.contactEmail = data.contact.contactEmail || null;
      }
      if (data.contact.contactPhone !== undefined) {
        updates.contactPhone = data.contact.contactPhone || null;
      }
      if (data.contact.address !== undefined) {
        updates.address = data.contact.address || null;
      }
      if (data.contact.socialInstagram !== undefined) {
        updates.socialInstagram = data.contact.socialInstagram || null;
      }
      if (data.contact.socialFacebook !== undefined) {
        updates.socialFacebook = data.contact.socialFacebook || null;
      }
      if (data.contact.socialTwitter !== undefined) {
        updates.socialTwitter = data.contact.socialTwitter || null;
      }
      if (data.contact.socialYoutube !== undefined) {
        updates.socialYoutube = data.contact.socialYoutube || null;
      }
      if (data.contact.logoUrl !== undefined) {
        updates.logoUrl = data.contact.logoUrl || null;
      }
    }

    // Branding se almacena en branding_colors (JSON)
    if (data.branding) {
      const brandingJson = JSON.stringify({
        primaryColor: data.branding.primaryColor || "#DC2626",
        secondaryColor: data.branding.secondaryColor || "#EF4444",
        accentColor: data.branding.accentColor || "#F59E0B",
        fontHeading: data.branding.fontHeading || "Inter",
        fontBody: data.branding.fontBody || "Inter",
        faviconUrl: data.branding.faviconUrl || "",
      });
      updates.brandingColors = brandingJson;
    }

    // Schedule se almacena en schedule_config (JSON)
    if (data.schedule) {
      updates.scheduleConfig = JSON.stringify(data.schedule);
    }

    // Timezone
    if (data.timezone) {
      updates.timezone = data.timezone;
    }

    // Billing
    if (data.stripePublicKey !== undefined) {
      updates.stripePublicKey = data.stripePublicKey || null;
    }
    if (data.stripeSecretKey !== undefined && data.stripeSecretKey !== "") {
      updates.stripeSecretKey = data.stripeSecretKey;
    }
    if (data.stripeWebhookSecret !== undefined && data.stripeWebhookSecret !== "") {
      updates.stripeWebhookSecret = data.stripeWebhookSecret;
    }
    if (data.taxId !== undefined) {
      updates.taxId = data.taxId || null;
    }
    if (data.invoicePrefix !== undefined) {
      updates.invoicePrefix = data.invoicePrefix || "INV";
    }

    if (
      Object.keys(updates).length === 0 &&
      data.activeDisciplineVariants === undefined &&
      data.activeProgramCodesByVariant === undefined &&
      data.activeApparatusCodesByVariant === undefined &&
      data.terminologyOverridesByVariant === undefined
    ) {
      return apiError("NO_CHANGES", "No se proporcionaron cambios para actualizar", 400);
    }

    const [updated] = Object.keys(updates).length > 0
      ? await db
        .update(academies)
        .set(updates)
        .where(eq(academies.id, academyId))
        .returning({
        id: academies.id,
        name: academies.name,
        academyType: academies.academyType,
        country: academies.country,
        countryCode: academies.countryCode,
        region: academies.region,
        city: academies.city,
        disciplineVariant: academies.disciplineVariant,
        federationConfigVersion: academies.federationConfigVersion,
        specializationStatus: academies.specializationStatus,
        publicDescription: academies.publicDescription,
        isPublic: academies.isPublic,
        logoUrl: academies.logoUrl,
        website: academies.website,
        contactEmail: academies.contactEmail,
        contactPhone: academies.contactPhone,
        address: academies.address,
        socialInstagram: academies.socialInstagram,
        socialFacebook: academies.socialFacebook,
        socialTwitter: academies.socialTwitter,
        socialYoutube: academies.socialYoutube,
        })
      : await db
        .select({
          id: academies.id,
          name: academies.name,
          academyType: academies.academyType,
          country: academies.country,
          countryCode: academies.countryCode,
          region: academies.region,
          city: academies.city,
          disciplineVariant: academies.disciplineVariant,
          federationConfigVersion: academies.federationConfigVersion,
          specializationStatus: academies.specializationStatus,
          publicDescription: academies.publicDescription,
          isPublic: academies.isPublic,
          logoUrl: academies.logoUrl,
          website: academies.website,
          contactEmail: academies.contactEmail,
          contactPhone: academies.contactPhone,
          address: academies.address,
          socialInstagram: academies.socialInstagram,
          socialFacebook: academies.socialFacebook,
          socialTwitter: academies.socialTwitter,
          socialYoutube: academies.socialYoutube,
        })
        .from(academies)
        .where(eq(academies.id, academyId))
        .limit(1);

    if (!updated) {
      return apiError("ACADEMY_NOT_FOUND", "Academia no encontrada", 404);
    }

    const sportConfigs = await withSportConfigUsage({
      academyId,
      tenantId: academy.tenantId,
      sportConfigs: await getAcademySportConfigOptions(academyId),
    });

    return apiSuccess({
        name: updated.name,
        academyType: updated.academyType,
        country: updated.country,
        countryCode: updated.countryCode,
        region: updated.region,
        city: updated.city,
        disciplineVariant: updated.disciplineVariant,
        activeDisciplineVariants: sportConfigs.map((config) => config.defaultDisciplineVariant),
        sportConfigs,
        federationConfigVersion: updated.federationConfigVersion,
        specializationStatus: updated.specializationStatus,
        publicDescription: updated.publicDescription,
        isPublic: updated.isPublic,
        logoUrl: updated.logoUrl,
        website: updated.website,
        contactEmail: updated.contactEmail,
        contactPhone: updated.contactPhone,
        address: updated.address,
        socialInstagram: updated.socialInstagram,
        socialFacebook: updated.socialFacebook,
        socialTwitter: updated.socialTwitter,
        socialYoutube: updated.socialYoutube,
      });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/academies/[academyId]/settings", method: "PATCH" });
  }
});
