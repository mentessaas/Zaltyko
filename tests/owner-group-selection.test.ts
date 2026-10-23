import { describe, expect, it } from "vitest";

import { selectOwnerGroup } from "@/modules/groups/application/owner-group-selection";

const accessibleGroups = [
  { id: "group-a", name: "Iniciación" },
  { id: "group-b", name: "Avanzado" },
];

describe("selección explícita del grupo Owner", () => {
  it("mantiene el grupo pedido cuando está dentro del ámbito accesible", () => {
    expect(selectOwnerGroup(accessibleGroups, "group-b")).toBe(accessibleGroups[1]);
  });

  it("no cambia silenciosamente a otro grupo si el solicitado no es accesible", () => {
    expect(selectOwnerGroup(accessibleGroups, "group-no-disponible")).toBeNull();
  });

  it("usa el primer grupo solo cuando no se indicó una selección", () => {
    expect(selectOwnerGroup(accessibleGroups)).toBe(accessibleGroups[0]);
    expect(selectOwnerGroup([])).toBeNull();
  });
});
