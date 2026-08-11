import { describe, expect, it } from "vitest";

// Tests del módulo puro: validación + normalización + límites + plantillas.
// Los efectos de DB/Supabase/Brevo se validan en tests de integración contra
// sandbox (ver ZAL-138 changelog pendiente).

import {
  ATHLETE_INVITE_BULK_MAX,
  ATHLETE_INVITE_MAX_EXPIRES_DAYS,
  ATHLETE_INVITE_RESEND_COOLDOWN_MINUTES,
  ATHLETE_INVITE_MAX_RESENDS,
  validateAndNormalizeEmails,
} from "@/lib/athletes/magic-link-invite-service";

describe("ZAL-138 magic link invite — constantes y validación pura", () => {
  it("constantes operativas dentro del rango esperado", () => {
    expect(ATHLETE_INVITE_BULK_MAX).toBe(10);
    expect(ATHLETE_INVITE_BULK_MAX).toBeGreaterThanOrEqual(1);
    expect(ATHLETE_INVITE_BULK_MAX).toBeLessThanOrEqual(50);
    expect(ATHLETE_INVITE_MAX_EXPIRES_DAYS).toBeGreaterThanOrEqual(7);
    expect(ATHLETE_INVITE_MAX_EXPIRES_DAYS).toBeLessThanOrEqual(60);
    expect(ATHLETE_INVITE_RESEND_COOLDOWN_MINUTES).toBeGreaterThanOrEqual(1);
    expect(ATHLETE_INVITE_RESEND_COOLDOWN_MINUTES).toBeLessThanOrEqual(60);
    expect(ATHLETE_INVITE_MAX_RESENDS).toBeGreaterThan(0);
    expect(ATHLETE_INVITE_MAX_RESENDS).toBeLessThanOrEqual(10);
  });

  it("validateAndNormalizeEmails: emails simples se aceptan y normalizan", () => {
    const res = validateAndNormalizeEmails(["lucia@test.com", "PEDRO@test.com"]);
    expect(res.errors).toEqual([]);
    expect(res.valid).toEqual([
      { original: "lucia@test.com", email: "lucia@test.com" },
      { original: "PEDRO@test.com", email: "pedro@test.com" },
    ]);
  });

  it("validateAndNormalizeEmails: trim y lowercase aplicados", () => {
    const res = validateAndNormalizeEmails(["  LUCIA@Test.COM  "]);
    expect(res.errors).toEqual([]);
    expect(res.valid[0]?.email).toBe("lucia@test.com");
    expect(res.valid[0]?.original).toBe("  LUCIA@Test.COM  ");
  });

  it("validateAndNormalizeEmails: emails inválidos marcados como INVALID_EMAIL", () => {
    const res = validateAndNormalizeEmails([
      "no-es-email",
      "tampoco@",
      "@sin-user.com",
      "sin-dominio@",
    ]);
    expect(res.valid).toEqual([]);
    expect(res.errors).toHaveLength(4);
    for (const e of res.errors) {
      expect(e.reason).toBe("INVALID_EMAIL");
    }
  });

  it("validateAndNormalizeEmails: dedupe case-insensitive dentro del batch", () => {
    const res = validateAndNormalizeEmails([
      "Lucia@Test.com",
      "lucia@test.com",
      "LUCIA@TEST.COM",
    ]);
    expect(res.valid).toHaveLength(1);
    expect(res.errors).toHaveLength(2);
    expect(res.errors.every((e) => e.reason === "DUPLICATE_IN_BATCH")).toBe(true);
  });

  it("validateAndNormalizeEmails: acepta emails con subdominios y +alias", () => {
    const res = validateAndNormalizeEmails([
      "atleta+invierno@academia.gimnasia.es",
      "otro@sub.example.co.uk",
    ]);
    expect(res.errors).toEqual([]);
    expect(res.valid).toHaveLength(2);
  });

  it("validateAndNormalizeEmails: mezcla válida + inválido + duplicado", () => {
    const res = validateAndNormalizeEmails([
      "buena@test.com",
      "no-es-email",
      "BUENA@test.com",
      "atleta2@test.com",
    ]);
    expect(res.valid.map((v) => v.email)).toEqual([
      "buena@test.com",
      "atleta2@test.com",
    ]);
    expect(res.errors.map((e) => e.reason)).toEqual([
      "INVALID_EMAIL",
      "DUPLICATE_IN_BATCH",
    ]);
  });

  it("validateAndNormalizeEmails: emails vacíos cuentan como inválidos", () => {
    const res = validateAndNormalizeEmails(["", "   "]);
    expect(res.valid).toEqual([]);
    expect(res.errors).toHaveLength(2);
    expect(res.errors.every((e) => e.reason === "INVALID_EMAIL")).toBe(true);
  });

  it("validateAndNormalizeEmails: emails con espacios internos cuentan como inválidos", () => {
    const res = validateAndNormalizeEmails(["lu cia@test.com"]);
    expect(res.valid).toEqual([]);
    expect(res.errors[0]?.reason).toBe("INVALID_EMAIL");
  });
});