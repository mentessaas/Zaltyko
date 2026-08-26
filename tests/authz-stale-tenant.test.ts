import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regresión: profiles.tenantId obsoleto no debe conceder acceso cross-tenant.
 * Escenario: ex-miembro de la academia A (tenant A) sin membresía vigente.
 * getTenantId sin academyId debe resolver null (o el tenant de su academia
 * activa), jamás el tenant obsoleto.
 */

const state = vi.hoisted(() => {
  return {
    profile: null as null | {
      id: string;
      userId: string;
      role: string;
      tenantId: string | null;
      activeAcademyId: string | null;
    },
    academyRows: [] as Array<{ id: string; tenantId: string; ownerId: string }>,
    membershipRows: [] as Array<{ id: string; userId: string; academyId: string }>,
  };
});

vi.mock("@/db", async () => {
  const { academies, memberships } = await import("@/db/schema");

  function chainFor(table: unknown) {
    const rows =
      table === academies ? state.academyRows : table === memberships ? state.membershipRows : [];
    const chain: Record<string, unknown> = {
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
      innerJoin: vi.fn(() => chain),
      limit: vi.fn(() => Promise.resolve(rows)),
    };
    return chain;
  }

  return {
    db: new Proxy(
      {},
      {
        get: (_target, prop) => {
          if (prop === "select") {
            return vi.fn(() => ({
              from: vi.fn((table: unknown) => chainFor(table)),
            }));
          }
          return vi.fn();
        },
      }
    ),
  };
});

import { getTenantId } from "@/lib/authz/tenant-resolver";
import * as profileService from "@/lib/authz/profile-service";

vi.mock("@/lib/authz/profile-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/authz/profile-service")>();
  return {
    ...actual,
    getCurrentProfile: vi.fn(),
  };
});

const ACADEMY_A = "11111111-1111-1111-1111-111111111111";
const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ACADEMY_B = "55555555-5555-5555-5555-555555555555";
const TENANT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const USER = "22222222-2222-2222-2222-222222222222";
const OWNER = "44444444-4444-4444-4444-444444444444";

describe("getTenantId — tenant obsoleto tras baja de academia", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.profile = {
      id: "33333333-3333-3333-3333-333333333333",
      userId: USER,
      role: "coach",
      tenantId: TENANT_A,
      activeAcademyId: null,
    };
    state.academyRows = [{ id: ACADEMY_B, tenantId: TENANT_B, ownerId: OWNER }];
    state.membershipRows = [];
    vi.mocked(profileService.getCurrentProfile).mockResolvedValue(state.profile as never);
  });

  it("no devuelve el tenant obsoleto de una academia de la que ya no es miembro", async () => {
    // Sin academia activa y sin membresías vigentes: la verificación de
    // membresía sobre profiles.tenantId no encuentra filas.
    await expect(getTenantId(USER)).resolves.toBeNull();
  });

  it("resuelve el tenant de la academia activa aunque profiles.tenantId sea obsoleto", async () => {
    state.profile!.activeAcademyId = ACADEMY_B;
    state.membershipRows.push({ id: "m-b", userId: USER, academyId: ACADEMY_B });

    await expect(getTenantId(USER)).resolves.toBe(TENANT_B);
  });

  it("mantiene el tenant del perfil si la membresía sigue vigente", async () => {
    state.membershipRows.push({ id: "m-a", userId: USER, academyId: ACADEMY_A });

    await expect(getTenantId(USER)).resolves.toBe(TENANT_A);
  });
});
