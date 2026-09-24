import { createHash } from "node:crypto";

export const UPGRADE_SOURCE = "upgrade-gymnastics" as const;

export type UpgradeSkillRow = {
  id: string;
  discipline?: string | null;
  event?: string | null;
  element_group?: number | string | null;
  name?: string | null;
  description?: string | null;
  letter_grade?: string | null;
  value?: number | string | null;
  image_url?: string | null;
  known_as?: string | string[] | null;
  [key: string]: unknown;
};

export type UpgradeVideoRow = {
  id?: string | null;
  skill_id?: string | null;
  youtube_url?: string | null;
  start_time?: number | string | null;
  end_time?: number | string | null;
  platform?: string | null;
  [key: string]: unknown;
};

export type NormalizedUpgradeSkill = {
  source: typeof UPGRADE_SOURCE;
  source_id: string;
  source_version: string;
  content_hash: string;
  discipline: "MAG" | "WAG";
  apparatus: string;
  element_group: string | null;
  name: string;
  aliases: string[];
  description: string | null;
  difficulty: string | null;
  code_value: number | null;
  image_url: string | null;
  video_refs: Array<{
    source_id: string | null;
    url: string;
    platform: string;
    start_time: number | null;
    end_time: number | null;
  }>;
  status: "active" | "needs_review";
  quality_flags: string[];
};

export type UpgradeCatalogDryRun = {
  source: typeof UPGRADE_SOURCE;
  source_version: string;
  total_rows: number;
  normalized_rows: number;
  duplicate_identity_rows: number;
  needs_review_rows: number;
  video_rows: number;
  linked_video_rows: number;
  orphan_video_rows: number;
  rows: NormalizedUpgradeSkill[];
};

const APPARATUS_BY_EVENT: Record<string, string> = {
  fx: "floor",
  ph: "pommel_horse",
  sr: "rings",
  vt: "vault",
  pb: "parallel_bars",
  hb: "horizontal_bar",
  ub: "uneven_bars",
  bb: "balance_beam",
};

const DISCIPLINE_BY_SOURCE: Record<string, "MAG" | "WAG"> = {
  men: "MAG",
  women: "WAG",
  mag: "MAG",
  wag: "WAG",
};

const ELEMENT_GROUPS = new Set(["I", "II", "III", "IV", "V", "VI"]);

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function romanElementGroup(value: unknown): string | null {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 6) return null;
  return ["I", "II", "III", "IV", "V", "VI"][number - 1] ?? null;
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function videoNumber(value: unknown): number | null {
  const parsed = numericValue(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function aliasesFrom(row: UpgradeSkillRow): string[] {
  const values = Array.isArray(row.known_as)
    ? row.known_as
    : typeof row.known_as === "string" && row.known_as.trim()
      ? [row.known_as]
      : [];
  const grade = typeof row.letter_grade === "string" ? row.letter_grade.trim().toUpperCase() : "";
  return Array.from(new Set([...values, grade].map((value) => value.trim()).filter(Boolean)));
}

function youtubeUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (url.hostname !== "youtube.com" && !url.hostname.endsWith(".youtube.com") && url.hostname !== "youtu.be") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeUpgradeSkill(
  row: UpgradeSkillRow,
  sourceVersion: string,
  videos: UpgradeVideoRow[] = [],
): NormalizedUpgradeSkill {
  const disciplineKey = typeof row.discipline === "string" ? row.discipline.trim().toLowerCase() : "";
  const discipline = DISCIPLINE_BY_SOURCE[disciplineKey];
  const eventKey = typeof row.event === "string" ? row.event.trim().toLowerCase() : "";
  const apparatus = APPARATUS_BY_EVENT[eventKey] ?? "";
  const elementGroup = romanElementGroup(row.element_group);
  const explicitName = typeof row.name === "string" ? row.name.trim() : "";
  const description = typeof row.description === "string" ? row.description.trim() || null : null;
  const name = explicitName || description || `Upgrade skill ${row.id}`;
  const codeValue = numericValue(row.value);
  const difficulty = codeValue === null ? null : codeValue < 0.3 ? "beginner" : codeValue < 0.5 ? "intermediate" : "advanced";
  const qualityFlags: string[] = [];
  if (!discipline) qualityFlags.push("unknown_discipline");
  if (!apparatus) qualityFlags.push("unknown_apparatus");
  if (!elementGroup) qualityFlags.push("unknown_element_group");
  if (!explicitName) qualityFlags.push("name_derived_from_description");
  if (codeValue === null) qualityFlags.push("missing_code_value");

  const videoRefs = videos.flatMap((video) => {
    const url = youtubeUrl(video.youtube_url);
    if (!url) return [];
    return [{
      source_id: typeof video.id === "string" ? video.id : null,
      url,
      platform: typeof video.platform === "string" && video.platform.trim() ? video.platform : "youtube",
      start_time: videoNumber(video.start_time),
      end_time: videoNumber(video.end_time),
    }];
  });

  const normalized = {
    source: UPGRADE_SOURCE,
    source_id: row.id,
    source_version: sourceVersion,
    discipline: discipline ?? "MAG",
    apparatus,
    element_group: elementGroup,
    name,
    aliases: aliasesFrom(row),
    description,
    difficulty,
    code_value: codeValue,
    image_url: typeof row.image_url === "string" && row.image_url.trim() ? row.image_url.trim() : null,
    video_refs: videoRefs,
  };

  return {
    ...normalized,
    content_hash: sha256({ source_version: sourceVersion, source_row: row, video_refs: videoRefs }),
    status: qualityFlags.length > 0 ? "needs_review" : "active",
    quality_flags: qualityFlags,
  };
}

export function dryRunUpgradeCatalog(
  skills: UpgradeSkillRow[],
  videos: UpgradeVideoRow[],
  sourceVersion: string,
): UpgradeCatalogDryRun {
  const videosBySkill = new Map<string, UpgradeVideoRow[]>();
  for (const video of videos) {
    if (!video.skill_id) continue;
    const bucket = videosBySkill.get(video.skill_id) ?? [];
    bucket.push(video);
    videosBySkill.set(video.skill_id, bucket);
  }

  const rows = skills.map((skill) => normalizeUpgradeSkill(skill, sourceVersion, videosBySkill.get(skill.id) ?? []));
  const identities = new Map<string, number>();
  for (const row of rows) {
    const identity = [row.discipline, row.apparatus, row.name.toLocaleLowerCase(), row.code_value ?? ""].join("|");
    identities.set(identity, (identities.get(identity) ?? 0) + 1);
  }
  const duplicateIdentityRows = rows.filter((row) => {
    const identity = [row.discipline, row.apparatus, row.name.toLocaleLowerCase(), row.code_value ?? ""].join("|");
    return (identities.get(identity) ?? 0) > 1;
  }).length;
  const linkedVideoRows = videos.filter((video) => Boolean(video.skill_id && skills.some((skill) => skill.id === video.skill_id))).length;

  return {
    source: UPGRADE_SOURCE,
    source_version: sourceVersion,
    total_rows: skills.length,
    normalized_rows: rows.length,
    duplicate_identity_rows: duplicateIdentityRows,
    needs_review_rows: rows.filter((row) => row.status === "needs_review").length,
    video_rows: videos.length,
    linked_video_rows: linkedVideoRows,
    orphan_video_rows: videos.length - linkedVideoRows,
    rows,
  };
}
