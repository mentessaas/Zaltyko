import { describe, expect, it } from "vitest";

const resolver = require("../scripts/ci/resolve-vite-with-baseline-rollup.cjs") as {
  OVERRIDE: string;
  UPDATE_ARGS: string[];
  filteredEnv: (env: Record<string, string>) => Record<string, string>;
  run: (input: { env: Record<string, string>; io: FakeIo }) => number;
};

const SHA = "a".repeat(40);
const BASE_MANIFEST = `${JSON.stringify({
  name: "fixture",
  devDependencies: { vite: "6.4.3", vitest: "4.1.11" },
  pnpm: { overrides: { uuid: "^11.1.1" } },
}, null, 2)}\n`;
const BASE_LOCK = "lock-base\n";

type FakeIo = {
  cwd: string;
  baseManifest: string;
  files: Record<string, string>;
  writes: string[];
  pnpmCalls: Array<{ args: string[]; options: Record<string, unknown> }>;
  failPnpm: boolean;
  driftManifest: boolean;
  compactManifest: boolean;
  duplicateManifestKey: boolean;
  driftHeadAfterResolver: boolean;
  driftStatusAfterResolver: boolean;
  head: string;
  status: string;
  execGit: (args: string[]) => string;
  readFile: (path: string) => string;
  writeFile: (path: string, content: string) => void;
  runPnpm: (args: string[], options: Record<string, unknown>) => { status: number | null; error?: Error };
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  errors: string[];
};

function fakeIo(): FakeIo {
  const io: FakeIo = {
    cwd: "/repo",
    baseManifest: BASE_MANIFEST,
    files: { "package.json": BASE_MANIFEST, "pnpm-lock.yaml": BASE_LOCK },
    writes: [], pnpmCalls: [], failPnpm: false, driftManifest: false, compactManifest: false,
    duplicateManifestKey: false, driftHeadAfterResolver: false, driftStatusAfterResolver: false,
    head: SHA, status: "",
    errors: [], execGit(args) {
      if (args[0] === "rev-parse") return `${io.head}\n`;
      if (args[0] === "status") return io.status;
      if (args[0] === "show" && args[1] === `${SHA}:package.json`) return io.baseManifest;
      if (args[0] === "show" && args[1] === `${SHA}:pnpm-lock.yaml`) return BASE_LOCK;
      throw new Error("unexpected git read");
    },
    readFile(path) { return io.files[path]; },
    writeFile(path, content) { io.writes.push(path); io.files[path] = content; },
    runPnpm(args, options) {
      io.pnpmCalls.push({ args, options });
      if (io.failPnpm) return { status: 1 };
      const manifest = JSON.parse(io.files["package.json"]);
      manifest.devDependencies.vite = "6.4.5";
      if (io.driftManifest) manifest.devDependencies.vitest = "9.9.9";
      io.files["package.json"] = `${JSON.stringify(manifest, null, io.compactManifest ? undefined : 2)}\n`;
      if (io.duplicateManifestKey) io.files["package.json"] = io.files["package.json"].replace(/\n}$/, ',\n  "name": "duplicate"\n}');
      io.files["pnpm-lock.yaml"] = "resolver-lock\n";
      io.status = " M package.json\n M pnpm-lock.yaml\n";
      if (io.driftHeadAfterResolver) io.head = "b".repeat(40);
      if (io.driftStatusAfterResolver) io.status += "?? unexpected.txt\n";
      return { status: 0 };
    },
    writeStdout() {}, writeStderr(text) { io.errors.push(text); },
  };
  return io;
}

describe("temporary Vite Rollup resolver", () => {
  it("preserves existing overrides, uses exact pnpm args, and leaves only the Vite pin", () => {
    const io = fakeIo();
    expect(resolver.run({ env: { BASE_SHA: SHA, TOKEN_SHOULD_NOT_PASS: "secret" }, io })).toBe(0);
    expect(io.pnpmCalls[0].args).toEqual(resolver.UPDATE_ARGS);
    expect(io.pnpmCalls[0].options).toMatchObject({ shell: false, stdio: "inherit" });
    expect((io.pnpmCalls[0].options.env as Record<string, string>).TOKEN_SHOULD_NOT_PASS).toBeUndefined();
    const final = JSON.parse(io.files["package.json"]);
    expect(final.devDependencies).toEqual({ vite: "6.4.5", vitest: "4.1.11" });
    expect(final.pnpm.overrides).toEqual({ uuid: "^11.1.1" });
    expect(io.writes).toEqual(["package.json", "package.json"]);
    expect(io.files["pnpm-lock.yaml"]).toBe("resolver-lock\n");
    expect(io.errors).toEqual([]);
  });

  it("accepts pnpm JSON formatting changes but restores the original manifest formatting", () => {
    const io = fakeIo();
    io.compactManifest = true;
    expect(resolver.run({ env: { BASE_SHA: SHA }, io })).toBe(0);
    expect(io.files["package.json"]).toBe(BASE_MANIFEST.replace('"vite": "6.4.3"', '"vite": "6.4.5"'));
    expect(io.errors).toEqual([]);
  });

  it("rejects a pre-existing temporary selector before writing or resolving", () => {
    const io = fakeIo();
    const manifest = JSON.parse(io.baseManifest);
    manifest.pnpm.overrides[resolver.OVERRIDE] = "4.63.1";
    io.baseManifest = `${JSON.stringify(manifest, null, 2)}\n`;
    io.files["package.json"] = io.baseManifest;
    expect(resolver.run({ env: { BASE_SHA: SHA }, io })).toBe(1);
    expect(io.writes).toEqual([]);
    expect(io.pnpmCalls).toEqual([]);
    expect(io.errors.join("")).toContain("OVERRIDE_EXISTS");
  });

  it("rejects a working manifest that differs from the authoritative base", () => {
    const io = fakeIo();
    io.files["package.json"] = BASE_MANIFEST.replace('"vitest": "4.1.11"', '"vitest": "9.9.9"');
    expect(resolver.run({ env: { BASE_SHA: SHA }, io })).toBe(1);
    expect(io.writes).toEqual([]);
    expect(io.pnpmCalls).toEqual([]);
    expect(io.errors.join("")).toContain("BASE_MANIFEST_MISMATCH");
  });

  it("requires the expected HEAD and a clean checkout before writing", () => {
    const cases: Array<[(io: FakeIo) => void, string]> = [
      [(io: FakeIo) => { io.head = "b".repeat(40); }, "BASE_HEAD_MISMATCH"],
      [(io: FakeIo) => { io.status = "?? unrelated.txt\n"; }, "STATUS_DIRTY"],
    ];
    for (const [change, code] of cases) {
      const io = fakeIo();
      change(io);
      expect(resolver.run({ env: { BASE_SHA: SHA }, io })).toBe(1);
      expect(io.writes).toEqual([]);
      expect(io.pnpmCalls).toEqual([]);
      expect(io.errors.join("")).toContain(code);
    }
  });

  it("fails closed on resolver failure without writing the lockfile or projecting", () => {
    const io = fakeIo();
    io.failPnpm = true;
    expect(resolver.run({ env: { BASE_SHA: SHA }, io })).toBe(1);
    expect(io.writes).toEqual(["package.json"]);
    expect(io.files["pnpm-lock.yaml"]).toBe(BASE_LOCK);
    expect(io.pnpmCalls).toHaveLength(1);
    expect(io.errors.join("")).toContain("RESOLVER_FAILED");
  });

  it("rejects resolver manifest drift and never writes the lockfile itself", () => {
    const io = fakeIo();
    io.driftManifest = true;
    expect(resolver.run({ env: { BASE_SHA: SHA }, io })).toBe(1);
    expect(io.writes).toEqual(["package.json"]);
    expect(io.files["pnpm-lock.yaml"]).toBe("resolver-lock\n");
    expect(io.errors.join("")).toContain("RESOLVER_MANIFEST_SCOPE");
  });

  it("rejects duplicate JSON keys from the resolver", () => {
    const io = fakeIo();
    io.duplicateManifestKey = true;
    expect(resolver.run({ env: { BASE_SHA: SHA }, io })).toBe(1);
    expect(io.writes).toEqual(["package.json"]);
    expect(io.errors.join("")).toContain("MANIFEST_DUPLICATE_KEY");
  });

  it("rechecks HEAD and the two-file status before removing the temporary override", () => {
    const cases: Array<["driftHeadAfterResolver" | "driftStatusAfterResolver", string]> = [
      ["driftHeadAfterResolver", "BASE_HEAD_MISMATCH"],
      ["driftStatusAfterResolver", "STATUS_DRIFT"],
    ];
    for (const [field, code] of cases) {
      const io = fakeIo();
      io[field] = true;
      expect(resolver.run({ env: { BASE_SHA: SHA }, io })).toBe(1);
      expect(io.writes).toEqual(["package.json"]);
      expect(io.errors.join("")).toContain(code);
    }
  });

  it("does not pass environment values outside the explicit pnpm allowlist", () => {
    expect(resolver.filteredEnv({ PATH: "/bin", HOME: "/tmp", NODE_ENV: "test", NPM_TOKEN: "secret" })).toEqual({
      PATH: "/bin", HOME: "/tmp", NODE_ENV: "test", npm_config_userconfig: "/dev/null",
    });
  });
});
