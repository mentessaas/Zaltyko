import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { apiSuccess, apiError } from "@/lib/api-response";
import { handleApiError } from "@/lib/api-error-handler";
import { logger } from "@/lib/logger";
import {
  getCountryNameFromCode,
  inferDisciplineFromVariant,
  mapDisciplineVariantToAcademyType,
  normalizeCountryCode,
} from "@/lib/specialization/registry";

const ACADEMY_TYPES = ["artistica", "ritmica", "trampolin", "general", "parkour", "danza"] as const;
const DISCIPLINE_VARIANTS = ["artistic_female", "artistic_male", "rhythmic", "trampoline", "parkour", "dance", "general"] as const;

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
  website: z.string().url().optional().or(z.literal("")),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().optional(),
  address: z.string().optional(),
  socialInstagram: z.string().url().optional().or(z.literal("")),
  socialFacebook: z.string().url().optional().or(z.literal("")),
  socialTwitter: z.string().url().optional().or(z.literal("")),
  socialYoutube: z.string().url().optional().or(z.literal("")),
  logoUrl: z.string().url().optional().or(z.literal("")),
});

const SettingsSchema = z.object({
  // Basic info
  name: z.string().min(3).optional(),
  publicDescription: z.string().optional(),
  isPublic: z.boolean().optional(),
  academyType: z.enum(ACADEMY_TYPES).optional(),
  countryCode: z.string().optional(),
  disciplineVariant: z.enum(DISCIPLINE_VARIANTS).optional(),

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

    // Devolver configuración completa
    return apiSuccess({
      name: academy.name,
      academyType: academy.academyType,
      country: academy.country,
      countryCode: academy.countryCode || academy.country || "",
      region: academy.region || "",
      city: academy.city || "",
      disciplineVariant: academy.disciplineVariant || "rhythmic",
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
      stripeSecretKey: academy.stripeSecretKey || "",
      stripeWebhookSecret: academy.stripeWebhookSecret || "",
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
      updates.federationConfigVersion =
        (normalizeCountryCode(data.countryCode ?? academy.countryCode ?? academy.country) === "ES" &&
          ["artistic_female", "artistic_male", "rhythmic"].includes(data.disciplineVariant))
          ? "rfeg-2026-v1"
          : "legacy-default-v1";
      updates.specializationStatus = "configured";
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
    if (data.stripeSecretKey !== undefined) {
      updates.stripeSecretKey = data.stripeSecretKey || null;
    }
    if (data.stripeWebhookSecret !== undefined) {
      updates.stripeWebhookSecret = data.stripeWebhookSecret || null;
    }
    if (data.taxId !== undefined) {
      updates.taxId = data.taxId || null;
    }
    if (data.invoicePrefix !== undefined) {
      updates.invoicePrefix = data.invoicePrefix || "INV";
    }

    if (Object.keys(updates).length === 0) {
      return apiError("NO_CHANGES", "No se proporcionaron cambios para actualizar", 400);
    }

    const [updated] = await db
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
      });

    if (!updated) {
      return apiError("ACADEMY_NOT_FOUND", "Academia no encontrada", 404);
    }

    return apiSuccess({
        name: updated.name,
        academyType: updated.academyType,
        country: updated.country,
        countryCode: updated.countryCode,
        region: updated.region,
        city: updated.city,
        disciplineVariant: updated.disciplineVariant,
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
