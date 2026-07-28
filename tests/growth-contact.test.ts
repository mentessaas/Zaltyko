import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ContactRequestSchema } from "@/lib/growth/contracts";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VISITOR_STORAGE_KEY = "zaltyko_growth_visitor_id";

function buildContactRequest(overrides: Record<string, unknown> = {}) {
  return {
    name: "Test User",
    email: "test@example.com",
    reason: "migracion",
    source: "public_contact",
    message: "Hola quiero migrar mis datos",
    submissionId: "00000000-0000-4000-8000-000000000099",
    visitorId: "00000000-0000-4000-8000-000000000098",
    ...overrides,
  };
}

describe("contact growth contracts", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("acepta migracion como motivo de contacto", () => {
    const parsed = ContactRequestSchema.safeParse(buildContactRequest());

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.reason).toBe("migracion");
  });

  it("reemplaza visitorId legacy en localStorage por UUID v4", async () => {
    const newVisitorId = "00000000-0000-4000-8000-000000000123";
    const storage = new Map<string, string>([[VISITOR_STORAGE_KEY, "v-001"]]);
    const getItem = vi.fn((key: string) => storage.get(key) ?? null);
    const setItem = vi.fn((key: string, value: string) => {
      storage.set(key, value);
    });

    vi.stubGlobal("window", {
      localStorage: { getItem, setItem },
    });
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => newVisitorId),
    });

    const { getGrowthVisitorId } = await import("@/lib/growth/client");

    const visitorId = getGrowthVisitorId();

    expect(visitorId).toBe(newVisitorId);
    expect(visitorId).toMatch(UUID_V4_PATTERN);
    expect(getItem).toHaveBeenCalledWith(VISITOR_STORAGE_KEY);
    expect(setItem).toHaveBeenCalledWith(VISITOR_STORAGE_KEY, newVisitorId);
    expect(storage.get(VISITOR_STORAGE_KEY)).toBe(newVisitorId);
  });
});
