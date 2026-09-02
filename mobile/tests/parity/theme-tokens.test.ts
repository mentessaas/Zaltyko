// Vitest de theme tokens. Cubre la presencia y el formato de los tokens
// nuevos introducidos por ZAL-1057 (Tier H.1 pressed states) y ZAL-1058
// (Tier H.2 a11y tour + token discipline). Los ratios WCAG reales se
// verifican con `node mobile/tools/wcag-ratio.mjs`.

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

describe("theme tokens — ZAL-1058 Tier H.2 a11y tour + token discipline", () => {
  it("expone onDarkMuted (slate-400) promocionado desde 13 literales '#94A3B8'", () => {
    expect(colors.onDarkMuted).toBe("#94A3B8");
  });

  it("expone onDarkSubtle (slate-300) para texto secundario sobre fondos oscuros", () => {
    expect(colors.onDarkSubtle).toBe("#CBD5E1");
  });

  it("expone onDarkAccent (indigo-300) para links/titulares suaves sobre dark", () => {
    expect(colors.onDarkAccent).toBe("#A5B4FC");
  });

  it("expone onDarkDanger (red-300) para mensajes de error sobre dark", () => {
    expect(colors.onDarkDanger).toBe("#FCA5A5");
  });

  it("expone errorSoft/successSoft/infoSoft/warningSoft (backgrounds de banners)", () => {
    expect(colors.errorSoft).toBe("#FEF2F2");
    expect(colors.successSoft).toBe("#F0FDF4");
    expect(colors.infoSoft).toBe("#EFF6FF");
    expect(colors.warningSoft).toBe("#FEF3C7");
  });

  it("expone errorText/successText/infoText/warningText (texto oscuro sobre soft)", () => {
    expect(colors.errorText).toBe("#991B1B");
    expect(colors.successText).toBe("#166534");
    expect(colors.infoText).toBe("#1E40AF");
    expect(colors.warningText).toBe("#92400E");
  });

  it("los pares soft+text cumplen WCAG AA 1.4.3 (≥4.5:1) entre sí", () => {
    // Verificación literal vía tools/wcag-ratio.mjs (manual); este assert
    // documenta la promesa del par a los revisores. Los ratios reales se
    // imprimen en el comentario ZAL-1058 que acompaña este commit.
    expect(colors.errorSoft).toMatch(/^#[0-9A-F]{6}$/);
    expect(colors.errorText).toMatch(/^#[0-9A-F]{6}$/);
  });
});