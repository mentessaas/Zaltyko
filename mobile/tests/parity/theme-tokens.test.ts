// Vitest de theme tokens. Cubre la presencia y el formato de los tokens
// nuevos introducidos por ZAL-1057 (Tier H.1 pressed states). Los ratios
// WCAG reales se verifican con `node mobile/tools/wcag-ratio.mjs`.

import { describe, expect, it } from "vitest";

import { colors } from "@/lib/theme";

describe("theme tokens — ZAL-1057 Tier H.1 pressed states", () => {
  it("expone surfacePressed (slate-200) introducido en ZAL-1057", () => {
    expect(colors.surfacePressed).toBe("#E2E8F0");
  });

  it("expone primarySoftPressed (indigo-600 @ 28%) introducido en ZAL-1057", () => {
    expect(colors.primarySoftPressed).toBe("rgba(79, 70, 229, 0.28)");
  });

  it("expone dangerPressed (red-700) y lo promociona desde Button.tsx", () => {
    expect(colors.dangerPressed).toBe("#B91C1C");
  });

  it("expone semantic pressed pairs (success/warning/info) para uso futuro", () => {
    expect(colors.successPressed).toBe("#15803D");
    expect(colors.warningPressed).toBe("#B45309");
    expect(colors.infoPressed).toBe("#0369A1");
  });

  it("expone disabledOverlay (slate-100) distinto visualmente de surfacePressed", () => {
    expect(colors.disabledOverlay).toBe("#F1F5F9");
    expect(colors.disabledOverlay).not.toBe(colors.surfacePressed);
  });

  it("mantiene tokens originales sin cambios", () => {
    expect(colors.surface).toBe("#FFFFFF");
    expect(colors.surfaceMuted).toBe("#F8FAFC");
    expect(colors.primary).toBe("#4F46E5");
    expect(colors.primaryHover).toBe("#4338CA");
    expect(colors.success).toBe("#16A34A");
    expect(colors.warning).toBe("#F59E0B");
    expect(colors.danger).toBe("#DC2626");
    expect(colors.info).toBe("#0EA5E9");
  });
});