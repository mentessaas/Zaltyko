import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({ init: vi.fn(), captureRouterTransitionStart: vi.fn() }));
vi.mock("@sentry/nextjs", () => sentry);

function browser(path: string) {
  const location = new URL(path, "https://club.example.test");
  const replaceState = vi.fn((_state: unknown, _unused: string, url: string) => {
    location.href = new URL(url, location.origin).href;
  });
  vi.stubGlobal("window", { location, history: { state: null, replaceState } });
  return { location, replaceState };
}

beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("team invitation credential bootstrap", () => {
  it("cleans the address before consumption, retains only memory and reveals once", async () => {
    const token = "a".repeat(43);
    const page = browser(`/staff/accept?irrelevant=discard#token=${token}`);
    const { captureTeamInvitationFragment, takeTeamInvitationToken } = await import("@/lib/auth/team-invitation-fragment");
    expect(captureTeamInvitationFragment()).toBe(true);
    expect(page.location.href).toBe("https://club.example.test/staff/accept");
    expect(page.replaceState).toHaveBeenCalledWith(null, "", "/staff/accept");
    expect(captureTeamInvitationFragment()).toBe(true);
    expect(takeTeamInvitationToken()).toBe(token);
    expect(takeTeamInvitationToken()).toBeNull();
  });

  it.each(["#token=short", `#token=${"a".repeat(43)}&token=${"b".repeat(43)}`, `#token=${"a".repeat(43)}&next=/owner`])(
    "cleans malformed or ambiguous fragments without accepting them: %s", async (fragment) => {
      const page = browser(`/staff/accept${fragment}`);
      const helper = await import("@/lib/auth/team-invitation-fragment");
      helper.captureTeamInvitationFragment();
      expect(page.location.hash).toBe("");
      expect(helper.takeTeamInvitationToken()).toBeNull();
    }
  );

  it("fails closed if browser history cannot be cleaned", async () => {
    const page = browser(`/staff/accept#token=${"a".repeat(43)}`);
    page.replaceState.mockImplementation(() => { throw new Error("history unavailable"); });
    const helper = await import("@/lib/auth/team-invitation-fragment");
    expect(helper.captureTeamInvitationFragment()).toBe(true);
    expect(helper.takeTeamInvitationToken()).toBeNull();
  });

  it("does not alter unrelated routes or interpret their fragments as invitations", async () => {
    const page = browser("/owner#overview");
    const helper = await import("@/lib/auth/team-invitation-fragment");
    expect(helper.captureTeamInvitationFragment()).toBe(false);
    expect(page.replaceState).not.toHaveBeenCalled();
    expect(helper.takeTeamInvitationToken()).toBeNull();
  });

  it("discards an unconsumed credential after leaving and returning without a fresh fragment", async () => {
    const page = browser(`/staff/accept#token=${"a".repeat(43)}`);
    const helper = await import("@/lib/auth/team-invitation-fragment");
    helper.captureTeamInvitationFragment();
    page.location.href = "https://club.example.test/owner";
    helper.captureTeamInvitationFragment();
    page.location.href = "https://club.example.test/staff/accept";
    helper.captureTeamInvitationFragment();
    expect(helper.takeTeamInvitationToken()).toBeNull();
  });

  it("discards a bootstrap credential at navigation start even if the source never mounted", async () => {
    const page = browser(`/staff/accept#token=${"a".repeat(43)}`);
    const instrumentation = await import("../instrumentation-client");
    instrumentation.onRouterTransitionStart("/owner", "push");
    page.location.href = "https://club.example.test/staff/accept";
    const helper = await import("@/lib/auth/team-invitation-fragment");
    helper.captureTeamInvitationFragment();
    expect(helper.takeTeamInvitationToken()).toBeNull();
    expect(sentry.captureRouterTransitionStart).not.toHaveBeenCalled();
  });

  it("does not initialize Sentry on acceptance, even with an invalid credential", async () => {
    const page = browser("/staff/accept#token=invalid");
    const instrumentation = await import("../instrumentation-client");
    expect(page.location.hash).toBe("");
    expect(sentry.init).not.toHaveBeenCalled();
    instrumentation.onRouterTransitionStart("/staff/accept", "push");
    expect(sentry.captureRouterTransitionStart).not.toHaveBeenCalled();
  });

  it("preserves SDK initialization elsewhere and cleans later SPA acceptance navigation", async () => {
    const page = browser("/owner");
    const instrumentation = await import("../instrumentation-client");
    expect(sentry.init).toHaveBeenCalledTimes(1);
    page.location.href = `https://club.example.test/staff/accept#token=${"b".repeat(43)}`;
    instrumentation.onRouterTransitionStart("/staff/accept", "push");
    expect(page.location.hash).toBe("");
    expect(sentry.captureRouterTransitionStart).not.toHaveBeenCalled();
    const helper = await import("@/lib/auth/team-invitation-fragment");
    expect(helper.takeTeamInvitationToken()).toBe("b".repeat(43));
  });

  it("does not forward the destination credential before history has changed", async () => {
    const page = browser("/owner");
    const instrumentation = await import("../instrumentation-client");
    instrumentation.onRouterTransitionStart(`/staff/accept#token=${"c".repeat(43)}`, "push");
    expect(page.location.pathname).toBe("/owner");
    expect(sentry.captureRouterTransitionStart).not.toHaveBeenCalled();
    // Destination observation must not secretly retain a token on an aborted navigation.
    const helper = await import("@/lib/auth/team-invitation-fragment");
    expect(helper.takeTeamInvitationToken()).toBeNull();
  });
});
