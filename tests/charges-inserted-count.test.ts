import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ACADEMY_ID = "11111111-1111-4111-8111-111111111111";
const GROUP_ID = "22222222-2222-4222-8222-222222222222";
const BILLING_ITEM_ID = "33333333-3333-4333-8333-333333333333";
const TENANT_ID = "44444444-4444-4444-8444-444444444444";
type Row = Record<string, unknown>;
type Kind = "bulk" | "monthly";

const state = vi.hoisted(() => ({
  selects: [] as Row[][],
  inserted: [] as { id: string }[],
  insertError: null as Error | null,
  values: vi.fn(),
  returning: vi.fn(),
  insert: vi.fn(),
  conflict: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => {
      const result = state.selects.shift();
      if (!result) throw new Error("Unexpected select");
      const chain = {
        from: vi.fn(() => chain),
        innerJoin: vi.fn(() => chain),
        where: vi.fn(() => chain),
        limit: vi.fn(() => Promise.resolve(result)),
      };
      return chain;
    }),
    insert: state.insert,
  },
}));

vi.mock("@/lib/authz", () => ({
  withTenant: (handler: (request: Request, context: unknown) => Promise<Response>) =>
    (request: Request) => handler(request, {
      tenantId: TENANT_ID,
      userId: "synthetic-owner",
      profile: { role: "owner" },
    }),
}));
vi.mock("@/lib/authz/resource-scope", () => ({
  authorizeAcademyCapability: vi.fn().mockResolvedValue({ allowed: true }),
}));
vi.mock("@/lib/permissions", () => ({
  verifyAcademyAccess: vi.fn().mockResolvedValue({ allowed: true }),
  verifyGroupAccess: vi.fn().mockResolvedValue({ allowed: true }),
}));
vi.mock("@/lib/billing/athlete-fees", () => ({
  getMonthlyFeeForAthlete: vi.fn().mockResolvedValue(1900),
  formatPeriodToMonthName: vi.fn().mockReturnValue("octubre"),
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/lib/api-error-handler", () => ({
  handleApiError: () => new Response(null, { status: 500 }),
}));

async function setup(kind: Kind, existing = false) {
  const athletes = [{ id: "athlete-a", name: "QA A", groupId: GROUP_ID },
    { id: "athlete-b", name: "QA B", groupId: GROUP_ID }];
  if (kind === "bulk") {
    state.selects.push(
      [{ id: BILLING_ITEM_ID, name: "Cuota", amountCents: 1900, currency: "eur" }],
      athletes,
      existing ? [{ athleteId: "athlete-a" }] : [],
    );
    return (await import("@/app/api/charges/bulk/route")).POST;
  }
  state.selects.push([{ countryCode: "ES", country: "España" }], athletes,
    [{ id: GROUP_ID, name: "QA" }], existing ? [{ id: "existing" }] : [], []);
  return (await import("@/app/api/charges/generate-monthly/route")).POST;
}

function request(kind: Kind) {
  return new Request(`https://sandbox.invalid/api/charges/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ academyId: ACADEMY_ID, groupId: GROUP_ID,
      billingItemId: BILLING_ITEM_ID, period: "2026-10" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  state.selects = [];
  state.inserted = [];
  state.insertError = null;
  state.returning.mockImplementation(async () => {
    if (state.insertError) throw state.insertError;
    return state.inserted;
  });
  state.conflict.mockReturnValue({ returning: state.returning });
  state.values.mockReturnValue({ onConflictDoNothing: state.conflict });
  state.insert.mockReturnValue({ values: state.values });
});
afterEach(() => expect(state.selects).toHaveLength(0));

describe.each(["bulk", "monthly"] as const)("%s actual inserted count", (kind) => {
  it.each([0, 1, 2])("reports %i returned rows, not the two planned rows", async (count) => {
    const post = await setup(kind);
    state.inserted = Array.from({ length: count }, (_, index) => ({ id: `inserted-${index}` }));
    const response = await post(request(kind), {} as never);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ ok: true, data: {
      created: count, skipped: 2 - count,
      message: kind === "bulk" ? `Created ${count} charge(s)`
        : `Se generaron ${count} cargo${count === 1 ? "" : "s"}.`,
    } });
    expect(state.values.mock.calls[0][0]).toHaveLength(2);
    expect(state.conflict).toHaveBeenCalledOnce();
    expect(state.returning).toHaveBeenCalledWith({ id: expect.anything() });
  });

  it.each([0, 1])("adds pre-existing rows and late conflicts when %i row wins", async (count) => {
    const post = await setup(kind, true);
    state.inserted = count ? [{ id: "winner" }] : [];
    const response = await post(request(kind), {} as never);
    expect(await response.json()).toMatchObject({ data: { created: count, skipped: 2 - count } });
    expect(state.values.mock.calls[0][0]).toHaveLength(1);
  });

  it("does not report success when the insert fails", async () => {
    const post = await setup(kind);
    state.insertError = new Error("synthetic insertion failure");
    const response = await post(request(kind), {} as never);
    expect(response.status).toBe(500);
  });
});
