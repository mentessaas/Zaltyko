import { describe, expect, it, vi } from "vitest";
import { constants } from "node:fs";
import {
  createBuildHostResourceSampler,
  decodeFixedProcSourceBytes,
  HOST_RESOURCE_SAMPLE_INTERVAL_MS,
  MAX_HOST_RESOURCE_SAMPLES,
  MAX_PROC_SOURCE_BYTES,
  shouldCollectBuildHostResourceMetrics,
  readFixedLinuxProcSource,
  withBuildHostResourceMetrics,
} from "../scripts/lib/local-build-host-resource-metrics";

const enabledEnv = {
  GITHUB_ACTIONS: "true",
  CI: "true",
  RUNNER_OS: "Linux",
  E2E_LOCAL_PROJECT: "firefox",
};
const memory =
  "MemTotal: 1024 kB\nMemAvailable: 512 kB\nSwapTotal: 2048 kB\nSwapFree: 1024 kB\n";
const pressure =
  "some avg10=12.50 avg60=1.00 avg300=0.00 total=123\nfull avg10=2.25 avg60=0.00 avg300=0.00 total=3\n";
const cpu = (
  user: number,
  system: number,
  idle: number,
  wait: number,
  guest: number
) =>
  `cpu ${user} 0 ${system} ${idle} ${wait} 0 0 0 ${guest} ${guest}\ncpu0 1 2 3 4 5 6 7\n`;

function sources(readCpu: () => string = () => cpu(100, 100, 700, 100, 9_000)) {
  return (path: string, maxBytes: number) => {
    expect(maxBytes).toBe(MAX_PROC_SOURCE_BYTES);
    if (path === "/proc/stat") return readCpu();
    if (path === "/proc/meminfo") return memory;
    return pressure;
  };
}

describe("bounded build host resource sample", () => {
  it("gates only exact GitHub Linux browser build context", () => {
    expect(shouldCollectBuildHostResourceMetrics("linux", enabledEnv)).toBe(
      true
    );
    for (const [platform, env] of [
      ["darwin", enabledEnv],
      ["linux", { ...enabledEnv, CI: "false" }],
      ["linux", { ...enabledEnv, GITHUB_ACTIONS: "false" }],
      ["linux", { ...enabledEnv, RUNNER_OS: "macOS" }],
      ["linux", { ...enabledEnv, E2E_LOCAL_PROJECT: "all" }],
      ["linux", { ...enabledEnv, E2E_LOCAL_PROJECT: "firefox " }],
    ] as const)
      expect(shouldCollectBuildHostResourceMetrics(platform, env)).toBe(false);
  });

  it("decodes only a complete CPU first line inside 4 KiB and rejects other overflow", () => {
    const cpuPrefix = Buffer.alloc(MAX_PROC_SOURCE_BYTES, 120);
    const line = Buffer.from("cpu 1 2 3 4 5 6 7 8\n");
    line.copy(cpuPrefix);
    expect(
      decodeFixedProcSourceBytes("/proc/stat", cpuPrefix, cpuPrefix.length)
    ).toBe("cpu 1 2 3 4 5 6 7 8\n");
    expect(
      decodeFixedProcSourceBytes(
        "/proc/stat",
        Buffer.alloc(MAX_PROC_SOURCE_BYTES, 120),
        MAX_PROC_SOURCE_BYTES
      )
    ).toBeUndefined();
    expect(
      decodeFixedProcSourceBytes(
        "/proc/meminfo",
        Buffer.alloc(MAX_PROC_SOURCE_BYTES + 1),
        MAX_PROC_SOURCE_BYTES + 1
      )
    ).toBeUndefined();
    expect(
      decodeFixedProcSourceBytes(
        "/proc/pressure/io",
        Buffer.from("some avg10=1\n"),
        13
      )
    ).toBe("some avg10=1\n");
    expect(
      decodeFixedProcSourceBytes("/etc/passwd", Buffer.from("root"), 4)
    ).toBeUndefined();
  });

  it("reads only fixed regular proc files and always closes descriptors", () => {
    const opened: Array<{ path: string; flags: number }> = [];
    const closed: number[] = [];
    const io = {
      open: (path: string, flags: number) => {
        opened.push({ path, flags });
        return 17;
      },
      isRegularFile: () => true,
      read: (_fd: number, buffer: Buffer, offset: number, length: number) => {
        const line = Buffer.from(
          "cpu 1 2 3 4 5 6 7 8\n" + "cpu1 ".repeat(2_000)
        );
        const count = Math.min(length, line.length - offset);
        line.copy(buffer, offset, offset, offset + count);
        return count;
      },
      close: (fd: number) => closed.push(fd),
    };
    expect(
      readFixedLinuxProcSource("/proc/stat", MAX_PROC_SOURCE_BYTES, io)
    ).toBe("cpu 1 2 3 4 5 6 7 8\n");
    expect(opened).toHaveLength(1);
    expect(opened[0].path).toBe("/proc/stat");
    expect(opened[0].flags & constants.O_NOFOLLOW).not.toBe(0);
    expect(closed).toEqual([17]);

    const rejectedIo = {
      ...io,
      isRegularFile: () => false,
    };
    expect(
      readFixedLinuxProcSource(
        "/proc/meminfo",
        MAX_PROC_SOURCE_BYTES,
        rejectedIo
      )
    ).toBeUndefined();
    expect(closed).toEqual([17, 17]);

    const throwingIo = {
      ...io,
      read: () => {
        throw new Error("io-secret");
      },
    };
    expect(
      readFixedLinuxProcSource(
        "/proc/meminfo",
        MAX_PROC_SOURCE_BYTES,
        throwingIo
      )
    ).toBeUndefined();
    expect(closed).toEqual([17, 17, 17]);

    const overflowIo = {
      ...io,
      read: (_fd: number, buffer: Buffer, offset: number, length: number) => {
        buffer.fill(120, offset, offset + length);
        return length;
      },
    };
    expect(
      readFixedLinuxProcSource(
        "/proc/meminfo",
        MAX_PROC_SOURCE_BYTES,
        overflowIo
      )
    ).toBeUndefined();
    expect(closed).toEqual([17, 17, 17, 17]);
  });

  it("collects fixed numeric fields and excludes duplicated guest CPU ticks", () => {
    let tick = 0;
    let cpuReads = 0;
    const readText = sources(() => {
      cpuReads += 1;
      return cpuReads === 1
        ? cpu(100, 100, 700, 100, 9_000)
        : cpu(200, 200, 1_400, 200, 90_000);
    });
    const timers: Array<() => void> = [];
    const sampler = createBuildHostResourceSampler(true, {
      readText,
      now: () => tick,
      schedule: (callback) => {
        timers.push(callback);
        return timers.length as unknown as ReturnType<typeof setTimeout>;
      },
      cancel: () => undefined,
    });
    sampler.start();
    tick = HOST_RESOURCE_SAMPLE_INTERVAL_MS;
    timers.shift()?.();
    const summary = sampler.stop()!;
    expect(summary).toMatchObject({
      scope: "host",
      sampleCount: 2,
      cpuBusyMaxPct: 20,
      memoryAvailableMinMiB: 0.5,
      memoryAvailableMinPct: 50,
      swapUsedMaxMiB: 1,
      cpuSomeAvg10MaxPct: 12.5,
      memorySomeAvg10MaxPct: 12.5,
      memoryFullAvg10MaxPct: 2.25,
      ioSomeAvg10MaxPct: 12.5,
      ioFullAvg10MaxPct: 2.25,
    });
    expect(Object.keys(summary).sort()).toEqual([
      "cpuBusyMaxPct",
      "cpuSomeAvg10MaxPct",
      "durationMs",
      "ioFullAvg10MaxPct",
      "ioSomeAvg10MaxPct",
      "memoryAvailableMinMiB",
      "memoryAvailableMinPct",
      "memoryFullAvg10MaxPct",
      "memorySomeAvg10MaxPct",
      "sampleCount",
      "scope",
      "swapUsedMaxMiB",
      "unavailableSourceReads",
    ]);
  });

  it("skips regressing CPU/iowait counters and nonfinite clock values", () => {
    let read = 0;
    const cpuSnapshots = [
      cpu(100, 100, 700, 100, 0),
      cpu(10, 10, 80, 20, 0), // Counter reset/regression.
      cpu(210, 110, 80, 0, 0), // iowait falls while total still rises.
      cpu(310, 210, 880, 0, 0), // Valid interval after the reset baselines.
    ];
    const callbacks: Array<() => void> = [];
    const sampler = createBuildHostResourceSampler(true, {
      readText: sources(() => cpuSnapshots[Math.min(read++, 3)]),
      now: () => Number.NaN,
      schedule: (callback) => {
        callbacks.push(callback);
        return callbacks.length as unknown as ReturnType<typeof setTimeout>;
      },
      cancel: () => undefined,
    });
    sampler.start();
    callbacks.shift()?.();
    callbacks.shift()?.();
    callbacks.shift()?.();
    const summary = sampler.stop()!;
    expect(summary.cpuBusyMaxPct).toBe(20);
    expect(summary.durationMs).toBeNull();
  });

  it("ignores bytes after a complete CPU line but rejects oversized other sources", () => {
    const readText = (path: string) =>
      path === "/proc/stat"
        ? `${cpu(100, 100, 700, 100, 0)}${"private-tail".repeat(500)}`
        : path === "/proc/meminfo"
          ? "x".repeat(MAX_PROC_SOURCE_BYTES + 1)
          : pressure;
    const sampler = createBuildHostResourceSampler(true, {
      readText,
      now: () => 0,
    });
    sampler.start();
    const summary = sampler.stop()!;
    expect(summary.sampleCount).toBe(1);
    expect(summary.unavailableSourceReads).toBeGreaterThan(0);
    expect(JSON.stringify(summary)).not.toContain("private-tail");
  });

  it("nulls impossible memory and pressure values", () => {
    const sampler = createBuildHostResourceSampler(true, {
      readText: (path) => {
        if (path === "/proc/stat") return cpu(1, 1, 1, 0, 0);
        if (path === "/proc/meminfo")
          return "MemTotal: 1 kB\nMemAvailable: 2 kB\nSwapTotal: 1 kB\nSwapFree: 2 kB\n";
        if (path === "/proc/pressure/cpu") return "some avg10=NaN avg60=1\n";
        return "some avg10=101 avg60=1\nfull avg10=NaN avg60=1\n";
      },
    });
    sampler.start();
    const summary = sampler.stop()!;
    expect(summary.memoryAvailableMinMiB).toBeNull();
    expect(summary.memoryAvailableMinPct).toBeNull();
    expect(summary.swapUsedMaxMiB).toBeNull();
    expect(summary.cpuSomeAvg10MaxPct).toBeNull();
    expect(summary.memorySomeAvg10MaxPct).toBeNull();
    expect(summary.memoryFullAvg10MaxPct).toBeNull();
  });

  it("caps sampling at 250 samples and cancels its pending timer on stop", () => {
    vi.useFakeTimers();
    try {
      let tick = 0;
      const sampler = createBuildHostResourceSampler(true, {
        readText: sources(),
        now: () => tick,
      });
      sampler.start();
      for (let index = 1; index < MAX_HOST_RESOURCE_SAMPLES; index += 1) {
        tick += HOST_RESOURCE_SAMPLE_INTERVAL_MS;
        vi.advanceTimersByTime(HOST_RESOURCE_SAMPLE_INTERVAL_MS);
      }
      expect(sampler.stop()?.sampleCount).toBe(MAX_HOST_RESOURCE_SAMPLES);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops scheduling when timer creation fails", () => {
    const sampler = createBuildHostResourceSampler(true, {
      readText: sources(),
      schedule: () => {
        throw new Error("timer-secret");
      },
    });
    sampler.start();
    expect(sampler.stop()?.sampleCount).toBe(1);
  });

  it("counts I/O and parser failures without exposing source text", () => {
    const sampler = createBuildHostResourceSampler(true, {
      readText: (path) => {
        if (path === "/proc/stat") throw new Error("host-secret");
        return "sensitive-data";
      },
    });
    sampler.start();
    const summary = sampler.stop()!;
    expect(summary.unavailableSourceReads).toBeGreaterThan(0);
    expect(JSON.stringify(summary)).not.toMatch(/host-secret|sensitive-data/);
  });

  it("does not start outside the gate and preserves successful build result", async () => {
    const build = vi.fn(async () => "build-result");
    const emit = vi.fn();
    const result = await withBuildHostResourceMetrics(build, {
      platform: "darwin",
      env: enabledEnv,
      readText: sources(),
      emit,
    });
    expect(result).toBe("build-result");
    expect(build).toHaveBeenCalledOnce();
    expect(emit).not.toHaveBeenCalled();
  });

  it("emits one closed numeric summary after an enabled successful build", async () => {
    const emit = vi.fn();
    await expect(
      withBuildHostResourceMetrics(async () => "build-ok", {
        platform: "linux",
        env: enabledEnv,
        readText: sources(),
        now: () => 10,
        emit,
      })
    ).resolves.toBe("build-ok");
    expect(emit).toHaveBeenCalledOnce();
    const summary = emit.mock.calls[0][0];
    expect(
      Object.values(summary).every(
        (value) =>
          value === null || typeof value === "number" || value === "host"
      )
    ).toBe(true);
    expect(summary.sampleCount).toBe(1);
  });

  it.each(["build error", "timeout-like rejection", "abort-like rejection"])(
    "emits once while preserving synthetic %s and cleanup outcome",
    async (kind) => {
      vi.useFakeTimers();
      try {
        const failure = Object.assign(new Error(`private-${kind}`), {
          name: kind,
        });
        const emit = vi.fn();
        const build = vi.fn(async () => {
          throw failure;
        });
        await expect(
          withBuildHostResourceMetrics(build, {
            platform: "linux",
            env: enabledEnv,
            readText: sources(),
            emit,
          })
        ).rejects.toBe(failure);
        expect(emit).toHaveBeenCalledOnce();
        expect(JSON.stringify(emit.mock.calls[0][0])).not.toContain("private-");
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    }
  );

  it("stops metrics before invoking outer cleanup exactly once", async () => {
    vi.useFakeTimers();
    try {
      const order: string[] = [];
      const failure = new Error("synthetic build timeout");
      const operation = async () => {
        try {
          await withBuildHostResourceMetrics(
            async () => {
              throw failure;
            },
            {
              platform: "linux",
              env: enabledEnv,
              readText: sources(),
              emit: () => order.push("metrics-stopped"),
            }
          );
        } finally {
          order.push("outer-cleanup");
        }
      };
      await expect(operation()).rejects.toBe(failure);
      expect(order).toEqual(["metrics-stopped", "outer-cleanup"]);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores throwing reader and emitter without changing build result", async () => {
    const emit = vi.fn(() => {
      throw new Error("emit-secret");
    });
    await expect(
      withBuildHostResourceMetrics(async () => "ok", {
        platform: "linux",
        env: enabledEnv,
        readText: () => {
          throw new Error("reader-secret");
        },
        emit,
      })
    ).resolves.toBe("ok");
    expect(emit).toHaveBeenCalledOnce();
  });

  it("preserves build failure when the summary emitter also throws", async () => {
    const failure = new Error("build-error");
    await expect(
      withBuildHostResourceMetrics(
        async () => {
          throw failure;
        },
        {
          platform: "linux",
          env: enabledEnv,
          readText: sources(),
          emit: () => {
            throw new Error("emit-secret");
          },
        }
      )
    ).rejects.toBe(failure);
  });
});
