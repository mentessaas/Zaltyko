import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import tailwindConfig from "../tailwind.config.mjs";

/**
 * Contrato del tono de aviso (decisión del 2026-11-12, PR-0/PR-1 de la
 * auditoría de coherencia visual): el aviso tiene tono propio en ocre y deja
 * de confundirse con el error (coral señal). Este test fija los tokens, su
 * contraste AA de día y de noche, el mapeo de las familias heredadas
 * (amber/yellow/orange → ocre) y que ningún componente de `components/ui`
 * pinte un «warning» con coral.
 */

type Scale = Record<string, string>;
const colors = (tailwindConfig as unknown as {
  theme: { extend: { colors: Record<string, unknown> } };
}).theme.extend.colors as Record<string, Scale & Record<string, unknown>>;

const SCALE_STEPS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]) {
  const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: [number, number, number], b: [number, number, number]) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function mix(fg: [number, number, number], bg: [number, number, number], alpha: number) {
  return fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha))) as [number, number, number];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sat = s / 100;
  const light = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255)) as [number, number, number];
}

function hue([r, g, b]: [number, number, number]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

const globals = readFileSync("src/app/globals.css", "utf8");

function darkVar(name: string): [number, number, number] {
  const darkBlock = globals.slice(globals.indexOf(".dark {"));
  const match = darkBlock.match(new RegExp(`--${name}:\\s*(\\d+)\\s+(\\d+)%\\s+(\\d+)%`));
  if (!match) throw new Error(`No se encontró --${name} en .dark`);
  return hslToRgb(Number(match[1]), Number(match[2]), Number(match[3]));
}

const WHITE = hexToRgb("#FFFFFF");

describe("tono de aviso (ocre): tokens", () => {
  const ochre = colors.ochre as Scale;

  it("define el ocre con relleno, tinta, lavado, línea y tinta de noche", () => {
    expect(ochre.DEFAULT).toBe("#C4851A");
    expect(ochre.ink).toBe("#7A500E");
    expect(ochre.wash).toBe("#F7ECD2");
    expect(ochre.line).toBe("#E3BC6E");
    expect(ochre.light).toBe("#F2C46B");
    for (const step of SCALE_STEPS) expect(ochre[step]).toMatch(/^#[0-9A-F]{6}$/);
    expect(ochre["100"]).toBe(ochre.wash);
    expect(ochre["500"]).toBe(ochre.DEFAULT);
    expect(ochre["700"]).toBe(ochre.ink);
  });

  it("no rompe los tokens existentes de señal y tapiz", () => {
    const signal = colors.signal as Scale;
    const mat = colors.mat as Scale;
    expect(signal.DEFAULT).toBe("#E5482A");
    expect(signal.ink).toBe("#B8331A");
    expect(signal.wash).toBe("#FDECE7");
    expect(signal.light).toBe("#FF8A73");
    expect(mat.DEFAULT).toBe("#1E3FA8");
    expect(mat.wash).toBe("#E8EDFB");
    expect(mat.deep).toBe("#14307F");
  });

  it("reasigna amber, yellow y orange al ocre, no a la señal", () => {
    const ochreScale = Object.fromEntries(SCALE_STEPS.map((step) => [step, ochre[step]]));
    const signalScale = Object.fromEntries(
      SCALE_STEPS.map((step) => [step, (colors.signal as Scale)[step]])
    );
    for (const family of ["amber", "yellow", "orange"]) {
      expect(colors[family]).toEqual(ochreScale);
      expect(colors[family]).not.toEqual(signalScale);
    }
    for (const family of ["red", "rose", "pink", "fuchsia"]) {
      expect(colors[family]).toEqual(signalScale);
    }
    const zaltyko = colors.zaltyko as unknown as { accent: Scale; coral: string };
    expect(zaltyko.accent.amber).toBe(ochre.ink);
    expect(zaltyko.coral).toBe("#C2391E");
  });

  it("se distingue del error por tono, no solo por claridad", () => {
    const ochreHue = hue(hexToRgb(ochre.ink));
    const signalHue = hue(hexToRgb((colors.signal as Scale).ink));
    expect(ochreHue).toBeGreaterThanOrEqual(30);
    expect(ochreHue).toBeLessThanOrEqual(50);
    expect(ochreHue - signalHue).toBeGreaterThanOrEqual(20);
  });
});

describe("tono de aviso (ocre): contraste AA", () => {
  const ochre = colors.ochre as Scale;
  const ink = hexToRgb(ochre.ink);
  const wash = hexToRgb(ochre.wash);

  it("cumple 4,5:1 de día con la tinta sobre su lavado, el blanco y el magnesio", () => {
    expect(contrast(ink, wash)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ink, WHITE)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ink, hexToRgb("#F4F6F2"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(WHITE, ink)).toBeGreaterThanOrEqual(4.5);
  });

  it("mantiene legibles los ámbar heredados más usados como texto", () => {
    expect(contrast(hexToRgb(ochre["600"]), WHITE)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hexToRgb(ochre["600"]), hexToRgb(ochre["100"]))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hexToRgb(ochre["700"]), hexToRgb(ochre["50"]))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hexToRgb(ochre["800"]), hexToRgb(ochre["100"]))).toBeGreaterThanOrEqual(4.5);
  });

  it("el punto de aviso llega a 3:1 como objeto gráfico", () => {
    expect(contrast(hexToRgb(ochre.DEFAULT), WHITE)).toBeGreaterThanOrEqual(3);
  });

  it("cumple 4,5:1 de noche con la tinta clara sobre el lavado nocturno", () => {
    const light = hexToRgb(ochre.light);
    for (const surface of [darkVar("card"), darkVar("background"), darkVar("muted")]) {
      const nightWash = mix(hexToRgb(ochre.DEFAULT), surface, 0.16);
      expect(contrast(light, nightWash)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(light, surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("globals.css aplica el ocre de noche con los mismos valores del tema", () => {
    expect(globals).toMatch(/\.dark \.bg-ochre-wash[^{]*\{\s*background-color: rgba\(196, 133, 26, 0\.16\);/);
    expect(globals).toMatch(new RegExp(`\\.dark \\.text-ochre-ink \\{\\s*color: ${ochre.light};`));
    expect(globals).toMatch(/\.dark \.border-ochre-line/);
    expect(hexToRgb(ochre.DEFAULT)).toEqual([196, 133, 26]);
  });

  it("los cuatro tonos de estado cumplen AA de día", () => {
    const signal = colors.signal as Scale;
    const mat = colors.mat as Scale;
    expect(contrast(hexToRgb(mat.deep), hexToRgb(mat.wash))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hexToRgb("#0B1430"), hexToRgb("#E9ECE6"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ink, wash)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hexToRgb(signal.ink), hexToRgb(signal.wash))).toBeGreaterThanOrEqual(4.5);
  });
});

function listUiSources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return listUiSources(path);
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

const UI_DIR = "src/components/ui";
const uiSources = listUiSources(UI_DIR).map((path) => ({
  file: relative(UI_DIR, path),
  source: readFileSync(path, "utf8"),
}));
const CORAL = /signal|coral|destructive|\b(?:red|rose|pink|fuchsia)-\d/;

describe("components/ui: el aviso nunca va en coral", () => {
  it("encuentra los componentes compartidos", () => {
    expect(uiSources.length).toBeGreaterThan(30);
  });

  it("ninguna variante «warning» usa coral y todas usan ocre", () => {
    const offenders: string[] = [];
    let warningVariants = 0;
    for (const { file, source } of uiSources) {
      const entries = source.matchAll(/\bwarning\s*:\s*(\{[^{}]*\}|"[^"]*"|\n\s*"[^"]*")/g);
      for (const [, value] of entries) {
        warningVariants += 1;
        if (CORAL.test(value) || !/ochre/.test(value)) offenders.push(`${file}: ${value.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
    // toast-provider, alert, badge y stats-card.
    expect(warningVariants).toBeGreaterThanOrEqual(4);
  });

  it("ningún «pending» ni «tip» se pinta en coral", () => {
    const offenders: string[] = [];
    for (const { file, source } of uiSources) {
      for (const [, value] of source.matchAll(/\b(?:pending|tip)\s*:\s*(\{[^{}]*\}|"[^"]*"|\n\s*"[^"]*")/g)) {
        if (CORAL.test(value)) offenders.push(`${file}: ${value.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no escribe ámbar, amarillo ni naranja de Tailwind: usa los tokens del ocre", () => {
    const offenders = uiSources
      .filter(({ source }) => /\b(?:amber|yellow|orange)-\d/.test(source))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("sin conexión es un aviso en ocre, no un error", () => {
    const offline = readFileSync(join(UI_DIR, "offline-banner.tsx"), "utf8");
    expect(offline).toContain("bg-ochre-wash");
    expect(offline).toContain("text-ochre-ink");
    expect(offline).not.toMatch(CORAL);

    const errorState = readFileSync(join(UI_DIR, "error-state.tsx"), "utf8");
    const offlineState = errorState.slice(errorState.indexOf("export function OfflineState"));
    const offlineMarkup = offlineState.slice(0, offlineState.indexOf("interface LoadingStateProps"));
    expect(offlineMarkup).toContain("bg-ochre-wash");
    expect(offlineMarkup).not.toMatch(CORAL);
    expect(globals).toMatch(/\.offline-banner \{[^}]*bg-ochre-wash[^}]*\}/);
  });

  it("los errores siguen en señal", () => {
    const toast = readFileSync(join(UI_DIR, "toast-provider.tsx"), "utf8");
    const errorBlock = toast.match(/\berror\s*:\s*(\{[^{}]*\})/)?.[1] ?? "";
    expect(errorBlock).toContain("bg-signal-wash");
    expect(errorBlock).toContain("text-signal-ink");
    const errorState = readFileSync(join(UI_DIR, "error-state.tsx"), "utf8");
    expect(errorState).toContain("bg-signal-wash");
  });
});

describe("errores heredados escritos en ámbar vuelven a la señal", () => {
  // Con amber → ocre, un error escrito en ámbar saldría como aviso. Estos se
  // corrigieron en el mismo PR para que nada cambie de sentido al fusionar.
  it("los errores de equipo y la factura vencida usan señal, no ámbar", () => {
    const teamAccess = readFileSync("src/components/owner/OwnerTeamAccessPanel.tsx", "utf8");
    const staff = readFileSync("src/components/owner-dashboard/OwnerStaffManager.tsx", "utf8");
    const notifications = readFileSync("src/components/notifications/NotificationCenter.tsx", "utf8");

    expect(teamAccess).toMatch(/\{error \? <p role="alert" className="[^"]*bg-signal-wash[^"]*text-signal-ink/);
    expect(teamAccess).not.toMatch(/role="alert" className="[^"]*amber-/);
    expect(staff).toMatch(/className="[^"]*bg-signal-wash[^"]*text-signal-ink[^"]*">\{mutationError\}/);
    expect(staff).not.toMatch(/amber-[^"]*">\{mutationError\}/);
    expect(notifications).toContain('if (type.includes("invoice_overdue")) return "bg-signal-wash text-signal-ink";');
    expect(notifications).toContain('if (type.includes("invoice_pending")) return "bg-ochre-wash text-ochre-ink";');
  });
});

describe("DESIGN.md documenta los tonos de estado", () => {
  const design = readFileSync("DESIGN.md", "utf8");

  it("incluye la tabla de éxito, información, aviso y error", () => {
    expect(design).toContain("### Tonos de estado");
    for (const tone of ["**Éxito**", "**Información**", "**Aviso**", "**Error**"]) {
      expect(design).toContain(tone);
    }
    expect(design).toContain("ochre-ink: \"#7A500E\"");
    expect(design).toContain("**The Aviso Rule.**");
  });
});
