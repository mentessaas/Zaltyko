import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { isAbsolute, relative, resolve, sep } from "node:path";
import {
  buildTracePackageNames,
  buildTraceSourcePaths,
} from "./local-build-trace-catalog";

export const MAX_TRACE_BYTES = 8 * 1024 * 1024;
export const MAX_TRACE_LINE_BYTES = 1024 * 1024;
export const MAX_TRACE_EVENTS = 100_000;
export const MAX_TRACE_NODES = 100_000;
export const MAX_TRACE_PARENT_DEPTH = 64;
export const MAX_TRACE_ANALYSIS_MS = 1_000;
export const MAX_TRACE_OUTPUT_BYTES = 16 * 1024;

const MAX_MODULE_REQUEST_CHARS = 4_096;
const MAX_CANONICAL_ID_CHARS = 160;
const MAX_DURATION_US = 86_400_000_000;
const compilers = ["client", "server", "edge-server"] as const;
type Compiler = (typeof compilers)[number];
const compilerSet = new Set<string>(compilers);
const phases = [
  "next-build",
  "run-webpack-compiler",
  "static-generation",
  "node-file-trace-build",
  "apply-include-excludes",
] as const;
type Phase = (typeof phases)[number];
const phaseSet = new Set<string>(phases);
const workerCompilerByName = new Map<string, Compiler>([
  ["worker-main-client", "client"],
  ["worker-main-server", "server"],
  ["worker-main-edge-server", "edge-server"],
]);
const moduleSpanTypes = new Map<string, string>([
  ["build-module", "unknown"],
  ...[
    "cjs",
    "css",
    "html",
    "js",
    "json",
    "jsx",
    "less",
    "mdx",
    "mjs",
    "png",
    "sass",
    "scss",
    "svg",
    "ts",
    "tsx",
    "wasm",
    "webp",
    "woff",
    "woff2",
  ].map((extension) => [`build-module-${extension}`, extension] as const),
]);
const routeSpanNames = new Set([
  "check-page",
  "is-page-static",
  "is-page-static-utils",
]);
const compilerTraceSpanNames = new Set([
  "node-file-trace-plugin",
  "collect-traced-files",
]);
const globalTraceSpanNames = new Set([
  "node-file-trace-build",
  "apply-include-excludes",
]);
const staticRouteTemplates = new Set([
  "/owner",
  "/owner/attendance",
  "/owner/classes",
  "/owner/enrollments",
  "/owner/groups",
  "/owner/monthly-invoices",
  "/owner/payments",
]);

type PartialReason =
  | "byte_limit"
  | "line_limit"
  | "event_limit"
  | "node_limit"
  | "malformed_line"
  | "malformed_tail"
  | "deadline"
  | "clock_invalid"
  | "anchor_parent_gap"
  | "output_limit"
  | "read_error";

export type PhaseDuration = {
  phase: Phase;
  count: number;
  accumulatedDurationMs: number;
  maxDurationMs: number;
};

export type BuildTraceCatalog = {
  root: string;
  sourcePaths: ReadonlySet<string>;
  packageNames: ReadonlySet<string>;
  routeTemplates: ReadonlySet<string>;
};

export type BuildTraceDetail = {
  status:
    "complete" | "partial" | "missing" | "read_error" | "not_regular" | "empty";
  reasons: PartialReason[];
  elapsedMs: number | null;
  eventCount: number;
  modules: Array<{
    compiler: Compiler;
    moduleId: string;
    moduleType: string;
    count: number;
    inclusiveSpanSumMs: number;
    maxSpanMs: number;
  }>;
  moduleCoverage: Array<{
    compiler: Compiler;
    limit: 10;
    totalGroups: number;
    omittedGroups: number;
    complete: boolean;
  }>;
  routeCoverage: {
    limit: 10;
    totalGroups: number;
    omittedGroups: number;
    complete: boolean;
  };
  compilerSpans: Array<{
    span:
      | "worker-main-client"
      | "worker-main-server"
      | "worker-main-edge-server"
      | "webpack-compilation";
    compiler: Compiler;
    count: number;
    inclusiveSpanSumMs: number;
    maxSpanMs: number;
  }>;
  routeChecks: Array<{
    route: string;
    work: "check-page" | "is-page-static" | "is-page-static-utils";
    count: number;
    inclusiveSpanSumMs: number;
    maxSpanMs: number;
  }>;
  traceWork: Array<{
    work:
      | "node-file-trace-build"
      | "apply-include-excludes"
      | "node-file-trace-plugin"
      | "collect-traced-files";
    scope: "aggregate_only" | Compiler;
    count: number;
    inclusiveSpanSumMs: number;
    maxSpanMs: number;
    traceEntryCount?: number;
  }>;
  quality: {
    duplicateIds: number;
    orphanParents: number;
    cycles: number;
    depthExceeded: number;
    ambiguousCompilers: number;
    unattributedCompilerSpans: number;
    invalidCompilerAnchors: number;
    anchorParentGaps: number;
    unsupportedModuleSpans: number;
    unknownModuleIds: number;
    unattributedModules: number;
    unattributedRoutes: number;
    unattributedTraceWork: number;
    invalidIds: number;
    invalidTraceIds: number;
    invalidDurations: number;
    invalidTraceEntryCounts: number;
  };
};

export type BuildTraceSummary = {
  status: BuildTraceDetail["status"];
  reasons: PartialReason[];
  phases: PhaseDuration[];
  detail: BuildTraceDetail;
};

type Aggregate = { count: number; sumUs: number; maxUs: number };
type NodeKind =
  | "other"
  | "worker"
  | "webpack-compilation"
  | "module"
  | "route"
  | "trace-work";
type TraceNode = {
  namespace: string;
  id: number;
  parentId?: number;
  invalidParentId: boolean;
  kind: NodeKind;
  name?: string;
  compiler?: Compiler;
  compilerSpan?: BuildTraceDetail["compilerSpans"][number]["span"];
  moduleId?: string;
  moduleType?: string;
  routeId?: string;
  traceEntryCount?: number;
  durationUs?: number;
  duplicate: boolean;
};
type InputStatus =
  "complete" | "partial" | "missing" | "read_error" | "not_regular" | "empty";

function isSafePackageName(name: string): boolean {
  return (
    name.length <= MAX_CANONICAL_ID_CHARS - 4 &&
    /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name)
  );
}

function validRouteTemplate(route: string): boolean {
  if (route === "/") return true;
  if (
    !route.startsWith("/") ||
    route.length > MAX_CANONICAL_ID_CHARS ||
    /[\\?#%!\x00-\x1f\x7f]/.test(route)
  )
    return false;
  const segmentPattern =
    /^(?:[A-Za-z0-9._~@+-]+|\[[A-Za-z0-9_-]+\]|\[\.\.\.[A-Za-z0-9_-]+\]|\[\[\.\.\.[A-Za-z0-9_-]+\]\])$/;
  return route
    .slice(1)
    .split("/")
    .every(
      (segment) =>
        segment !== "." && segment !== ".." && segmentPattern.test(segment)
    );
}

/** Static versioned allowlists; unknown trace values never enter the output. */
export function createBuildTraceCatalog(root: string): BuildTraceCatalog {
  return {
    root: resolve(root),
    sourcePaths: buildTraceSourcePaths,
    packageNames: buildTracePackageNames,
    routeTemplates: staticRouteTemplates,
  };
}

function canonicalPackage(
  candidate: string,
  catalog: BuildTraceCatalog
): string | undefined {
  let packagePath = candidate;
  const nodeModulesMarker = "/node_modules/";
  const markerIndex = packagePath.lastIndexOf(nodeModulesMarker);
  if (markerIndex >= 0)
    packagePath = packagePath.slice(markerIndex + nodeModulesMarker.length);
  else if (packagePath.startsWith("node_modules/"))
    packagePath = packagePath.slice("node_modules/".length);
  const segments = packagePath.split("/");
  const name = segments[0]?.startsWith("@")
    ? segments.length >= 2
      ? `${segments[0]}/${segments[1]}`
      : undefined
    : segments[0];
  if (!name || !isSafePackageName(name) || !catalog.packageNames.has(name))
    return undefined;
  return `pkg:${name}`;
}

function canonicalModuleId(raw: unknown, catalog: BuildTraceCatalog): string {
  if (
    typeof raw !== "string" ||
    raw.length === 0 ||
    raw.length > MAX_MODULE_REQUEST_CHARS ||
    /[\x00-\x1f\x7f]/.test(raw)
  )
    return "unknown";

  const lastLoader = raw.slice(raw.lastIndexOf("!") + 1);
  const resource = lastLoader.split("?", 1)[0].replaceAll("\\", "/");
  if (!resource || resource.includes("!")) return "unknown";

  if (isAbsolute(resource)) {
    const relativePath = relative(catalog.root, resolve(resource))
      .split(sep)
      .join("/");
    if (
      relativePath &&
      relativePath.length <= MAX_CANONICAL_ID_CHARS - 5 &&
      !relativePath.startsWith("../") &&
      relativePath !== ".." &&
      !isAbsolute(relativePath) &&
      catalog.sourcePaths.has(relativePath)
    )
      return `repo:${relativePath}`;
    return canonicalPackage(resource, catalog) ?? "unknown";
  }

  if (catalog.sourcePaths.has(resource)) return `repo:${resource}`;
  return canonicalPackage(resource, catalog) ?? "unknown";
}

function canonicalRoute(
  raw: unknown,
  catalog: BuildTraceCatalog
): string | undefined {
  if (typeof raw !== "string" || !validRouteTemplate(raw)) return undefined;
  return catalog.routeTemplates.has(raw) ? raw : undefined;
}

function emptyQuality(): BuildTraceDetail["quality"] {
  return {
    duplicateIds: 0,
    orphanParents: 0,
    cycles: 0,
    depthExceeded: 0,
    ambiguousCompilers: 0,
    unattributedCompilerSpans: 0,
    invalidCompilerAnchors: 0,
    anchorParentGaps: 0,
    unsupportedModuleSpans: 0,
    unknownModuleIds: 0,
    unattributedModules: 0,
    unattributedRoutes: 0,
    unattributedTraceWork: 0,
    invalidIds: 0,
    invalidTraceIds: 0,
    invalidDurations: 0,
    invalidTraceEntryCounts: 0,
  };
}

function unavailableSummary(
  status: BuildTraceDetail["status"],
  elapsedMs: number | null,
  initialReasons: PartialReason[] = []
): BuildTraceSummary {
  const reasons = [...initialReasons].sort();
  return {
    status,
    reasons,
    phases: [],
    detail: {
      status,
      reasons,
      elapsedMs,
      eventCount: 0,
      modules: [],
      moduleCoverage: compilers.map((compiler) => ({
        compiler,
        limit: 10,
        totalGroups: 0,
        omittedGroups: 0,
        complete: true,
      })),
      routeCoverage: {
        limit: 10,
        totalGroups: 0,
        omittedGroups: 0,
        complete: true,
      },
      compilerSpans: [],
      routeChecks: [],
      traceWork: [],
      quality: emptyQuality(),
    },
  };
}

function validDuration(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_DURATION_US
  );
}

function validPositiveId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function addAggregate(
  target: Map<string, Aggregate>,
  key: string,
  durationUs: number
): void {
  const prior = target.get(key) ?? { count: 0, sumUs: 0, maxUs: 0 };
  if (!Number.isSafeInteger(prior.sumUs + durationUs)) return;
  target.set(key, {
    count: prior.count + 1,
    sumUs: prior.sumUs + durationUs,
    maxUs: Math.max(prior.maxUs, durationUs),
  });
}

export function parseTraceEntryCount(value: unknown): number | undefined {
  if (
    typeof value !== "number" &&
    (typeof value !== "string" || !/^\d{1,7}$/.test(value))
  )
    return undefined;
  const count = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(count) && count >= 0 && count <= 1_000_000
    ? count
    : undefined;
}

function elapsedMs(start: number | null, now: () => number): number | null {
  if (start === null) return null;
  try {
    const end = now();
    const elapsed = end - start;
    return Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= 60_000
      ? Math.round(elapsed * 1000) / 1000
      : null;
  } catch {
    return null;
  }
}

function durationFields(bucket: Aggregate) {
  return {
    count: bucket.count,
    inclusiveSpanSumMs: bucket.sumUs / 1000,
    maxSpanMs: bucket.maxUs / 1000,
  };
}

function insertTop<T>(
  rows: T[],
  candidate: T,
  compare: (left: T, right: T) => number
): void {
  rows.push(candidate);
  rows.sort(compare);
  if (rows.length > 10) rows.pop();
}

export function scanTraceGroups<T>(
  groups: Iterable<T>,
  visit: (group: T) => void,
  shouldStop: () => boolean
): { scanned: number; complete: boolean } {
  let scanned = 0;
  for (const group of groups) {
    if ((scanned & 63) === 0 && shouldStop())
      return { scanned, complete: false };
    visit(group);
    scanned++;
  }
  return { scanned, complete: true };
}

function reasonStatus(reasons: Set<PartialReason>): BuildTraceDetail["status"] {
  return reasons.size > 0 ? "partial" : "complete";
}

/** Parses the bounded trace prefix; IDs and tags are used only for aggregation. */
export function summarizeBuildTraceReport(
  input: Buffer,
  catalog: BuildTraceCatalog,
  now: () => number = () => performance.now(),
  initialReasons: readonly PartialReason[] = []
): BuildTraceSummary {
  if (!Buffer.isBuffer(input)) return unavailableSummary("read_error", null);
  const startedAt = (() => {
    try {
      const value = now();
      return Number.isFinite(value) ? value : null;
    } catch {
      return null;
    }
  })();
  const reasons = new Set<PartialReason>(initialReasons);
  if (startedAt === null) reasons.add("clock_invalid");
  const bytes = input.subarray(0, MAX_TRACE_BYTES);
  if (input.length > MAX_TRACE_BYTES) reasons.add("byte_limit");
  const text = bytes.toString("utf8");
  const lines = text.split("\n");
  const hasFinalNewline = text.endsWith("\n");
  if (hasFinalNewline) lines.pop();

  const phaseTotals = new Map<Phase, Aggregate>();
  const compilerSpanTotals = new Map<string, Aggregate>();
  const nodes: TraceNode[] = [];
  const byNamespace = new Map<string, Map<number, TraceNode>>();
  const duplicateIds = new Map<string, Set<number>>();
  const quality = emptyQuality();
  const anchorParentGapKeys = new Set<string>();
  const invalidCompilerAnchorIds = new Set<string>();
  const moduleGroupCounts = new Map<Compiler, number>(
    compilers.map((compiler) => [compiler, 0])
  );
  let eventCount = 0;
  let nodeCount = 0;
  let stopParsing = false;
  let lastClock = startedAt;

  const checkDeadline = (): boolean => {
    if (startedAt === null) return true;
    try {
      const current = now();
      if (
        !Number.isFinite(current) ||
        (lastClock !== null && current < lastClock)
      ) {
        reasons.add("clock_invalid");
        lastClock = null;
        return true;
      }
      lastClock = current;
      if (current - startedAt >= MAX_TRACE_ANALYSIS_MS) {
        reasons.add("deadline");
        return true;
      }
      return false;
    } catch {
      reasons.add("clock_invalid");
      return true;
    }
  };

  const addEvent = (event: unknown): void => {
    if (eventCount >= MAX_TRACE_EVENTS) {
      reasons.add("event_limit");
      stopParsing = true;
      return;
    }
    eventCount++;
    if (!event || typeof event !== "object" || Array.isArray(event)) return;
    const record = event as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name : "";
    const duration = record.duration;
    if (phaseSet.has(name) && validDuration(duration)) {
      const phase = name as Phase;
      addAggregate(phaseTotals, phase, duration);
    }
    if (duration !== undefined && !validDuration(duration))
      quality.invalidDurations++;

    const rawTraceId = record.traceId;
    let namespace: string;
    if (rawTraceId === undefined) {
      namespace = "no-trace-id";
    } else if (
      typeof rawTraceId === "string" &&
      rawTraceId.length <= 128 &&
      /^[A-Za-z0-9-]+$/.test(rawTraceId)
    ) {
      namespace = `trace:${rawTraceId}`;
    } else {
      quality.invalidTraceIds++;
      return;
    }

    if (!validPositiveId(record.id)) {
      quality.invalidIds++;
      return;
    }
    const parentMissing = record.parentId === undefined;
    const parentValid = parentMissing || validPositiveId(record.parentId);
    if (!parentValid) quality.invalidIds++;
    if (nodeCount >= MAX_TRACE_NODES) {
      reasons.add("node_limit");
      return;
    }

    const tags =
      record.tags &&
      typeof record.tags === "object" &&
      !Array.isArray(record.tags)
        ? (record.tags as Record<string, unknown>)
        : {};
    const workerCompiler = workerCompilerByName.get(name);
    if (
      workerCompiler &&
      (!validDuration(duration) ||
        !parentValid ||
        record.parentId === record.id)
    ) {
      const invalidAnchorKey = `${namespace}\u0000${record.id}`;
      if (!invalidCompilerAnchorIds.has(invalidAnchorKey)) {
        invalidCompilerAnchorIds.add(invalidAnchorKey);
        quality.invalidCompilerAnchors++;
      }
    }
    const compilationCompiler =
      name === "webpack-compilation" &&
      typeof tags.name === "string" &&
      compilerSet.has(tags.name)
        ? (tags.name as Compiler)
        : undefined;
    const compilerSpan = workerCompiler
      ? name
      : compilationCompiler
        ? "webpack-compilation"
        : undefined;
    const moduleType = moduleSpanTypes.get(name);
    if (name.startsWith("build-module-") && !moduleType)
      quality.unsupportedModuleSpans++;
    const routeName = routeSpanNames.has(name) ? name : undefined;
    const globalWork = globalTraceSpanNames.has(name) ? name : undefined;
    const compilerWork = compilerTraceSpanNames.has(name) ? name : undefined;
    const moduleId = moduleType
      ? canonicalModuleId(tags.name, catalog)
      : undefined;
    const routeId = routeName ? canonicalRoute(tags.page, catalog) : undefined;
    const rawEntryCount =
      name === "node-file-trace-plugin" ? tags.traceEntryCount : undefined;
    const traceEntryCount = parseTraceEntryCount(rawEntryCount);
    if (rawEntryCount !== undefined && traceEntryCount === undefined)
      quality.invalidTraceEntryCounts++;

    const kind: NodeKind = workerCompiler
      ? "worker"
      : name === "webpack-compilation"
        ? "webpack-compilation"
        : moduleType
          ? "module"
          : routeName
            ? "route"
            : globalWork || compilerWork
              ? "trace-work"
              : "other";
    const node: TraceNode = {
      namespace,
      id: record.id,
      ...(parentValid && !parentMissing
        ? { parentId: record.parentId as number }
        : {}),
      invalidParentId: !parentValid,
      kind,
      ...((workerCompiler ?? compilationCompiler)
        ? { compiler: workerCompiler ?? compilationCompiler }
        : {}),
      ...(compilerSpan
        ? { compilerSpan: compilerSpan as TraceNode["compilerSpan"] }
        : {}),
      ...(moduleType ? { moduleType, moduleId } : {}),
      ...(routeName ? { name: routeName, routeId } : {}),
      ...(globalWork || compilerWork
        ? { name: globalWork ?? compilerWork }
        : {}),
      ...(traceEntryCount !== undefined ? { traceEntryCount } : {}),
      ...(validDuration(duration) ? { durationUs: duration } : {}),
      duplicate: false,
    };

    let map = byNamespace.get(namespace);
    if (!map) {
      map = new Map();
      byNamespace.set(namespace, map);
    }
    const duplicates = duplicateIds.get(namespace) ?? new Set<number>();
    if (map.has(node.id) || duplicates.has(node.id)) {
      const previous = map.get(node.id);
      if (previous) previous.duplicate = true;
      map.delete(node.id);
      duplicates.add(node.id);
      duplicateIds.set(namespace, duplicates);
      quality.duplicateIds++;
      node.duplicate = true;
    } else {
      map.set(node.id, node);
      nodes.push(node);
      nodeCount++;
    }
  };

  const parseLine = (line: string, isTail: boolean): void => {
    if (Buffer.byteLength(line, "utf8") > MAX_TRACE_LINE_BYTES) {
      reasons.add("line_limit");
      return;
    }
    if (!line.trim()) return;
    let batch: unknown;
    try {
      batch = JSON.parse(line);
    } catch {
      reasons.add(isTail ? "malformed_tail" : "malformed_line");
      return;
    }
    if (!Array.isArray(batch)) {
      reasons.add(isTail ? "malformed_tail" : "malformed_line");
      return;
    }
    for (let index = 0; index < batch.length; index++) {
      if ((index & 63) === 0 && checkDeadline()) {
        stopParsing = true;
        return;
      }
      addEvent(batch[index]);
      if (stopParsing) return;
    }
  };

  for (let index = 0; index < lines.length; index++) {
    if (checkDeadline()) {
      stopParsing = true;
      break;
    }
    parseLine(lines[index], !hasFinalNewline && index === lines.length - 1);
    if (stopParsing) break;
  }

  const moduleAggregates = new Map<string, Aggregate>();
  const routeAggregates = new Map<string, Aggregate>();
  const traceAggregates = new Map<string, Aggregate>();
  const traceEntryTotals = new Map<string, number>();
  const traceEntryOverflowKeys = new Set<string>();

  const resolveCompiler = (node: TraceNode): Compiler | undefined => {
    const seen = new Set<number>();
    const candidates = new Set<Compiler>();
    const map = byNamespace.get(node.namespace);
    const duplicates = duplicateIds.get(node.namespace);
    let current: TraceNode | undefined = node;
    let foundWorkerAnchor = false;
    let workerAnchorId: number | undefined;
    const workerAnchorIds = new Set<number>();
    for (let depth = 0; current; depth++) {
      if ((depth & 15) === 0 && checkDeadline()) return undefined;
      if (duplicates?.has(current.id) || current.duplicate) return undefined;
      if (seen.has(current.id)) {
        quality.cycles++;
        return undefined;
      }
      seen.add(current.id);
      if (current.compiler) candidates.add(current.compiler);
      if (current.kind === "worker") {
        if (current.durationUs === undefined || current.invalidParentId)
          return undefined;
        foundWorkerAnchor = true;
        workerAnchorId = current.id;
        workerAnchorIds.add(current.id);
        if (current.parentId === current.id) {
          quality.cycles++;
          return undefined;
        }
      }
      if (current.invalidParentId) return undefined;
      if (current.parentId === undefined) break;
      if (depth + 1 >= MAX_TRACE_PARENT_DEPTH) {
        quality.depthExceeded++;
        return undefined;
      }
      const parent: TraceNode | undefined = map?.get(current.parentId);
      if (!parent) {
        if (duplicates?.has(current.parentId)) return undefined;
        if (!foundWorkerAnchor) {
          quality.orphanParents++;
          return undefined;
        }
        const gapKey = `${node.namespace}\u0000${workerAnchorId}`;
        if (!anchorParentGapKeys.has(gapKey)) {
          anchorParentGapKeys.add(gapKey);
          quality.anchorParentGaps++;
        }
        reasons.add("anchor_parent_gap");
        break;
      }
      current = parent;
    }
    if (workerAnchorIds.size > 1 || candidates.size > 1) {
      quality.ambiguousCompilers++;
      return undefined;
    }
    return candidates.values().next().value as Compiler | undefined;
  };

  const resolveRoute = (node: TraceNode): string | undefined => {
    const map = byNamespace.get(node.namespace);
    const duplicates = duplicateIds.get(node.namespace);
    const seen = new Set<number>();
    let current: TraceNode | undefined = node;
    for (let depth = 0; current; depth++) {
      if ((depth & 15) === 0 && checkDeadline()) return undefined;
      if (duplicates?.has(current.id) || current.duplicate) return undefined;
      if (seen.has(current.id)) {
        quality.cycles++;
        return undefined;
      }
      seen.add(current.id);
      // A canonical route tag is self-identifying; inherited tags need clean ancestry.
      if (current.kind === "route" && current.routeId) return current.routeId;
      if (current.invalidParentId) return undefined;
      if (current.parentId === undefined) return undefined;
      if (depth + 1 >= MAX_TRACE_PARENT_DEPTH) {
        quality.depthExceeded++;
        return undefined;
      }
      const parent: TraceNode | undefined = map?.get(current.parentId);
      if (!parent) {
        if (!duplicates?.has(current.parentId)) quality.orphanParents++;
        return undefined;
      }
      current = parent;
    }
    return undefined;
  };

  for (let index = 0; index < nodes.length; index++) {
    if ((index & 63) === 0 && checkDeadline()) break;
    const node = nodes[index];
    if (node.duplicate) continue;
    if (node.kind === "module" && node.moduleId === "unknown")
      quality.unknownModuleIds++;
    if (node.compilerSpan && node.compiler && node.durationUs !== undefined) {
      if (resolveCompiler(node) === node.compiler) {
        addAggregate(
          compilerSpanTotals,
          `${node.compilerSpan}\u0000${node.compiler}`,
          node.durationUs
        );
      } else {
        quality.unattributedCompilerSpans++;
        if (reasons.has("deadline")) break;
      }
    }
    if (node.kind === "module" && node.durationUs !== undefined) {
      const compiler = resolveCompiler(node);
      if (!compiler) {
        quality.unattributedModules++;
        if (reasons.has("deadline")) break;
        continue;
      }
      const moduleKey = `${compiler}\u0000${node.moduleId ?? "unknown"}\u0000${node.moduleType ?? "unknown"}`;
      if (!moduleAggregates.has(moduleKey))
        moduleGroupCounts.set(
          compiler,
          (moduleGroupCounts.get(compiler) ?? 0) + 1
        );
      addAggregate(moduleAggregates, moduleKey, node.durationUs);
      continue;
    }
    if (node.kind === "route" && node.durationUs !== undefined) {
      const route = resolveRoute(node);
      if (!route || !node.name) {
        quality.unattributedRoutes++;
        if (reasons.has("deadline")) break;
        continue;
      }
      addAggregate(
        routeAggregates,
        `${route}\u0000${node.name}`,
        node.durationUs
      );
      continue;
    }
    if (
      node.kind === "trace-work" &&
      node.name &&
      node.durationUs !== undefined
    ) {
      if (globalTraceSpanNames.has(node.name)) {
        addAggregate(
          traceAggregates,
          `${node.name}\u0000aggregate_only`,
          node.durationUs
        );
        continue;
      }
      const compiler = resolveCompiler(node);
      if (!compiler) {
        quality.unattributedTraceWork++;
        if (reasons.has("deadline")) break;
        continue;
      }
      const key = `${node.name}\u0000${compiler}`;
      addAggregate(traceAggregates, key, node.durationUs);
      if (
        node.traceEntryCount !== undefined &&
        !traceEntryOverflowKeys.has(key)
      ) {
        const prior = traceEntryTotals.get(key) ?? 0;
        const total = parseTraceEntryCount(prior + node.traceEntryCount);
        if (total !== undefined) traceEntryTotals.set(key, total);
        else {
          traceEntryTotals.delete(key);
          traceEntryOverflowKeys.add(key);
          quality.invalidTraceEntryCounts++;
        }
      }
    }
  }

  const moduleRowsByCompiler = new Map<Compiler, BuildTraceDetail["modules"]>(
    compilers.map((compiler) => [compiler, []])
  );
  const scannedModuleGroups = new Map<Compiler, number>(
    compilers.map((compiler) => [compiler, 0])
  );
  const compareModules = (
    left: BuildTraceDetail["modules"][number],
    right: BuildTraceDetail["modules"][number]
  ) =>
    right.inclusiveSpanSumMs - left.inclusiveSpanSumMs ||
    left.moduleId.localeCompare(right.moduleId);
  const moduleScan = scanTraceGroups(
    moduleAggregates,
    ([key, bucket]) => {
      const [compilerName, moduleId, moduleType] = key.split("\u0000");
      if (!compilerSet.has(compilerName)) return;
      const compiler = compilerName as Compiler;
      const rows = moduleRowsByCompiler.get(compiler) ?? [];
      insertTop(
        rows,
        { compiler, moduleId, moduleType, ...durationFields(bucket) },
        compareModules
      );
      moduleRowsByCompiler.set(compiler, rows);
      scannedModuleGroups.set(
        compiler,
        (scannedModuleGroups.get(compiler) ?? 0) + 1
      );
    },
    checkDeadline
  );
  const modules = compilers.flatMap(
    (compiler) => moduleRowsByCompiler.get(compiler) ?? []
  );
  const moduleCoverage = compilers.map((compiler) => {
    const rows = moduleRowsByCompiler.get(compiler) ?? [];
    const totalGroups = moduleGroupCounts.get(compiler) ?? 0;
    return {
      compiler,
      limit: 10 as const,
      totalGroups,
      omittedGroups: Math.max(0, totalGroups - rows.length),
      complete:
        moduleScan.complete &&
        scannedModuleGroups.get(compiler) === totalGroups &&
        !reasons.has("deadline"),
    };
  });

  const compilerSpans = [...compilerSpanTotals.entries()]
    .map(([key, bucket]) => {
      const [span, compiler] = key.split("\u0000");
      if (
        span !== "worker-main-client" &&
        span !== "worker-main-server" &&
        span !== "worker-main-edge-server" &&
        span !== "webpack-compilation"
      )
        return undefined;
      if (!compilerSet.has(compiler)) return undefined;
      return {
        span,
        compiler: compiler as Compiler,
        ...durationFields(bucket),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== undefined)
    .sort(
      (a, b) =>
        a.span.localeCompare(b.span) || a.compiler.localeCompare(b.compiler)
    ) as BuildTraceDetail["compilerSpans"];

  const routeChecks: BuildTraceDetail["routeChecks"] = [];
  const compareRoutes = (
    left: BuildTraceDetail["routeChecks"][number],
    right: BuildTraceDetail["routeChecks"][number]
  ) =>
    right.inclusiveSpanSumMs - left.inclusiveSpanSumMs ||
    left.route.localeCompare(right.route);
  const routeScan = scanTraceGroups(
    routeAggregates,
    ([key, bucket]) => {
      const [route, work] = key.split("\u0000");
      if (
        work !== "check-page" &&
        work !== "is-page-static" &&
        work !== "is-page-static-utils"
      )
        return;
      insertTop(
        routeChecks,
        { route, work, ...durationFields(bucket) },
        compareRoutes
      );
    },
    checkDeadline
  );
  const routeCoverage = {
    limit: 10 as const,
    totalGroups: routeAggregates.size,
    omittedGroups: Math.max(0, routeAggregates.size - routeChecks.length),
    complete: routeScan.complete && !reasons.has("deadline"),
  };

  const traceWork = [...traceAggregates.entries()]
    .map(([key, bucket]) => {
      const [work, scope] = key.split("\u0000");
      if (
        work !== "node-file-trace-build" &&
        work !== "apply-include-excludes" &&
        work !== "node-file-trace-plugin" &&
        work !== "collect-traced-files"
      )
        return undefined;
      const row = {
        work,
        scope,
        ...durationFields(bucket),
        ...(traceEntryTotals.has(key)
          ? { traceEntryCount: traceEntryTotals.get(key) }
          : {}),
      };
      return row;
    })
    .filter((row): row is NonNullable<typeof row> => row !== undefined)
    .sort(
      (a, b) => a.work.localeCompare(b.work) || a.scope.localeCompare(b.scope)
    ) as BuildTraceDetail["traceWork"];

  checkDeadline();
  const elapsed = elapsedMs(startedAt, now);
  if (elapsed === null) reasons.add("clock_invalid");
  const phaseSummary = phases.flatMap((phase) => {
    const total = phaseTotals.get(phase);
    return total
      ? [
          {
            phase,
            count: total.count,
            accumulatedDurationMs: total.sumUs / 1000,
            maxDurationMs: total.maxUs / 1000,
          },
        ]
      : [];
  });

  const detail: BuildTraceDetail = {
    status: reasonStatus(reasons),
    reasons: [...reasons].sort(),
    elapsedMs: elapsed,
    eventCount,
    modules,
    moduleCoverage,
    routeCoverage,
    compilerSpans,
    routeChecks,
    traceWork,
    quality,
  };
  const report: BuildTraceSummary = {
    status: reasonStatus(reasons),
    reasons: [...reasons].sort(),
    phases: phaseSummary,
    detail,
  };
  while (
    Buffer.byteLength(JSON.stringify(report), "utf8") > MAX_TRACE_OUTPUT_BYTES
  ) {
    if (detail.modules.length) {
      const removed = detail.modules.pop();
      const coverage = detail.moduleCoverage.find(
        (row) => row.compiler === removed?.compiler
      );
      if (coverage) coverage.omittedGroups++;
    } else if (detail.routeChecks.length) {
      detail.routeChecks.pop();
      detail.routeCoverage.omittedGroups++;
    } else if (detail.traceWork.length) detail.traceWork.pop();
    else if (detail.compilerSpans.length) detail.compilerSpans.pop();
    else break;
    reasons.add("output_limit");
    detail.reasons = [...reasons].sort();
    report.reasons = detail.reasons;
    detail.status = "partial";
    report.status = "partial";
  }
  return report;
}

export function summarizeBuildTrace(bytes: Buffer): PhaseDuration[] {
  return summarizeBuildTraceReport(bytes, {
    root: process.cwd(),
    sourcePaths: new Set(),
    packageNames: new Set(),
    routeTemplates: new Set(),
  }).phases;
}

export function readTracePrefix(
  readAt: (
    buffer: Buffer,
    offset: number,
    length: number,
    position: number
  ) => number,
  getFileSize: () => number,
  initialFileSize = 0
): { bytes: Buffer; reasons: PartialReason[] } {
  const buffer = Buffer.alloc(MAX_TRACE_BYTES);
  const reasons = new Set<PartialReason>();
  let size = 0;
  if (initialFileSize > MAX_TRACE_BYTES) reasons.add("byte_limit");
  while (size < buffer.length) {
    let read: number;
    const requested = Math.min(64 * 1024, buffer.length - size);
    try {
      read = readAt(buffer, size, requested, size);
    } catch {
      reasons.add("read_error");
      break;
    }
    if (!Number.isSafeInteger(read) || read < 0 || read > requested) {
      reasons.add("read_error");
      break;
    }
    if (read === 0) break;
    size += read;
  }

  let finalSize: number;
  try {
    finalSize = getFileSize();
  } catch {
    finalSize = size;
    reasons.add("read_error");
  }
  if (!Number.isSafeInteger(finalSize) || finalSize < 0) {
    finalSize = size;
    reasons.add("read_error");
  }
  if (finalSize > MAX_TRACE_BYTES) reasons.add("byte_limit");
  else if (finalSize !== size) reasons.add("read_error");
  return {
    bytes: buffer.subarray(0, Math.min(size, finalSize)),
    reasons: [...reasons].sort(),
  };
}

export function readBuildTraceSummary(
  root: string,
  catalog: BuildTraceCatalog = createBuildTraceCatalog(root),
  now: () => number = () => performance.now()
): BuildTraceSummary {
  let fd: number | undefined;
  let initialReasons: PartialReason[] = [];
  let status: InputStatus = "complete";
  let bytes: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  let size = 0;
  try {
    fd = openSync(
      resolve(root, ".next", "trace"),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
    );
    const stat = fstatSync(fd);
    if (!stat.isFile()) return unavailableSummary("not_regular", 0);
    if (stat.size === 0) return unavailableSummary("empty", 0);
    const prefix = readTracePrefix(
      (buffer, offset, length, position) =>
        readSync(fd as number, buffer, offset, length, position),
      () => fstatSync(fd as number).size,
      stat.size
    );
    bytes = prefix.bytes;
    size = bytes.length;
    initialReasons = prefix.reasons;
    if (initialReasons.includes("read_error")) status = "partial";
    if (size === 0)
      return initialReasons.length
        ? unavailableSummary("partial", 0, initialReasons)
        : unavailableSummary("empty", 0);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    status = code === "ENOENT" ? "missing" : "read_error";
    if (size === 0) return unavailableSummary(status, 0);
    initialReasons.push("read_error");
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        /* Best effort diagnostic only. */
      }
    }
  }
  const summary = summarizeBuildTraceReport(
    bytes,
    catalog,
    now,
    initialReasons
  );
  if (status === "partial") {
    summary.status = "partial";
    summary.detail.status = "partial";
  }
  return summary;
}

/** Diagnostics must never replace the build error or bypass caller cleanup. */
export async function withBuildDiagnostic<T, TSummary>(
  build: () => Promise<T>,
  read: () => TSummary,
  emit: (summary: TSummary) => void
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
