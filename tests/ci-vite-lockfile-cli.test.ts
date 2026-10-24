import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const cli = require("../scripts/ci/project-vite-lockfile-refresh.cjs") as {
  MAX_GIT_OUTPUT_BYTES: number;
  OUTPUT_FIELDS: Array<[string, string]>;
  VERIFY_ENV: Record<string, string>;
  CliFailure: new (code: string) => Error & { code: string };
  execGit: (args: string[], io: { execGit: (...args: unknown[]) => string }) => string;
  parseStatus: (text: string) => { manifest: number; lockfile: number; modules: number };
  runCli: (input: { argv?: string[]; env?: Record<string, string>; io: FakeIo }) => number;
};

const core = require("../scripts/ci/project-vite-lockfile-core.cjs") as {
  INTEGRITY: string;
  projectViteLockfileCore: (input: {
    baseManifestText: string;
    rawManifestText: string;
    baseLockfileText: string;
    rawLockfileText: string;
  }) => { manifestText: string; lockfileText: string; hashes: Record<string, string> };
  sha256: (text: string) => string;
};

const BASE_SHA = "f".repeat(40);
const STATUS = " M package.json\n M pnpm-lock.yaml\n";
const STATUS_WITH_MODULES = STATUS + "?? node_modules/\n";
const peerContext = "@types/node@20.19.43)(jiti@1.21.7)(terser@5.51.2)(tsx@4.23.13";
const viteContext = (version: string) => `${version}(${peerContext})`;

type FakeIo = {
  execGit: (args: string[], options: { encoding: string; maxBuffer: number }) => string;
  readFile: (path: string) => string;
  writeFile: (path: string, content: string) => void;
  appendFile: (path: string, content: string) => void;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
};

function replaceUnique(text: string, before: string, after: string) {
  const index = text.indexOf(before);
  if (index < 0 || text.indexOf(before, index + before.length) >= 0) throw new Error("fixture mismatch");
  return text.slice(0, index) + after + text.slice(index + before.length);
}

const OLD_VITE_INTEGRITY = "sha512-NTKlcQjlAK7MlQoyb6LgaqHc8sso/pVyUJYWMws3jg21uTJw/LddqIFPcPqP6PzpgbIcZyKI85sFE4HBrQDA8A==";

function checkoutFilesAtVersion(manifestText: string, lockfileText: string, from: string, to: string) {
  if (!lockfileText.includes(`vite@${from}`)) throw new Error("checkout lockfile locator mismatch");
  const integrityFrom = from === "6.4.3" ? OLD_VITE_INTEGRITY : core.INTEGRITY;
  const integrityTo = to === "6.4.3" ? OLD_VITE_INTEGRITY : core.INTEGRITY;
  let nextLockfileText = lockfileText
    .replaceAll(`vite@${from}`, `vite@${to}`)
    .replaceAll(viteContext(from), viteContext(to));
  nextLockfileText = replaceUnique(nextLockfileText, `        specifier: ${from}\n`, `        specifier: ${to}\n`);
  nextLockfileText = replaceUnique(nextLockfileText, integrityFrom, integrityTo);
  return {
    manifestText: replaceUnique(manifestText, `"vite": "${from}"`, `"vite": "${to}"`),
    lockfileText: nextLockfileText,
  };
}

function realRawInput(requestedSourceVersion?: "6.4.3" | "6.4.5") {
  const checkoutManifestText = readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8");
  const checkoutLockfileText = readFileSync(fileURLToPath(new URL("../pnpm-lock.yaml", import.meta.url)), "utf8");
  const packageJson = JSON.parse(checkoutManifestText) as { devDependencies?: { vite?: string } };
  const checkoutVersion = packageJson.devDependencies?.vite;
  if (checkoutVersion !== "6.4.3" && checkoutVersion !== "6.4.5") {
    throw new Error(`unsupported checkout Vite pin: ${String(checkoutVersion)}`);
  }
  const sourceVersion = requestedSourceVersion ?? checkoutVersion;
  const sourceFiles = checkoutVersion === sourceVersion
    ? { manifestText: checkoutManifestText, lockfileText: checkoutLockfileText }
    : checkoutFilesAtVersion(checkoutManifestText, checkoutLockfileText, checkoutVersion, sourceVersion);
  const fromVersion = sourceVersion;
  const toVersion = sourceVersion === "6.4.3" ? "6.4.5" : "6.4.3";
  const targetFiles = checkoutFilesAtVersion(sourceFiles.manifestText, sourceFiles.lockfileText, fromVersion, toVersion);
  const baseFiles = sourceVersion === "6.4.3" ? sourceFiles : targetFiles;
  const rawFiles = sourceVersion === "6.4.3" ? targetFiles : sourceFiles;
  return {
    baseManifestText: baseFiles.manifestText,
    rawManifestText: rawFiles.manifestText,
    baseLockfileText: baseFiles.lockfileText,
    rawLockfileText: rawFiles.lockfileText,
    sourceVersion,
  };
}

function mockIo(input: ReturnType<typeof realRawInput>, initialStatus = STATUS) {
  const files: Record<string, string> = {
    "package.json": input.rawManifestText,
    "pnpm-lock.yaml": input.rawLockfileText,
  };
  const calls: Array<{ args: string[]; maxBuffer: number }> = [];
  const writes: string[] = [];
  const output: string[] = [];
  const errors: string[] = [];
  const appended: Array<{ path: string; content: string }> = [];
  const io: FakeIo = {
    execGit(args, options) {
      calls.push({ args, maxBuffer: options.maxBuffer });
      if (args[0] === "rev-parse") return BASE_SHA + "\n";
      if (args[0] === "status") return initialStatus;
      if (args[0] === "show") {
        return args[1].endsWith(":package.json") ? input.baseManifestText : input.baseLockfileText;
      }
      if (args[0] === "diff" && args[1] === "--name-only") return "package.json\npnpm-lock.yaml\n";
      if (args[0] === "diff") return "guarded diff\n";
      throw new Error("unexpected git command");
    },
    readFile(path) { return files[path]; },
    writeFile(path, content) { writes.push(path); files[path] = content; },
    appendFile(path, content) { appended.push({ path, content }); },
    writeStdout(text) { output.push(text); },
    writeStderr(text) { errors.push(text); },
  };
  return { io, files, calls, writes, output, errors, appended };
}

function expectedEnv(hashes: Record<string, string>) {
  return Object.fromEntries(cli.OUTPUT_FIELDS.map(([outputName]) => [
    cli.VERIFY_ENV[outputName], hashes[outputName],
  ]));
}

describe("Vite lockfile refresh CLI", () => {
  it("accepts only the exact unstaged target status and optional node_modules directory", () => {
    expect(cli.parseStatus(STATUS)).toEqual({ manifest: 1, lockfile: 1, modules: 0 });
    expect(cli.parseStatus(STATUS_WITH_MODULES)).toEqual({ manifest: 1, lockfile: 1, modules: 1 });
    for (const status of [
      "M  package.json\n M pnpm-lock.yaml\n",
      STATUS + "?? .DS_Store\n",
      STATUS + " M package-lock.json\n",
      STATUS + "?? node_modules-extra/\n",
      " M pnpm-lock.yaml\n",
    ]) expect(() => cli.parseStatus(status)).toThrow(cli.CliFailure);
  });

  it("passes the 4 MiB cap to every Git call", () => {
    let observed: unknown[] = [];
    const result = cli.execGit(["rev-parse", "HEAD"], {
      execGit: (...args: unknown[]) => { observed = args; return "head\n"; },
    });
    expect(result).toBe("head\n");
    expect(observed[1]).toEqual({ encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
    expect(cli.MAX_GIT_OUTPUT_BYTES).toBe(4 * 1024 * 1024);
  });

  it("rejects Git output larger than 4 MiB", () => {
    expect(() => cli.execGit(["rev-parse", "HEAD"], {
      execGit: () => "x".repeat(cli.MAX_GIT_OUTPUT_BYTES + 1),
    })).toThrow(cli.CliFailure);
  });

  it("rejects an invalid head before any writes", () => {
    const input = realRawInput();
    const harness = mockIo(input);
    const result = cli.runCli({ env: { BASE_SHA: "0".repeat(40) }, io: {
      ...harness.io,
      execGit(args, options) {
        if (args[0] === "rev-parse") return "1".repeat(40) + "\n";
        return harness.io.execGit(args, options);
      },
    } });
    expect(result).toBe(1);
    expect(harness.writes).toEqual([]);
    expect(harness.output).toEqual([]);
    expect(harness.errors.join("")).toMatch(/code=BASE_HEAD_MISMATCH/);
  });

  it("does not write before core validation and emits only allowlisted errors", () => {
    const input = realRawInput();
    const harness = mockIo(input);
    harness.files["package.json"] = replaceUnique(input.rawManifestText, '"react": "18.3.1"', '"react": "18.3.2"');
    const result = cli.runCli({ env: { BASE_SHA }, io: harness.io });
    expect(result).toBe(1);
    expect(harness.writes).toEqual([]);
    expect(harness.output).toEqual([]);
    expect(harness.errors.join("")).toMatch(/^Vite lockfile refresh rejected: code=MANIFEST_SCOPE\n$/);
  });

  it("writes only the two guarded candidate files and appends six hash fields", () => {
    const input = realRawInput();
    const harness = mockIo(input, STATUS_WITH_MODULES);
    const result = cli.runCli({ env: { BASE_SHA, GITHUB_OUTPUT: "gha-output" }, io: harness.io });
    expect(result).toBe(0);
    expect(harness.writes).toEqual(["package.json", "pnpm-lock.yaml"]);
    expect(harness.appended).toHaveLength(1);
    expect(harness.appended[0].path).toBe("gha-output");
    const outputLines = harness.appended[0].content.trimEnd().split("\n");
    expect(outputLines).toHaveLength(cli.OUTPUT_FIELDS.length + 1);
    expect(outputLines[0]).toBe(`base_sha=${BASE_SHA}`);
    expect(outputLines.slice(1).map((line) => line.split("=", 1)[0])).toEqual(
      cli.OUTPUT_FIELDS.map(([outputName]) => outputName),
    );
    expect(outputLines.slice(1).every((line) => /^[a-z0-9_]+=[a-f0-9]{64}$/.test(line))).toBe(true);
    expect(harness.output.join("")).not.toContain("vite@6.4.5");
    expect(harness.errors).toEqual([]);
    expect(harness.calls.every((call) => call.maxBuffer === cli.MAX_GIT_OUTPUT_BYTES)).toBe(true);
    expect(harness.calls.filter((call) => call.args[0] === "status").every((call) =>
      JSON.stringify(call.args) === JSON.stringify(["status", "--porcelain=v1", "--untracked-files=normal"]),
    )).toBe(true);
  });

  it("accepts a checkout fixture already pinned to 6.4.5 with a synthetic 6.4.3 base", () => {
    const input = realRawInput("6.4.5");
    expect(input.sourceVersion).toBe("6.4.5");
    expect(JSON.parse(input.rawManifestText).devDependencies.vite).toBe("6.4.5");
    expect(JSON.parse(input.baseManifestText).devDependencies.vite).toBe("6.4.3");
    const harness = mockIo(input);
    const result = cli.runCli({ env: { BASE_SHA }, io: harness.io });
    expect(result).toBe(0);
    expect(harness.writes).toEqual(["package.json", "pnpm-lock.yaml"]);
    expect(harness.errors).toEqual([]);
  });

  it("does not write when the permitted status changes before projection", () => {
    const input = realRawInput();
    const harness = mockIo(input);
    let statusCalls = 0;
    const io = {
      ...harness.io,
      execGit(args: string[], options: { encoding: string; maxBuffer: number }) {
        if (args[0] === "status") {
          statusCalls += 1;
          if (statusCalls === 2) return STATUS + " M README.md\n";
        }
        return harness.io.execGit(args, options);
      },
    };
    const result = cli.runCli({ env: { BASE_SHA }, io });
    expect(result).toBe(1);
    expect(harness.writes).toEqual([]);
    expect(harness.output).toEqual([]);
    expect(harness.calls.some((call) => call.args[0] === "diff")).toBe(false);
    expect(harness.errors.join("")).toContain("code=STATUS_SCOPE");
  });

  it("fails post-write hash verification if a write is changed", () => {
    const input = realRawInput();
    const harness = mockIo(input);
    const io = {
      ...harness.io,
      writeFile(path: string, content: string) {
        harness.io.writeFile(path, path === "package.json" ? content + "\n" : content);
      },
    };
    const result = cli.runCli({ env: { BASE_SHA }, io });
    expect(result).toBe(1);
    expect(harness.writes).toEqual(["package.json", "pnpm-lock.yaml"]);
    expect(harness.output).toEqual([]);
    expect(harness.errors.join("")).toContain("code=POST_WRITE_HASH");
  });

  it("fails closed if the GitHub output append fails", () => {
    const input = realRawInput();
    const harness = mockIo(input);
    const io = { ...harness.io, appendFile() { throw new Error("sensitive output path"); } };
    const result = cli.runCli({ env: { BASE_SHA, GITHUB_OUTPUT: "/private/path" }, io });
    expect(result).toBe(1);
    expect(harness.output).toEqual([]);
    expect(harness.errors.join("")).toBe("Vite lockfile refresh rejected: code=OUTPUT_WRITE\n");
    expect(harness.errors.join("")).not.toContain("/private/path");
  });

  it("verifies hashes and both global guards before requesting or printing a diff", () => {
    const input = realRawInput();
    const projection = core.projectViteLockfileCore(input);
    const harness = mockIo(input);
    harness.files["package.json"] = projection.manifestText;
    harness.files["pnpm-lock.yaml"] = projection.lockfileText;
    const env = {
      BASE_SHA,
      ...expectedEnv({
        base_manifest_sha256: projection.hashes.baseManifestSha256,
        raw_manifest_sha256: projection.hashes.rawManifestSha256,
        projected_manifest_sha256: projection.hashes.projectedManifestSha256,
        base_lockfile_sha256: projection.hashes.baseLockfileSha256,
        raw_lockfile_sha256: projection.hashes.rawLockfileSha256,
        projected_lockfile_sha256: projection.hashes.projectedLockfileSha256,
      }),
    };
    const result = cli.runCli({ argv: ["--verify"], env, io: harness.io });
    expect(result).toBe(0);
    expect(harness.output).toEqual(["guarded diff\n"]);
    expect(harness.calls.slice(-2).map((call) => call.args[0])).toEqual(["diff", "diff"]);
  });

  it("does not request or print a diff when a projected hash is wrong", () => {
    const input = realRawInput();
    const projection = core.projectViteLockfileCore(input);
    const harness = mockIo(input);
    harness.files["package.json"] = projection.manifestText;
    harness.files["pnpm-lock.yaml"] = projection.lockfileText;
    const env = {
      BASE_SHA,
      ...expectedEnv({
        base_manifest_sha256: projection.hashes.baseManifestSha256,
        raw_manifest_sha256: projection.hashes.rawManifestSha256,
        projected_manifest_sha256: "0".repeat(64),
        base_lockfile_sha256: projection.hashes.baseLockfileSha256,
        raw_lockfile_sha256: projection.hashes.rawLockfileSha256,
        projected_lockfile_sha256: projection.hashes.projectedLockfileSha256,
      }),
    };
    const result = cli.runCli({ argv: ["--verify"], env, io: harness.io });
    expect(result).toBe(1);
    expect(harness.calls.some((call) => call.args[0] === "diff")).toBe(false);
    expect(harness.output).toEqual([]);
  });

  it("rejects verify hashes without the EXPECTED_ prefix", () => {
    const input = realRawInput();
    const projection = core.projectViteLockfileCore(input);
    const harness = mockIo(input);
    harness.files["package.json"] = projection.manifestText;
    harness.files["pnpm-lock.yaml"] = projection.lockfileText;
    const result = cli.runCli({
      argv: ["--verify"],
      env: {
        BASE_SHA,
        BASE_MANIFEST_SHA256: projection.hashes.baseManifestSha256,
        RAW_MANIFEST_SHA256: projection.hashes.rawManifestSha256,
        PROJECTED_MANIFEST_SHA256: projection.hashes.projectedManifestSha256,
        BASE_LOCKFILE_SHA256: projection.hashes.baseLockfileSha256,
        RAW_LOCKFILE_SHA256: projection.hashes.rawLockfileSha256,
        PROJECTED_LOCKFILE_SHA256: projection.hashes.projectedLockfileSha256,
      },
      io: harness.io,
    });
    expect(result).toBe(1);
    expect(harness.calls.some((call) => call.args[0] === "diff")).toBe(false);
    expect(harness.output).toEqual([]);
    expect(harness.errors.join("")).toContain("code=HASH_FORMAT");
  });

  it("rejects semantically changed candidate bytes even when their projected hash is recalculated", () => {
    const input = realRawInput();
    const projection = core.projectViteLockfileCore(input);
    const harness = mockIo(input);
    harness.files["package.json"] = projection.manifestText;
    harness.files["pnpm-lock.yaml"] = projection.lockfileText.replace(
      "  autoInstallPeers: true\n",
      "  autoInstallPeers: false\n",
    );
    const env = {
      BASE_SHA,
      ...expectedEnv({
        base_manifest_sha256: projection.hashes.baseManifestSha256,
        raw_manifest_sha256: projection.hashes.rawManifestSha256,
        projected_manifest_sha256: projection.hashes.projectedManifestSha256,
        base_lockfile_sha256: projection.hashes.baseLockfileSha256,
        raw_lockfile_sha256: projection.hashes.rawLockfileSha256,
        projected_lockfile_sha256: core.sha256(harness.files["pnpm-lock.yaml"]),
      }),
    };
    const result = cli.runCli({ argv: ["--verify"], env, io: harness.io });
    expect(result).toBe(1);
    expect(harness.calls.some((call) => call.args[0] === "diff")).toBe(false);
    expect(harness.output).toEqual([]);
  });
});
