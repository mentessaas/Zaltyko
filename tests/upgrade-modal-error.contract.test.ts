import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../src/components/billing/UpgradeModal.tsx", import.meta.url), "utf8");

describe("upgrade modal error contract", () => {
  it("does not open an empty payment step when initialization fails", () => {
    expect(source).toContain("if (!response.ok)");
    expect(source).toContain("No se recibió una sesión de pago válida.");
    expect(source).toContain("setError");
  });

  it("shows payment failures to the user", () => {
    expect(source).toContain('role="alert"');
    expect(source).toContain("Upgrade payment confirmation failed");
  });
});
