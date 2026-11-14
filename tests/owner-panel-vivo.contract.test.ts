import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { ownerTone, ownerUi } from "@/components/owner-dashboard/owner-ui";

/**
 * Panel vivo de `/owner` (gráficas, esqueletos y respuestas): sigue el mundo
 * «Magnesio sobre tapiz», carga las gráficas en diferido y respeta el
 * movimiento reducido.
 */

const CHART_DIR = "src/components/owner-dashboard/charts";
const FILES = [
  `${CHART_DIR}/AttendanceWeeksChart.tsx`,
  `${CHART_DIR}/ClassOccupancyChart.tsx`,
  `${CHART_DIR}/MonthlyFeesChart.tsx`,
  `${CHART_DIR}/AthleteSignupsChart.tsx`,
  `${CHART_DIR}/OwnerChartPanels.tsx`,
  `${CHART_DIR}/chart-parts.tsx`,
  `${CHART_DIR}/owner-charts-lazy.tsx`,
  `${CHART_DIR}/use-chart-motion.ts`,
  "src/components/owner-dashboard/OwnerFeedback.tsx",
] as const;

const read = (path: string) => readFileSync(path, "utf8");
const sources = FILES.map((file) => ({ file, source: read(file) }));

const GENERIC_FAMILIES =
  "gray|slate|zinc|neutral|stone|red|rose|pink|fuchsia|amber|yellow|orange|teal|emerald|green|cyan|sky|blue|indigo|violet|purple|lime";
const UTILITIES =
  "bg|text|border|border-[trblxy]|ring|outline|from|to|via|fill|stroke|divide|placeholder|decoration|accent|shadow|caret";

const FORBIDDEN: Array<[string, RegExp]> = [
  ["familia genérica de Tailwind", new RegExp(`\\b(?:${UTILITIES})-(?:${GENERIC_FAMILIES})-\\d{2,3}\\b`)],
  ["píldora (rounded-full)", /\brounded-full\b/],
  ["radio grande heredado", /\brounded-(?:2xl|3xl)\b/],
  ["radio arbitrario", /\brounded-\[/],
  ["negro", /\b(?:bg|text|border)-black\b/],
  ["alias zaltyko-*", /\b(?:bg|text|border|ring|outline)-zaltyko-/],
  ["hexadecimal suelto", /#[0-9A-Fa-f]{6}\b/],
  ["letter-spacing negativo", /\btracking-(?:tight|tighter|\[-)/],
  ["alias coral z-chalk-*", /\bz-chalk-/],
  ["texto degradado o halo", /\b(?:bg-gradient|bg-clip-text|drop-shadow)\b/],
  ["rebote", /\b(?:animate-bounce|bounce|spring)\b/],
  ["superficie que se levanta al pasar el ratón", /hover:-translate-y/],
  ["titular h1 fuera de PageHeader", /<h1\b/],
];

describe("gráficas y respuestas de /owner en Magnesio", () => {
  it.each(FORBIDDEN)("no usan %s", (_label, pattern) => {
    const offenders = sources.flatMap(({ file, source }) =>
      source
        .split("\n")
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => pattern.test(line))
        .map(({ line, index }) => `${file}:${index + 1}: ${line.trim()}`)
    );
    expect(offenders).toEqual([]);
  });

  it("el coral solo pinta lo vencido sin cobrar (The Señal Rule)", () => {
    for (const file of [
      `${CHART_DIR}/AttendanceWeeksChart.tsx`,
      `${CHART_DIR}/ClassOccupancyChart.tsx`,
      `${CHART_DIR}/AthleteSignupsChart.tsx`,
    ]) {
      expect(read(file), file).not.toMatch(/signal/);
    }
    const fees = read(`${CHART_DIR}/MonthlyFeesChart.tsx`);
    expect(fees).toMatch(/key: "overdue", label: "Vencido sin cobrar", swatch: "bg-signal"/);
    expect(fees).toMatch(/key: "pending", label: "Por vencer", swatch: "bg-ochre"/);
  });
});

describe("carga diferida y movimiento", () => {
  it("cada gráfica llega en su propio trozo, sin render en servidor y con esqueleto", () => {
    const lazy = read(`${CHART_DIR}/owner-charts-lazy.tsx`);
    expect(lazy.match(/dynamic\(/g)).toHaveLength(4);
    expect(lazy.match(/ssr: false/g)).toHaveLength(4);
    expect(lazy.match(/loading: \(\) => <OwnerChartSkeleton/g)).toHaveLength(4);
    const panels = read(`${CHART_DIR}/OwnerChartPanels.tsx`);
    expect(panels).not.toMatch(/from "\.\/(?:AttendanceWeeksChart|ClassOccupancyChart|MonthlyFeesChart|AthleteSignupsChart)"/);
  });

  it("no añade librerías de gráficas: barras propias con CSS", () => {
    for (const { file, source } of sources) {
      expect(source, file).not.toMatch(/from "(?:recharts|framer-motion|chart\.js|d3)/);
    }
  });

  it("el movimiento reducido apaga todas las animaciones del panel", () => {
    const globals = read("src/app/globals.css");
    const start = globals.indexOf("/* ===== Gráficas y respuestas del panel del club (/owner) ===== */");
    expect(start).toBeGreaterThan(-1);
    const block = globals.slice(start);
    const reduced = block.slice(block.indexOf("@media (prefers-reduced-motion: reduce)"));
    for (const name of ["zk-bar-rise", "zk-bar-grow", "zk-settle", "zk-stamp", "zk-check-draw", "zk-bar-wait"]) {
      expect(block, name).toContain(`.${name}`);
      expect(reduced, name).toContain(`.${name}`);
    }
    // Aterrizaje clavado: la misma curva sin rebote del resto del sistema.
    expect(block).toContain("cubic-bezier(0.16, 1, 0.3, 1)");
    const motion = read(`${CHART_DIR}/use-chart-motion.ts`);
    expect(motion).toContain('"(prefers-reduced-motion: reduce)"');
  });

  it("los esqueletos vacíos no laten con movimiento reducido", () => {
    for (const file of [`${CHART_DIR}/chart-parts.tsx`, "src/components/owner-dashboard/OwnerFeedback.tsx"]) {
      const source = read(file);
      expect(source, file).not.toMatch(/(?<!motion-safe:)animate-pulse/);
    }
  });
});

describe("respuesta al pulsar en los botones del panel", () => {
  const classes = (value: string) => value.split(/\s+/);
  it.each([
    ["primaryButton", ownerUi.primaryButton],
    ["brandButton", ownerUi.brandButton],
    ["secondaryButton", ownerUi.secondaryButton],
    ["iconButton", ownerUi.iconButton],
    ["dangerButton", ownerTone.dangerButton],
    ["dangerOutlineButton", ownerTone.dangerOutlineButton],
  ])("%s se hunde a 0,99 y no lo hace con movimiento reducido", (_name, value) => {
    expect(classes(value)).toContain("active:scale-[0.99]");
    expect(classes(value)).toContain("motion-reduce:active:scale-100");
    expect(classes(value)).not.toContain("hover:-translate-y-0.5");
  });
});
