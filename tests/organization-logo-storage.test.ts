import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("server-only", () => ({}));

import {
  isMissingOrganizationLogoColumn,
  isOrganizationLogoPath,
  organizationLogoPath,
  validateOrganizationLogo,
} from "@/modules/organizations/infrastructure/organization-logo-storage";

const ORGANIZATION_A = "10000000-0000-4000-8000-000000000001";
const ORGANIZATION_B = "20000000-0000-4000-8000-000000000001";

describe("organization logo storage boundary", () => {
  it("keeps each stored object under the exact organization prefix", () => {
    const pathA = organizationLogoPath(ORGANIZATION_A, "png");
    const pathB = organizationLogoPath(ORGANIZATION_B, "png");
    expect(pathA).toBe(`${ORGANIZATION_A}/logo.png`);
    expect(pathB).toBe(`${ORGANIZATION_B}/logo.png`);
    expect(pathA).not.toBe(pathB);
    expect(isOrganizationLogoPath(pathA)).toBe(true);
    expect(isOrganizationLogoPath("uploads/logo.png")).toBe(false);
    expect(isOrganizationLogoPath(`${ORGANIZATION_A}/other.png`)).toBe(false);
  });

  it("accepts PNG, JPEG and WebP signatures and rejects SVG and oversized files", () => {
    expect(validateOrganizationLogo(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), "image/png")).toEqual({ ok: true, extension: "png" });
    expect(validateOrganizationLogo(new Uint8Array([255, 216, 255, 1]), "image/jpeg")).toEqual({ ok: true, extension: "jpg" });
    const webp = new Uint8Array(12);
    webp.set([82, 73, 70, 70], 0);
    webp.set([87, 69, 66, 80], 8);
    expect(validateOrganizationLogo(webp, "image/webp")).toEqual({ ok: true, extension: "webp" });
    expect(validateOrganizationLogo(new TextEncoder().encode("<svg></svg>"), "image/svg+xml").ok).toBe(false);
    const oversized = new Uint8Array(1024 * 1024 + 1);
    oversized.set([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(validateOrganizationLogo(oversized, "image/png")).toEqual({ ok: false, code: "FILE_TOO_LARGE" });
  });

  it("recognizes only the missing logo_path migration for safe diploma fallback", () => {
    expect(isMissingOrganizationLogoColumn({ code: "42703", message: "column organizations.logo_path does not exist" })).toBe(true);
    expect(isMissingOrganizationLogoColumn({ code: "42703", message: "column organizations.name does not exist" })).toBe(false);
    expect(isMissingOrganizationLogoColumn({ code: "08006", message: "connection lost" })).toBe(false);
  });

  it("reads the optional logo through row JSON so a missing candidate column cannot abort the diploma transaction", () => {
    const reads = readFileSync(join(process.cwd(), "src/modules/skill-levels/application/skill-levels/reads.ts"), "utf8");
    expect(reads).toContain("to_jsonb(organization)->>'logo_path'");
    expect(reads).not.toContain(".select({ path: organizations.logoPath })");
  });
});
