export const dynamic = 'force-dynamic';

import { and, eq, desc } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { athleteDocuments } from "@/db/schema/athlete-documents";
import { withTenant } from "@/lib/authz";
import { authorizeAthleteResource } from "@/lib/authz/resource-scope";
import { handleApiError } from "@/lib/api-error-handler";
import { DOCUMENT_TYPES } from "@/types/athletes";
import { apiSuccess, apiError, apiCreated } from "@/lib/api-response";
import { createSignedUrl, deleteFile } from "@/lib/supabase/storage-helpers";

const STORAGE_PATH_PREFIX = (tenantId: string, academyId: string, athleteId: string) =>
  `${tenantId}/${academyId}/athletes/${athleteId}/documents/`;

function validDate(value: string | undefined, field: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} inválida`);
  return date;
}

const createDocumentSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES),
  fileName: z.string().trim().min(1).max(255),
  fileUrl: z.string().trim().min(1).max(2048),
  fileSize: z.string().trim().max(32).optional(),
  mimeType: z.string().trim().max(120).optional(),
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
    const scope = await authorizeAthleteResource({ context, athleteId });
    if (!scope.allowed) {
      return apiError(scope.reason ?? "ATHLETE_ACCESS_DENIED", "Athlete not found", 404);
    }

    const documents = await db
      .select()
      .from(athleteDocuments)
      .where(and(
        eq(athleteDocuments.athleteId, athleteId),
        eq(athleteDocuments.tenantId, context.tenantId)
      ))
      .orderBy(desc(athleteDocuments.createdAt))
      .limit(100);

    const items = await Promise.all(documents.map(async (document) => {
      // New records store a private Storage path; legacy absolute URLs remain
      // untouched until their document is re-uploaded.
      const fileUrl = document.fileUrl.startsWith("http")
        ? document.fileUrl
        : await createSignedUrl(document.fileUrl);
      return { ...document, fileUrl };
    }));
    return apiSuccess({ items }, { total: items.length });
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

    const scope = await authorizeAthleteResource({ context, athleteId });
    if (!scope.allowed) {
      return apiError(scope.reason ?? "ATHLETE_ACCESS_DENIED", "Athlete not found", 404);
    }

    // Uploaded documents must reference this athlete's private Storage
    // prefix. Absolute legacy URLs remain supported, but cross-scope paths do
    // not.
    if (!body.fileUrl.startsWith("http") &&
        !body.fileUrl.startsWith(STORAGE_PATH_PREFIX(context.tenantId, scope.resource!.academyId, athleteId))) {
      return apiError("DOCUMENT_PATH_OUT_OF_SCOPE", "Document path does not belong to this athlete", 400);
    }
    const issuedDate = validDate(body.issuedDate, "Fecha de emisión");
    const expiryDate = validDate(body.expiryDate, "Fecha de vencimiento");
    if (issuedDate && expiryDate && expiryDate < issuedDate) {
      return apiError("INVALID_DOCUMENT_DATES", "La fecha de vencimiento no puede ser anterior a la emisión", 400);
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
      issuedDate: issuedDate ? issuedDate.toISOString().slice(0, 10) : null,
      expiryDate: expiryDate ? expiryDate.toISOString().slice(0, 10) : null,
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
    const scope = await authorizeAthleteResource({ context, athleteId });
    if (!scope.allowed) {
      return apiError(scope.reason ?? "ATHLETE_ACCESS_DENIED", "Athlete not found", 404);
    }

    const [document] = await db
      .delete(athleteDocuments)
      .where(and(
        eq(athleteDocuments.id, documentId),
        eq(athleteDocuments.athleteId, athleteId),
        eq(athleteDocuments.tenantId, context.tenantId)
      ))
      .returning({ fileUrl: athleteDocuments.fileUrl });

    // Keep Storage in sync with metadata. Legacy external URLs are not ours
    // to delete; private paths are safe because the record was scope-checked.
    if (document?.fileUrl && !document.fileUrl.startsWith("http")) {
      try {
        await deleteFile(document.fileUrl);
      } catch (error) {
        // Metadata deletion remains successful; surface an operational signal
        // without making a user retry and risk duplicate records.
        console.error("Failed to delete athlete document storage object", error);
      }
    }

    return apiSuccess({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
});
