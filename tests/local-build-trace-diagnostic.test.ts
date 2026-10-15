import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  MAX_TRACE_BYTES,
  readBuildTraceSummary,
  summarizeBuildTrace,
  withBuildDiagnostic,
} from "../scripts/lib/local-build-trace-diagnostic";

const encode = (value: unknown) => Buffer.from(JSON.stringify(value));
describe("bounded build trace diagnostics", () => {
  it.each([false, true])(
    "emits the same bounded payload with failure=%s and preserves cleanup",
    async (failure) => {
      const error = new Error("build result");
      const emit = vi.fn();
      const cleanup = vi.fn();
      const payload = summarizeBuildTrace(
        encode([{ name: "next-build", duration: 1000 }])
      );
      const attempt = async () => {
        try {
          return await withBuildDiagnostic(
            async () => {
              if (failure) throw error;
              return 42;
            },
            () => payload,
            emit
          );
        } finally {
          cleanup();
        }
      };
      if (failure) await expect(attempt()).rejects.toBe(error);
      else await expect(attempt()).resolves.toBe(42);
      expect(emit).toHaveBeenCalledExactlyOnceWith(payload);
      expect(cleanup).toHaveBeenCalledOnce();
    }
  );
  it("emits only fixed phases, counts and accumulated/maximum span durations", () => {
    const bytes = Buffer.from(
      encode([
        {
          name: "static-generation",
          duration: 2000,
          tags: { secret: "never-emit" },
        },
        { name: "unknown-secret", duration: 9000 },
      ]).toString() +
        "\n" +
        encode([{ name: "static-generation", duration: 3000, path: "private" }])
    );
    const result = summarizeBuildTrace(bytes);
    expect(result).toEqual([
      {
        phase: "static-generation",
        count: 2,
        accumulatedDurationMs: 5,
        maxDurationMs: 3,
      },
    ]);
    expect(JSON.stringify(result)).not.toMatch(/secret|private|tags|path/);
  });
  it.each(["{broken", "{}", '[{"name":"next-build","duration":1}]\n['])(
    "rejects malformed input %s",
    (input) => {
      expect(summarizeBuildTrace(Buffer.from(input))).toEqual([]);
    }
  );
  it("rejects excessive bytes and event counts", () => {
    expect(summarizeBuildTrace(null as unknown as Buffer)).toEqual([]);
    expect(summarizeBuildTrace(Buffer.alloc(MAX_TRACE_BYTES + 1))).toEqual([]);
    expect(summarizeBuildTrace(encode(Array(100001).fill(null)))).toEqual([]);
  });
  it("ignores unknown phases and invalid durations", () => {
    expect(
      summarizeBuildTrace(
        encode([
          null,
          { name: "/secret", duration: 1 },
          ...[-1, 0.5, 86400000001, "1000", null].map((duration) => ({
            name: "next-build",
            duration,
          })),
        ])
      )
    ).toEqual([]);
  });
  it("reads bounded regular files, rejects symlinks and missing input", () => {
    const root = mkdtempSync(join(tmpdir(), "trace-fixture-"));
    try {
      expect(readBuildTraceSummary(root)).toEqual([]);
      mkdirSync(join(root, ".next"));
      const target = join(root, "fixture");
      writeFileSync(target, encode([{ name: "next-build", duration: 1000 }]));
      symlinkSync(target, join(root, ".next", "trace"));
      expect(readBuildTraceSummary(root)).toEqual([]);
      rmSync(join(root, ".next", "trace"));
      writeFileSync(
        join(root, ".next", "trace"),
        encode([{ name: "next-build", duration: 1000 }])
      );
      expect(readBuildTraceSummary(root)).toEqual([
        {
          phase: "next-build",
          count: 1,
          accumulatedDurationMs: 1,
          maxDurationMs: 1,
        },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it.each(["read", "emit"])(
    "preserves the original failure and finally cleanup when %s fails",
    async (failure) => {
      const error = new Error("original-build-failure");
      const cleanup = vi.fn();
      const run = async () => {
        try {
          return await withBuildDiagnostic(
            async () => {
              throw error;
            },
            () => {
              if (failure === "read") throw new Error("private-reader");
              return [];
            },
            () => {
              throw new Error("private-emitter");
            }
          );
        } finally {
          cleanup();
        }
      };
      await expect(run()).rejects.toBe(error);
      expect(cleanup).toHaveBeenCalledOnce();
    }
  );
  it("reads the same diagnostics after a successful build", async () => {
    const read = vi.fn(() => []);
    const emit = vi.fn();
    await expect(withBuildDiagnostic(async () => 42, read, emit)).resolves.toBe(
      42
    );
    expect(read).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledWith([]);
  });
});

it.each(["read", "emit"])(
  "preserves success when %s throws",
  async (failure) => {
    await expect(
      withBuildDiagnostic(
        async () => 42,
        () => {
          if (failure === "read") throw Error("secret");
          return [];
        },
        () => {
          throw Error("secret");
        }
      )
    ).resolves.toBe(42);
  }
);
