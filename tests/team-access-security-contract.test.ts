import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(), scope: vi.fn(), limit: vi.fn(), transaction: vi.fn(),
  list: vi.fn(), invite: vi.fn(), reissue: vi.fn(), revoke: vi.fn(), inspect: vi.fn(), accept: vi.fn(),
}));

vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({ resolveOwnerScope: mocks.scope }));
vi.mock("@/lib/rate-limit", () => ({
  getLimitForRoute: () => ({ limit: 20, window: 60 }),
  getVerifiedTenantRateLimitIdentifier: () => "synthetic-team-access",
  rateLimit: mocks.limit,
  rateLimitExceededResponse: () => new Response(JSON.stringify({ ok: false }), { status: 429 }),
}));
vi.mock("@/modules/staff/application/canonical-team-access", async importOriginal => {
  const actual = await importOriginal<typeof import("@/modules/staff/application/canonical-team-access")>();
  return {
    ...actual,
    listCanonicalTeamAccess: mocks.list,
    createCanonicalTeamInvitation: mocks.invite,
    reissueCanonicalTeamInvitation: mocks.reissue,
    revokeCanonicalTeamInvitation: mocks.revoke,
    inspectCanonicalTeamInvitation: mocks.inspect,
    acceptCanonicalTeamInvitation: mocks.accept,
  };
});

import { GET as listAccess } from "@/app/api/v1/owner/staff/access/route";
import { POST as invite } from "@/app/api/v1/owner/staff/invitations/route";
import { POST as reissue } from "@/app/api/v1/owner/staff/invitations/[id]/reissue/route";
import { DELETE as revoke } from "@/app/api/v1/owner/staff/invitations/[id]/route";
import { POST as inspect } from "@/app/api/v1/staff/invitations/inspect/route";
import { POST as accept } from "@/app/api/v1/staff/invitations/accept/route";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const organizationId = "10000000-0000-4000-8000-000000000001";
const memberId = "10000000-0000-4000-8000-000000000002";
const userId = "10000000-0000-4000-8000-000000000003";
const locationId = "10000000-0000-4000-8000-000000000004";
const invitationId = "10000000-0000-4000-8000-000000000005";
const otherLocationId = "10000000-0000-4000-8000-000000000006";
const token = "a".repeat(43);
const key = "synthetic-team-command-001";
const base = "https://synthetic.invalid/api/v1";
const inviteBody = { organizationId, email: " Synthetic@example.invalid ", role: "coach", locationIds: [locationId] };
const scope = { organization: { id: organizationId, name: "Synthetic Academy" }, member: { id: memberId, role: "owner", locationScopeMode: "all" } };
const commandMocks = [mocks.list, mocks.invite, mocks.reissue, mocks.revoke, mocks.inspect, mocks.accept];

function request(path: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`${base}${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
function context() { return { params: Promise.resolve({ id: invitationId }) }; }
function privateResponse(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
}
function noServiceCalls() { commandMocks.forEach(mock => expect(mock).not.toHaveBeenCalled()); }

const ownerCalls = [
  { name: "list", call: () => listAccess(request(`/owner/staff/access?organizationId=${organizationId}`, "GET")) },
  { name: "invite", call: () => invite(request("/owner/staff/invitations", "POST", inviteBody, { "idempotency-key": key })) },
  { name: "reissue", call: () => reissue(request(`/owner/staff/invitations/${invitationId}/reissue`, "POST", { organizationId }, { "idempotency-key": key, "if-match": '"2"' }), context()) },
  { name: "revoke", call: () => revoke(request(`/owner/staff/invitations/${invitationId}?organizationId=${organizationId}`, "DELETE", undefined, { "idempotency-key": key, "if-match": "2" }), context()) },
];
const allCalls = [
  ...ownerCalls,
  { name: "inspect", call: () => inspect(request("/staff/invitations/inspect", "POST", { token })) },
  { name: "accept", call: () => accept(request("/staff/invitations/accept", "POST", { token }, { "idempotency-key": key })) },
];

beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset());
  vi.stubEnv("ZALTYKO_TEAM_ACCESS_ENABLED", "true");
  mocks.user.mockResolvedValue({ id: userId, email: "untrusted-session@example.invalid" });
  mocks.scope.mockResolvedValue(scope);
  mocks.limit.mockResolvedValue({ success: true });
  mocks.list.mockResolvedValue({ organization: scope.organization, activeLocations: [], invitations: [], members: [] });
  mocks.invite.mockResolvedValue({ invitation: { id: invitationId }, token, replayed: false });
  mocks.reissue.mockResolvedValue({ invitation: { id: invitationId }, token, replayed: false });
  mocks.revoke.mockResolvedValue({ id: invitationId, status: "revoked", revision: 3, replayed: false });
  mocks.inspect.mockResolvedValue({ organization: scope.organization, role: "coach", locations: [{ id: locationId, name: "Synthetic location" }] });
  mocks.accept.mockResolvedValue({ membership: { id: memberId, role: "coach", status: "active", locationScopeMode: "selected", locations: [] }, replayed: false });
});
afterEach(() => vi.unstubAllEnvs());

describe("Team access real HTTP guards with synthetic session and service boundaries", () => {
  for (const route of allCalls) {
    for (const flag of [undefined, "false", "TRUE"]) {
      it(`${route.name}: default-off/exact flag ${String(flag)} stops before Auth, rate-limit or application work`, async () => {
        vi.stubEnv("ZALTYKO_TEAM_ACCESS_ENABLED", flag);
        const response = await route.call();
        expect(response.status).toBe(503);
        privateResponse(response);
        expect(mocks.user).not.toHaveBeenCalled();
        expect(mocks.limit).not.toHaveBeenCalled();
        expect(mocks.scope).not.toHaveBeenCalled();
        expect(mocks.transaction).not.toHaveBeenCalled();
        noServiceCalls();
      });
    }

    it(`${route.name}: missing session returns private 401 before authorization or application work`, async () => {
      mocks.user.mockResolvedValue(null);
      const response = await route.call();
      expect(response.status).toBe(401);
      privateResponse(response);
      expect(mocks.scope).not.toHaveBeenCalled();
      expect(mocks.limit).not.toHaveBeenCalled();
      noServiceCalls();
    });

    it(`${route.name}: rate denial returns private 429 without application work`, async () => {
      mocks.limit.mockResolvedValue({ success: false });
      const response = await route.call();
      expect(response.status).toBe(429);
      privateResponse(response);
      expect(mocks.scope).not.toHaveBeenCalled();
      noServiceCalls();
    });
  }

  for (const route of ownerCalls) {
    for (const [role, mode] of [["owner", "selected"], ["manager", "all"], ["admin", "all"], ["coach", "selected"]]) {
      it(`${route.name}: ${role}/${mode} is denied before canonical service calls`, async () => {
        mocks.scope.mockResolvedValue({ ...scope, member: { ...scope.member, role, locationScopeMode: mode } });
        const response = await route.call();
        expect(response.status).toBe(403);
        privateResponse(response);
        noServiceCalls();
      });
    }

    it(`${route.name}: foreign organization denial does not expose its resources`, async () => {
      mocks.scope.mockRejectedValue(new OperationalError("FORBIDDEN", "Sin acceso", 403));
      const response = await route.call();
      expect(response.status).toBe(403);
      expect(mocks.scope).toHaveBeenCalledWith({ userId, organizationId });
      noServiceCalls();
    });
  }

  it("Owner-all creation normalizes email, sorts explicit locations and derives actor from verified scope", async () => {
    const response = await invite(request("/owner/staff/invitations", "POST", { ...inviteBody, locationIds: [otherLocationId, locationId] }, { "idempotency-key": key }));
    expect(response.status).toBe(201);
    privateResponse(response);
    expect(mocks.invite).toHaveBeenCalledWith({
      organizationId, email: "synthetic@example.invalid", role: "coach", locationIds: [locationId, otherLocationId],
      actor: { userId, memberId }, idempotencyKey: key,
    });
    expect(await response.json()).toMatchObject({ ok: true, data: { token, replayed: false } });
  });

  for (const body of [
    { ...inviteBody, role: "owner" }, { ...inviteBody, role: "admin" },
    { ...inviteBody, locationIds: [] }, { ...inviteBody, locationIds: [locationId, locationId] },
    { ...inviteBody, userId }, { ...inviteBody, locationScopeMode: "all" },
  ]) {
    it(`rejects invalid or privilege-bearing invitation body ${JSON.stringify(body)}`, async () => {
      const response = await invite(request("/owner/staff/invitations", "POST", body, { "idempotency-key": key }));
      expect(response.status).toBe(400);
      privateResponse(response);
      expect(await response.text()).not.toContain(inviteBody.email);
      noServiceCalls();
    });
  }

  for (const route of [reissue, revoke]) {
    for (const revision of [undefined, "0", "-1", "1.2", "9007199254740992"]) {
      it(`${route === reissue ? "reissue" : "revoke"}: rejects missing/invalid If-Match ${String(revision)}`, async () => {
        const headers = { "idempotency-key": key, ...(revision ? { "if-match": revision } : {}) };
        const response = route === reissue
          ? await reissue(request(`/owner/staff/invitations/${invitationId}/reissue`, "POST", { organizationId }, headers), context())
          : await revoke(request(`/owner/staff/invitations/${invitationId}?organizationId=${organizationId}`, "DELETE", undefined, headers), context());
        expect(response.status).toBe(400);
        noServiceCalls();
      });
    }
  }

  it("reissue and revoke forward If-Match plus verified actor, never a caller-supplied identity", async () => {
    expect((await ownerCalls[2].call()).status).toBe(200);
    expect((await ownerCalls[3].call()).status).toBe(200);
    const expected = { organizationId, invitationId, revision: 2, actor: { userId, memberId }, idempotencyKey: key };
    expect(mocks.reissue).toHaveBeenCalledWith(expected);
    expect(mocks.revoke).toHaveBeenCalledWith(expected);
  });

  it("creation replay returns the safe service receipt without revealing a token again", async () => {
    mocks.invite.mockResolvedValue({ invitation: { id: invitationId }, token: null, replayed: true });
    const response = await ownerCalls[1].call();
    expect(response.status).toBe(200);
    privateResponse(response);
    const text = await response.text();
    expect(text).not.toContain(token);
    expect(JSON.parse(text)).toMatchObject({ data: { token: null, replayed: true } });
  });

  it("reissue replay returns no token, preserving the explicit rotation boundary", async () => {
    mocks.reissue.mockResolvedValue({ invitation: { id: invitationId }, token: null, replayed: true });
    const response = await ownerCalls[2].call();
    expect(response.status).toBe(200);
    privateResponse(response);
    const text = await response.text();
    expect(text).not.toContain(token);
    expect(JSON.parse(text)).toMatchObject({ data: { token: null, replayed: true } });
  });

  it("forwards stale-revision conflicts privately without treating them as successful revocation", async () => {
    mocks.revoke.mockRejectedValue(new OperationalError("VERSION_CONFLICT", "Actualiza el listado", 409));
    const response = await ownerCalls[3].call();
    expect(response.status).toBe(409);
    privateResponse(response);
    expect(await response.json()).toMatchObject({ ok: false, code: "VERSION_CONFLICT" });
  });

  for (const handler of [inspect, accept]) {
    it(`${handler === inspect ? "inspect" : "accept"}: derives identity exclusively from verified Auth, without Owner scope`, async () => {
      const response = await handler(request("/staff/invitations/synthetic", "POST", { token }, { "idempotency-key": key }));
      expect(response.status).toBe(200);
      privateResponse(response);
      expect(handler === inspect ? mocks.inspect : mocks.accept).toHaveBeenCalledWith({ token, userId, ...(handler === accept ? { idempotencyKey: key } : {}) });
      expect(mocks.scope).not.toHaveBeenCalled();
      const text = await response.text();
      for (const secret of [token, "untrusted-session@example.invalid", userId]) expect(text).not.toContain(secret);
      if (handler === inspect) expect(mocks.accept).not.toHaveBeenCalled();
    });

    for (const extra of [{ userId }, { email: "different@example.invalid" }, { organizationId }, { role: "owner" }, { locationIds: [locationId] }]) {
      it(`${handler === inspect ? "inspect" : "accept"}: rejects identity/scope injection ${JSON.stringify(extra)}`, async () => {
        const response = await handler(request("/staff/invitations/synthetic", "POST", { token, ...extra }, { "idempotency-key": key }));
        expect(response.status).toBe(400);
        expect(await response.text()).not.toContain(token);
        noServiceCalls();
      });
    }
  }

  it("accept requires an idempotency key while inspect needs none", async () => {
    expect((await accept(request("/staff/invitations/accept", "POST", { token }))).status).toBe(400);
    expect(mocks.accept).not.toHaveBeenCalled();
    expect((await inspect(request("/staff/invitations/inspect", "POST", { token }))).status).toBe(200);
  });

  for (const handler of [inspect, accept]) {
    for (const invalid of ["short", `${token}=`, `https://synthetic.invalid/staff/accept#token=${token}`]) {
      it(`${handler === inspect ? "inspect" : "accept"}: rejects credential shape without reflecting it`, async () => {
        const response = await handler(request("/staff/invitations/synthetic", "POST", { token: invalid }, { "idempotency-key": key }));
        expect(response.status).toBe(400);
        privateResponse(response);
        expect(await response.text()).not.toContain(invalid);
        noServiceCalls();
      });
    }
  }

  it("inspect forwards only the generic identity/token denial, without invoking acceptance", async () => {
    mocks.inspect.mockRejectedValue(new OperationalError("NOT_FOUND", "La invitación no está disponible para esta identidad.", 404));
    const response = await inspect(request("/staff/invitations/inspect", "POST", { token }));
    expect(response.status).toBe(404);
    privateResponse(response);
    const text = await response.text();
    expect(text).not.toContain(token);
    expect(text).not.toContain(userId);
    expect(mocks.accept).not.toHaveBeenCalled();
  });

  it("unexpected dependency errors become private generic 503 without reflecting SQL, email or token", async () => {
    mocks.invite.mockRejectedValue(new Error(`query failed normalized_email=${inviteBody.email}; token=${token}`));
    const response = await ownerCalls[1].call();
    expect(response.status).toBe(503);
    privateResponse(response);
    const text = await response.text();
    expect(text).not.toContain("normalized_email");
    expect(text).not.toContain(token);
    expect(text).not.toContain(inviteBody.email);
  });

  it("a missing canonical schema fails in the real application preflight before any command write", async () => {
    const actual = await vi.importActual<typeof import("@/modules/staff/application/canonical-team-access")>("@/modules/staff/application/canonical-team-access");
    mocks.invite.mockImplementation(actual.createCanonicalTeamInvitation);
    const execute = vi.fn().mockRejectedValue(new Error("synthetic undefined_table"));
    mocks.transaction.mockImplementation(async work => work({ execute }));
    const response = await ownerCalls[1].call();
    expect(response.status).toBe(503);
    privateResponse(response);
    // The first schema projection failed: no lock, mutation, audit or receipt ran.
    expect(execute).toHaveBeenCalledTimes(1);
    expect(await response.text()).not.toContain("undefined_table");
  });

  it("present relations with untrusted catalog metadata fail before authorization locks or command writes", async () => {
    const actual = await vi.importActual<typeof import("@/modules/staff/application/canonical-team-access")>("@/modules/staff/application/canonical-team-access");
    mocks.invite.mockImplementation(actual.createCanonicalTeamInvitation);
    // Three zero-row projections can succeed even when integrity/RLS metadata
    // is absent or unreliable. The real catalog guard must still stop here.
    const execute = vi.fn().mockResolvedValue({ rows: [] });
    mocks.transaction.mockImplementation(async work => work({ execute }));
    const response = await ownerCalls[1].call();
    expect(response.status).toBe(503);
    privateResponse(response);
    expect(execute).toHaveBeenCalledTimes(4);
    expect(await response.text()).not.toContain(token);
  });
});
