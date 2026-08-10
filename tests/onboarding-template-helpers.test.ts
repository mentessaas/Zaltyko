import { describe, expect, it, beforeEach } from "vitest";

import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  isSupportedLocale,
  pickLocalized,
  resolveOwnerLocale,
} from "@/lib/onboarding/template-helpers";

describe("onboarding/template-helpers (ZAL-324 Gap 4)", () => {
  beforeEach(() => {
    delete process.env.OWNER_DEFAULT_LOCALE;
  });

  it("DEFAULT_LOCALE es 'es' (literal, sin schema)", () => {
    expect(DEFAULT_LOCALE).toBe("es");
  });

  it("SUPPORTED_LOCALES solo expone 'es' y 'en' en v0.2", () => {
    expect([...SUPPORTED_LOCALES].sort()).toEqual(["en", "es"]);
  });

  it("isSupportedLocale acepta solo locales validos", () => {
    expect(isSupportedLocale("es")).toBe(true);
    expect(isSupportedLocale("en")).toBe(true);
    expect(isSupportedLocale("fr")).toBe(false);
    expect(isSupportedLocale("")).toBe(false);
    expect(isSupportedLocale(null)).toBe(false);
    expect(isSupportedLocale(undefined)).toBe(false);
  });

  it("resolveOwnerLocale cae a 'es' si no hay nada", () => {
    expect(resolveOwnerLocale(null)).toBe("es");
    expect(resolveOwnerLocale(undefined)).toBe("es");
    expect(resolveOwnerLocale("")).toBe("es");
    expect(resolveOwnerLocale("fr")).toBe("es");
  });

  it("resolveOwnerLocale acepta el profileLocale si es valido", () => {
    expect(resolveOwnerLocale("es")).toBe("es");
    expect(resolveOwnerLocale("en")).toBe("en");
  });

  it("resolveOwnerLocale respeta OWNER_DEFAULT_LOCALE override", () => {
    process.env.OWNER_DEFAULT_LOCALE = "en";
    expect(resolveOwnerLocale(null)).toBe("en");
    expect(resolveOwnerLocale("es")).toBe("es"); // profile gana
  });

  it("pickLocalized devuelve el string del locale resuelto", () => {
    const strings = { es: "Bienvenido", en: "Welcome" };
    expect(pickLocalized(strings, "es")).toBe("Bienvenido");
    expect(pickLocalized(strings, "en")).toBe("Welcome");
  });

  it("pickLocalized cae a DEFAULT_LOCALE si falta la clave del locale", () => {
    const strings = { es: "Bienvenido", en: null };
    expect(pickLocalized(strings, "en")).toBe("Bienvenido");
  });
});
