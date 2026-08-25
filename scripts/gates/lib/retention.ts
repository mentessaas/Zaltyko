/**
 * Retention helper for the operational gate runner.
 *
 * Background: ZAL-24 (calibration report) flagged that Zaltyko's previous log
 * retention window was 3 days, which made cost-waste triage impossible beyond
 * that horizon. ZAL-617 raises that floor to 14 days for the gate-quota logs.
 *
 * This helper is intentionally minimal: deterministic by the file's mtime
 * (so re-running it is idempotent), and never touches anything outside the
 * configured directory. Gates may call this on each run to keep the working
 * set bounded.
 *
 * What it does NOT do:
 *   - It does not rotate or compress; deleted files are unlinked. Callers that
 *     need cold storage should archive before invoking this helper.
 *   - It does not follow symlinks. The gates directory is intentionally
 *     plain files; if symlinks appear, they are reported and left alone.
 */
import * as fs from "node:fs";
import * as path from "node:path";

export interface RetentionResult {
  kept: string[];
  removed: string[];
  symlinks: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Remove files in `dir` whose mtime is older than `retentionDays`.
 *
 * @param dir          Directory to clean (created if missing).
 * @param retentionDays Retention window in days. Files older than this are removed.
 * @param now          Reference "now" used to compute ages. Defaults to `new Date()`.
 *                     Tests pass an explicit Date to keep the helper deterministic.
 *
 * Subdirectories are NOT recursed into. The gate-runner emits one file per run;
 * any nested structure would be a bug worth surfacing rather than silently
 * walking through it.
 */
export function applyRetention(
  dir: string,
  retentionDays: number,
  now: Date = new Date(),
): RetentionResult {
  if (retentionDays < 1) {
    throw new Error(`retentionDays must be >= 1, got ${retentionDays}`);
  }

  fs.mkdirSync(dir, { recursive: true });

  const cutoff = now.getTime() - retentionDays * DAY_MS;
  const kept: string[] = [];
  const removed: string[] = [];
  const symlinks: string[] = [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { kept, removed, symlinks };
    throw err;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      symlinks.push(full);
      continue;
    }
    if (entry.isDirectory()) {
      // Surface nested directories; the gate-runner layout is flat on purpose.
      symlinks.push(full);
      continue;
    }
    if (!entry.isFile()) continue;

    const stat = fs.statSync(full);
    if (stat.mtimeMs < cutoff) {
      fs.unlinkSync(full);
      removed.push(full);
    } else {
      kept.push(full);
    }
  }

  return { kept, removed, symlinks };
}