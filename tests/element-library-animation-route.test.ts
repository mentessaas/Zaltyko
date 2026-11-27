import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Animation route of the element library. Most catalog elements have no
 * animation yet: the route answers 200 with no data, so opening their card
 * does not log a failed request in the browser.
 */

const mocks = vi.hoisted(() => ({
  user: { id: "c0000000-0000-4000-8000-000000000001" } as { id: string } | null,
  scope: vi.fn(),
  rateLimit: vi.fn(),
  getElement: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: async () => mocks.user }));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  rateLimit: mocks.rateLimit,
}));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({ resolveOwnerScope: mocks.scope }));
vi.mock("@/modules/element-library/application/element-library-service", () => ({
  getCatalogElement: mocks.getElement,
}));

const organizationId = "a0000000-0000-4000-8000-000000000001";
const locationId = "a0000000-0000-4000-8000-000000000002";
const elementId = "a0000000-0000-4000-8000-000000000003";
const FLAG = "ZALTYKO_ELEMENT_LIBRARY_ANIMATIONS_ENABLED";

async function get() {
  const { GET } = await import("@/app/api/v1/owner/element-library/[elementId]/animation/route");
  const url = `https://zaltyko.test/api/v1/owner/element-library/${elementId}/animation?organizationId=${organizationId}&locationId=${locationId}`;
  return GET(new Request(url), { params: Promise.resolve({ elementId }) });
}

beforeEach(() => {
  vi.stubEnv(FLAG, "true");
  mocks.user = { id: "c0000000-0000-4000-8000-000000000001" };
  mocks.scope.mockReset().mockResolvedValue({ organization: { id: organizationId }, member: { id: "a0000000-0000-4000-8000-000000000005" } });
  mocks.rateLimit.mockReset().mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 });
  mocks.getElement.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET animación del elemento", () => {
  it("devuelve la animación de un elemento que la tiene", async () => {
    mocks.getElement.mockResolvedValue({ id: elementId, edition: { code: "fig-wag-2025-2028" }, elementKey: "bb_cartwheel" });
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json();
    expect(body.data).toMatchObject({ formatVersion: 2, edition: "fig-wag-2025-2028", elementKey: "bb_cartwheel" });
  });

  it("un elemento sin animación responde 200 sin datos, no un error", async () => {
    mocks.getElement.mockResolvedValue({ id: elementId, edition: { code: "fig-wag-2025-2028" }, elementKey: "bb_element_without_animation" });
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await response.json()).data).toBeNull();
  });

  it("sin sesión responde 401 y no lee el elemento", async () => {
    mocks.user = null;
    const response = await get();
    expect(response.status).toBe(401);
    expect(mocks.getElement).not.toHaveBeenCalled();
  });

  it("con las animaciones apagadas no lee el elemento", async () => {
    vi.stubEnv(FLAG, "false");
    const response = await get();
    expect(response.status).toBe(400);
    expect(mocks.getElement).not.toHaveBeenCalled();
  });
});
