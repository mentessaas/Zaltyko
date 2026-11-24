import { execFileSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { renderPosterSvg } from "@/modules/element-library/animation/renderer";
import type { ElementAnimationData } from "@/modules/element-library/animation/types";

const root = process.cwd();
const animationDir = path.join(root, "scripts/element-library/animation");
const fixtureEdition = "fig-wag-2025-2028";
const fixtureKeys = ["fx_pike_jump", "fx_turn_3_wolf", "fx_split_leap_half_turn"];

function pythonFixture(key: string): { data: ElementAnimationData; svg: string } {
  const script = [
    "import json, sys",
    "from pathlib import Path",
    "sys.path.insert(0, sys.argv[1])",
    "import export_app, run_spec",
    "spec = json.loads(Path(sys.argv[2]).read_text())",
    "scene, timeline, _ = run_spec.build(spec)",
    "print(json.dumps({'data': export_app.encode_spec(spec, sys.argv[3]), 'svg': run_spec.poster_svg(spec, scene, timeline, 'parity')}))",
  ].join("\n");
  return JSON.parse(execFileSync("python3", [
    "-c", script, animationDir,
    path.join(animationDir, "specs", fixtureEdition, `${key}.json`), fixtureEdition,
  ], { encoding: "utf8" })) as { data: ElementAnimationData; svg: string };
}

const fixtures = new Map(fixtureKeys.map((key) => [key, pythonFixture(key)]));

function pathCoordinates(svg: string): number[][] {
  return [...svg.matchAll(/<path d="([^"]+)"/g)].map(([, d]) => [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map(([value]) => Number(value)));
}

describe("element library animation renderer", () => {
  it("exports small, quantized 30 fps records for three existing specs", () => {
    const sizes = fixtureKeys.map((key) => Buffer.byteLength(JSON.stringify(fixtures.get(key)!.data)));
    expect(Math.max(...sizes)).toBeLessThan(15 * 1024);
    expect(sizes.reduce((sum, size) => sum + size, 0) / sizes.length).toBeGreaterThan(0);
    expect(fixtureKeys.map((key) => fixtures.get(key)!.data.fps)).toEqual([30, 30, 30]);
  });

  it("keeps the Python pictogram silhouette geometry within the export quantization tolerance", () => {
    for (const key of fixtureKeys) {
      const { data, svg } = fixtures.get(key)!;
      const pythonPaths = pathCoordinates(svg);
      const typescriptPaths = pathCoordinates(renderPosterSvg(data));
      expect(typescriptPaths).toHaveLength(pythonPaths.length);
      for (let pathIndex = 0; pathIndex < pythonPaths.length; pathIndex += 1) {
        expect(typescriptPaths[pathIndex]).toHaveLength(pythonPaths[pathIndex].length);
        for (let coordinateIndex = 0; coordinateIndex < pythonPaths[pathIndex].length; coordinateIndex += 1) {
          expect(Math.abs(typescriptPaths[pathIndex][coordinateIndex] - pythonPaths[pathIndex][coordinateIndex])).toBeLessThanOrEqual(8);
        }
      }
    }
  });
});
