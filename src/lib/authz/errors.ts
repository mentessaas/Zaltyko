/**
 * Errores específicos de autorización.
 * Esta jerarquía se mantiene por compatibilidad historica; las definiciones
 * "canonicas" viven en src/lib/errors.ts (AppError tree). Las clases aqui
 * extienden AppError para unificar instanceof en handleApiError.
 */
import { AuthorizationError as AppAuthorizationError, AppError } from "@/lib/errors";

export class AuthorizationError extends AppAuthorizationError {
  constructor(
    message = "No autorizado",
    public readonly legacyCode?: string,
    public readonly legacyStatus: number = 403,
    details?: Record<string, unknown>
  ) {
    super(message, details);
    this.name = "AuthorizationError";
    if (legacyStatus) {
      Object.defineProperty(this, "statusCode", { value: legacyStatus, configurable: true });
    }
  }
}

export class SuperAdminRequiredError extends AppError {
  constructor() {
    super("SUPER_ADMIN_REQUIRED", "SUPER_ADMIN_REQUIRED", 403);
    this.name = "SuperAdminRequiredError";
    Object.setPrototypeOf(this, SuperAdminRequiredError.prototype);
  }
}

export class TenantMissingError extends AppError {
  constructor() {
    super("TENANT_MISSING", "TENANT_MISSING", 403);
    this.name = "TenantMissingError";
    Object.setPrototypeOf(this, TenantMissingError.prototype);
  }
}

export class UnauthenticatedError extends AppError {
  constructor() {
    super("UNAUTHENTICATED", "UNAUTHENTICATED", 401);
    this.name = "UnauthenticatedError";
    Object.setPrototypeOf(this, UnauthenticatedError.prototype);
  }
}

export class ProfileNotFoundError extends AppError {
  constructor() {
    super("PROFILE_NOT_FOUND", "PROFILE_NOT_FOUND", 404);
    this.name = "ProfileNotFoundError";
    Object.setPrototypeOf(this, ProfileNotFoundError.prototype);
  }
}

export class LoginDisabledError extends AppError {
  constructor() {
    super("LOGIN_DISABLED", "LOGIN_DISABLED", 403);
    this.name = "LoginDisabledError";
    Object.setPrototypeOf(this, LoginDisabledError.prototype);
  }
}

// Re-exports canonicos para que el resto del codigo use una sola jerarquia.
export { AppAuthorizationError };


