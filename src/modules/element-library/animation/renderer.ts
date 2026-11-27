import { ANIMATION_JOINTS, type AnimationFrame, type ElementAnimationData } from "./types";

const JOINT_COUNT = ANIMATION_JOINTS.length;
const COORDS = JOINT_COUNT * 2;
// flags follow the joint coordinates, in ANIMATION_FLAGS order
const FLAG = { front: COORDS, arch: COORDS + 1, farLayer: COORDS + 2, behind: COORDS + 3, twistRing: COORDS + 4, twistTotal: COORDS + 5, torso: COORDS + 6, frontAmount: COORDS + 7 } as const;

type JointMap = Record<string, [number, number]>;

const decoded = new WeakMap<ElementAnimationData, number[][]>();

/** Absolute frames: the export stores joint coordinates as differences from the previous frame. */
export function absoluteFrames(data: ElementAnimationData): number[][] {
  const cached = decoded.get(data);
  if (cached) return cached;
  const out: number[][] = [];
  data.frames.forEach((frame, index) => {
    const copy = [...frame];
    if (index > 0) for (let i = 0; i < COORDS; i += 1) copy[i] += out[index - 1][i];
    out.push(copy);
  });
  decoded.set(data, out);
  return out;
}

function joints(frame: AnimationFrame): JointMap {
  const out: JointMap = {};
  ANIMATION_JOINTS.forEach((name, index) => {
    out[name] = [frame[2 * index], frame[2 * index + 1]];
  });
  return out;
}

const radians = (value: number) => (value * Math.PI) / 180;

type WidthPoint = readonly [number, number];
type Profile = readonly [WidthPoint[], WidthPoint[]];
const THIGH: Profile = [[[0, 7.4], [0.3, 7.7], [1, 5.4]], [[0, 7.2], [0.45, 7.2], [1, 5.2]]];
const SHIN: Profile = [[[0, 5.2], [0.55, 4.6], [1, 3]], [[0, 5.2], [0.28, 5.7], [1, 2.9]]];
const FOOT: Profile = [[[0, 3], [1, 1.2]], [[0, 3], [1, 1.3]]];
const UARM: Profile = [[[0, 4.7], [0.45, 4.8], [1, 3.9]], [[0, 4.6], [0.4, 4.5], [1, 3.9]]];
const FARM: Profile = [[[0, 3.9], [0.25, 4], [1, 2.7]], [[0, 3.9], [0.3, 3.8], [1, 2.7]]];
const HAND: Profile = [[[0, 2.7], [0.5, 2.9], [1, 1.7]], [[0, 2.7], [0.5, 2.8], [1, 1.7]]];
const TORSO_SIDE: Profile = [[[0, 8.5], [0.35, 7.2], [0.72, 10.4], [1, 7.2]], [[0, 9], [0.35, 7], [0.72, 9.2], [1, 7]]];
const TORSO_FRONT: Profile = [[[0, 9], [0.4, 8], [0.78, 13.5], [1, 11.5]], [[0, 9], [0.4, 8], [0.78, 13.5], [1, 11.5]]];

function widthAt(t: number, profile: WidthPoint[]): number {
  for (let i = 0; i < profile.length - 1; i += 1) {
    const [t0, w0] = profile[i];
    const [t1, w1] = profile[i + 1];
    if (t0 <= t && t <= t1) {
      const u = (t - t0) / (t1 - t0 || 1);
      const smooth = u * u * (3 - 2 * u);
      return w0 + (w1 - w0) * smooth;
    }
  }
  return profile.at(-1)?.[1] ?? 0;
}

function halfProfile(profile: Profile, start: number, end: number): Profile {
  const cut = (points: WidthPoint[]) => [
    [0, widthAt(start, points)],
    ...points.filter(([t]) => t > start && t < end).map(([t, width]): WidthPoint => [(t - start) / (end - start), width]),
    [1, widthAt(end, points)],
  ] as WidthPoint[];
  return [cut(profile[0]), cut(profile[1])];
}

function smoothPath(points: [number, number][]): string {
  const n = points.length;
  const f = (p: readonly number[]) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
  let d = `M${f(points[0])}`;
  for (let i = 0; i < n; i += 1) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    const c1: [number, number] = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: [number, number] = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1)} ${f(c2)} ${f(p2)}`;
  }
  return `${d} Z`;
}

function muscle(a: [number, number], b: [number, number], profile: Profile): string {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy) || 1;
  const normal: [number, number] = [-dy / length, dx / length];
  const along: [number, number] = [dx / length, dy / length];
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i <= 10; i += 1) {
    const t = i / 10;
    const center: [number, number] = [a[0] + dx * t, a[1] + dy * t];
    const wl = widthAt(t, profile[0]);
    const wr = widthAt(t, profile[1]);
    left.push([center[0] + normal[0] * wl, center[1] + normal[1] * wl]);
    right.push([center[0] - normal[0] * wr, center[1] - normal[1] * wr]);
  }
  const cap = (center: [number, number], width: number): [number, number][] =>
    Array.from({ length: 5 }, (_, i) => {
      const theta = (Math.PI * (i + 1)) / 6;
      return [center[0] + width * (normal[0] * Math.cos(theta) + along[0] * Math.sin(theta)), center[1] + width * (normal[1] * Math.cos(theta) + along[1] * Math.sin(theta))];
    });
  const wb = (widthAt(1, profile[0]) + widthAt(1, profile[1])) / 2;
  const wa = (widthAt(0, profile[0]) + widthAt(0, profile[1])) / 2;
  const capA = cap(a, wa).map(([x, y]) => [2 * a[0] - x, 2 * a[1] - y] as [number, number]);
  return smoothPath([...left, ...cap(b, wb), ...right.reverse(), ...capA]);
}

function body(frame: AnimationFrame, opacity = 1): string {
  const j = joints(frame);
  const seg = (a: string, b: string, width: Profile) => `<path d="${muscle(j[a], j[b], width)}"/>`;
  const limb = (tag: "n" | "f") => {
    const fore = j[`ha${tag}`];
    const elbow = j[`el${tag}`];
    const direction = Math.atan2(fore[0] - elbow[0], -(fore[1] - elbow[1]));
    const handEnd: [number, number] = [fore[0] + Math.sin(direction) * 6, fore[1] - Math.cos(direction) * 6];
    return [
      `<path d="${muscle(j[`sh${tag}`], elbow, UARM)}"/>`,
      `<path d="${muscle(elbow, fore, FARM)}"/>`,
      `<path d="${muscle(fore, handEnd, HAND)}"/>`,
      `<path d="${muscle(j[`hip${tag}`], j[`kn${tag}`], THIGH)}"/>`,
      `<path d="${muscle(j[`kn${tag}`], j[`an${tag}`], SHIN)}"/>`,
      `<path d="${muscle(j[`an${tag}`], j[`to${tag}`], FOOT)}"/>`,
    ];
  };
  const out: string[] = [];
  if (Boolean(frame[FLAG.farLayer])) out.push(...limb("f"));
  const front = Boolean(frame[FLAG.front]);
  const torsoProfile = front ? TORSO_FRONT : TORSO_SIDE;
  if (!front && Boolean(frame[FLAG.arch])) {
    out.push(seg("pelvis", "mid", halfProfile(torsoProfile, 0, 0.5)));
    out.push(seg("mid", "neck", halfProfile(torsoProfile, 0.5, 1)));
  } else {
    out.push(seg("pelvis", "neck", torsoProfile));
  }
  if (front) {
    const bridge: Profile = [[[0, 6.2], [0.5, 5], [1, 6.2]], [[0, 6.6], [0.5, 5.6], [1, 6.6]]];
    out.push(seg("shf", "shn", bridge));
  }
  const neckVector: [number, number] = [j.head[0] - j.neck[0], j.head[1] - j.neck[1]];
  const neckLength = Math.hypot(...neckVector) || 1;
  const neckEnd: [number, number] = [j.neck[0] + neckVector[0] / neckLength * 8, j.neck[1] + neckVector[1] / neckLength * 8];
  const neckProfile: Profile = [[[0, 3.4], [1, 3]], [[0, 3.4], [1, 3]]];
  out.push(`<path d="${muscle(j.neck, neckEnd, neckProfile)}"/>`);
  const headAngle = Math.atan2(j.head[0] - j.neck[0], -(j.head[1] - j.neck[1])) * 180 / Math.PI;
  out.push(`<ellipse cx="${j.head[0].toFixed(1)}" cy="${j.head[1].toFixed(1)}" rx="8.2" ry="9.6" transform="rotate(${headAngle.toFixed(1)} ${j.head[0].toFixed(1)} ${j.head[1].toFixed(1)})"/>`);
  out.push(...limb("n"));
  return `<g opacity="${opacity}" fill="currentColor">${out.join("")}</g>`;
}

function turnsLabel(degrees: number): string {
  const quarters = Math.round(degrees / 90);
  const whole = Math.floor(quarters / 4);
  const rest = quarters - whole * 4;
  const fraction = ["", "¼", "½", "¾"][rest];
  return `${whole ? whole : ""}${fraction}` || "0";
}

/** Rings straps (far or near layer) and the twist ring with its count, as run_spec.overlay draws them. */
function overlay(data: ElementAnimationData, frame: AnimationFrame, layer: "far" | "near", label = true): string {
  let out = "";
  const j = joints(frame);
  if (data.rings) {
    const amount = frame[FLAG.frontAmount] / 100;
    const center = data.rings[0];
    const [tx, hand] = layer === "far" ? [center - 21 * amount, j.haf] : [center + 21 * amount, j.han];
    out += `<line x1="${+tx.toFixed(2)}" y1="6" x2="${hand[0].toFixed(1)}" y2="${(hand[1] - 9).toFixed(1)}" stroke="currentColor" stroke-opacity=".6" stroke-width="2"/>`;
    out += `<circle cx="${hand[0].toFixed(1)}" cy="${hand[1].toFixed(1)}" r="8.5" fill="none" stroke="currentColor" stroke-opacity=".6" stroke-width="4"/>`;
  }
  if (layer === "near" && frame[FLAG.twistRing]) {
    const center: [number, number] = [(j.pelvis[0] + j.neck[0]) / 2, (j.pelvis[1] + j.neck[1]) / 2];
    const torso = frame[FLAG.torso];
    out += `<ellipse cx="${center[0].toFixed(1)}" cy="${center[1].toFixed(1)}" rx="26" ry="8" transform="rotate(${torso.toFixed(1)} ${center[0].toFixed(1)} ${center[1].toFixed(1)})" fill="none" stroke="currentColor" stroke-width="3" opacity=".8"/>`;
    const total = frame[FLAG.twistTotal];
    if (total && label) {
      let dx = Math.cos(radians(torso));
      let dy = Math.sin(radians(torso));
      if (dy > 0 || (Math.abs(dy) < 1e-6 && dx < 0)) { dx = -dx; dy = -dy; }
      if (Math.abs(dy) < 0.5) { dx *= 0.6; dy = dy * 0.6 - 0.8; }
      const lx = center[0] + 40 * dx;
      const ly = center[1] + 40 * dy;
      out += `<g transform="translate(${lx.toFixed(1)},${ly.toFixed(1)})"><rect x="-17" y="-11" width="34" height="22" rx="11" fill="currentColor" opacity=".9"/><text y="5" text-anchor="middle" font-family="Inter,Helvetica,Arial,sans-serif" font-size="14" font-weight="700" fill="#fff">${turnsLabel(total)}</text></g>`;
    }
  }
  return out;
}

function figure(data: ElementAnimationData, frame: AnimationFrame, opacity = 1, label = true): string {
  return overlay(data, frame, "far", label) + body(frame, opacity) + overlay(data, frame, "near", label);
}

function band(data: ElementAnimationData): string {
  return data.floorBand ? `<rect x="10" y="${data.floorY - 22}" width="${data.size[0] - 20}" height="70" rx="35" fill="currentColor" opacity=".08"/>` : "";
}

function apparatus(data: ElementAnimationData): string {
  return data.floorBand && data.scene === "floor" ? "" : data.sceneSvg;
}

function svg(data: ElementAnimationData, layers: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${data.size[0]} ${data.size[1] + data.headroom}" role="img" class="text-z-ink"><g transform="translate(0 ${data.headroom})">${layers}</g></svg>`;
}

export function renderAnimationFrame(data: ElementAnimationData, index: number): string {
  const frames = absoluteFrames(data);
  const frame = frames[Math.max(0, Math.min(index, frames.length - 1))];
  const sceneDrawing = apparatus(data);
  const behind = Boolean(frame[FLAG.behind]);
  return svg(data, `${band(data)}${behind ? "" : sceneDrawing}${figure(data, frame)}${behind ? sceneDrawing : ""}`);
}

export function renderPosterSvg(data: ElementAnimationData): string {
  const frames = absoluteFrames(data);
  const { main, ghosts } = data.poster;
  const inTwist = (k: number) => Boolean(frames[k][FLAG.twistRing]);
  let layers = band(data) + apparatus(data);
  for (const ghost of ghosts) {
    const lo = Math.min(ghost, main);
    const hi = Math.max(ghost, main);
    let label = false;
    for (let k = lo; k <= hi; k += 1) if (!inTwist(k)) { label = true; break; }
    const frame = frames[ghost];
    layers += `<g opacity=".55">${overlay(data, frame, "far", label)}</g>${body(frame, 0.16)}<g opacity=".55">${overlay(data, frame, "near", label)}</g>`;
  }
  layers += figure(data, frames[main]);
  return svg(data, layers);
}
