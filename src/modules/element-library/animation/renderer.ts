import type { AnimationFrame, ElementAnimationData } from "./types";

const ANGLE_STEP = 5;
const POSITION_STEP = 2;
const radians = (value: number) => (value * Math.PI) / 180;
const point = (angle: number, length: number): [number, number] => [Math.sin(radians(angle)) * length, -Math.cos(radians(angle)) * length];
const add = (a: readonly number[], b: readonly number[]): [number, number] => [a[0] + b[0], a[1] + b[1]];

type JointMap = Record<string, [number, number]>;

function joints(frame: AnimationFrame): JointMap {
  const angle = (index: number) => frame[index] * ANGLE_STEP;
  const pelvis: [number, number] = [frame[15] * POSITION_STEP, frame[16] * POSITION_STEP];
  const torso = angle(0);
  const upper = torso - angle(10) * frame[11];
  const front = Boolean(frame[14]);
  const mid = add(pelvis, point(torso, 23));
  const neck = add(mid, point(upper, 23));
  const out: JointMap = { pelvis, mid, neck, head: add(neck, point(upper + angle(9), 14)) };
  const side = (d: number) => (front ? point(upper + 90, d) : [0, 0]);
  for (const [tag, offset, upper, fore] of [["n", 1, 1, 2], ["f", -1, 3, 4]] as const) {
    const shoulder = add(neck, side(offset * 10));
    const elbow = add(shoulder, point(angle(upper), 23));
    out[`sh${tag}`] = shoulder;
    out[`el${tag}`] = elbow;
    out[`ha${tag}`] = add(elbow, point(angle(fore), 21));
  }
  for (const [tag, offset, thigh, shin] of [["n", 1, 5, 6], ["f", -1, 7, 8]] as const) {
    const hip = add(pelvis, front ? point(torso + 90, offset * 6) : [0, 0]);
    const knee = add(hip, point(angle(thigh), 34));
    const ankle = add(knee, point(angle(shin), 32));
    out[`hip${tag}`] = hip;
    out[`kn${tag}`] = knee;
    out[`an${tag}`] = ankle;
    out[`to${tag}`] = add(ankle, point(angle(shin), 9));
  }
  const yaw = radians(angle(12));
  if (yaw !== 0) {
    const pivotKey = (["han", "haf", "pelvis", "ton"] as const)[frame[13]] ?? "han";
    const pivot = out[pivotKey];
    const elevation = Math.sin(radians(25));
    for (const [key, [x, y]] of Object.entries(out)) {
      const dx = x - pivot[0];
      out[key] = [pivot[0] + dx * Math.cos(yaw), y + dx * Math.sin(yaw) * elevation];
    }
  }
  return out;
}

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
  const close = (a: number, b: number) => Math.abs(a - b) < 6;
  if (Boolean(frame[24])) out.push(...limb("f"));
  const torsoProfile = Boolean(frame[14]) ? TORSO_FRONT : TORSO_SIDE;
  if (!Boolean(frame[14]) && Math.abs(frame[10] * ANGLE_STEP) > 2) {
    out.push(seg("pelvis", "mid", halfProfile(torsoProfile, 0, 0.5)));
    out.push(seg("mid", "neck", halfProfile(torsoProfile, 0.5, 1)));
  } else {
    out.push(seg("pelvis", "neck", torsoProfile));
  }
  if (Boolean(frame[14])) {
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

function scene(data: ElementAnimationData): string {
  const [width] = data.size;
  const floor = `<line x1="14" y1="${data.floorY}" x2="${width - 14}" y2="${data.floorY}" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`;
  const metal = "currentColor";
  if (data.scene === "floor" || data.scene === "floor_pass") return floor;
  if (data.scene === "beam" || data.scene === "beam_mount") {
    const top = data.floorY - Math.round(1.25 * 85);
    const x0 = data.scene === "beam_mount" ? 330 : 16;
    const x1 = data.scene === "beam_mount" ? 755 : 344;
    const supports = data.scene === "beam_mount"
      ? `<polygon points="228,${data.floorY} 286,${data.floorY} 286,${data.floorY - 14}" fill="${metal}"/><rect x="400" y="${top + 9}" width="6" height="${data.floorY - top - 9}" fill="currentColor"/><rect x="679" y="${top + 9}" width="6" height="${data.floorY - top - 9}" fill="currentColor"/>`
      : `<rect x="96" y="${top + 9}" width="6" height="${data.floorY - top - 9}" fill="currentColor"/><rect x="258" y="${top + 9}" width="6" height="${data.floorY - top - 9}" fill="currentColor"/>`;
    return `${floor}${supports}<rect x="${x0}" y="${top}" width="${x1 - x0}" height="9" rx="3" fill="${metal}"/>`;
  }
  if (data.scene === "high_bar") {
    const y = data.floorY - Math.round(2.8 * 85);
    return `${floor}<rect x="178" y="${y}" width="4" height="${data.floorY - y}" fill="currentColor"/><circle cx="180" cy="${y}" r="5" fill="${metal}"/>`;
  }
  if (data.scene === "uneven_bars") {
    const low = data.floorY - Math.round(1.7 * 85); const high = data.floorY - Math.round(2.5 * 85);
    return `${floor}<polygon points="234,${data.floorY} 292,${data.floorY} 292,${data.floorY - 14}" fill="${metal}"/><polygon points="678,${data.floorY} 620,${data.floorY} 620,${data.floorY - 14}" fill="${metal}"/><rect x="388" y="${low}" width="4" height="${data.floorY - low}" fill="currentColor"/><circle cx="390" cy="${low}" r="4.5" fill="${metal}"/><rect x="518" y="${high}" width="4" height="${data.floorY - high}" fill="currentColor"/><circle cx="520" cy="${high}" r="4.5" fill="${metal}"/>`;
  }
  if (data.scene === "rings") return floor;
  if (data.scene === "parallel_bars") {
    const rail = data.floorY - Math.round(2 * 85);
    return `${floor}<line x1="40" y1="${rail - 7}" x2="330" y2="${rail - 7}" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><rect x="70" y="${rail}" width="5" height="${data.floorY - rail}" fill="currentColor"/><rect x="286" y="${rail}" width="5" height="${data.floorY - rail}" fill="currentColor"/><rect x="30" y="${rail - 3.5}" width="300" height="7" rx="3.5" fill="${metal}"/>`;
  }
  if (data.scene === "pommel_horse") {
    const top = data.floorY - Math.round(1.05 * 85);
    return `${floor}<rect x="132" y="${top + 26}" width="8" height="${data.floorY - top - 26}" fill="currentColor"/><rect x="220" y="${top + 26}" width="8" height="${data.floorY - top - 26}" fill="currentColor"/><rect x="108" y="${top}" width="144" height="28" rx="14" fill="${metal}"/><path d="M150 ${top + 1} v-9 a3 3 0 0 1 3 -3 h16 a3 3 0 0 1 3 3 v9 M188 ${top + 1} v-9 a3 3 0 0 1 3 -3 h16 a3 3 0 0 1 3 3 v9" fill="none" stroke="currentColor" stroke-width="5"/>`;
  }
  if (data.scene === "vault") {
    const top = data.floorY - Math.round(1.25 * 85);
    return `${floor}<polygon points="236,${data.floorY} 300,${data.floorY} 300,${data.floorY - 14}" fill="${metal}"/><path d="M406 ${data.floorY} l5 -${data.floorY - top - 12} h10 l5 ${data.floorY - top - 12} z" fill="currentColor"/><rect x="370" y="${top}" width="92" height="14" rx="7" fill="${metal}"/><rect x="478" y="${data.floorY - 8}" width="150" height="8" rx="3" fill="currentColor"/>`;
  }
  return floor;
}

function overlay(frame: AnimationFrame): string {
  if (!frame[21] && !frame[23]) return "";
  const j = joints(frame);
  const center: [number, number] = [(j.pelvis[0] + j.neck[0]) / 2, (j.pelvis[1] + j.neck[1]) / 2];
  const torso = frame[0] * ANGLE_STEP;
  return `<ellipse cx="${center[0].toFixed(1)}" cy="${center[1].toFixed(1)}" rx="26" ry="8" transform="rotate(${torso.toFixed(1)} ${center[0].toFixed(1)} ${center[1].toFixed(1)})" fill="none" stroke="currentColor" stroke-width="3" opacity=".8"/>`;
}

function posterBody(data: ElementAnimationData, frameIndexes: number[]): string {
  let out = scene(data);
  for (const index of frameIndexes.filter((frameIndex) => frameIndex !== data.poster.main)) {
    const ghost = data.frames[index];
    out += `<g opacity=".55">${overlay(ghost)}</g><g opacity=".16">${body(ghost)}</g>`;
  }
  out += overlay(data.frames[data.poster.main]) + body(data.frames[data.poster.main]);
  return out;
}

export function renderAnimationFrame(data: ElementAnimationData, index: number): string {
  const frame = data.frames[Math.max(0, Math.min(index, data.frames.length - 1))];
  const band = data.floorBand ? `<rect x="10" y="${data.floorY - 22}" width="${data.size[0] - 20}" height="70" rx="35" fill="currentColor" opacity=".08"/>` : "";
  const sceneDrawing = data.floorBand && data.scene === "floor" ? "" : scene(data);
  const behind = Math.sin(radians(frame[12] * ANGLE_STEP)) < -0.05;
  const drawing = `${overlay(frame)}${body(frame)}`;
  const layers = `${band}${behind ? "" : sceneDrawing}${drawing}${behind ? sceneDrawing : ""}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${data.size[0]} ${data.size[1] + data.headroom}" role="img" class="text-z-ink"><g transform="translate(0 ${data.headroom})">${layers}</g></svg>`;
}

export function renderPosterSvg(data: ElementAnimationData): string {
  const ghosts = data.poster.ghosts;
  const dy = data.headroom;
  const band = data.floorBand ? `<rect x="10" y="${data.floorY - 22}" width="${data.size[0] - 20}" height="70" rx="35" fill="currentColor" opacity=".08"/>` : "";
  const apparatus = data.floorBand && data.scene === "floor" ? "" : scene(data);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${data.size[0]} ${data.size[1] + dy}" role="img" class="text-z-ink"><g transform="translate(0 ${dy})">${band}${apparatus}${posterBody(data, ghosts).slice(scene(data).length)}</g></svg>`;
}
