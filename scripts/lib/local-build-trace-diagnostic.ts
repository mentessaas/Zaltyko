import { constants, closeSync, fstatSync, openSync, readSync } from "node:fs";
import { join } from "node:path";

export const MAX_TRACE_BYTES = 8 * 1024 * 1024;
const phases = [
  "next-build",
  "run-webpack-compiler",
  "static-generation",
  "node-file-trace-build",
  "apply-include-excludes",
] as const;
type Phase = (typeof phases)[number];
export type PhaseDuration = {
  phase: Phase;
  count: number;
  accumulatedDurationMs: number;
  maxDurationMs: number;
};

/** Only completed allowlisted spans; no attributes, paths or raw diagnostics. */
export function summarizeBuildTrace(bytes: Buffer): PhaseDuration[] {
  if (!Buffer.isBuffer(bytes) || bytes.length > MAX_TRACE_BYTES) return [];
  try {
    const totals = new Map<
      Phase,
      { count: number; sum: number; max: number }
    >();
    let count = 0;
    for (const line of bytes.toString("utf8").split("\n")) {
      if (!line.trim()) continue;
      const batch: unknown = JSON.parse(line);
      if (!Array.isArray(batch)) return [];
      for (const event of batch) {
        if (++count > 100_000) return [];
        if (!event || typeof event !== "object") continue;
        const { name, duration } = event as Record<string, unknown>;
        if (
          typeof name !== "string" ||
          !phases.includes(name as Phase) ||
          typeof duration !== "number" ||
          !Number.isSafeInteger(duration) ||
          duration < 0 ||
          duration > 86_400_000_000
        )
          continue;
        const phase = name as Phase;
        const prior = totals.get(phase) ?? { count: 0, sum: 0, max: 0 };
        if (!Number.isSafeInteger(prior.sum + duration)) return [];
        totals.set(phase, {
          count: prior.count + 1,
          sum: prior.sum + duration,
          max: Math.max(prior.max, duration),
        });
      }
    }
    return phases.flatMap((phase) => {
      const total = totals.get(phase);
      return total === undefined
        ? []
        : [
            {
              phase,
              count: total.count,
              accumulatedDurationMs: total.sum / 1000,
              maxDurationMs: total.max / 1000,
            },
          ];
    });
  } catch {
    return [];
  }
}

export function readBuildTraceSummary(root: string): PhaseDuration[] {
  let fd: number | undefined;
  try {
    fd = openSync(
      join(root, ".next", "trace"),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
    );
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_TRACE_BYTES) return [];
    const buffer = Buffer.alloc(MAX_TRACE_BYTES + 1);
    let size = 0;
    while (size < buffer.length) {
      const read = readSync(fd, buffer, size, buffer.length - size, null);
      if (!read) break;
      size += read;
    }
    return summarizeBuildTrace(buffer.subarray(0, size));
  } catch {
    return [];
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        /* Best effort diagnostic only. */
      }
    }
  }
}

/** Diagnostics must never replace the build error or bypass caller cleanup. */
export async function withBuildDiagnostic<T>(
  build: () => Promise<T>,
  read: () => PhaseDuration[],
  emit: (summary: PhaseDuration[]) => void
): Promise<T> {
  try {
    return await build();
  } finally {
    try {
      emit(read());
    } catch {
      /* Preserve build success/failure and caller cleanup. */
    }
  }
}
