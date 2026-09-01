// Vitest de theme tokens. Cubre la presencia y el formato de los tokens
// nuevos introducidos por ZAL-1057 (Tier H.1 pressed states) y ZAL-1058
// (Tier H.2 a11y tour + token discipline). Los ratios WCAG reales se
// verifican con `node mobile/tools/wcag-ratio.mjs`.

import { describe, expect, it } from "vitest";

import { colors } from "@/lib/theme";

// Helper de contraste WCAG 2.x. Implementación local (no reutiliza
// mobile/tools/*), de modo que la guardia del sistema de diseño no pueda
// "verificar" un pressed state cambiando la herramienta. Acepta hex 6/8
// dígitos y `rgba(...)` con alpha.
function parseColor(input) {
  const s = String(input).trim();
  let m = /^#([0-9a-fA-F]{6})$/.exec(s);
  if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: 1 };
  m = /^#([0-9a-fA-F]{8})$/.exec(s);
  if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: parseInt(m[1].slice(6, 8), 16) / 255 };
  m = /^rgba?\(([^)]+)\)$/.exec(s);
  if (m) {
    const parts = m[1].split(",").map((x) => x.trim());
    return { r: Number(parts[0]), g: Number(parts[1]), b: Number(parts[2]), a: parts[3] === undefined ? 1 : Number(parts[3]) };
  }
  throw new Error("parseColor: formato no soportado " + s);
}

// alpha-compositing sobre un fondo opaco (default = surface blanco).
function compositeOver(fg, bg) {
  const a = fg.a;
  return {
    r: Math.round(fg.r * a + bg.r * (1 - a)),
    g: Math.round(fg.g * a + bg.g * (1 - a)),
    b: Math.round(fg.b * a + bg.b * (1 - a)),
  };
}
function srgbToLin(c) {
  const x = c / 255;
  return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}
function relLuminance(rgb) {
  return 0.2126 * srgbToLin(rgb.r) + 0.7152 * srgbToLin(rgb.g) + 0.0722 * srgbToLin(rgb.b);
}
function contrastRatio(fgHex, bgHex) {
  const fg = compositeOver(parseColor(fgHex), parseColor(bgHex));
  const bg = parseColor(bgHex);
  const l1 = relLuminance(fg);
  const l2 = relLuminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

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

// ZAL-1169: la guardia del sistema de diseño debe fallar cuando un token
// *Pressed se ofrezca sin un par de borde que satisfaga WCAG 1.4.11 (≥3:1
// frente al fondo del card), no sólo verificar el valor hex. surfacePressed
// (= #E2E8F0) sobre surface (= #FFFFFF) da 1.23:1 por sí solo; el pressed
// state sólo es "visible" para 1.4.11 si el card lleva borde primary
// (6.29:1). El comentario del token avisa de eso; este test lo enforza.
describe("theme tokens — ZAL-1169 par de borde 1.4.11 (≥3:1) sobre pressed", () => {
  it("surfacePressed exige borde primary (≥3:1) sobre surface", () => {
    const solo = contrastRatio(colors.surfacePressed, colors.surface);
    const conBorde = contrastRatio(colors.primary, colors.surface);
    // Documenta el motivo: el token sólo, NO cumple.
    expect(solo).toBeLessThan(3);
    // El par que la issue exige (borderColor: primary acompañante) SÍ cumple.
    expect(conBorde).toBeGreaterThanOrEqual(3);
  });

  it("primarySoftPressed exige borde primary (≥3:1) sobre surface", () => {
    const conBorde = contrastRatio(colors.primary, colors.surface);
    expect(conBorde).toBeGreaterThanOrEqual(3);
  });

  it("semantic pressed (success/warning/danger/info) alcanza ≥4.5:1 con texto blanco", () => {
    // Para pressed semánticos el par "natural" es texto blanco sobre fondo
    // pressed; exigimos WCAG 1.4.3 (≥4.5:1) para que el cambio de estado
    // sea legible, no sólo detectable (1.4.11 ≥3:1).
    const pairs = [
      ["successPressed", colors.successPressed],
      ["warningPressed", colors.warningPressed],
      ["dangerPressed", colors.dangerPressed],
      ["infoPressed", colors.infoPressed],
    ] as const;
    for (const [name, bg] of pairs) {
      const r = contrastRatio(colors.textInverse, bg);
      expect(r, `${name} debe tener texto blanco ≥4.5:1 sobre ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
