import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isE2EMockAuthClientEnabled,
  isE2EMockAuthEnabled,
  parseE2EMockUser,
} from "@/lib/supabase/e2e-mock";

describe("E2E auth seam", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("solo habilita el mock server-side con el flag privado en desarrollo", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("E2E_MOCK_AUTH", "1");
    vi.stubEnv("NEXT_PUBLIC_E2E_MOCK_AUTH", "1");

    expect(isE2EMockAuthEnabled()).toBe(true);

    vi.stubEnv("E2E_MOCK_AUTH", "0");
    expect(isE2EMockAuthEnabled()).toBe(false);
  });

  it("nunca habilita el mock server-side en producción", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_MOCK_AUTH", "1");

    expect(isE2EMockAuthEnabled()).toBe(false);
  });

  it("habilita el cliente solo con la cookie explícita de desarrollo", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(isE2EMockAuthClientEnabled("zaltyko_e2e_mock_client=1")).toBe(true);
    expect(isE2EMockAuthClientEnabled("zaltyko_e2e_mock_client=0")).toBe(false);
    expect(isE2EMockAuthClientEnabled("NEXT_PUBLIC_E2E_MOCK_AUTH=1")).toBe(false);
  });

  it("rechaza cookies de usuario malformadas sin lanzar", () => {
    expect(parseE2EMockUser("%7B%22id%22%3A42%7D")).toBeNull();
    expect(parseE2EMockUser("not-json")).toBeNull();
  });
});
