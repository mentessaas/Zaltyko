/**
 * Errores específicos de autorización
 */

export class AuthorizationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number = 403
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export class SuperAdminRequiredError extends AuthorizationError {
  constructor() {
    super("SUPER_ADMIN_REQUIRED", "SUPER_ADMIN_REQUIRED", 403);
    this.name = "SuperAdminRequiredError";
  }
}

export class TenantMissingError extends AuthorizationError {
  constructor() {
    super("TENANT_MISSING", "TENANT_MISSING", 403);
    this.name = "TenantMissingError";
  }
}

export class UnauthenticatedError extends AuthorizationError {
  constructor() {
    super("UNAUTHENTICATED", "UNAUTHENTICATED", 401);
    this.name = "UnauthenticatedError";
  }
}

export class ProfileNotFoundError extends AuthorizationError {
  constructor() {
    super("PROFILE_NOT_FOUND", "PROFILE_NOT_FOUND", 404);
    this.name = "ProfileNotFoundError";
  }
}

export class LoginDisabledError extends AuthorizationError {
  constructor() {
    super(
      "LOGIN_DISABLED",
      "LOGIN_DISABLED",
      403
    );
    this.name = "LoginDisabledError";
  }
}

