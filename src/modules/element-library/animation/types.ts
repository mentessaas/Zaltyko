export type AnimationFrame = readonly number[];

export const ANIMATION_JOINTS = [
  "pelvis", "mid", "neck", "head",
  "shn", "eln", "han", "shf", "elf", "haf",
  "hipn", "knn", "ann", "ton", "hipf", "knf", "anf", "tof",
] as const;

export const ANIMATION_FLAGS = ["front", "arch", "farLayer", "behind", "twistRing", "twistTotal", "torso", "frontAmount"] as const;

export type ElementAnimationData = {
  formatVersion: 2;
  edition: string;
  elementKey: string;
  scene: string;
  fps: number;
  size: [number, number];
  floorY: number;
  headroom: number;
  floorBand: boolean;
  /** Apparatus drawing exported from scenes.py, already recoloured to currentColor. */
  sceneSvg: string;
  /** Rings scene only: x of the rings anchor. */
  rings: [number] | null;
  joints: string[];
  jointEncoding: "delta";
  flags: string[];
  poster: { main: number; ghosts: number[] };
  /** Joint coordinates (first frame absolute, later frames as differences) followed by the flags. */
  frames: AnimationFrame[];
};
