import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("../src/app/api/onboarding/owner/claim/route.ts", import.meta.url), "utf8");
describe("legacy claim cannot transfer operational ownership", () => {
 it("authenticates and only redirects the existing owner", () => {
  expect(source).toContain("supabase.auth.getUser()");
  expect(source).toContain("eq(profiles.userId, user.id)");
  expect(source).toContain("academies.ownerId");
 });
 it("never updates owners, profiles or memberships", () => {
  expect(source).not.toMatch(/\.(update|insert|delete)\(/);
  expect(source).toContain('"MANUAL_REVIEW_REQUIRED"');
 });
});
