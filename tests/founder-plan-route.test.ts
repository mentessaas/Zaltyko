import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lock: vi.fn(),
  grant: vi.fn(),
  audit: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/authz", () => ({
  withSuperAdmin:
    (handler: (request: Request, context: Record<string, unknown>) => Promise<Response>) =>
    (request: Request, context: { params: Promise<Record<string, string>> }) =>
      context.params.then((params) => handler(request, { params, userId: "super-admin-user" })),
}));
vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/modules/saas-billing/application/entitlement-service", () => ({
  lockOrganizationForSaasMutation: mocks.lock,
  grantOrganizationEntitlement: mocks.grant,
}));
vi.mock("@/modules/shared/infrastructure/transactional-records", () => ({
  appendAuditEntry: mocks.audit,
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { POST } from "@/app/api/super-admin/organizations/[organizationId]/founder-plan/route";

const organizationId = "00000000-0000-4000-8000-0000000000c1";

function isoDateInDays(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

function call(body: unknown, id = organizationId) {
  return POST(
    new Request(`https://example.test/api/super-admin/organizations/${id}/founder-plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ organizationId: id }) }
  );
}

describe("founder plan grant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (run: (tx: unknown) => unknown) => run({ tx: true }));
    mocks.grant.mockResolvedValue({ revision: 4, replayed: false });
  });

  it("grants Starter or Growth through the contract source under the organization lock and audits it", async () => {
    const until = isoDateInDays(90);
    const response = await call({ planCode: "growth", effectiveUntil: until, reference: "piloto-club-atenea", note: "Fundador" });

    expect(response.status).toBe(200);
    expect(mocks.lock).toHaveBeenCalledWith({ tx: true }, organizationId);
    expect(mocks.grant).toHaveBeenCalledWith(
      { tx: true },
      expect.objectContaining({
        organizationId,
        planCode: "growth",
        source: "contract",
        sourceReference: "founder:piloto-club-atenea",
        subscriptionId: null,
        trialId: null,
        effectiveUntil: new Date(`${until}T23:59:59.999Z`),
      })
    );
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mocks.grant.mock.invocationCallOrder[0]);
    expect(mocks.audit).toHaveBeenCalledWith(
      { tx: true },
      expect.objectContaining({
        organizationId,
        actorUserId: "super-admin-user",
        action: "saas.founder_plan_granted",
        idempotencyKey: "founder:piloto-club-atenea",
      })
    );
    expect((await response.json()).data).toMatchObject({ planCode: "growth", revision: 4, replayed: false });
  });

  it("does not audit twice when the same grant is replayed", async () => {
    mocks.grant.mockResolvedValueOnce({ revision: 4, replayed: true });
    const response = await call({ planCode: "starter", effectiveUntil: isoDateInDays(30), reference: "piloto-club-atenea" });
    expect(response.status).toBe(200);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each([
    ["network plans stay sales-assisted", { planCode: "network", effectiveUntil: isoDateInDays(30), reference: "piloto-club-a" }],
    ["free is not a grant", { planCode: "free", effectiveUntil: isoDateInDays(30), reference: "piloto-club-a" }],
    ["unknown fields", { planCode: "growth", effectiveUntil: isoDateInDays(30), reference: "piloto-club-a", price: 0 }],
    ["unsafe reference", { planCode: "growth", effectiveUntil: isoDateInDays(30), reference: "Club Atenea!" }],
  ])("rejects %s", async (_label, body) => {
    const response = await call(body);
    expect(response.status).toBe(400);
    expect(mocks.grant).not.toHaveBeenCalled();
  });

  it("rejects past dates and grants longer than a year", async () => {
    for (const effectiveUntil of [isoDateInDays(-1), isoDateInDays(400)]) {
      const response = await call({ planCode: "growth", effectiveUntil, reference: "piloto-club-atenea" });
      expect(response.status).toBe(400);
      expect((await response.json()).error ?? "").toBeDefined();
    }
    expect(mocks.grant).not.toHaveBeenCalled();
  });

  it("rejects an invalid organization id", async () => {
    const response = await call({ planCode: "growth", effectiveUntil: isoDateInDays(30), reference: "piloto-club-atenea" }, "not-a-uuid");
    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
