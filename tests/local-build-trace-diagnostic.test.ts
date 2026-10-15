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
  withBuildFailureDiagnostic,
} from "../scripts/lib/local-build-trace-diagnostic";

const encode = (value: unknown) => Buffer.from(JSON.stringify(value));
describe("bounded build trace diagnostics", () => {
  it("emits only fixed phase names and maximum duration in milliseconds", () => {
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
    expect(result).toEqual([{ phase: "static-generation", durationMs: 3 }]);
    expect(JSON.stringify(result)).not.toMatch(/secret|private|tags|path/);
  });
  it.each(["{broken", "{}", '[{"name":"next-build","duration":1}]\n['])(
    "rejects malformed input %s",
    (input) => {
      expect(summarizeBuildTrace(Buffer.from(input))).toEqual([]);
    }
  );
  it("rejects excessive bytes and event counts", () => {
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
        { phase: "next-build", durationMs: 1 },
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
          return await withBuildFailureDiagnostic(
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
  it("does not read diagnostics after a successful build", async () => {
    const read = vi.fn();
    const emit = vi.fn();
    await expect(
      withBuildFailureDiagnostic(async () => 42, read, emit)
    ).resolves.toBe(42);
    expect(read).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
});
