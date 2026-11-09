import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), execute: vi.fn() }));
vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));
// These unit cases isolate authorization/identity after a trusted schema. The
// real catalog guard and reversible drift are covered in the PG suite.
vi.mock("@/modules/staff/application/canonical-team-access-schema", () => ({ assertCanonicalTeamAccessSchema: vi.fn() }));

import { createCanonicalTeamInvitation, inspectCanonicalTeamInvitation, listCanonicalTeamAccess } from "@/modules/staff/application/canonical-team-access";

const organizationId = "5fb33113-5528-4268-846a-9941e5cd71ba";
const actor = { userId: "2c429c67-7297-42d9-9599-918ea0f306fb", memberId: "047e301c-cbef-4d4d-99af-26adf74719d9" };
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

describe("canonical team access fail-closed boundary", () => {
  it.each([undefined, "false", "TRUE", "1"])("does not open a database with flag %s", async value => {
    vi.stubEnv("ZALTYKO_TEAM_ACCESS_ENABLED", value);
    await expect(listCanonicalTeamAccess({ organizationId, actor })).rejects.toMatchObject({ status: 503, code: "FEATURE_NOT_AVAILABLE" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("sanitizes a missing/partial schema failure without returning SQL parameters", async () => {
    vi.stubEnv("ZALTYKO_TEAM_ACCESS_ENABLED", "true");
    mocks.transaction.mockRejectedValue(new Error("column token_sha256 missing; token=private-canary email=private@example.invalid"));
    const failure = await listCanonicalTeamAccess({ organizationId, actor }).catch(error => error);
    expect(failure).toMatchObject({ status: 503 });
    expect(String(failure)).not.toContain("private");
  });

  it("denies an actor whose canonical Owner-all row is missing", async () => {
    vi.stubEnv("ZALTYKO_TEAM_ACCESS_ENABLED", "true");
    mocks.execute.mockResolvedValue({ rows: [] });
    mocks.transaction.mockImplementation(async work => work({ execute: mocks.execute }));
    await expect(listCanonicalTeamAccess({ organizationId, actor })).rejects.toMatchObject({ status: 403 });
  });

  it("rejects privilege escalation before any transaction", async () => {
    vi.stubEnv("ZALTYKO_TEAM_ACCESS_ENABLED", "true");
    await expect(createCanonicalTeamInvitation({ organizationId, actor, email: "team@example.invalid", role: "owner" as "coach", locationIds: [actor.memberId], idempotencyKey: "synthetic-key" })).rejects.toBeDefined();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not accept a client email instead of an Auth-owned confirmed identity", async () => {
    vi.stubEnv("ZALTYKO_TEAM_ACCESS_ENABLED", "true");
    mocks.execute.mockResolvedValue({ rows: [] });
    mocks.transaction.mockImplementation(async work => work({ execute: mocks.execute }));
    await expect(inspectCanonicalTeamInvitation({ userId: actor.userId, token: "a".repeat(43) })).rejects.toMatchObject({ status: 404 });
  });
});
