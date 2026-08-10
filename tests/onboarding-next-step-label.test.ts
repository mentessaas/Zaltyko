import { describe, expect, it } from "vitest";

import {
  canonicalChecklistLabel,
  listCanonicalLabels,
  resolveNextStep,
  resolveNextStepLabel,
  type ChecklistRowLike,
} from "@/lib/onboarding/next-step-label";
import { isNextStepKey } from "@/lib/onboarding/next-step-urls";
import { CHECKLIST_DEFINITIONS } from "@/lib/onboarding-utils";

describe("onboarding/next-step-label (ZAL-324 Gap 1, Opcion A)", () => {
  const appUrl = "https://zaltyko.com";

  const rows = (overrides: Partial<ChecklistRowLike>[] = []): ChecklistRowLike[] =>
    CHECKLIST_DEFINITIONS.map((definition, index) => ({
      key: definition.key,
      label: definition.label,
      status: "pending",
      ...(overrides[index] ?? {}),
    }));

  it("toda clave del catalogo tiene etiqueta canonica y URL en el allowlist", () => {
    for (const { key, label } of listCanonicalLabels()) {
      expect(label.length).toBeGreaterThan(0);
      expect(isNextStepKey(key)).toBe(true);
    }
  });

  it("prefiere CHECKLIST_DEFINITIONS.label sobre la fila persistida (drift del seed)", () => {
    const stale = rows([{ label: "Etiqueta vieja de una academia ya sembrada" }]);
    const resolved = resolveNextStep(stale, appUrl);
    expect(resolved?.key).toBe(CHECKLIST_DEFINITIONS[0].key);
    expect(resolved?.label).toBe(CHECKLIST_DEFINITIONS[0].label);
    expect(resolved?.labelSource).toBe("definition");
  });

  it("cae a la fila cuando la clave no esta en el catalogo", () => {
    expect(canonicalChecklistLabel("clave_legacy")).toBeNull();
    expect(resolveNextStepLabel("clave_legacy", "  Etiqueta legacy  ")).toEqual({
      label: "Etiqueta legacy",
      labelSource: "row",
    });
  });

  it("lanza si no hay etiqueta canonica ni de fila", () => {
    expect(() => resolveNextStepLabel("clave_legacy", "   ")).toThrow(/no resoluble/);
    expect(() => resolveNextStepLabel("clave_legacy", null)).toThrow(/no resoluble/);
  });

  it("salta items completed y skipped y devuelve el primer pending", () => {
    const partial = rows([
      { status: "completed" },
      { status: "skipped" },
      { status: "pending" },
    ]);
    const resolved = resolveNextStep(partial, appUrl);
    expect(resolved?.key).toBe(CHECKLIST_DEFINITIONS[2].key);
    expect(resolved?.label).toBe(CHECKLIST_DEFINITIONS[2].label);
  });

  it("devuelve null cuando el checklist esta completo", () => {
    const done = CHECKLIST_DEFINITIONS.map((definition) => ({
      key: definition.key,
      label: definition.label,
      status: "completed",
    }));
    expect(resolveNextStep(done, appUrl)).toBeNull();
  });

  it("resuelve la URL desde el allowlist de Gap 2", () => {
    const resolved = resolveNextStep(rows(), appUrl);
    expect(resolved?.url.startsWith(appUrl)).toBe(true);
    expect(resolved?.url).not.toContain("undefined");
  });

  it("rechaza una clave pendiente fuera del allowlist de URLs", () => {
    const bad: ChecklistRowLike[] = [
      { key: "clave_inexistente", label: "X", status: "pending" },
    ];
    expect(() => resolveNextStep(bad, appUrl)).toThrow(/fuera del allowlist/);
  });
});
