// Mock utilities for tests - Centralized authentication mocks
import { vi } from "vitest";

// Mock de authz con todas las dependencias internas
export const setupAuthzMocks = () => {
  vi.mock("@/lib/authz", () => ({
    withTenant: (handler: any) => async (request: Request, context: any) => {
      return handler(request, {
        ...context,
        user: {
          id: "user-123",
          tenant_id: "tenant-123",
          role: "admin",
          plan: "free",
        },
        userId: "user-123",
        tenantId: "tenant-123",
        profile: {
          id: "user-123",
          role: "admin",
          tenantId: "tenant-123",
          email: "test@example.com",
          name: "Test User",
          canLogin: true,
        },
      });
    },
    withSuperAdmin: (handler: any) => async (request: Request, context: any) => {
      return handler(request, {
        ...context,
        userId: "user-123",
        profile: {
          id: "user-123",
          role: "super_admin",
          tenantId: "tenant-123",
          email: "test@example.com",
          name: "Test Admin",
          canLogin: true,
        },
      });
    },
    getCurrentProfile: vi.fn(),
    getTenantId: vi.fn(),
    assertSuperAdmin: vi.fn(),
    ProfileRow: {},
  }));

  vi.mock("@/lib/authz/profile-service", () => ({
    getCurrentProfile: vi.fn().mockResolvedValue({
      id: "user-123",
      role: "admin",
      tenantId: "tenant-123",
      email: "test@example.com",
      name: "Test User",
      canLogin: true,
    }),
  }));

  vi.mock("@/lib/authz/tenant-resolver", () => ({
    getTenantId: vi.fn().mockResolvedValue("tenant-123"),
    resolveTenantWithUpdate: vi.fn().mockResolvedValue({
      tenantId: "tenant-123",
      shouldUpdateProfile: false,
    }),
  }));

  vi.mock("@/lib/authz/user-resolver", () => ({
    resolveUserId: vi.fn().mockResolvedValue("user-123"),
  }));

  vi.mock("@/lib/authz/endpoint-config", () => ({
    isPublicEndpoint: vi.fn().mockReturnValue(false),
    isAcademyCreationEndpoint: vi.fn().mockReturnValue(false),
    isFlexibleTenantEndpoint: vi.fn().mockReturnValue(false),
    extractAcademyId: vi.fn().mockReturnValue(null),
  }));

  vi.mock("@/lib/authz/errors", () => ({
    SuperAdminRequiredError: class extends Error {
      code = "SUPER_ADMIN_REQUIRED";
      status = 403;
    },
    UnauthenticatedError: class extends Error {
      code = "UNAUTHENTICATED";
      status = 401;
    },
    ProfileNotFoundError: class extends Error {
      code = "PROFILE_NOT_FOUND";
      status = 404;
    },
    TenantMissingError: class extends Error {
      code = "TENANT_MISSING";
      status = 403;
    },
    LoginDisabledError: class extends Error {
      code = "LOGIN_DISABLED";
      status = 403;
    },
  }));

  vi.mock("@/lib/logger", () => ({
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    },
  }));
};

// Mock de base de datos completo
export const createMockDb = (returnValue: any = []) => {
  const createChain = (returnValueInner: any = []) => {
    const chain: any = {
      from: vi.fn(() => chain),
      innerJoin: vi.fn(() => chain),
      leftJoin: vi.fn(() => chain),
      where: vi.fn(() => createChain(returnValueInner)),
      orderBy: vi.fn(() => createChain(returnValueInner)),
      limit: vi.fn(() => createChain(returnValueInner)),
      groupBy: vi.fn(() => createChain(returnValueInner)),
      returning: vi.fn(() => Promise.resolve(returnValueInner)),
    };
    return chain;
  };

  return {
    select: vi.fn(() => createChain(returnValue)),
    insert: vi.fn(() => ({
      values: vi.fn(() => createChain(returnValue)),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => createChain(returnValue)),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => createChain(returnValue)),
    })),
  };
};

export const setupDbMocks = () => {
  vi.mock("@/db", () => ({
    db: createMockDb([]),
  }));
};
