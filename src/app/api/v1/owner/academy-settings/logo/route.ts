import { NextResponse } from "next/server";
import { z } from "zod";

import { operationalProblem } from "@/app/api/v1/problem";
import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  createOrganizationLogoUrl,
  getOrganizationLogoState,
  ORGANIZATION_LOGO_UNAVAILABLE_MESSAGE,
  setOrganizationLogoPath,
  isMissingOrganizationLogoColumn,
  organizationLogoPath,
  removeOrganizationLogo,
  uploadOrganizationLogo,
  validateOrganizationLogo,
} from "@/modules/organizations/infrastructure/organization-logo-storage";
import {
  getLimitForRoute,
  getVerifiedTenantRateLimitIdentifier,
  rateLimit,
  rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { hasSameOrigin } from "@/modules/saas-billing/application/owner-access";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const organizationIdSchema = z.guid();
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
      const state = await getOrganizationLogoState(auth.scope.organization.id);
      const logoUrl = state.logoPath ? await createOrganizationLogoUrl(state.logoPath) : null;
      return noStore(apiSuccess({ logoUrl, available: state.available }));
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
    const previous = await getOrganizationLogoState(auth.scope.organization.id);
    if (!previous.available) return noStore(apiError("LOGO_NOT_READY", ORGANIZATION_LOGO_UNAVAILABLE_MESSAGE, 503));
    const bytes = new Uint8Array(await file.arrayBuffer());
    const validation = validateOrganizationLogo(bytes, file.type);
    if (!validation.ok) {
      const message = validation.code === "FILE_TOO_LARGE"
        ? "El logo debe ocupar 1 MB o menos."
        : "El archivo debe ser una imagen PNG, JPG o WebP válida.";
      return noStore(apiError("INVALID_LOGO", message, 400));
    }

    const newPath = organizationLogoPath(auth.scope.organization.id, validation.extension);
    const previousPath = previous.logoPath;

    await uploadOrganizationLogo(newPath, bytes, file.type);
    try {
      if (!(await setOrganizationLogoPath(auth.scope.organization.id, newPath, previousPath))) {
        await removeOrganizationLogo(newPath).catch(() => undefined);
        return noStore(apiError("LOGO_NOT_READY", ORGANIZATION_LOGO_UNAVAILABLE_MESSAGE, 503));
      }
    } catch (error) {
      if (newPath !== previousPath) await removeOrganizationLogo(newPath).catch(() => undefined);
      if (isMissingOrganizationLogoColumn(error)) return noStore(apiError("LOGO_NOT_READY", ORGANIZATION_LOGO_UNAVAILABLE_MESSAGE, 503));
      throw error;
    }

    if (previousPath && previousPath !== newPath) {
      try {
        await removeOrganizationLogo(previousPath);
      } catch {
        await setOrganizationLogoPath(auth.scope.organization.id, previousPath, newPath).catch(() => false);
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
    const state = await getOrganizationLogoState(organizationId);
    if (!state.available) return noStore(apiError("LOGO_NOT_READY", ORGANIZATION_LOGO_UNAVAILABLE_MESSAGE, 503));
    const previousPath = state.logoPath;
    if (!previousPath) return noStore(apiSuccess({ logoUrl: null }));
    if (!(await setOrganizationLogoPath(organizationId, null, previousPath))) {
      return noStore(apiError("LOGO_NOT_READY", ORGANIZATION_LOGO_UNAVAILABLE_MESSAGE, 503));
    }
    try {
      await removeOrganizationLogo(previousPath);
    } catch {
      await setOrganizationLogoPath(organizationId, previousPath, null).catch(() => false);
      throw new Error("No se ha podido quitar el logo de la academia.");
    }
    return noStore(apiSuccess({ logoUrl: null }));
  } catch (error) {
    if (error instanceof OperationalError) return noStore(operationalProblem(error));
    if (isMissingOrganizationLogoColumn(error)) return noStore(apiError("LOGO_NOT_READY", ORGANIZATION_LOGO_UNAVAILABLE_MESSAGE, 503));
    return noStore(apiError("LOGO_DELETE_FAILED", "No hemos podido quitar el logo. Inténtalo de nuevo.", 503));
  }
}
