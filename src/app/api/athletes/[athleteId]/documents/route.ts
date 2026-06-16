export const dynamic = 'force-dynamic';

import { and, eq, desc } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { athleteDocuments } from "@/db/schema/athlete-documents";
import { athletes } from "@/db/schema/athletes";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { DOCUMENT_TYPES } from "@/types/athletes";
import { apiSuccess, apiError, apiCreated } from "@/lib/api-response";

const createDocumentSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES),
  fileName: z.string().min(1),
  fileUrl: z.string().min(1),
  fileSize: z.string().optional(),
  mimeType: z.string().optional(),
  issuedDate: z.string().optional(),
  expiryDate: z.string().optional(),
  notes: z.string().optional(),
});

export const GET = withTenant(async (request, context) => {
  try {
    const params = context.params as { athleteId?: string };
    const athleteId = params?.athleteId;

    if (!athleteId) {
      return apiError("ATHLETE_ID_REQUIRED", "Athlete ID is required", 400);
    }

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
    }

    const documents = await db
      .select()
      .from(athleteDocuments)
      .where(and(
        eq(athleteDocuments.athleteId, athleteId),
        eq(athleteDocuments.tenantId, context.tenantId)
      ))
      .orderBy(desc(athleteDocuments.createdAt));

    return apiSuccess({ items: documents }, { total: documents.length });
  } catch (error) {
    return handleApiError(error);
  }
});

export const POST = withTenant(async (request, context) => {
  try {
    const params = context.params as { athleteId?: string };
    const athleteId = params?.athleteId;
    const body = createDocumentSchema.parse(await request.json());

    if (!athleteId) {
      return apiError("ATHLETE_ID_REQUIRED", "Athlete ID is required", 400);
    }

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
    }

    // Verify athlete belongs to tenant
    const [athlete] = await db
      .select({ id: athletes.id })
      .from(athletes)
      .where(and(
        eq(athletes.id, athleteId),
        eq(athletes.tenantId, context.tenantId)
      ))
      .limit(1);

    if (!athlete) {
      return apiError("ATHLETE_NOT_FOUND", "Athlete not found", 404);
    }

    // Build insert values
    const insertValues = {
      tenantId: context.tenantId,
      athleteId,
      documentType: body.documentType,
      fileName: body.fileName,
      fileUrl: body.fileUrl,
      fileSize: body.fileSize ?? null,
      mimeType: body.mimeType ?? null,
      issuedDate: body.issuedDate ? new Date(body.issuedDate) : null,
      expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
      notes: body.notes ?? null,
      isVerified: false,
      alertSent: false,
    };

    const [inserted] = await db.insert(athleteDocuments).values(insertValues as typeof athleteDocuments.$inferInsert).returning({ id: athleteDocuments.id });

    return apiCreated({ id: inserted.id });
  } catch (error) {
    return handleApiError(error);
  }
});

export const DELETE = withTenant(async (request, context) => {
  try {
    const params = context.params as { athleteId?: string };
    const athleteId = params?.athleteId;
    const url = new URL(request.url);
    const documentId = url.searchParams.get("documentId");

    if (!athleteId) {
      return apiError("ATHLETE_ID_REQUIRED", "Athlete ID is required", 400);
    }

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
    }

    if (!documentId) {
      return apiError("DOCUMENT_ID_REQUIRED", "Document ID is required", 400);
    }

    await db
      .delete(athleteDocuments)
      .where(and(
        eq(athleteDocuments.id, documentId),
        eq(athleteDocuments.athleteId, athleteId),
        eq(athleteDocuments.tenantId, context.tenantId)
      ));

    return apiSuccess({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
});
