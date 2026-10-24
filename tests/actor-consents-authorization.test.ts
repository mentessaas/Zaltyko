import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

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
function compiled(value: unknown) {
  return new PgDialect().sqlToQuery(value as SQL);
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
    const joins = q.innerJoin.mock.calls as Array<[unknown, unknown]>;
    const athleteJoin = compiled(joins.find(([table]) => table === athletes)?.[1]);
    const guardianJoin = compiled(joins.find(([table]) => table === guardianAthletes)?.[1]);
    const profileJoin = compiled(joins.find(([table]) => table === profiles)?.[1]);
    const linkWhere = compiled(q.where.mock.calls[0]?.[0]);
    expect(athleteJoin.sql).toContain('"athletes"."tenant_id" = "actor_pages"."tenant_id"');
    expect(athleteJoin.sql).toContain('"athletes"."academy_id" = "actor_pages"."academy_id"');
    expect(guardianJoin.sql).toContain('"guardian_athletes"."athlete_id" = "athletes"."id"');
    expect(guardianJoin.sql).toContain('"guardian_athletes"."tenant_id" = "athletes"."tenant_id"');
    expect(profileJoin.sql).toContain('"profiles"."id" = "guardians"."profile_id"');
    expect(linkWhere.sql).toContain('"profiles"."user_id" =');
    expect(linkWhere.sql).toContain('"profiles"."is_suspended" =');
    expect(linkWhere.params).toEqual(expect.arrayContaining([pageId, userId, false]));
    expect(mocks.insert).toHaveBeenCalledWith(actorConsents);
  });

  it("limits history to the current guardian even after the relationship check", async () => {
    const history = query([]);
    mocks.select.mockReturnValueOnce(query([{ id: "link" }])).mockReturnValueOnce(history);
    expect((await GET(request("GET"))).status).toBe(200);
    const historyWhere = compiled(history.where.mock.calls[0]?.[0]);
    expect(historyWhere.sql).toContain('"actor_consents"."guardian_user_id" =');
    expect(historyWhere.sql).toContain('"actor_consents"."actor_page_id" =');
    expect(historyWhere.params).toEqual([pageId, userId]);
    expect(history.limit).toHaveBeenCalledWith(100);
  });

  it("allows revoking only the caller's own consent even after unlinking", async () => {
    const change = query([]);
    mocks.update.mockReturnValue(change);
    expect((await DELETE(request("DELETE", { actorPageId: pageId, reason: "Retirada" }))).status).toBe(200);
    const revokeWhere = compiled(change.where.mock.calls[0]?.[0]);
    expect(revokeWhere.sql).toContain('"actor_consents"."guardian_user_id" =');
    expect(revokeWhere.params).toEqual([pageId, userId]);
  });

  it("rejects invalid page identifiers before touching the database", async () => {
    expect((await POST(request("POST", { ...consent, actorPageId: {} }))).status).toBe(400);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
