import { execFileSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { absoluteFrames, renderPosterSvg } from "@/modules/element-library/animation/renderer";
import { ANIMATION_FLAGS, ANIMATION_JOINTS, type ElementAnimationData } from "@/modules/element-library/animation/types";

const root = process.cwd();
const animationDir = path.join(root, "scripts/element-library/animation");
// one accepted element per apparatus and feature: spread arms and front view on rings, the shifted vault
// scene, the side dismount beam scene, camera turns (beam mount) and twisting dismounts
const fixtureList: [string, string][] = [
  ["fig-mag-2025-2028", "mrg_balandin_1_pull_up_to_swallow"],
  ["fig-mag-2025-2028", "mrg_azarian_slow_roll_bwd_to_cross"],
  ["fig-mag-2025-2028", "mvt_double_tsukahara_twist_360"],
  ["fig-mag-2025-2028", "mpb_dm_alvarez_hang_end_double_salto_bwd_straight"],
  ["fig-mag-2025-2028", "mhb_dm_double_salto_bwd_straight"],
  ["fig-wag-2025-2028", "bb_cartwheel"],
  ["fig-wag-2025-2028", "bb_flic_flac_side_full_twist_hip_circle_bwd"],
  ["fig-wag-2025-2028", "ub_dismount_underswing_salto_fwd_tucked_one_and_half_turn"],
];
const fixtureKeys = fixtureList.map(([, key]) => key);

function pythonFixture(fixtureEdition: string, key: string): { data: ElementAnimationData; svg: string } {
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

const fixtures = new Map(fixtureList.map(([edition, key]) => [key, pythonFixture(edition, key)]));

function pathCoordinates(svg: string): number[][] {
  return [...svg.matchAll(/<path d="([^"]+)"/g)].map(([, d]) => [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map(([value]) => Number(value)));
}

describe("element library animation renderer", () => {
  it("exports compact 30 fps records with the joint layout the browser expects", () => {
    const sizes = fixtureKeys.map((key) => Buffer.byteLength(JSON.stringify(fixtures.get(key)!.data)));
    expect(Math.max(...sizes)).toBeLessThan(40 * 1024);
    for (const key of fixtureKeys) {
      const { data } = fixtures.get(key)!;
      expect(data.fps).toBe(30);
      expect(data.formatVersion).toBe(2);
      expect(data.joints).toEqual([...ANIMATION_JOINTS]);
      expect(data.flags).toEqual([...ANIMATION_FLAGS]);
      expect(data.sceneSvg).not.toMatch(/url\(|#[0-9a-f]{3}/i);
    }
  });

  it("rebuilds absolute joints from the delta encoding", () => {
    const { data } = fixtures.get("mvt_double_tsukahara_twist_360")!;
    const frames = absoluteFrames(data);
    expect(frames).toHaveLength(data.frames.length);
    expect(frames[0]).toEqual([...data.frames[0]]);
    const last = frames.at(-1)!;
    const sum = data.frames.reduce((total, frame) => total + frame[0], 0);
    expect(last[0]).toBe(sum);
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
