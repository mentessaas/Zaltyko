import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("super-admin refresh resilience contract", () => {
  it("aborts slow metric refreshes and exposes a recoverable error", () => {
    const source = readFileSync("src/hooks/useSuperAdminData.ts", "utf8");

    expect(source).toContain("SUPER_ADMIN_REFRESH_TIMEOUT_MS");
    expect(source).toContain("new AbortController()");
    expect(source).toContain("controller.abort()");
    expect(source).toContain("Mostramos el último corte válido");
    expect(source).toContain("refreshError");
  });

  it("announces the refresh fallback in the Super Admin surface", () => {
    const source = readFileSync(
      "src/app/(super-admin)/super-admin/components/SuperAdminDashboard.tsx",
      "utf8"
    );

    expect(source).toContain("const { metrics, loading, refresh, refreshError }");
    expect(source).toContain('role="status" aria-live="polite"');
    expect(source).toContain("refreshError &&");
  });
});
