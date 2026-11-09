import { beforeEach, describe, expect, it, vi } from "vitest";

const exchange = vi.hoisted(() => vi.fn());
const updateUser = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({}) }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    auth: { exchangeCodeForSession: exchange, updateUser },
  })),
}));
import { GET } from "@/app/auth/callback/route";

describe("callback PKCE expiry", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("requires login after expiry, preserves a safe destination and never updates consent", async () => {
    exchange.mockResolvedValue({ error: { code: "flow_state_expired" } });
    await expect(GET(new Request("https://preview.example/auth/callback?code=synthetic&next=%2Fowner") as never))
      .rejects.toThrow("REDIRECT:/auth/login?error=callback_expired&next=%2Fowner");
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(updateUser).not.toHaveBeenCalled();
  });
  it("does not preserve an external destination", async () => {
    exchange.mockResolvedValue({ error: { code: "flow_state_expired" } });
    await expect(GET(new Request("https://preview.example/auth/callback?code=synthetic&next=%2F%2Fevil.example") as never))
      .rejects.toThrow("REDIRECT:/auth/login?error=callback_expired&next=%2Fauth%2Fredirect");
  });
  it("keeps other failures fail-closed", async () => {
    exchange.mockResolvedValue({ error: { code: "bad_code_verifier" } });
    await expect(GET(new Request("https://preview.example/auth/callback?code=synthetic") as never))
      .rejects.toThrow("REDIRECT:/auth/login?error=callback_failed");
  });
  it("keeps successful code exchange on the requested route", async () => {
    exchange.mockResolvedValue({ error: null });
    await expect(GET(new Request("https://preview.example/auth/callback?code=synthetic&next=%2Fowner") as never))
      .rejects.toThrow("REDIRECT:/owner");
  });
});
