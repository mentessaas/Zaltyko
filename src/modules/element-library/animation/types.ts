export type AnimationFrame = readonly number[];

export type ElementAnimationData = {
  formatVersion: 1;
  edition: string;
  elementKey: string;
  scene: string;
  fps: number;
  size: [number, number];
  floorY: number;
  headroom: number;
  floorBand: boolean;
  poster: { main: number; ghosts: number[] };
  frames: AnimationFrame[];
};
