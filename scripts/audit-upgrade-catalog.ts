#!/usr/bin/env tsx

import { readFile } from "node:fs/promises";
import path from "node:path";
import { dryRunUpgradeCatalog, type UpgradeSkillRow, type UpgradeVideoRow } from "@/lib/skills/upgrade-catalog-mapper";

const upgradeRoot = process.argv[2] ?? "/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Upgrade Gymnastics";
const sourceVersion = process.env.UPGRADE_SOURCE_VERSION ?? "supabase-export-2026-07-17";

async function load<T>(fileName: string): Promise<T> {
  const filePath = path.join(upgradeRoot, "web/src/data/supabase", fileName);
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function main() {
  const skills = await load<UpgradeSkillRow[]>("skills.json");
  const videos = await load<UpgradeVideoRow[]>("skill_videos.json");
  const report = dryRunUpgradeCatalog(skills, videos, sourceVersion);

  console.log(JSON.stringify({
    source: report.source,
    source_version: report.source_version,
    total_rows: report.total_rows,
    normalized_rows: report.normalized_rows,
    duplicate_identity_rows: report.duplicate_identity_rows,
    needs_review_rows: report.needs_review_rows,
    video_rows: report.video_rows,
    linked_video_rows: report.linked_video_rows,
    orphan_video_rows: report.orphan_video_rows,
    writes_performed: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
