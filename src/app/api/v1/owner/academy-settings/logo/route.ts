import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { operationalProblem } from "@/app/api/v1/problem";
import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/db";
import { organizationMembers, organizations } from "@/db/zaltyko-schema";
import {
  getLimitForRoute,
  getVerifiedTenantRateLimitIdentifier,
  rateLimit,
  rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { validateOrganizationLogo, organizationLogoPath, uploadOrganizationLogo, removeOrganizationLogo, createOrganizationLogoUrl, isMissingOrganizationLogoColumn } from "@/modules/organizations/infrastructure/organization-logo-storage";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { hasSameOrigin } from "@/modules/saas-billing/application/owner-access";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const organizationIdSchema = z.guid();
const logoPathSchema = z.string().nullable();
const deleteBodySchema = z.object({ organizationId: organizationIdSchema }).strict();
const formSchema = z.object({ organizationId: organizationIdSchema }).strict();

function noStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

async function authorizedScope(request: Request, organizationId: string) {
  const user = await getCurrentUser(request);
  if (!user) return { response: noStore(apiError("UNAUTHORIZED", "Inicia sesión para gestionar el logo de tu academia.", 401)) };
  const scope = await resolveOwnerScope({ userId: user.id, organizationId });
  if (!(scope.member.role === "owner" || scope.member.role === "admin") || scope.member.locationScopeMode !== "all") {
    return { response: noStore(apiError("FORBIDDEN", "Solo la dueña o una persona administradora con acceso a toda la academia puede gestionar el logo.", 403)) };
  }
  const limit = await rateLimit({
    identifier: getVerifiedTenantRateLimitIdentifier(request, scope.organization.id),
    ...getLimitForRoute(new URL(request.url).pathname),
  });
  if (!limit.success) return { response: noStore(rateLimitExceededResponse(limit)) };
  return { user, scope };
}

async function storedLogoPath(organizationId: string): Promise<string | null> {
  const [organization] = await db
    .select({ logoPath: organizations.logoPath })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  return logoPathSchema.parse(organization?.logoPath ?? null);
}

// @auth-flexible route-guard-reason: sesión comprobada en servidor y alcance owner/admin con todas las sedes; Storage permanece privado y todas las operaciones usan service role desde este handler.
export async function GET(request: Request) {
  const query = z.object({ organizationId: organizationIdSchema }).strict().safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );
  if (!query.success) return noStore(apiError("INVALID_REQUEST", "Indica la academia.", 400));
  try {
    const auth = await authorizedScope(request, query.data.organizationId);
    if ("response" in auth) return auth.response;
    try {
      const path = await storedLogoPath(auth.scope.organization.id);
      const logoUrl = path ? await createOrganizationLogoUrl(path) : null;
      return noStore(apiSuccess({ logoUrl, available: true }));
    } catch (error) {
      if (isMissingOrganizationLogoColumn(error)) return noStore(apiSuccess({ logoUrl: null, available: false }));
      throw error;
    }
  } catch (error) {
    if (error instanceof OperationalError) return noStore(operationalProblem(error));
    return noStore(apiError("LOGO_UNAVAILABLE", "No hemos podido cargar el logo. Inténtalo de nuevo.", 503));
  }
}

// @auth-flexible route-guard-reason: sesión comprobada en servidor y alcance owner/admin con todas las sedes; se valida el origen, formato, firma real y tamaño antes de escribir en el bucket privado.
export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return noStore(apiError("INVALID_ORIGIN", "La edición debe proceder de esta misma web.", 403));
  const user = await getCurrentUser(request);
  if (!user) return noStore(apiError("UNAUTHORIZED", "Inicia sesión para gestionar el logo de tu academia.", 401));
  const form = await request.formData().catch(() => null);
  const organizationId = form?.get("organizationId");
  const parsed = formSchema.safeParse({ organizationId });
  const file = form?.get("file");
  if (!parsed.success || !(file instanceof File)) return noStore(apiError("INVALID_REQUEST", "Elige un archivo PNG, JPG o WebP de hasta 1 MB.", 400));

  try {
    const auth = await authorizedScope(request, parsed.data.organizationId);
    if ("response" in auth) return auth.response;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const validation = validateOrganizationLogo(bytes, file.type);
    if (!validation.ok) {
      const message = validation.code === "FILE_TOO_LARGE"
        ? "El logo debe ocupar 1 MB o menos."
        : "El archivo debe ser una imagen PNG, JPG o WebP válida.";
      return noStore(apiError("INVALID_LOGO", message, 400));
    }

    const newPath = organizationLogoPath(auth.scope.organization.id, validation.extension);
    let previousPath: string | null;
    try {
      previousPath = await storedLogoPath(auth.scope.organization.id);
    } catch (error) {
      if (isMissingOrganizationLogoColumn(error)) return noStore(apiError("LOGO_NOT_READY", "Esta opción estará disponible cuando se actualicen los ajustes de la academia.", 503));
      throw error;
    }

    await uploadOrganizationLogo(newPath, bytes, file.type);
    try {
      await db.update(organizations).set({ logoPath: newPath, updatedAt: new Date() }).where(eq(organizations.id, auth.scope.organization.id));
    } catch (error) {
      if (newPath !== previousPath) await removeOrganizationLogo(newPath).catch(() => undefined);
      if (isMissingOrganizationLogoColumn(error)) return noStore(apiError("LOGO_NOT_READY", "Esta opción estará disponible cuando se actualicen los ajustes de la academia.", 503));
      throw error;
    }

    if (previousPath && previousPath !== newPath) {
      try {
        await removeOrganizationLogo(previousPath);
      } catch {
        await db.update(organizations)
          .set({ logoPath: previousPath })
          .where(and(eq(organizations.id, auth.scope.organization.id), eq(organizations.logoPath, newPath)))
          .catch(() => undefined);
        await removeOrganizationLogo(newPath).catch(() => undefined);
        return noStore(apiError("LOGO_REPLACE_FAILED", "No hemos podido sustituir el logo anterior. Inténtalo de nuevo.", 503));
      }
    }
    return noStore(apiSuccess({ logoUrl: await createOrganizationLogoUrl(newPath) }));
  } catch (error) {
    if (error instanceof OperationalError) return noStore(operationalProblem(error));
    return noStore(apiError("LOGO_UPLOAD_FAILED", "No hemos podido guardar el logo. Comprueba la conexión e inténtalo de nuevo.", 503));
  }
}

// @auth-flexible route-guard-reason: sesión comprobada en servidor y alcance owner/admin con todas las sedes; se limpia la referencia de esta organización y luego su archivo privado.
export async function DELETE(request: Request) {
  if (!hasSameOrigin(request)) return noStore(apiError("INVALID_ORIGIN", "La edición debe proceder de esta misma web.", 403));
  const user = await getCurrentUser(request);
  if (!user) return noStore(apiError("UNAUTHORIZED", "Inicia sesión para gestionar el logo de tu academia.", 401));
  const body = deleteBodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return noStore(apiError("INVALID_REQUEST", "Indica la academia.", 400));
  try {
    const auth = await authorizedScope(request, body.data.organizationId);
    if ("response" in auth) return auth.response;
    const organizationId = auth.scope.organization.id;
    const previousPath = await storedLogoPath(organizationId);
    if (!previousPath) return noStore(apiSuccess({ logoUrl: null }));
    await db.update(organizations).set({ logoPath: null, updatedAt: new Date() }).where(and(eq(organizations.id, organizationId), eq(organizations.logoPath, previousPath)));
    try {
      await removeOrganizationLogo(previousPath);
    } catch {
      await db.update(organizations).set({ logoPath: previousPath }).where(and(eq(organizations.id, organizationId), isNull(organizations.logoPath))).catch(() => undefined);
      throw new Error("No se ha podido quitar el logo de la academia.");
    }
    return noStore(apiSuccess({ logoUrl: null }));
  } catch (error) {
    if (error instanceof OperationalError) return noStore(operationalProblem(error));
    if (isMissingOrganizationLogoColumn(error)) return noStore(apiError("LOGO_NOT_READY", "Esta opción estará disponible cuando se actualicen los ajustes de la academia.", 503));
    return noStore(apiError("LOGO_DELETE_FAILED", "No hemos podido quitar el logo. Inténtalo de nuevo.", 503));
  }
}
