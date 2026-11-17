import { describe, expect, it } from "vitest";

import {
  isOperatingOrganizationStatus,
  OPERATING_ORGANIZATION_STATUSES,
  ORGANIZATION_STATUSES,
} from "@/modules/organizations/domain/organization-status";

/**
 * Academia operativa = en prueba o activa (arreglo del 17-11-2026): toda
 * academia nace `trial` y nada la pasa a `active`.
 */
describe("estado operativo de la academia", () => {
  it("en prueba y activa son operativas", () => {
    expect(OPERATING_ORGANIZATION_STATUSES).toEqual(["trial", "active"]);
    expect(isOperatingOrganizationStatus("trial")).toBe(true);
    expect(isOperatingOrganizationStatus("active")).toBe(true);
  });

  it("suspendida y cerrada no lo son", () => {
    expect(isOperatingOrganizationStatus("suspended")).toBe(false);
    expect(isOperatingOrganizationStatus("closed")).toBe(false);
  });

  it("cualquier otro valor tampoco (desconocido, vacío o sin texto)", () => {
    for (const value of ["", "ACTIVE", " trial", "trialing", "pending", null, undefined, 1, {}]) {
      expect(isOperatingOrganizationStatus(value), String(value)).toBe(false);
    }
  });

  it("los cuatro estados son los del enum organization_status de la base", () => {
    expect(ORGANIZATION_STATUSES).toEqual(["trial", "active", "suspended", "closed"]);
    expect(ORGANIZATION_STATUSES.filter(isOperatingOrganizationStatus)).toEqual(["trial", "active"]);
  });
});
