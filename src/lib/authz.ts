import { NextResponse } from "next/server";

import { getCurrentProfile, type ProfileRow } from "./authz/profile-service";
import { getTenantId, resolveTenantWithUpdate } from "./authz/tenant-resolver";
import { resolveUserId } from "./authz/user-resolver";
import { updateProfileIfNeeded } from "./authz/profile-updater";
import {
  isPublicEndpoint,
  isAcademyCreationEndpoint,
  isFlexibleTenantEndpoint,
  isAuthenticatedNoTenantEndpoint,
  extractVerifiedAcademyCandidate,
} from "./authz/endpoint-config";
import {
  SuperAdminRequiredError,
  AgentRequiredError,
  UnauthenticatedError,
  ProfileNotFoundError,
  TenantMissingError,
  LoginDisabledError,
} from "./authz/errors";

/**
 * Allowlist de ids de Paperclip agents autorizados a registrar outreach
 * manual 1:1 (ZAL-582 / ZAL-580 / ZAL-576). Configurable por entorno via
 * `MARKETING_OUTREACH_AGENT_IDS=id1,id2,...`. Mantener sincronizado con la
 * lista operativa que registra Marketing en `Decisiones.md`. Si la variable
 * esta vacia o ausente, solo se acepta super_admin autenticado.
 */
function getAuthorizedAgentIds(): Set<string> {
  const raw = process.env.MARKETING_OUTREACH_AGENT_IDS ?? "";
  return new Set(
    raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

/**
 * Shared secret usado para verificar la firma HMAC-SHA256 de los requests
 * firmados por agentes Paperclip en el camino de `withAgentAuth`. Se mantiene
 * como variable de entorno (NO como constante en el codigo ni en logs) y se
 * configura de forma identica en cada agente autorizado. La ausencia de la
 * variable cierra el camino de agente por defensa-en-profundidad: en ese
 * estado, aunque `MARKETING_OUTREACH_AGENT_IDS` siga poblada, no se acepta
 * ningun caller con `x-paperclip-agent-id` (se cae a super_admin).
 */
function getAgentSharedSecret(): string {
  return (process.env.MARKETING_OUTREACH_AGENT_SHARED_SECRET ?? "").trim();
}

/**
 * Ventana maxima de skew admitida entre el timestamp firmado y el reloj del
 * servidor (en segundos). 300s = 5 min, suficiente para tolerancia operativa
 * sin permitir replay indefinido. Configurable por entorno si se necesita
 * abrir/cerrar la ventana en algun despliegue especifico.
 */
function getAgentSignatureMaxSkewSeconds(): number {
  const raw = process.env.MARKETING_OUTREACH_AGENT_MAX_SKEW_SECONDS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return 300;
}

/**
 * Comparacion constant-time de dos strings hexadecimales. Evita timing
 * side-channels que filtren byte-a-byte la firma esperada.
 */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Hash del body del request en SHA-256 hex. Si el body no se puede leer
 * (stream ya consumido, content-encoding desconocido, etc.), devuelve el hash
 * del string vacio para mantener la verificacion deterministic pero exigir
 * la misma firma en cliente y servidor.
 */
async function sha256HexOfRequestBody(request: Request): Promise<string> {
  try {
    const cloned = request.clone();
    const text = await cloned.text();
    const { createHash } = await import("node:crypto");
    return createHash("sha256").update(text, "utf8").digest("hex");
  } catch {
    const { createHash } = await import("node:crypto");
    return createHash("sha256").update("", "utf8").digest("hex");
  }
}

/**
 * Verifica la firma HMAC-SHA256 del request contra el secret compartido.
 * Devuelve true solo si TODAS las condiciones se cumplen:
 *   - agentId pertenece al allowlist.
 *   - timestamp presente, numerico y dentro de la ventana de skew.
 *   - signature presente y matches HMAC-SHA256 sobre la cadena canonica.
 *
 * El path de agente exige las tres firmas porque cualquiera de las tres por
 * sola (header solo, header+timestamp, header+firma-invalida) es
 * insuficientemente autentica. El caller sigue intentando con super_admin
 * si esto falla — el camino NO es mutuamente excluyente.
 */
async function verifyAgentSignature(request: Request): Promise<{
  ok: boolean;
  agentId?: string;
  reason?:
    | "AGENT_ID_NOT_ALLOWLISTED"
    | "AGENT_TIMESTAMP_MISSING"
    | "AGENT_TIMESTAMP_INVALID"
    | "AGENT_TIMESTAMP_SKEW"
    | "AGENT_SIGNATURE_MISSING"
    | "AGENT_SIGNATURE_INVALID"
    | "AGENT_SECRET_UNSET";
}> {
  const allowlist = getAuthorizedAgentIds();
  const agentId = request.headers.get("x-paperclip-agent-id")?.trim() ?? "";

  if (!agentId) {
    return { ok: false, reason: "AGENT_ID_NOT_ALLOWLISTED" };
  }
  if (!allowlist.has(agentId)) {
    return { ok: false, reason: "AGENT_ID_NOT_ALLOWLISTED" };
  }

  const secret = getAgentSharedSecret();
  if (!secret) {
    // Defensa-en-profundidad: sin secret, el camino de agente esta cerrado.
    return { ok: false, reason: "AGENT_SECRET_UNSET" };
  }

  const timestampHeader = request.headers.get("x-paperclip-agent-timestamp");
  if (!timestampHeader) {
    return { ok: false, reason: "AGENT_TIMESTAMP_MISSING" };
  }
  const timestamp = Number.parseInt(timestampHeader, 10);
  if (!Number.isFinite(timestamp)) {
    return { ok: false, reason: "AGENT_TIMESTAMP_INVALID" };
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    Math.abs(nowSeconds - timestamp) > getAgentSignatureMaxSkewSeconds()
  ) {
    return { ok: false, reason: "AGENT_TIMESTAMP_SKEW" };
  }

  const providedSignature =
    request.headers.get("x-paperclip-agent-signature")?.trim() ?? "";
  if (!providedSignature) {
    return { ok: false, reason: "AGENT_SIGNATURE_MISSING" };
  }

  const method = request.method.toUpperCase();
  const pathname = new URL(request.url).pathname;
  const bodyHash = await sha256HexOfRequestBody(request);
  const canonical = `${agentId}\n${method}\n${pathname}\n${timestamp}\n${bodyHash}`;

  const { createHmac } = await import("node:crypto");
  const expectedSignature = createHmac("sha256", secret)
    .update(canonical, "utf8")
    .digest("hex");

  if (!timingSafeEqualHex(providedSignature, expectedSignature)) {
    return { ok: false, reason: "AGENT_SIGNATURE_INVALID" };
  }

  return { ok: true, agentId };
}
import { logger } from "@/lib/logger";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import {
  createBearerSupabaseClient,
  getBearerToken,
} from "@/lib/supabase/bearer-client";
import { getRequiredRoutePermission } from "./authz/route-permissions";
import { getUserPermissions } from "./authz/permissions-service";
import { grantsRequiredPermission } from "./authz/permission-policy";
import {
  getLimitForRoute,
  getVerifiedTenantRateLimitIdentifier,
  rateLimit,
} from "@/lib/rate-limit";

export type { ProfileRow };

export type TenantContext<
  C extends Record<string, unknown> = Record<string, unknown>,
> = C & {
  tenantId: string;
  userId: string;
  profile: ProfileRow;
};

export const authzAdapter = {
  db,
};

// Re-export para compatibilidad
export { getCurrentProfile, getTenantId };

export function assertSuperAdmin(profile: ProfileRow | null | undefined): void {
  if (!profile || profile.role !== "super_admin") {
    throw new SuperAdminRequiredError();
  }
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * La capa edge limita por IP antes de alcanzar la aplicación. Aquí añadimos
 * una segunda clave por tenant solo después de resolver ownership/membership
 * en DB, evitando confiar en academyId o tenantId aportados por el cliente.
 */
async function enforceVerifiedTenantMutationRateLimit(
  request: Request,
  tenantId: string | null | undefined
): Promise<NextResponse | null> {
  if (!tenantId || !MUTATING_METHODS.has(request.method.toUpperCase())) {
    return null;
  }

  const pathname = new URL(request.url).pathname;
  const result = await rateLimit({
    identifier: getVerifiedTenantRateLimitIdentifier(
      request,
      tenantId,
      pathname
    ),
    ...getLimitForRoute(pathname),
  });

  if (result.success) {
    return null;
  }

  const retryAfter = Math.max(0, result.reset - Math.floor(Date.now() / 1000));
  return NextResponse.json(
    {
      error: "RATE_LIMIT_EXCEEDED",
      code: "RATE_LIMIT_EXCEEDED",
      message: "Demasiadas requests. Intenta de nuevo más tarde.",
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(result.reset),
      },
    }
  );
}

/**
 * Wrapper para endpoints operados por un Paperclip agent autorizado (ZAL-582
 * / ZAL-580 / ZAL-576). Acepta UNA de las dos vias:
 *
 * 1. Camino de agente: triple header `x-paperclip-agent-id` (allowlist),
 *    `x-paperclip-agent-timestamp` (unix epoch s, ventana 5 min) y
 *    `x-paperclip-agent-signature` (HMAC-SHA256 del secret compartido sobre
 *    `${agentId}\n${method}\n${pathname}\n${timestamp}\n${sha256(body)}`).
 *    El secret se lee de `MARKETING_OUTREACH_AGENT_SHARED_SECRET` (env,
 *    nunca en codigo ni en logs). Si el secret no esta configurado, el
 *    camino de agente queda cerrado por defensa-en-profundidad aunque el
 *    header del allowlist matchee — la ausencia del secret convierte
 *    cualquier intento de usar el header en 401, no en 500.
 * 2. Sesion autenticada cuyo profile tenga rol global `super_admin` (camino
 *    operativo de Marketing; conserva el resto del wrapper de super-admin).
 *
 * En ambos casos el handler recibe `agentId` resuelto (header validado o
 * `super-admin:<profile.id>`) para que `created_by_agent_id` quede auditado
 * en cada INSERT.
 *
 * Sandbox/local: si `NODE_ENV !== "production"`,
 * `MARKETING_OUTREACH_DEV_BYPASS_AGENT=true` Y el secret de agente esta
 * vacio, se acepta cualquier `x-paperclip-agent-id` (incluso vacio, en cuyo
 * caso se usa `dev-agent`). La condicion extra sobre el secret evita que
 * un dev que olvidó setearlo termine exponiendo el bypass a produccion
 * accidentalmente. Esta puerta existe solo para que `scripts/run-rls-…` y
 * los tests vitest puedan llamar al endpoint; nunca en produccion.
 */
export function withAgentAuth<Ctx extends Record<string, unknown>>(
  handler: (
    request: Request,
    context: Ctx & {
      agentId: string;
      userId?: string | null;
      profile?: ProfileRow | null;
    }
  ) => Promise<Response>
) {
  return async (request: Request, context: any) => {
    try {
      const params = context.params ? await context.params : context.params;
      const contextWithParams = { ...context, params };

      const headerAgentId =
        request.headers.get("x-paperclip-agent-id")?.trim() || "";

      // Camino de agente: solo si hay header, el allowlist matchea, el secret
      // esta configurado y la firma HMAC verifica.
      if (headerAgentId) {
        const verification = await verifyAgentSignature(request);
        if (verification.ok && verification.agentId) {
          return handler(request, {
            ...contextWithParams,
            agentId: verification.agentId,
            userId: null,
            profile: null,
          });
        }

        // El caller presento header de agente pero NO autentico: NO aceptamos
        // el bypass de dev en este caso (seria una evasion del nuevo control)
        // y tampoco caemos a super_admin automaticamente — exigimos o firma
        // valida o sesion super_admin explicita.
        const isDevBypass =
          process.env.NODE_ENV !== "production" &&
          process.env.MARKETING_OUTREACH_DEV_BYPASS_AGENT === "true" &&
          getAgentSharedSecret() === "";

        if (isDevBypass) {
          return handler(request, {
            ...contextWithParams,
            agentId: headerAgentId,
            userId: null,
            profile: null,
          });
        }

        if (!isDevBypass) {
          return NextResponse.json(
            { error: "AGENT_AUTH_FAILED" },
            { status: 401 }
          );
        }
      }

      // Camino de agente sin header (incluye dev bypass sin header) cae a
      // super_admin o, en sandbox con bypass explicito, a `dev-agent`.
      const isDevBypass =
        process.env.NODE_ENV !== "production" &&
        process.env.MARKETING_OUTREACH_DEV_BYPASS_AGENT === "true" &&
        getAgentSharedSecret() === "";

      if (isDevBypass && !headerAgentId) {
        return handler(request, {
          ...contextWithParams,
          agentId: "dev-agent",
          userId: null,
          profile: null,
        });
      }

      const userId = await resolveUserId(request, contextWithParams);
      if (!userId) {
        return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
      }

      const profile = await getCurrentProfile(userId);
      if (!profile) {
        return NextResponse.json(
          { error: "PROFILE_NOT_FOUND" },
          { status: 404 }
        );
      }

      assertSuperAdmin(profile);

      return handler(request, {
        ...contextWithParams,
        agentId: headerAgentId || `super-admin:${profile.id}`,
        userId,
        profile,
      });
    } catch (error) {
      if (error instanceof SuperAdminRequiredError) {
        return NextResponse.json(
          { error: error.code },
          { status: error.statusCode }
        );
      }
      if (error instanceof AgentRequiredError) {
        return NextResponse.json(
          { error: error.code },
          { status: error.statusCode }
        );
      }

      logger.error("Error in withAgentAuth", error);
      return NextResponse.json(
        {
          error: "INTERNAL_ERROR",
          message: "Error interno del servidor",
        },
        { status: 500 }
      );
    }
  };
}

export function withSuperAdmin<Ctx extends Record<string, unknown>>(
  handler: (
    request: Request,
    context: Ctx & { userId: string; profile: ProfileRow }
  ) => Promise<Response>
) {
  // Next.js 15 passes context where params is a Promise for dynamic routes
  return async (request: Request, context: any) => {
    try {
      // Resolve params if they're a Promise (Next.js 15 pattern)
      const params = context.params ? await context.params : context.params;

      const contextWithParams = {
        ...context,
        params,
      };

      const userId = await resolveUserId(request, contextWithParams);

      if (!userId) {
        return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
      }

      const profile = await getCurrentProfile(userId);

      if (!profile) {
        return NextResponse.json(
          { error: "PROFILE_NOT_FOUND" },
          { status: 404 }
        );
      }

      assertSuperAdmin(profile);

      return handler(request, {
        ...contextWithParams,
        userId,
        profile,
      });
    } catch (error) {
      if (error instanceof SuperAdminRequiredError) {
        return NextResponse.json(
          { error: error.code },
          { status: error.statusCode }
        );
      }

      logger.error("Error in withSuperAdmin", error);
      return NextResponse.json(
        {
          error: "INTERNAL_ERROR",
          message: "Error interno del servidor",
        },
        { status: 500 }
      );
    }
  };
}

export function withTenant<Ctx extends Record<string, unknown>>(
  handler: (request: Request, context: TenantContext<Ctx>) => Promise<Response>
) {
  // Next.js 15 passes context where params is a Promise for dynamic routes
  return async (request: Request, context: any) => {
    try {
      // Resolve params if they're a Promise (Next.js 15 pattern)
      const params = context.params ? await context.params : context.params;

      // Create resolved context for functions that need params synchronously
      const contextWithParams = {
        ...context,
        params,
      };

      // Resolver userId
      const userId = await resolveUserId(request, contextWithParams);
      if (!userId) {
        return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
      }

      // Obtener perfil
      const profile = await getCurrentProfile(userId);
      if (!profile) {
        return NextResponse.json(
          { error: "PROFILE_NOT_FOUND" },
          { status: 404 }
        );
      }

      // Verificar si el usuario puede hacer login
      if (!profile.canLogin && profile.role !== "super_admin") {
        return NextResponse.json(
          {
            error: "LOGIN_DISABLED",
            message:
              "Tu cuenta no tiene acceso activado. Contacta al administrador.",
          },
          { status: 403 }
        );
      }

      // Extraer academyId desde diferentes fuentes
      const academyContext = await extractVerifiedAcademyCandidate(
        request,
        contextWithParams
      );
      if (academyContext.conflict) {
        return NextResponse.json(
          { error: "ACADEMY_CONTEXT_CONFLICT" },
          { status: 403 }
        );
      }
      const effectiveAcademyId = academyContext.academyId;

      // Resolver tenantId
      let tenantId = await getTenantId(userId, effectiveAcademyId);

      // Si no hay tenantId pero hay academyId, intentar resolver y actualizar perfil
      if (!tenantId && effectiveAcademyId) {
        const resolution = await resolveTenantWithUpdate(
          userId,
          effectiveAcademyId,
          profile
        );

        if (resolution.shouldUpdateProfile && resolution.newTenantId) {
          const updatedProfile = await updateProfileIfNeeded(
            profile,
            resolution.newTenantId,
            resolution.newActiveAcademyId
          );
          Object.assign(profile, updatedProfile);
        }

        tenantId = resolution.tenantId;
      }

      // Verificar si el endpoint requiere tenantId
      const pathname = new URL(request.url).pathname;
      const method = request.method?.toUpperCase() ?? "GET";
      const isPublic = isPublicEndpoint(pathname, method);
      const isAcademyCreation = isAcademyCreationEndpoint(pathname, method);
      const isFlexible = isFlexibleTenantEndpoint(pathname);
      // Solo super_admin puede operar sin tenantId; admin sigue requiriéndolo
      const isSuperAdmin = profile.role === "super_admin";
      const isEventsEndpoint = pathname.startsWith("/api/events");

      const hasValidTenantId = tenantId && tenantId !== "";

      if (
        effectiveAcademyId &&
        !hasValidTenantId &&
        !isPublic &&
        !isAcademyCreation &&
        !isSuperAdmin
      ) {
        return NextResponse.json(
          { error: "ACADEMY_ACCESS_DENIED" },
          { status: 403 }
        );
      }

      // Validar tenantId según el tipo de endpoint
      if (
        !hasValidTenantId &&
        !isPublic &&
        !isAcademyCreation &&
        !isFlexible &&
        !isSuperAdmin
      ) {
        return NextResponse.json({ error: "TENANT_MISSING" }, { status: 403 });
      }

      // Para endpoints de eventos, permitir que el handler obtenga el tenantId del academyId en el body
      const handlerTenantId =
        isEventsEndpoint && !hasValidTenantId && effectiveAcademyId
          ? ""
          : (tenantId ?? "");

      const requiredPermission = getRequiredRoutePermission(pathname, method);
      const authorizationAcademyId =
        effectiveAcademyId ?? profile.activeAcademyId ?? undefined;
      if (requiredPermission && !isSuperAdmin) {
        if (!authorizationAcademyId) {
          return NextResponse.json(
            { error: "PERMISSION_CONTEXT_MISSING", permission: requiredPermission },
            { status: 403 }
          );
        }
        const effectivePermissions = await getUserPermissions(
          userId,
          authorizationAcademyId
        );
        if (!grantsRequiredPermission(effectivePermissions, requiredPermission)) {
          return NextResponse.json(
            { error: "PERMISSION_DENIED", permission: requiredPermission },
            { status: 403 }
          );
        }
      }

      const tenantRateLimitResponse =
        await enforceVerifiedTenantMutationRateLimit(request, tenantId);
      if (tenantRateLimitResponse) {
        return tenantRateLimitResponse;
      }

      return handler(request, {
        ...contextWithParams,
        tenantId: handlerTenantId,
        userId,
        profile,
      });
    } catch (error) {
      if (error instanceof UnauthenticatedError) {
        return NextResponse.json(
          { error: error.code },
          { status: error.statusCode }
        );
      }
      if (error instanceof ProfileNotFoundError) {
        return NextResponse.json(
          { error: error.code },
          { status: error.statusCode }
        );
      }
      if (error instanceof TenantMissingError) {
        return NextResponse.json(
          { error: error.code },
          { status: error.statusCode }
        );
      }
      if (error instanceof LoginDisabledError) {
        return NextResponse.json(
          {
            error: error.code,
            message:
              "Tu cuenta no tiene acceso activado. Contacta al administrador.",
          },
          { status: error.statusCode }
        );
      }

      logger.error("Error in withTenant", error);
      return NextResponse.json(
        {
          error: "INTERNAL_ERROR",
          message: "Error interno del servidor",
        },
        { status: 500 }
      );
    }
  };
}

/**
 * Wrapper equivalente a `withTenant` para endpoints autenticados que NO
 * requieren tenantId. Pensado para roles globales (provider, super_admin)
 * que operan recursos propios sin academia/tenant (ver ZAL-495 opción a).
 *
 * Reglas:
 * - Resuelve userId (cookie/bearer).
 * - Carga profile y exige `canLogin` (super_admin siempre pasa).
 * - Acepta role `super_admin`, `provider`, o cualquier perfil con tenantId.
 *   Otros roles (athlete, parent, coach sin academia, …) → 403 INSUFFICIENT_ROLE.
 * - NO llama getTenantId/resolveTenantWithUpdate/extractVerifiedAcademyCandidate.
 * - Pasa al handler `{ ...contextWithParams, userId, profile, tenantId: '' }`
 *   para preservar la firma TenantContext.
 * - Maneja errores con el mismo patrón que withTenant.
 *
 * ⚠️ El handler es responsable de validar propiedad del recurso contra
 * `context.userId` (server-derived) y NO contra campos del body. Ver
 * `route.ts:108` del marketplace para el patrón correcto.
 */
export function withAuthenticatedNoTenant<
  Ctx extends Record<string, unknown>,
>(
  handler: (request: Request, context: TenantContext<Ctx>) => Promise<Response>
) {
  return async (request: Request, context: any) => {
    try {
      const params = context.params ? await context.params : context.params;
      const contextWithParams = { ...context, params };

      const userId = await resolveUserId(request, contextWithParams);
      if (!userId) {
        return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
      }

      const profile = await getCurrentProfile(userId);
      if (!profile) {
        return NextResponse.json(
          { error: "PROFILE_NOT_FOUND" },
          { status: 404 }
        );
      }

      if (!profile.canLogin && profile.role !== "super_admin") {
        return NextResponse.json(
          {
            error: "LOGIN_DISABLED",
            message:
              "Tu cuenta no tiene acceso activado. Contacta al administrador.",
          },
          { status: 403 }
        );
      }

      const role = profile.role ?? "";
      const hasTenant = Boolean(profile.tenantId);
      const allowed =
        role === "super_admin" || role === "provider" || hasTenant;
      if (!allowed) {
        return NextResponse.json(
          {
            error: "INSUFFICIENT_ROLE",
            message:
              "Tu rol no tiene permisos para publicar sin academia asociada.",
          },
          { status: 403 }
        );
      }

      return handler(request, {
        ...contextWithParams,
        tenantId: "",
        userId,
        profile,
      });
    } catch (error) {
      if (error instanceof UnauthenticatedError) {
        return NextResponse.json(
          { error: error.code },
          { status: error.statusCode }
        );
      }
      if (error instanceof ProfileNotFoundError) {
        return NextResponse.json(
          { error: error.code },
          { status: error.statusCode }
        );
      }
      if (error instanceof LoginDisabledError) {
        return NextResponse.json(
          {
            error: error.code,
            message:
              "Tu cuenta no tiene acceso activado. Contacta al administrador.",
          },
          { status: error.statusCode }
        );
      }

      logger.error("Error in withAuthenticatedNoTenant", error);
      return NextResponse.json(
        {
          error: "INTERNAL_ERROR",
          message: "Error interno del servidor",
        },
        { status: 500 }
      );
    }
  };
}

/**
 * Resuelve userId desde Authorization: Bearer <token>.
 * Complemento de withTenant para clientes mobile/PWA que usan bearer.
 * Valida firma via Supabase auth.getUser(token).
 */
async function resolveUserIdFromBearer(
  request: Request
): Promise<string | null> {
  const token = getBearerToken(request);
  if (!token) return null;

  try {
    const supabase = createBearerSupabaseClient(token);
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    if (error || !user) {
      logger.warn("Bearer token rejected by Supabase", {
        error: error?.message,
      });
      return null;
    }
    return user.id;
  } catch (err) {
    logger.warn("Failed to validate bearer token", { err });
    return null;
  }
}

/**
 * Wrapper equivalente a withTenant pero para clientes que envian
 * Authorization: Bearer <token> en lugar de cookies Supabase.
 * Mantiene la misma firma de contexto ({ tenantId, userId, profile }).
 *
 * Caso de uso: apps mobile, scripts CLI, integraciones server-to-server
 * que no comparten cookies con el browser.
 */
export function withBearerTenant<Ctx extends Record<string, unknown>>(
  handler: (request: Request, context: TenantContext<Ctx>) => Promise<Response>
) {
  return async (request: Request, context: any) => {
    try {
      const params = context.params ? await context.params : context.params;
      const contextWithParams = { ...context, params };

      const userId = await resolveUserIdFromBearer(request);
      if (!userId) {
        return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
      }

      const profile = await getCurrentProfile(userId);
      if (!profile) {
        return NextResponse.json(
          { error: "PROFILE_NOT_FOUND" },
          { status: 404 }
        );
      }

      if (!profile.canLogin && profile.role !== "super_admin") {
        return NextResponse.json(
          {
            error: "LOGIN_DISABLED",
            message:
              "Tu cuenta no tiene acceso activado. Contacta al administrador.",
          },
          { status: 403 }
        );
      }

      const academyContext = await extractVerifiedAcademyCandidate(
        request,
        contextWithParams
      );
      if (academyContext.conflict) {
        return NextResponse.json(
          { error: "ACADEMY_CONTEXT_CONFLICT" },
          { status: 403 }
        );
      }
      const effectiveAcademyId = academyContext.academyId;
      let tenantId = await getTenantId(userId, effectiveAcademyId);

      if (!tenantId && effectiveAcademyId) {
        const resolution = await resolveTenantWithUpdate(
          userId,
          effectiveAcademyId,
          profile
        );
        if (resolution.shouldUpdateProfile && resolution.newTenantId) {
          const updatedProfile = await updateProfileIfNeeded(
            profile,
            resolution.newTenantId,
            resolution.newActiveAcademyId
          );
          Object.assign(profile, updatedProfile);
        }
        tenantId = resolution.tenantId;
      }

      if (effectiveAcademyId && !tenantId && profile.role !== "super_admin") {
        return NextResponse.json(
          { error: "ACADEMY_ACCESS_DENIED" },
          { status: 403 }
        );
      }

      const pathname = new URL(request.url).pathname;
      const requiredPermission = getRequiredRoutePermission(
        pathname,
        request.method?.toUpperCase() ?? "GET"
      );
      const authorizationAcademyId =
        effectiveAcademyId ?? profile.activeAcademyId ?? undefined;
      if (requiredPermission && profile.role !== "super_admin") {
        if (!authorizationAcademyId) {
          return NextResponse.json(
            { error: "PERMISSION_CONTEXT_MISSING", permission: requiredPermission },
            { status: 403 }
          );
        }
        const effectivePermissions = await getUserPermissions(
          userId,
          authorizationAcademyId
        );
        if (!grantsRequiredPermission(effectivePermissions, requiredPermission)) {
          return NextResponse.json(
            { error: "PERMISSION_DENIED", permission: requiredPermission },
            { status: 403 }
          );
        }
      }

      const tenantRateLimitResponse =
        await enforceVerifiedTenantMutationRateLimit(request, tenantId);
      if (tenantRateLimitResponse) {
        return tenantRateLimitResponse;
      }

      return handler(request, {
        ...contextWithParams,
        tenantId: tenantId ?? "",
        userId,
        profile,
      });
    } catch (error) {
      logger.error("Error in withBearerTenant", error);
      return NextResponse.json(
        {
          error: "INTERNAL_ERROR",
          message: "Error interno del servidor",
        },
        { status: 500 }
      );
    }
  };
}
