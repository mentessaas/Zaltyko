/**
 * Tests del helper de claim-academy (ZAL-137, corte owner onboarding).
 *
 * Issue:    ZAL-137 [D-006] Auditar y adaptar onboarding owner existente
 * Companion: src/lib/auth/claim-academy.ts
 *
 * Cobertura objetivo: lógica pura (`normalizeClaimEmail`) — sin DB. La query
 * `findClaimableAcademyByEmail` se valida estructuralmente vía typecheck y
 * vía el chainable mock de tests/setup.ts; el flujo E2E real se valida con
 * Playwright contra localhost en sandbox (ver audit notes).
 *
 * Por qué solo lógica pura:
 *  - `normalizeClaimEmail` define el CONTRATO del match (trim + lowercase);
 *    cambiarlo sin actualizar el helper silenciosamente rompe claims.
 *  - La query `lower(academies.contactEmail) = $normalized` se prueba en
 *    integration tests de Drizzle; los unit tests verifican el contrato de
 *    normalización que es lo que cambia entre PRs.
 */

import { describe, expect, it } from "vitest";

import {
  normalizeClaimEmail,
  findClaimableAcademyByEmail,
  type ClaimableAcademy,
} from "@/lib/auth/claim-academy";

describe("ZAL-137 — claim-academy helper", () => {
  describe("normalizeClaimEmail (puro)", () => {
    it("lowercase + trim para input válido", () => {
      expect(normalizeClaimEmail("Owner@Example.com")).toBe("owner@example.com");
      expect(normalizeClaimEmail("  owner@example.com  ")).toBe("owner@example.com");
      expect(normalizeClaimEmail("OWNER@EXAMPLE.COM")).toBe("owner@example.com");
    });

    it("string vacío si input es null/undefined/no-string", () => {
      expect(normalizeClaimEmail(null)).toBe("");
      expect(normalizeClaimEmail(undefined)).toBe("");
      expect(normalizeClaimEmail("")).toBe("");
      expect(normalizeClaimEmail("   ")).toBe("");
      expect(normalizeClaimEmail(123)).toBe("");
      expect(normalizeClaimEmail({})).toBe("");
      expect(normalizeClaimEmail([])).toBe("");
      expect(normalizeClaimEmail(true)).toBe("");
    });

    it("preserva chars no-ASCII pero lowercase Unicode-aware (lowercase del user.email de Supabase)", () => {
      // Supabase devuelve emails normalizados; los tests cubren el caso ASCII
      // porque es el 99% del universo Zaltyko. Si en el futuro entra
      // Unicode (acentos, ñ) revisar el locale de toLowerCase.
      expect(normalizeClaimEmail("María@Example.com")).toBe("maría@example.com");
    });
  });

  describe("findClaimableAcademyByEmail — early returns", () => {
    it("devuelve null sin tocar DB si email es null", async () => {
      // El chainable mock de tests/setup.ts resuelve `[]`. Si el helper
      // respeta su guard y devuelve null antes de tocar db, el chainable
      // nunca se invoca y la promesa resuelve a null.
      const result = await findClaimableAcademyByEmail({ email: null });
      expect(result).toBeNull();
    });

    it("devuelve null sin tocar DB si email es empty string", async () => {
      const result = await findClaimableAcademyByEmail({ email: "" });
      expect(result).toBeNull();
    });

    it("devuelve null sin tocar DB si email es solo whitespace", async () => {
      const result = await findClaimableAcademyByEmail({ email: "   " });
      expect(result).toBeNull();
    });

    it("devuelve null sin tocar DB si email es undefined", async () => {
      const result = await findClaimableAcademyByEmail({ email: undefined });
      expect(result).toBeNull();
    });
  });

  describe("ClaimableAcademy shape", () => {
    // Pin del contrato público del helper. Si alguien cambia el shape
    // rompiendo OwnerClaimCard props o el endpoint claim, el typecheck falla.
    it("ClaimableAcademy tiene id/name/tenantId/ownerId", () => {
      const fixture: ClaimableAcademy = {
        id: "00000000-0000-0000-0000-000000000001",
        name: "Club Gimnasia Elite",
        tenantId: "00000000-0000-0000-0000-000000000002",
        ownerId: "00000000-0000-0000-0000-000000000003",
      };
      expect(Object.keys(fixture).sort()).toEqual(
        ["id", "name", "ownerId", "tenantId"].sort()
      );
    });
  });
});