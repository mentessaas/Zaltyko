import { describe, expect, it } from "vitest";

import { normalizeOwnerGuardianContact } from "@/modules/families/application/owner-guardian-contacts";

describe("normalización de contactos Owner de tutor", () => {
  it("normaliza correo sin conservar espacios ni diferencias de mayúsculas", () => {
    expect(normalizeOwnerGuardianContact("email", "  QA.Parent+1@Example.COM ")).toEqual({
      success: true,
      value: "qa.parent+1@example.com",
      normalizedValue: "qa.parent+1@example.com",
    });
  });

  it("rechaza teléfonos que requerirían adivinar el prefijo internacional", () => {
    expect(normalizeOwnerGuardianContact("phone", "612345678")).toMatchObject({
      success: false,
    });
  });

  it("acepta solo teléfono explícito E.164", () => {
    expect(normalizeOwnerGuardianContact("phone", "+34612345678")).toEqual({
      success: true,
      value: "+34612345678",
      normalizedValue: "+34612345678",
    });
  });

  it("rechaza correos vacíos, mal formados y más largos que el límite", () => {
    expect(normalizeOwnerGuardianContact("email", "   ")).toMatchObject({
      success: false,
    });
    expect(normalizeOwnerGuardianContact("email", "not-an-email")).toMatchObject({
      success: false,
    });
    expect(
      normalizeOwnerGuardianContact("email", `${"a".repeat(248)}@x.test`)
    ).toMatchObject({ success: false });
  });
});
