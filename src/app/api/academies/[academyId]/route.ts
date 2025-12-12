import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { academies } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";

const ACADEMY_TYPES = ["artistica", "ritmica", "trampolin", "general", "parkour", "danza"] as const;

const UpdateSchema = z.object({
  name: z.string().min(3).optional(),
  country: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  academyType: z.enum(ACADEMY_TYPES).optional(),
  publicDescription: z.string().optional().nullable(),
  isPublic: z.boolean().optional(),
  logoUrl: z.string().url().optional().nullable().or(z.literal("")),
  website: z.string().url().optional().nullable().or(z.literal("")),
  contactEmail: z.string().email().optional().nullable().or(z.literal("")),
  contactPhone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  socialInstagram: z.string().url().optional().nullable().or(z.literal("")),
  socialFacebook: z.string().url().optional().nullable().or(z.literal("")),
  socialTwitter: z.string().url().optional().nullable().or(z.literal("")),
  socialYoutube: z.string().url().optional().nullable().or(z.literal("")),
});

/**
 * PATCH /api/academies/[academyId]
 * 
 * Actualiza los datos de una academia.
 * Solo el propietario o super_admin puede actualizar.
 */
export const PATCH = withTenant(async (request, context) => {
  try {
    const academyId = (context.params as { academyId?: string })?.academyId;

    if (!academyId) {
      return NextResponse.json({ error: "ACADEMY_ID_REQUIRED" }, { status: 400 });
    }

    // Verificar que la academia existe y pertenece al tenant
    const [academy] = await db
      .select({
        id: academies.id,
        tenantId: academies.tenantId,
        ownerId: academies.ownerId,
      })
      .from(academies)
      .where(eq(academies.id, academyId))
      .limit(1);

    if (!academy) {
      return NextResponse.json({ error: "ACADEMY_NOT_FOUND" }, { status: 404 });
    }

    // Verificar permisos: solo el propietario o super_admin puede actualizar
    const isSuperAdmin = context.profile.role === "super_admin";
    const isOwner = academy.ownerId === context.profile.id;
    const isSameTenant = academy.tenantId === context.tenantId;

    if (!isSuperAdmin && !isOwner && !isSameTenant) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = UpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          message: "Los datos proporcionados no son válidos",
          details: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {};

    if (parsed.data.name !== undefined) {
      updates.name = parsed.data.name;
    }
    if (parsed.data.country !== undefined) {
      updates.country = parsed.data.country || null;
    }
    if (parsed.data.region !== undefined) {
      updates.region = parsed.data.region || null;
    }
    if (parsed.data.city !== undefined) {
      updates.city = parsed.data.city || null;
    }
    if (parsed.data.academyType !== undefined) {
      updates.academyType = parsed.data.academyType;
    }
    if (parsed.data.publicDescription !== undefined) {
      updates.publicDescription = parsed.data.publicDescription || null;
    }
    if (parsed.data.isPublic !== undefined) {
      updates.isPublic = parsed.data.isPublic;
    }
    if (parsed.data.logoUrl !== undefined) {
      updates.logoUrl = parsed.data.logoUrl || null;
    }
    if (parsed.data.website !== undefined) {
      updates.website = parsed.data.website || null;
    }
    if (parsed.data.contactEmail !== undefined) {
      updates.contactEmail = parsed.data.contactEmail || null;
    }
    if (parsed.data.contactPhone !== undefined) {
      updates.contactPhone = parsed.data.contactPhone || null;
    }
    if (parsed.data.address !== undefined) {
      updates.address = parsed.data.address || null;
    }
    if (parsed.data.socialInstagram !== undefined) {
      updates.socialInstagram = parsed.data.socialInstagram || null;
    }
    if (parsed.data.socialFacebook !== undefined) {
      updates.socialFacebook = parsed.data.socialFacebook || null;
    }
    if (parsed.data.socialTwitter !== undefined) {
      updates.socialTwitter = parsed.data.socialTwitter || null;
    }
    if (parsed.data.socialYoutube !== undefined) {
      updates.socialYoutube = parsed.data.socialYoutube || null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "NO_CHANGES" }, { status: 400 });
    }

    const [updated] = await db
      .update(academies)
      .set(updates)
      .where(eq(academies.id, academyId))
      .returning({
        id: academies.id,
        name: academies.name,
        country: academies.country,
        region: academies.region,
        city: academies.city,
        academyType: academies.academyType,
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
      return NextResponse.json({ error: "ACADEMY_NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/academies/[academyId]", method: "PATCH" });
  }
});

/**
 * GET /api/academies/[academyId]
 * 
 * Obtiene los datos de una academia.
 */
export const GET = withTenant(async (request, context) => {
  try {
    const academyId = (context.params as { academyId?: string })?.academyId;

    if (!academyId) {
      return NextResponse.json({ error: "ACADEMY_ID_REQUIRED" }, { status: 400 });
    }

    const [academy] = await db
      .select({
        id: academies.id,
        name: academies.name,
        country: academies.country,
        region: academies.region,
        city: academies.city,
        academyType: academies.academyType,
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
        createdAt: academies.createdAt,
      })
      .from(academies)
      .where(eq(academies.id, academyId))
      .limit(1);

    if (!academy) {
      return NextResponse.json({ error: "ACADEMY_NOT_FOUND" }, { status: 404 });
    }

    // Verificar permisos
    const isSuperAdmin = context.profile.role === "super_admin";
    const isOwner = academy.ownerId === context.profile.id;
    const isSameTenant = academy.tenantId === context.tenantId;

    if (!isSuperAdmin && !isOwner && !isSameTenant) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    return NextResponse.json(academy);
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/academies/[academyId]", method: "GET" });
  }
});

