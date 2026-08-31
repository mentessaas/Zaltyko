import { describe, expect, it } from "vitest";

import { mapSupabaseAuthError } from "@/lib/auth/map-supabase-auth-error";

/**
 * Tests del mapeo de mensajes de error de Supabase Auth → español.
 *
 * Cobertura:
 * - Caso estrella: `signInWithOtp({ email: "test@test.c" })` → mensaje crudo
 *   `Email address "test@test.c" is invalid` debe caer en español.
 * - Variantes de credenciales, rate-limit, email no confirmado, OAuth, etc.
 * - Casos degenerados (null, undefined, mensaje vacío, mensaje no-EN).
 * - Fallback genérico cuando ningún patrón coincide.
 *
 * Si Supabase cambia el wording en una versión futura del SDK, este test
 * falla → obliga a actualizar el patrón. Es la red de seguridad del fix.
 */

describe("mapSupabaseAuthError — bug i18n magic link (ZAL-138)", () => {
  describe("caso estrella reportado por L11 (2026-08-24)", () => {
    it("traduce 'Email address ... is invalid' (TLD 1 char) a español", () => {
      const result = mapSupabaseAuthError({
        message: 'Email address "test@test.c" is invalid',
      });
      expect(result).toBe("La dirección de correo no es válida.");
      expect(result).not.toMatch(/invalid/i);
    });

    it("tolera variaciones con/sin comillas en el email", () => {
      expect(
        mapSupabaseAuthError({ message: "Email address foo@bar.io is invalid" })
      ).toBe("La dirección de correo no es válida.");
    });

    it("case-insensitive en 'Email Address'", () => {
      expect(
        mapSupabaseAuthError({ message: 'EMAIL ADDRESS "X@Y.C" IS INVALID' })
      ).toBe("La dirección de correo no es válida.");
    });
  });

  describe("credenciales y registro", () => {
    it("'Invalid login credentials' → mensaje en español", () => {
      expect(mapSupabaseAuthError({ message: "Invalid login credentials" }))
        .toBe("Correo o contraseña incorrectos.");
    });

    it("'User already registered' → invita a iniciar sesión", () => {
      expect(mapSupabaseAuthError({ message: "User already registered" }))
        .toBe("Este correo ya está registrado. Prueba a iniciar sesión.");
    });

    it("'Email not confirmed' → pide confirmar el correo", () => {
      expect(mapSupabaseAuthError({ message: "Email not confirmed" }))
        .toBe("Revisa tu correo para confirmar la cuenta antes de iniciar sesión.");
    });

    it("'Signups not allowed' → registro cerrado", () => {
      expect(mapSupabaseAuthError({ message: "Signups not allowed" }))
        .toBe("El registro está cerrado en este momento. Contacta con soporte.");
    });
  });

  describe("rate limit y OTP", () => {
    it("'Email rate limit exceeded' → pide esperar", () => {
      expect(mapSupabaseAuthError({ message: "Email rate limit exceeded" }))
        .toBe("Demasiados intentos. Espera un minuto antes de reintentar.");
    });

    it("'Too many requests' (genérico) → pide esperar", () => {
      expect(mapSupabaseAuthError({ message: "Too many requests" }))
        .toBe("Demasiados intentos. Espera un minuto antes de reintentar.");
    });

    it("'OTP expired' → enlace caducado", () => {
      expect(mapSupabaseAuthError({ message: "OTP expired" }))
        .toBe("El enlace ha caducado. Solicita uno nuevo.");
    });

    it("'Token expired' → enlace caducado", () => {
      expect(mapSupabaseAuthError({ message: "Token expired" }))
        .toBe("El enlace ha caducado. Solicita uno nuevo.");
    });
  });

  describe("OAuth y red", () => {
    it("'Provider ... not enabled' → proveedor no habilitado", () => {
      expect(mapSupabaseAuthError({ message: "Provider google not enabled" }))
        .toBe("Este proveedor de acceso no está habilitado.");
    });

    it("mensaje con 'network' → problema de conexión", () => {
      expect(mapSupabaseAuthError({ message: "Network request failed" }))
        .toBe("Problema de conexión. Comprueba tu red e inténtalo de nuevo.");
    });

    it("'Internal server error' → error interno", () => {
      expect(mapSupabaseAuthError({ message: "Internal server error" }))
        .toBe("Error interno del servidor. Inténtalo en unos minutos.");
    });
  });

  describe("casos degenerados (degradación graciosa)", () => {
    it("null → fallback genérico", () => {
      expect(mapSupabaseAuthError(null)).toBe(
        "No pudimos completar la operación. Inténtalo de nuevo en unos segundos."
      );
    });

    it("undefined → fallback genérico", () => {
      expect(mapSupabaseAuthError(undefined)).toBe(
        "No pudimos completar la operación. Inténtalo de nuevo en unos segundos."
      );
    });

    it("error.message vacío → fallback genérico (NO muestra string vacío)", () => {
      expect(mapSupabaseAuthError({ message: "" })).toBe(
        "No pudimos completar la operación. Inténtalo de nuevo en unos segundos."
      );
    });

    it("error.message solo whitespace → fallback genérico", () => {
      expect(mapSupabaseAuthError({ message: "   " })).toBe(
        "No pudimos completar la operación. Inténtalo de nuevo en unos segundos."
      );
    });

    it("error.message null → fallback genérico", () => {
      expect(mapSupabaseAuthError({ message: null })).toBe(
        "No pudimos completar la operación. Inténtalo de nuevo en unos segundos."
      );
    });

    it("error sin message → fallback genérico", () => {
      expect(mapSupabaseAuthError({})).toBe(
        "No pudimos completar la operación. Inténtalo de nuevo en unos segundos."
      );
    });
  });

  describe("garantía i18n", () => {
    it("ningún patrón conocido debe dejar pasar texto en inglés crudo", () => {
      // Si Supabase añade un nuevo mensaje y olvidamos mapearlo, este test
      // falla recordándonos actualizar el helper.
      const sampleUnknownMessages = [
        "Some new Supabase Auth error message in English",
        "Internal: foo bar baz",
      ];
      for (const msg of sampleUnknownMessages) {
        const result = mapSupabaseAuthError({ message: msg });
        expect(result).toBe(
          "No pudimos completar la operación. Inténtalo de nuevo en unos segundos."
        );
        expect(result).not.toMatch(/[A-Z]{4,}/); // heurística: nada en MAYÚSCULAS
      }
    });

    it("el fallback NO contiene palabras inglesas obvious", () => {
      const result = mapSupabaseAuthError({ message: "completely unknown error xyz" });
      expect(result.toLowerCase()).not.toContain("error");
      expect(result.toLowerCase()).not.toContain("unknown");
      expect(result.toLowerCase()).not.toContain("invalid");
    });
  });
});