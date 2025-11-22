import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { NextResponse } from "next/server";

describe("API /api/billing/plans", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("debe requerir autenticación", async () => {
    vi.mock("@/lib/authz", () => ({
      withTenant: (handler: any) => async (request: Request, context: any) => {
        return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
      },
    }));

    const { GET } = await import("@/app/api/billing/plans/route");
    const request = new NextRequest("http://localhost/api/billing/plans");
    
    const response = await GET(request, {});
    
    expect(response.status).toBe(401);
  });

  it("debe retornar lista de planes disponibles", async () => {
    vi.mock("@/lib/authz", () => ({
      withTenant: (handler: any) => handler,
    }));

    const plansFixture = [
      { id: "plan-1", code: "free", nickname: "Free" },
      { id: "plan-2", code: "pro", nickname: "Pro" },
    ];

    vi.doMock("@/db", () => ({
      db: {
        select: vi.fn(() => {
          const chain: any = {};
          chain.from = vi.fn(() => chain);
          chain.where = vi.fn(() => chain);
          chain.orderBy = vi.fn(() => plansFixture);
          return chain;
        }),
      },
    }));

    const { GET } = await import("@/app/api/billing/plans/route");
    const request = new NextRequest("http://localhost/api/billing/plans");
    
    const response = await GET(request, {});
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
  });
});
