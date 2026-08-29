import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  values: vi.fn(),
  verify: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: { insert: mocks.insert },
}));

vi.mock("@/lib/rate-limit", () => ({
  RATE_LIMITS: { STRICT: { limit: 5, window: 60 } },
  withRateLimit: (handler: unknown) => handler,
}));

vi.mock("@/lib/onboarding/email-link-token", () => ({
  verifyEmailLinkToken: mocks.verify,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: mocks.error },
}));

import { POST as preferencesPost } from "@/app/api/preferences/route";
import { POST as unsubscribePost } from "@/app/api/unsubscribe/route";

const TOKEN = "synthetic-token-that-is-long-enough";
const EMAIL = "Owner@Example.com";

function request(body: unknown) {
  return new Request("https://sandbox.zaltyko.com/api/preferences", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("onboarding email preference routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockReturnValue({
      ok: true,
      payload: {
        email: EMAIL,
        purpose: "unsubscribe",
        expiresAt: 1_800_000_000,
        nonce: "synthetic",
      },
    });
    mocks.insert.mockReturnValue({ values: mocks.values });
    mocks.values.mockResolvedValue(undefined);
  });

  it("no confirma la baja si falla la persistencia", async () => {
    mocks.values.mockRejectedValue(new Error("synthetic database outage"));

    const response = await unsubscribePost(request({ token: TOKEN }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "PERSISTENCE_FAILED",
    });
    expect(mocks.insert).toHaveBeenCalledOnce();
  });

  it("no confirma preferencias si falla la persistencia", async () => {
    mocks.verify.mockReturnValue({
      ok: true,
      payload: {
        email: EMAIL,
        purpose: "preferences",
        expiresAt: 1_800_000_000,
        nonce: "synthetic",
      },
    });
    mocks.values.mockRejectedValue(new Error("synthetic database outage"));

    const response = await preferencesPost(
      request({
        token: TOKEN,
        prefs: { transactional: true, marketing: false },
      })
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "PERSISTENCE_FAILED",
    });
  });

  it("rechaza un token de preferencias en la ruta de baja", async () => {
    mocks.verify.mockReturnValue({
      ok: true,
      payload: {
        email: EMAIL,
        purpose: "preferences",
        expiresAt: 1_800_000_000,
        nonce: "synthetic",
      },
    });

    const response = await unsubscribePost(request({ token: TOKEN }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "WRONG_PURPOSE",
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
