import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  user: vi.fn(), select: vi.fn(), insert: vi.fn(), update: vi.fn(),
}));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/db", () => ({ db: mocks }));
import { GET, POST, DELETE } from "@/app/api/actor-consents/route";
import { actorConsents, actorPages, athletes, guardianAthletes, guardians, profiles } from "@/db/schema";

const pageId = "10000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000001";
function query(rows: unknown[]) {
  const q: Record<string, any> = {};
  for (const name of ["from", "innerJoin", "where", "limit", "set", "values"]) q[name] = vi.fn(() => q);
  q.then = (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve);
  return q;
}
function request(method: string, body?: unknown) {
  return new NextRequest(`https://zaltyko.test/api/actor-consents?actorPageId=${pageId}`, {
    method, ...(body ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}),
  });
}
const consent = { actorPageId: pageId, guardianRelationship: "parent", consentScope: "public_page" };

describe("actor consent authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ id: userId });
    mocks.insert.mockReturnValue(query([]));
    mocks.update.mockReturnValue(query([]));
  });

  it("rejects anonymous access before querying or writing", async () => {
    mocks.user.mockResolvedValue(null);
    for (const [handler, method] of [[GET, "GET"], [POST, "POST"], [DELETE, "DELETE"]] as const) {
      expect((await handler(request(method, method === "GET" ? undefined : consent))).status).toBe(401);
    }
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects consent from an authenticated but unrelated user", async () => {
    mocks.select.mockReturnValue(query([]));
    expect((await POST(request("POST", consent))).status).toBe(404);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("does not disclose another family's consent history", async () => {
    mocks.select.mockReturnValue(query([]));
    expect((await GET(request("GET"))).status).toBe(404);
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });

  it("records consent only after resolving the linked guardian and tenant", async () => {
    const q = query([{ id: "link" }]);
    mocks.select.mockReturnValue(q);
    expect((await POST(request("POST", consent))).status).toBe(200);
    expect(q.innerJoin).toHaveBeenCalledWith(athletes, expect.objectContaining({ args: expect.arrayContaining([
      { _op: "eq", a: athletes.tenantId, b: actorPages.tenantId },
      { _op: "eq", a: athletes.academyId, b: actorPages.academyId },
    ]) }));
    expect(q.innerJoin).toHaveBeenCalledWith(guardianAthletes, expect.objectContaining({ args: expect.arrayContaining([
      { _op: "eq", a: guardianAthletes.athleteId, b: athletes.id },
      { _op: "eq", a: guardianAthletes.tenantId, b: athletes.tenantId },
    ]) }));
    expect(q.innerJoin).toHaveBeenCalledWith(profiles, expect.objectContaining({ args: expect.arrayContaining([
      { _op: "eq", a: profiles.id, b: guardians.profileId },
    ]) }));
    expect(q.where).toHaveBeenCalledWith(expect.objectContaining({ args: expect.arrayContaining([
      { _op: "eq", a: profiles.userId, b: userId },
      { _op: "eq", a: profiles.isSuspended, b: false },
    ]) }));
    expect(mocks.insert).toHaveBeenCalledWith(actorConsents);
  });

  it("limits history to the current guardian even after the relationship check", async () => {
    const history = query([]);
    mocks.select.mockReturnValueOnce(query([{ id: "link" }])).mockReturnValueOnce(history);
    expect((await GET(request("GET"))).status).toBe(200);
    expect(history.where).toHaveBeenCalledWith(expect.objectContaining({ args: expect.arrayContaining([
      { _op: "eq", a: actorConsents.guardianUserId, b: userId },
      { _op: "eq", a: actorConsents.actorPageId, b: pageId },
    ]) }));
    expect(history.limit).toHaveBeenCalledWith(100);
  });

  it("allows revoking only the caller's own consent even after unlinking", async () => {
    const change = query([]);
    mocks.update.mockReturnValue(change);
    expect((await DELETE(request("DELETE", { actorPageId: pageId, reason: "Retirada" }))).status).toBe(200);
    expect(change.where).toHaveBeenCalledWith(expect.objectContaining({ args: expect.arrayContaining([
      { _op: "eq", a: actorConsents.guardianUserId, b: userId },
    ]) }));
  });

  it("rejects invalid page identifiers before touching the database", async () => {
    expect((await POST(request("POST", { ...consent, actorPageId: {} }))).status).toBe(400);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
