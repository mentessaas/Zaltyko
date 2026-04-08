import { eq, and } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { coaches } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { apiSuccess, apiError } from "@/lib/api-response";

const certificationSchema = z.object({
  name: z.string().min(1),
  issuer: z.string().min(1),
  date: z.string(),
  url: z.string().url().optional(),
});

const achievementSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  date: z.string().optional(),
});

const updateSchema = z.object({
  isPublic: z.boolean(),
  publicBio: z.string().nullable().optional(),
  certifications: z.array(certificationSchema).optional(),
  photoGallery: z.array(z.string().url()).optional(),
  achievements: z.array(achievementSchema).optional(),
});

export const PUT = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "tenantId es requerido", 400);
  }

  const coachId = (context.params as { coachId?: string } | undefined)?.coachId;

  if (!coachId) {
    return apiError("COACH_ID_REQUIRED", "coachId es requerido", 400);
  }

  const body = updateSchema.parse(await request.json());

  // Validar que el coach existe y pertenece al tenant
  const [coachRow] = await db
    .select({
      id: coaches.id,
    })
    .from(coaches)
    .where(and(eq(coaches.id, coachId), eq(coaches.tenantId, context.tenantId)))
    .limit(1);

  if (!coachRow) {
    return apiError("COACH_NOT_FOUND", "Coach no encontrado", 404);
  }

  // Actualizar perfil público
  await db
    .update(coaches)
    .set({
      isPublic: body.isPublic,
      publicBio: body.publicBio ?? null,
      certifications: body.certifications || [],
      photoGallery: body.photoGallery || [],
      achievements: body.achievements || [],
    })
    .where(eq(coaches.id, coachId));

  return apiSuccess({ ok: true });
});

export const GET = withTenant(async (_request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "tenantId es requerido", 400);
  }

  const coachId = (context.params as { coachId?: string } | undefined)?.coachId;

  if (!coachId) {
    return apiError("COACH_ID_REQUIRED", "coachId es requerido", 400);
  }

  const [coachRow] = await db
    .select({
      isPublic: coaches.isPublic,
      publicBio: coaches.publicBio,
      certifications: coaches.certifications,
      photoGallery: coaches.photoGallery,
      achievements: coaches.achievements,
    })
    .from(coaches)
    .where(and(eq(coaches.id, coachId), eq(coaches.tenantId, context.tenantId)))
    .limit(1);

  if (!coachRow) {
    return apiError("COACH_NOT_FOUND", "Coach no encontrado", 404);
  }

  return apiSuccess({
    isPublic: coachRow.isPublic ?? false,
    publicBio: coachRow.publicBio,
    certifications: coachRow.certifications || [],
    photoGallery: coachRow.photoGallery || [],
    achievements: coachRow.achievements || [],
  });
});

