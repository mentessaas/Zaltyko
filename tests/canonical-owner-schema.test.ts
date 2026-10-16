import { describe, expect, it } from "vitest";

import { isMissingCanonicalOwnerSchema } from "@/lib/auth/canonical-owner-schema";

describe("ausencia demostrada del esquema Owner canónico", () => {
  it.each(["organization_members", "organizations"])(
    "reconoce únicamente la relación canónica %s",
    (table) => {
      expect(
        isMissingCanonicalOwnerSchema({
          code: "42P01",
          schema: "zaltyko",
          table,
        })
      ).toBe(true);
      expect(
        isMissingCanonicalOwnerSchema({
          code: "42P01",
          message: `relation "zaltyko.${table}" does not exist`,
        })
      ).toBe(true);
    }
  );

  it("reconoce el namespace canónico ausente por campos o mensaje cualificado", () => {
    expect(
      isMissingCanonicalOwnerSchema({ code: "3F000", schema: "zaltyko" })
    ).toBe(true);
    expect(
      isMissingCanonicalOwnerSchema({
        code: "3F000",
        message: 'schema "zaltyko" does not exist',
      })
    ).toBe(true);
  });

  it.each([
    { code: "42P01", schema: "public", table: "organizations" },
    { code: "42P01", schema: "other", table: "organization_members" },
    { code: "42P01", table: "organizations" },
    { code: "42P01", message: 'relation "organizations" does not exist' },
    {
      code: "42P01",
      message: 'relation "public.organizations" does not exist',
    },
    { code: "42P01", schema: "zaltyko", table: "persons" },
    {
      code: "42P01",
      schema: "public",
      table: "organizations",
      message: 'relation "zaltyko.organizations" does not exist',
    },
    {
      code: "3F000",
      schema: "public",
      message: 'schema "zaltyko" does not exist',
    },
    {
      code: "42501",
      schema: "zaltyko",
      table: "organization_members",
      message: 'relation "zaltyko.organization_members" does not exist',
    },
    new Error("Synthetic connection failure"),
    null,
    undefined,
  ])("no convierte otro error o namespace en un alta nueva: %#", (error) => {
    expect(isMissingCanonicalOwnerSchema(error)).toBe(false);
  });

  it("inspecciona una causa PostgreSQL cualificada dentro de un wrapper sin código", () => {
    expect(
      isMissingCanonicalOwnerSchema({
        message: "Synthetic query wrapper",
        cause: {
          code: "42P01",
          message: 'relation "zaltyko.organizations" does not exist',
        },
      })
    ).toBe(true);
    expect(
      isMissingCanonicalOwnerSchema({
        cause: { code: "42P01", schema: "public", table: "organizations" },
      })
    ).toBe(false);
  });

  it("no sustituye un error explícito por otro distinto encontrado en cause", () => {
    const cause = { code: "42P01", schema: "zaltyko", table: "organizations" };
    expect(isMissingCanonicalOwnerSchema({ code: "42501", cause })).toBe(false);
    expect(
      isMissingCanonicalOwnerSchema({
        code: "42P01",
        schema: "public",
        table: "organizations",
        cause,
      })
    ).toBe(false);
  });

  it("acota causas cíclicas o excesivamente profundas", () => {
    const cycle: { cause?: unknown } = {};
    cycle.cause = cycle;
    expect(isMissingCanonicalOwnerSchema(cycle)).toBe(false);
    let deep: unknown = {
      code: "42P01",
      schema: "zaltyko",
      table: "organizations",
    };
    for (let index = 0; index < 6; index += 1) deep = { cause: deep };
    expect(isMissingCanonicalOwnerSchema(deep)).toBe(false);
  });
});
