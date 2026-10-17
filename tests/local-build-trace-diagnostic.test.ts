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
  MAX_TRACE_EVENTS,
  MAX_TRACE_LINE_BYTES,
  MAX_TRACE_OUTPUT_BYTES,
  createBuildTraceCatalog,
  parseTraceEntryCount,
  readBuildTraceSummary,
  readTracePrefix,
  scanTraceGroups,
  summarizeBuildTrace,
  summarizeBuildTraceReport,
  withBuildDiagnostic,
} from "../scripts/lib/local-build-trace-diagnostic";

const encode = (value: unknown) => Buffer.from(JSON.stringify(value));
const catalog = createBuildTraceCatalog("/repo");
const modulePath =
  "/repo/src/components/owner-dashboard/OwnerAttendanceManager.tsx?secret=query";

describe("bounded build trace diagnostics", () => {
  it.each([
    { label: "negative integer", value: -1, expected: undefined },
    { label: "negative fraction", value: -0.5, expected: undefined },
    { label: "NaN", value: Number.NaN, expected: undefined },
    {
      label: "infinity",
      value: Number.POSITIVE_INFINITY,
      expected: undefined,
    },
    { label: "above the cap", value: 1_000_001, expected: undefined },
    { label: "fraction", value: 42.5, expected: undefined },
    { label: "zero", value: 0, expected: 0 },
    { label: "number", value: 42, expected: 42 },
    { label: "numeric string", value: "42", expected: 42 },
  ])("parses trace entry count: $label", ({ value, expected }) => {
    expect(parseTraceEntryCount(value)).toBe(expected);
  });

  it("does not emit a negative numeric trace entry count", () => {
    const report = summarizeBuildTraceReport(
      encode([
        { id: 1, name: "worker-main-server", duration: 10 },
        {
          id: 2,
          parentId: 1,
          name: "node-file-trace-plugin",
          duration: 5,
          tags: { traceEntryCount: -1 },
        },
      ]),
      catalog
    );

    expect(report.detail.quality.invalidTraceEntryCounts).toBe(1);
    expect(report.detail.traceWork).toEqual([
      expect.objectContaining({
        work: "node-file-trace-plugin",
        scope: "server",
      }),
    ]);
    expect(report.detail.traceWork[0]).not.toHaveProperty("traceEntryCount");
  });

  it.each([false, true])(
    "omits an overflowing trace entry aggregate with a later span=%s",
    (later) => {
      const report = summarizeBuildTraceReport(
        encode([
          { id: 1, name: "worker-main-server", duration: 10 },
          ...[600_000, 600_000, ...(later ? [1] : [])].map(
            (traceEntryCount, index) => ({
              id: index + 2,
              parentId: 1,
              name: "node-file-trace-plugin",
              duration: 5,
              tags: { traceEntryCount },
            })
          ),
        ]),
        catalog
      );
      expect(report.detail.traceWork).toHaveLength(1);
      expect(report.detail.traceWork[0]).not.toHaveProperty("traceEntryCount");
      expect(report.detail.quality.invalidTraceEntryCounts).toBe(1);
    }
  );

  it("accepts the exact aggregate cap independently for each compiler", () => {
    const report = summarizeBuildTraceReport(
      encode([
        { id: 1, name: "worker-main-server", duration: 10 },
        { id: 2, name: "worker-main-client", duration: 10 },
        {
          id: 3,
          parentId: 1,
          name: "node-file-trace-plugin",
          duration: 5,
          tags: { traceEntryCount: 600_000 },
        },
        {
          id: 4,
          parentId: 1,
          name: "node-file-trace-plugin",
          duration: 5,
          tags: { traceEntryCount: 400_000 },
        },
        {
          id: 5,
          parentId: 2,
          name: "node-file-trace-plugin",
          duration: 5,
          tags: { traceEntryCount: 42 },
        },
      ]),
      catalog
    );
    expect(report.detail.traceWork).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: "server",
          traceEntryCount: 1_000_000,
        }),
        expect.objectContaining({ scope: "client", traceEntryCount: 42 }),
      ])
    );
    expect(report.detail.quality.invalidTraceEntryCounts).toBe(0);
  });

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

  it("attributes only allowlisted compiler, module, route and NFT spans", () => {
    const report = summarizeBuildTraceReport(
      encode([
        {
          id: 1,
          traceId: "build-a",
          name: "worker-main-server",
          duration: 5000,
        },
        {
          id: 2,
          parentId: 1,
          traceId: "build-a",
          name: "webpack-compilation",
          duration: 4000,
          tags: { name: "server" },
        },
        {
          id: 3,
          parentId: 2,
          traceId: "build-a",
          name: "build-module-ts",
          duration: 2500,
          tags: { name: `babel-loader!${modulePath}&loader=private` },
        },
        {
          id: 12,
          parentId: 2,
          traceId: "build-a",
          name: "build-module-js",
          duration: 1500,
          tags: { name: "/repo/node_modules/next/dist/build/index.js" },
        },
        {
          id: 4,
          parentId: 2,
          traceId: "build-a",
          name: "check-page",
          duration: 3000,
          tags: { page: "/owner/attendance" },
        },
        {
          id: 5,
          parentId: 4,
          traceId: "build-a",
          name: "is-page-static",
          duration: 1000,
        },
        {
          id: 6,
          traceId: "build-a",
          name: "node-file-trace-build",
          duration: 6000,
        },
        {
          id: 7,
          traceId: "build-a",
          name: "apply-include-excludes",
          duration: 1200,
        },
        {
          id: 8,
          parentId: 1,
          traceId: "build-a",
          name: "node-file-trace-plugin",
          duration: 500,
          tags: { traceEntryCount: "42" },
        },
        {
          id: 9,
          parentId: 8,
          traceId: "build-a",
          name: "collect-traced-files",
          duration: 300,
        },
        {
          id: 10,
          traceId: "build-a",
          name: "next-build",
          duration: 10000,
          tags: { secret: "never-emit" },
        },
      ]),
      catalog
    );

    expect(report.status).toBe("complete");
    expect(report.phases).toContainEqual({
      phase: "next-build",
      count: 1,
      accumulatedDurationMs: 10,
      maxDurationMs: 10,
    });
    expect(report.detail.compilerSpans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          span: "worker-main-server",
          compiler: "server",
          inclusiveSpanSumMs: 5,
        }),
        expect.objectContaining({
          span: "webpack-compilation",
          compiler: "server",
          inclusiveSpanSumMs: 4,
        }),
      ])
    );
    expect(report.detail.modules).toContainEqual(
      expect.objectContaining({
        compiler: "server",
        moduleId:
          "repo:src/components/owner-dashboard/OwnerAttendanceManager.tsx",
        moduleType: "ts",
        inclusiveSpanSumMs: 2.5,
      })
    );
    expect(report.detail.modules).toContainEqual(
      expect.objectContaining({ moduleId: "pkg:next", moduleType: "js" })
    );
    expect(report.detail.routeChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          route: "/owner/attendance",
          work: "check-page",
          inclusiveSpanSumMs: 3,
        }),
        expect.objectContaining({
          route: "/owner/attendance",
          work: "is-page-static",
          inclusiveSpanSumMs: 1,
        }),
      ])
    );
    expect(report.detail.traceWork).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          work: "node-file-trace-build",
          scope: "aggregate_only",
        }),
        expect.objectContaining({
          work: "node-file-trace-plugin",
          scope: "server",
          traceEntryCount: 42,
        }),
      ])
    );
    expect(JSON.stringify(report)).not.toMatch(
      /secret|query|traceId|parentId|tags|build-a|never-emit/
    );
    expect(
      Buffer.byteLength(JSON.stringify(report), "utf8")
    ).toBeLessThanOrEqual(MAX_TRACE_OUTPUT_BYTES);
  });

  it("keeps absent and present trace IDs in separate parent namespaces", () => {
    const report = summarizeBuildTraceReport(
      encode([
        { id: 1, name: "worker-main-server", duration: 10 },
        {
          id: 2,
          parentId: 1,
          name: "build-module-ts",
          duration: 5,
          tags: { name: modulePath },
        },
        {
          id: 3,
          parentId: 1,
          traceId: "present",
          name: "build-module-ts",
          duration: 7,
          tags: { name: modulePath },
        },
      ]),
      catalog
    );

    expect(report.detail.modules).toEqual([
      expect.objectContaining({
        compiler: "server",
        inclusiveSpanSumMs: 0.005,
      }),
    ]);
    expect(report.detail.quality.unattributedModules).toBe(1);
    expect(report.detail.quality.orphanParents).toBe(1);
    expect(report.status).toBe("complete");
  });

  it("resolves parents that appear in later batches", () => {
    const lines = [
      [
        {
          id: 3,
          parentId: 2,
          traceId: "later-parent",
          name: "build-module-ts",
          duration: 5000,
          tags: { name: modulePath },
        },
      ],
      [
        {
          id: 2,
          parentId: 1,
          traceId: "later-parent",
          name: "webpack-compilation",
          duration: 6000,
          tags: { name: "server" },
        },
      ],
      [
        {
          id: 1,
          traceId: "later-parent",
          name: "worker-main-server",
          duration: 7000,
        },
      ],
    ].map((batch) => JSON.stringify(batch));
    const report = summarizeBuildTraceReport(
      Buffer.from(lines.join("\n")),
      catalog
    );
    expect(report.detail.modules).toContainEqual(
      expect.objectContaining({
        compiler: "server",
        inclusiveSpanSumMs: 5,
      })
    );
  });

  it("uses a valid worker as the compiler boundary and rejects conflicts", () => {
    const orphanAboveWorker = summarizeBuildTraceReport(
      encode([
        {
          id: 1,
          parentId: 999,
          name: "worker-main-server",
          duration: 100,
        },
        {
          id: 2,
          parentId: 1,
          name: "webpack-compilation",
          duration: 90,
          tags: { name: "server" },
        },
        {
          id: 3,
          parentId: 2,
          name: "build-module-ts",
          duration: 80,
          tags: { name: modulePath },
        },
      ]),
      catalog
    );
    expect(orphanAboveWorker.detail.modules).toContainEqual(
      expect.objectContaining({ compiler: "server" })
    );
    expect(orphanAboveWorker.detail.quality.anchorParentGaps).toBe(1);
    expect(orphanAboveWorker.reasons).toContain("anchor_parent_gap");
    expect(orphanAboveWorker.status).toBe("partial");
    expect(orphanAboveWorker.detail.status).toBe("partial");

    const conflict = summarizeBuildTraceReport(
      encode([
        {
          id: 10,
          parentId: 999,
          name: "worker-main-client",
          duration: 100,
        },
        {
          id: 11,
          parentId: 10,
          name: "webpack-compilation",
          duration: 90,
          tags: { name: "server" },
        },
        {
          id: 12,
          parentId: 11,
          name: "build-module-ts",
          duration: 80,
          tags: { name: modulePath },
        },
      ]),
      catalog
    );
    expect(conflict.detail.modules).toEqual([]);
    expect(conflict.detail.quality.ambiguousCompilers).toBeGreaterThan(0);
  });

  it.each([
    { label: "missing", duration: undefined, invalidDurations: 0 },
    { label: "invalid", duration: -1, invalidDurations: 1 },
  ])(
    "does not use a worker with $label duration as a compiler anchor",
    ({ duration, invalidDurations }) => {
      const report = summarizeBuildTraceReport(
        encode([
          {
            id: 1,
            name: "worker-main-server",
            ...(duration === undefined ? {} : { duration }),
          },
          {
            id: 2,
            parentId: 1,
            name: "webpack-compilation",
            duration: 90,
            tags: { name: "server" },
          },
          {
            id: 3,
            parentId: 2,
            name: "build-module-ts",
            duration: 80,
            tags: { name: modulePath },
          },
        ]),
        catalog
      );

      expect(report.detail.modules).toEqual([]);
      expect(report.detail.quality.invalidCompilerAnchors).toBe(1);
      expect(report.detail.quality.invalidDurations).toBe(invalidDurations);
      expect(report.detail.quality.unattributedModules).toBe(1);
    }
  );

  it("keeps distinct nested worker IDs ambiguous even for the same compiler", () => {
    const report = summarizeBuildTraceReport(
      encode([
        { id: 1, name: "worker-main-server", duration: 100 },
        {
          id: 2,
          parentId: 1,
          name: "worker-main-server",
          duration: 90,
        },
        {
          id: 3,
          parentId: 2,
          name: "webpack-compilation",
          duration: 80,
          tags: { name: "server" },
        },
        {
          id: 4,
          parentId: 3,
          name: "build-module-ts",
          duration: 70,
          tags: { name: modulePath },
        },
      ]),
      catalog
    );

    expect(report.detail.modules).toEqual([]);
    expect(report.detail.quality.ambiguousCompilers).toBeGreaterThan(0);
    expect(report.detail.quality.unattributedModules).toBe(1);
  });

  it("rejects duplicate, cyclic and orphaned ancestry without attribution", () => {
    const report = summarizeBuildTraceReport(
      encode([
        { id: 1, name: "worker-main-server", duration: 10 },
        {
          id: 2,
          parentId: 2,
          name: "build-module-ts",
          duration: 5,
          tags: { name: modulePath },
        },
        {
          id: 3,
          parentId: 99,
          name: "build-module-ts",
          duration: 7,
          tags: { name: modulePath },
        },
        { id: 4, name: "worker-main-client", duration: 8 },
        {
          id: 4,
          parentId: 1,
          name: "webpack-compilation",
          duration: 6,
          tags: { name: "client" },
        },
        {
          id: 10,
          parentId: 10,
          name: "worker-main-edge-server",
          duration: 8,
        },
        {
          id: 11,
          parentId: 10,
          name: "build-module-ts",
          duration: 9,
          tags: { name: modulePath },
        },
      ]),
      catalog
    );

    expect(report.detail.modules).toEqual([]);
    expect(report.detail.quality.duplicateIds).toBe(1);
    expect(report.detail.quality.cycles).toBeGreaterThan(0);
    expect(report.detail.quality.orphanParents).toBeGreaterThan(0);
    expect(report.detail.quality.unattributedModules).toBe(3);
    expect(report.detail.quality.unattributedCompilerSpans).toBe(1);
    expect(report.detail.compilerSpans).not.toContainEqual(
      expect.objectContaining({ compiler: "client" })
    );
    expect(report.detail.compilerSpans).not.toContainEqual(
      expect.objectContaining({ compiler: "edge-server" })
    );
    expect(report.status).toBe("complete");
  });

  it("does not attribute ancestry deeper than the fixed parent-depth cap", () => {
    const events: unknown[] = [
      { id: 1, name: "worker-main-server", duration: 100 },
    ];
    for (let id = 2; id <= 70; id++)
      events.push({ id, parentId: id - 1, name: "other" });
    events.push({
      id: 71,
      parentId: 70,
      name: "build-module-ts",
      duration: 5,
      tags: { name: modulePath },
    });

    const report = summarizeBuildTraceReport(encode(events), catalog);
    expect(report.detail.modules).toEqual([]);
    expect(report.detail.quality.depthExceeded).toBeGreaterThan(0);
    expect(report.detail.quality.unattributedModules).toBe(1);
  });

  it("parses a final non-newline record once and preserves complete prefix on a bad tail", () => {
    const first = encode([{ id: 1, name: "next-build", duration: 1000 }]);
    const report = summarizeBuildTraceReport(
      Buffer.concat([first, Buffer.from("\n{")]),
      catalog
    );
    expect(report.phases).toEqual([
      {
        phase: "next-build",
        count: 1,
        accumulatedDurationMs: 1,
        maxDurationMs: 1,
      },
    ]);
    expect(report.status).toBe("partial");
    expect(report.reasons).toContain("malformed_tail");
    expect(report.detail.status).toBe("partial");
  });

  it("keeps completed prefix records when the trace exceeds the byte cap", () => {
    const first = encode([{ id: 1, name: "next-build", duration: 1000 }]);
    const oversized = Buffer.concat([
      first,
      Buffer.from("\n"),
      Buffer.alloc(MAX_TRACE_BYTES, 0x20),
    ]);
    const report = summarizeBuildTraceReport(oversized, catalog);
    expect(report.phases).toHaveLength(1);
    expect(report.status).toBe("partial");
    expect(report.reasons).toContain("byte_limit");
    expect(report.detail.status).toBe("partial");
  });

  it("caps event batches and records invalid numeric fields", () => {
    const tooMany = summarizeBuildTraceReport(
      encode(Array(MAX_TRACE_EVENTS + 1).fill(null)),
      catalog,
      () => 0
    );
    expect(tooMany.status).toBe("partial");
    expect(tooMany.reasons).toContain("event_limit");

    const invalid = summarizeBuildTraceReport(
      encode([
        { id: 1, name: "next-build", duration: -1 },
        {
          id: 2,
          name: "node-file-trace-plugin",
          duration: 5,
          tags: { traceEntryCount: "99999999" },
        },
        {
          id: 3,
          name: "build-module-unsupported-extension",
          duration: 3,
          tags: { name: modulePath },
        },
      ]),
      catalog
    );
    expect(invalid.detail.quality.invalidDurations).toBe(1);
    expect(invalid.detail.quality.invalidTraceEntryCounts).toBe(1);
    expect(invalid.detail.quality.unsupportedModuleSpans).toBe(1);
    expect(JSON.stringify(invalid)).not.toContain("unsupported-extension");

    const invalidIds = summarizeBuildTraceReport(
      encode([
        {
          id: 0,
          name: "build-module-ts",
          duration: 1,
          tags: { name: modulePath },
        },
        {
          id: 2,
          parentId: 0,
          name: "build-module-ts",
          duration: 1,
          tags: { name: modulePath },
        },
        {
          id: 3,
          traceId: "trace/with/slash",
          name: "build-module-ts",
          duration: 1,
          tags: { name: modulePath },
        },
      ]),
      catalog
    );
    expect(invalidIds.detail.quality.invalidIds).toBe(2);
    expect(invalidIds.detail.quality.invalidTraceIds).toBe(1);
  });

  it("marks deadline, invalid clock, rollback and oversized lines as partial", () => {
    const deadlineTicks = [0, 1000, 1000, 1000];
    let deadlineIndex = 0;
    const deadline = summarizeBuildTraceReport(
      encode([{ id: 1, name: "next-build", duration: 1000 }]),
      catalog,
      () => deadlineTicks[Math.min(deadlineIndex++, deadlineTicks.length - 1)]
    );
    expect(deadline.status).toBe("partial");
    expect(deadline.reasons).toContain("deadline");
    expect(deadline.detail.status).toBe("partial");
    expect(Number.isFinite(deadline.detail.elapsedMs)).toBe(true);
    expect(deadline.detail.moduleCoverage.every((row) => !row.complete)).toBe(
      true
    );
    expect(deadline.detail.routeCoverage.complete).toBe(false);

    for (const ticks of [
      [10, 9, 9, 9],
      [10, Number.NaN, Number.NaN],
    ]) {
      let index = 0;
      const report = summarizeBuildTraceReport(
        encode([{ id: 1, name: "next-build", duration: 1000 }]),
        catalog,
        () => ticks[Math.min(index++, ticks.length - 1)]
      );
      expect(report.status).toBe("partial");
      expect(report.reasons).toContain("clock_invalid");
      expect(report.detail.status).toBe("partial");
      expect(report.detail.elapsedMs).toBeNull();
    }

    const oversizedLine = summarizeBuildTraceReport(
      Buffer.from("x".repeat(MAX_TRACE_LINE_BYTES + 1)),
      catalog,
      () => 0
    );
    expect(oversizedLine.status).toBe("partial");
    expect(oversizedLine.reasons).toContain("line_limit");
  });

  it("keeps unknown package and runtime route values out of output", () => {
    const privatePackage = "unlisted-private-package";
    const privateRoute = "/owner/attendance/runtime-athlete-901";
    const report = summarizeBuildTraceReport(
      encode([
        { id: 1, name: "worker-main-server", duration: 10 },
        {
          id: 2,
          parentId: 1,
          name: "webpack-compilation",
          duration: 9,
          tags: { name: "server" },
        },
        {
          id: 3,
          parentId: 2,
          name: "build-module-js",
          duration: 8,
          tags: {
            name: `/repo/node_modules/${privatePackage}/private.js?token=hidden`,
          },
        },
        {
          id: 4,
          parentId: 2,
          name: "check-page",
          duration: 7,
          tags: { page: privateRoute },
        },
      ]),
      catalog
    );
    expect(report.detail.modules).toContainEqual(
      expect.objectContaining({ moduleId: "unknown" })
    );
    expect(report.detail.quality.unknownModuleIds).toBe(1);
    expect(report.detail.routeChecks).toEqual([]);
    expect(report.detail.quality.unattributedRoutes).toBe(1);
    expect(report.status).toBe("complete");
    expect(JSON.stringify(report)).not.toContain(privatePackage);
    expect(JSON.stringify(report)).not.toContain(privateRoute);
    expect(JSON.stringify(report)).not.toContain("token=hidden");
  });

  it("keeps the ten largest real catalog modules per compiler within the output cap", () => {
    const paths = [...catalog.sourcePaths]
      .filter((path) => path.length <= 150)
      .slice(0, 300);
    expect(paths).toHaveLength(300);
    const events: unknown[] = [];
    let nextId = 1;
    const compilers = ["client", "server", "edge-server"] as const;
    for (const compiler of compilers) {
      const workerId = nextId++;
      events.push({
        id: workerId,
        traceId: "many-modules",
        name: `worker-main-${compiler}`,
        duration: 500_000,
      });
      const compilationId = nextId++;
      events.push({
        id: compilationId,
        parentId: workerId,
        traceId: "many-modules",
        name: "webpack-compilation",
        duration: 400_000,
        tags: { name: compiler },
      });
      paths.forEach((path, index) =>
        events.push({
          id: nextId++,
          parentId: compilationId,
          traceId: "many-modules",
          name: "build-module-ts",
          duration: index + 1,
          tags: { name: `/repo/${path}` },
        })
      );
    }
    const lines: string[] = [];
    for (let start = 0; start < events.length; start += 200)
      lines.push(JSON.stringify(events.slice(start, start + 200)));
    const input = Buffer.from(lines.join("\n"));
    const report = summarizeBuildTraceReport(input, catalog, () => 0);
    expect(report.status).toBe("complete");
    expect(report.detail.modules).toHaveLength(compilers.length * 10);
    for (const compiler of compilers)
      expect(
        report.detail.modules.filter((row) => row.compiler === compiler)
      ).toHaveLength(10);
    expect(report.detail.moduleCoverage).toEqual(
      compilers.map((compiler) => ({
        compiler,
        limit: 10,
        totalGroups: 300,
        omittedGroups: 290,
        complete: true,
      }))
    );
    expect(report.detail.routeCoverage).toEqual({
      limit: 10,
      totalGroups: 0,
      omittedGroups: 0,
      complete: true,
    });
    expect(
      Buffer.byteLength(JSON.stringify(report), "utf8")
    ).toBeLessThanOrEqual(MAX_TRACE_OUTPUT_BYTES);
    const measured = summarizeBuildTraceReport(input, catalog);
    expect(
      measured.detail.elapsedMs === null ||
        (Number.isFinite(measured.detail.elapsedMs) &&
          measured.detail.elapsedMs >= 0)
    ).toBe(true);
  });

  it("does not retry a zero read when the final file size is larger", () => {
    const readAt = vi.fn(() => 0);
    const prefix = readTracePrefix(
      readAt,
      () => MAX_TRACE_BYTES + 1,
      MAX_TRACE_BYTES + 1
    );
    expect(readAt).toHaveBeenCalledOnce();
    expect(prefix.bytes).toHaveLength(0);
    expect(prefix.reasons).toContain("byte_limit");
    expect(prefix.reasons).not.toContain("read_error");
  });

  it("checks cooperative deadlines while scanning large aggregate maps", () => {
    let visited = 0;
    let checks = 0;
    function* groups() {
      for (let index = 0; index < 100_000; index++) yield index;
    }

    const result = scanTraceGroups(
      groups(),
      () => {
        visited++;
      },
      () => ++checks === 3
    );

    expect(result).toEqual({ scanned: 128, complete: false });
    expect(visited).toBe(128);
    expect(checks).toBe(3);
  });

  it("reads bounded regular files, rejects symlinks and reports missing input", () => {
    const root = mkdtempSync(join(tmpdir(), "trace-fixture-"));
    try {
      expect(readBuildTraceSummary(root).status).toBe("missing");
      mkdirSync(join(root, ".next"));
      const target = join(root, "fixture");
      writeFileSync(
        target,
        encode([{ id: 1, name: "next-build", duration: 1000 }])
      );
      symlinkSync(target, join(root, ".next", "trace"));
      expect(readBuildTraceSummary(root).status).toBe("read_error");
      rmSync(join(root, ".next", "trace"));
      writeFileSync(
        join(root, ".next", "trace"),
        encode([{ id: 1, name: "next-build", duration: 1000 }])
      );
      expect(readBuildTraceSummary(root).phases).toEqual([
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

  it("preserves success when diagnostic read or emit throws", async () => {
    for (const failure of ["read", "emit"] as const) {
      await expect(
        withBuildDiagnostic(
          async () => 42,
          () => {
            if (failure === "read") throw Error("secret");
            return [];
          },
          () => {
            if (failure === "emit") throw Error("secret");
          }
        )
      ).resolves.toBe(42);
    }
  });
});
