import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";
import { performance } from "node:perf_hooks";

export const HOST_RESOURCE_SAMPLE_INTERVAL_MS = 1_000;
export const MAX_HOST_RESOURCE_SAMPLES = 250;
export const MAX_PROC_SOURCE_BYTES = 4 * 1024;

const procSources = {
  cpu: "/proc/stat",
  memory: "/proc/meminfo",
  cpuPressure: "/proc/pressure/cpu",
  memoryPressure: "/proc/pressure/memory",
  ioPressure: "/proc/pressure/io",
} as const;
type ProcSource = (typeof procSources)[keyof typeof procSources];
type ProcSourceReader = (
  path: ProcSource,
  maxBytes: number
) => string | undefined;
type ProcFileOps = {
  open(path: string, flags: number): number;
  isRegularFile(fd: number): boolean;
  read(
    fd: number,
    buffer: Buffer,
    offset: number,
    length: number,
    position: null
  ): number;
  close(fd: number): void;
};
const browserProjects = ["chromium", "firefox", "webkit"] as const;

export type BuildHostResourceMetrics = {
  scope: "host";
  sampleCount: number;
  unavailableSourceReads: number;
  durationMs: number | null;
  cpuBusyMaxPct: number | null;
  memoryAvailableMinMiB: number | null;
  memoryAvailableMinPct: number | null;
  swapUsedMaxMiB: number | null;
  cpuSomeAvg10MaxPct: number | null;
  memorySomeAvg10MaxPct: number | null;
  memoryFullAvg10MaxPct: number | null;
  ioSomeAvg10MaxPct: number | null;
  ioFullAvg10MaxPct: number | null;
};

type CpuCounters = { total: number; idle: number };
type Pressure = { some: number | null; full: number | null };

export function decodeFixedProcSourceBytes(
  path: string,
  buffer: Buffer,
  bytesRead: number
): string | undefined {
  if (
    !Object.values(procSources).includes(path as ProcSource) ||
    !Number.isSafeInteger(bytesRead) ||
    bytesRead < 0 ||
    bytesRead > buffer.length
  )
    return undefined;
  const cpu = path === procSources.cpu;
  if (cpu) {
    const prefix = buffer.subarray(
      0,
      Math.min(bytesRead, MAX_PROC_SOURCE_BYTES)
    );
    const newline = prefix.indexOf(10);
    return newline < 0 ? undefined : prefix.toString("utf8", 0, newline + 1);
  }
  if (bytesRead > MAX_PROC_SOURCE_BYTES) return undefined;
  return buffer.toString("utf8", 0, bytesRead);
}

function safeInteger(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseCpuCounters(text: string): CpuCounters | null {
  const line = text.split(/\r?\n/, 1)[0]?.trim();
  const match = /^cpu\s+([0-9 ]+)$/.exec(line ?? "");
  if (!match) return null;
  const values = match[1].trim().split(/\s+/).map(safeInteger);
  // Linux fields 9 and 10 (guest/guest_nice) duplicate user/nice; exclude them.
  if (values.length < 8 || values.length > 10 || values.some((v) => v === null))
    return null;
  const firstEight = (values as number[]).slice(0, 8);
  const total = firstEight.reduce((sum, value) => sum + value, 0);
  const idle = firstEight[3] + firstEight[4];
  return Number.isSafeInteger(total) && idle <= total ? { total, idle } : null;
}

function parseMemory(text: string) {
  const values = new Map<string, number>();
  for (const key of ["MemTotal", "MemAvailable", "SwapTotal", "SwapFree"]) {
    const match = new RegExp(`^${key}:\\s+(\\d+)\\s+kB\\s*$`, "m").exec(text);
    const kibibytes = match ? safeInteger(match[1]) : null;
    if (kibibytes !== null && kibibytes <= Number.MAX_SAFE_INTEGER / 1024)
      values.set(key, kibibytes * 1024);
  }
  const total = values.get("MemTotal");
  const available = values.get("MemAvailable");
  const swapTotal = values.get("SwapTotal");
  const swapFree = values.get("SwapFree");
  const validAvailable =
    total !== undefined &&
    total > 0 &&
    available !== undefined &&
    available <= total;
  return {
    availableMiB: validAvailable ? available / (1024 * 1024) : null,
    availablePct: validAvailable ? (available / total) * 100 : null,
    swapUsedMiB:
      swapTotal !== undefined && swapFree !== undefined && swapFree <= swapTotal
        ? (swapTotal - swapFree) / (1024 * 1024)
        : null,
  };
}

function parsePressure(text: string): Pressure {
  const values: Pressure = { some: null, full: null };
  for (const line of text.split(/\r?\n/)) {
    const match = /^(some|full)\s+(.+)$/.exec(line.trim());
    const avg10 =
      match && /(?:^|\s)avg10=(\d+(?:\.\d+)?)(?:\s|$)/.exec(match[2]);
    if (!match || !avg10) continue;
    const value = Number(avg10[1]);
    if (Number.isFinite(value) && value >= 0 && value <= 100)
      values[match[1] as "some" | "full"] = value;
  }
  return values;
}

/** Fixed procfs allowlist. CPU accepts only its complete first line within 4 KiB. */
export function readFixedLinuxProcSource(
  path: ProcSource,
  maxBytes = MAX_PROC_SOURCE_BYTES,
  io: ProcFileOps = {
    open: openSync,
    isRegularFile: (fd) => fstatSync(fd).isFile(),
    read: readSync,
    close: closeSync,
  }
): string | undefined {
  if (
    !Object.values(procSources).includes(path) ||
    maxBytes !== MAX_PROC_SOURCE_BYTES
  )
    return undefined;
  let fd: number | undefined;
  try {
    fd = io.open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
    );
    if (!io.isRegularFile(fd)) return undefined;
    const cpu = path === procSources.cpu;
    const buffer = Buffer.alloc(MAX_PROC_SOURCE_BYTES + (cpu ? 0 : 1));
    let size = 0;
    while (size < buffer.length) {
      const count = io.read(fd, buffer, size, buffer.length - size, null);
      if (count === 0) break;
      size += count;
      if (cpu) {
        const firstLine = decodeFixedProcSourceBytes(path, buffer, size);
        if (firstLine !== undefined) return firstLine;
      }
    }
    return decodeFixedProcSourceBytes(path, buffer, size);
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) {
      try {
        io.close(fd);
      } catch {
        // Best effort diagnostic only.
      }
    }
  }
}

export function shouldCollectBuildHostResourceMetrics(
  platform: string,
  env: NodeJS.ProcessEnv
): boolean {
  return (
    platform === "linux" &&
    env.GITHUB_ACTIONS === "true" &&
    env.CI === "true" &&
    env.RUNNER_OS === "Linux" &&
    browserProjects.some((project) => project === env.E2E_LOCAL_PROJECT)
  );
}

export function createBuildHostResourceSampler(
  enabled: boolean,
  options: {
    readText?: ProcSourceReader;
    now?: () => number;
    schedule?: (
      callback: () => void,
      delayMs: number
    ) => ReturnType<typeof setTimeout>;
    cancel?: (timer: ReturnType<typeof setTimeout>) => void;
  } = {}
) {
  const readText = options.readText ?? readFixedLinuxProcSource;
  const now = options.now ?? (() => performance.now());
  const schedule = options.schedule ?? setTimeout;
  const cancel = options.cancel ?? clearTimeout;
  let running = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let startedAt: number | null = null;
  let sampleCount = 0;
  let unavailableSourceReads = 0;
  let previousCpu: CpuCounters | null = null;
  let cpuBusyMaxPct: number | null = null;
  let memoryAvailableMinMiB: number | null = null;
  let memoryAvailableMinPct: number | null = null;
  let swapUsedMaxMiB: number | null = null;
  let cpuSomeAvg10MaxPct: number | null = null;
  let memorySomeAvg10MaxPct: number | null = null;
  let memoryFullAvg10MaxPct: number | null = null;
  let ioSomeAvg10MaxPct: number | null = null;
  let ioFullAvg10MaxPct: number | null = null;
  let finalSummary: BuildHostResourceMetrics | null = null;

  const clock = (): number | null => {
    try {
      const value = now();
      return Number.isFinite(value) && value >= 0 ? value : null;
    } catch {
      return null;
    }
  };
  const boundedRead = (path: ProcSource): string | undefined => {
    try {
      const text = readText(path, MAX_PROC_SOURCE_BYTES);
      if (typeof text !== "string") {
        unavailableSourceReads += 1;
        return undefined;
      }
      if (path === procSources.cpu) {
        const newline = text.indexOf("\n");
        if (newline < 0) {
          unavailableSourceReads += 1;
          return undefined;
        }
        const firstLine = text.slice(0, newline);
        if (Buffer.byteLength(firstLine, "utf8") >= MAX_PROC_SOURCE_BYTES) {
          unavailableSourceReads += 1;
          return undefined;
        }
        return firstLine;
      }
      if (Buffer.byteLength(text, "utf8") > MAX_PROC_SOURCE_BYTES) {
        unavailableSourceReads += 1;
        return undefined;
      }
      return text;
    } catch {
      unavailableSourceReads += 1;
      return undefined;
    }
  };
  const max = (current: number | null, next: number | null) =>
    next === null ? current : current === null ? next : Math.max(current, next);

  const sample = () => {
    if (!running || sampleCount >= MAX_HOST_RESOURCE_SAMPLES) return;
    sampleCount += 1;
    try {
      const cpuText = boundedRead(procSources.cpu);
      const memoryText = boundedRead(procSources.memory);
      const cpuPressureText = boundedRead(procSources.cpuPressure);
      const memoryPressureText = boundedRead(procSources.memoryPressure);
      const ioPressureText = boundedRead(procSources.ioPressure);

      const cpu = cpuText === undefined ? null : parseCpuCounters(cpuText);
      if (cpuText !== undefined && !cpu) unavailableSourceReads += 1;
      if (cpu && previousCpu) {
        const totalDelta = cpu.total - previousCpu.total;
        const idleDelta = cpu.idle - previousCpu.idle;
        if (totalDelta > 0 && idleDelta >= 0 && idleDelta <= totalDelta)
          cpuBusyMaxPct = max(
            cpuBusyMaxPct,
            ((totalDelta - idleDelta) / totalDelta) * 100
          );
      }
      if (cpu) previousCpu = cpu;

      if (memoryText !== undefined) {
        const memory = parseMemory(memoryText);
        if (memory.availableMiB !== null && memory.availablePct !== null) {
          memoryAvailableMinMiB =
            memoryAvailableMinMiB === null
              ? memory.availableMiB
              : Math.min(memoryAvailableMinMiB, memory.availableMiB);
          memoryAvailableMinPct =
            memoryAvailableMinPct === null
              ? memory.availablePct
              : Math.min(memoryAvailableMinPct, memory.availablePct);
        } else unavailableSourceReads += 1;
        if (memory.swapUsedMiB !== null)
          swapUsedMaxMiB = max(swapUsedMaxMiB, memory.swapUsedMiB);
      }

      if (cpuPressureText !== undefined) {
        const pressure = parsePressure(cpuPressureText);
        cpuSomeAvg10MaxPct = max(cpuSomeAvg10MaxPct, pressure.some);
        if (pressure.some === null) unavailableSourceReads += 1;
      }
      if (memoryPressureText !== undefined) {
        const pressure = parsePressure(memoryPressureText);
        memorySomeAvg10MaxPct = max(memorySomeAvg10MaxPct, pressure.some);
        memoryFullAvg10MaxPct = max(memoryFullAvg10MaxPct, pressure.full);
        if (pressure.some === null) unavailableSourceReads += 1;
      }
      if (ioPressureText !== undefined) {
        const pressure = parsePressure(ioPressureText);
        ioSomeAvg10MaxPct = max(ioSomeAvg10MaxPct, pressure.some);
        ioFullAvg10MaxPct = max(ioFullAvg10MaxPct, pressure.full);
        if (pressure.some === null) unavailableSourceReads += 1;
      }
    } catch {
      unavailableSourceReads += 1;
    }

    if (running && sampleCount < MAX_HOST_RESOURCE_SAMPLES) {
      try {
        // Delay from completion so even a slow read cannot exceed 1 sample/second.
        timer = schedule(sample, HOST_RESOURCE_SAMPLE_INTERVAL_MS);
      } catch {
        running = false;
      }
    }
  };

  const makeSummary = (): BuildHostResourceMetrics => {
    const endedAt = clock();
    const elapsed =
      startedAt !== null && endedAt !== null ? endedAt - startedAt : null;
    return {
      scope: "host",
      sampleCount,
      unavailableSourceReads,
      durationMs:
        elapsed !== null && Number.isFinite(elapsed) && elapsed >= 0
          ? Math.floor(elapsed)
          : null,
      cpuBusyMaxPct,
      memoryAvailableMinMiB,
      memoryAvailableMinPct,
      swapUsedMaxMiB,
      cpuSomeAvg10MaxPct,
      memorySomeAvg10MaxPct,
      memoryFullAvg10MaxPct,
      ioSomeAvg10MaxPct,
      ioFullAvg10MaxPct,
    };
  };

  return {
    start() {
      if (!enabled || running || stopped) return;
      running = true;
      startedAt = clock();
      sample();
    },
    stop(): BuildHostResourceMetrics | null {
      if (!enabled) return null;
      if (finalSummary) return finalSummary;
      running = false;
      stopped = true;
      if (timer !== undefined) {
        try {
          cancel(timer);
        } catch {
          // Best effort diagnostic only.
        }
        timer = undefined;
      }
      finalSummary = makeSummary();
      return finalSummary;
    },
  };
}

export async function withBuildHostResourceMetrics<T>(
  build: () => Promise<T>,
  options: {
    platform: string;
    env: NodeJS.ProcessEnv;
    readText?: ProcSourceReader;
    now?: () => number;
    emit: (summary: BuildHostResourceMetrics) => void;
  }
): Promise<T> {
  if (!shouldCollectBuildHostResourceMetrics(options.platform, options.env))
    return build();
  let sampler: ReturnType<typeof createBuildHostResourceSampler> | undefined;
  try {
    sampler = createBuildHostResourceSampler(true, {
      readText: options.readText,
      now: options.now,
    });
    sampler.start();
  } catch {
    sampler = undefined;
  }
  try {
    return await build();
  } finally {
    try {
      const summary = sampler?.stop();
      if (summary) options.emit(summary);
    } catch {
      // Metrics never replace build result, error, timeout, abort, or cleanup.
    }
  }
}
