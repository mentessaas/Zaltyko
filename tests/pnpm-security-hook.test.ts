import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { load } from "js-yaml";

type PackageManifest = {
  name: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const require = createRequire(import.meta.url);
const { readPackage } = require("../pnpmfile.cjs").hooks as {
  readPackage: (pkg: PackageManifest, context?: { log: (message: string) => void }) => PackageManifest;
};

describe("patched dependency compatibility", () => {
  it.each(["dependencies", "optionalDependencies", "devDependencies"] as const)(
    "preserves the body-parser API major in %s and leaves unknown majors alone",
    (field) => {
      for (const [requested, expected] of [
        ["~1.20.0", "^1.20.9"],
        ["^2.0.0", "^2.4.0"],
        ["^3.0.0", "^3.0.0"],
        ["workspace:*", "workspace:*"],
      ]) {
        const input: PackageManifest = { name: "consumer", [field]: { "body-parser": requested } };
        const output = readPackage(input);
        expect(output[field]?.["body-parser"]).toBe(expected);
        expect(input[field]?.["body-parser"]).toBe(requested);
      }
    }
  );

  it.each(["dependencies", "optionalDependencies", "devDependencies"] as const)(
    "lifts only the undici 7 line to its TLS and cache fix in %s",
    (field) => {
      for (const [requested, expected] of [
        ["^7.25.0", "^7.30.1"],
        ["7.29.1", "^7.30.1"],
        ["^6.21.0", "^6.21.0"],
        ["^8.12.3", "^8.12.3"],
      ]) {
        const input: PackageManifest = { name: "consumer", [field]: { undici: requested } };
        expect(readPackage(input)[field]?.undici).toBe(expected);
        expect(input[field]?.undici).toBe(requested);
      }
    }
  );

  it("raises the fast-uri and ip-address floors to their patched releases", () => {
    const output = readPackage({
      name: "consumer",
      dependencies: { "fast-uri": "^3.0.1", "ip-address": "^10.0.1" },
    });
    expect(output.dependencies?.["fast-uri"]).toBe("^3.1.9");
    expect(output.dependencies?.["ip-address"]).toBe("^10.7.4");
  });

  it.each(["dependencies", "optionalDependencies", "devDependencies"] as const)(
    "lifts qs 6 and @hono/node-server 2 to a floor, keeping the operator, never down nor across a major, in %s",
    (field) => {
      for (const [name, requested, expected] of [
        // Operator preserved.
        ["qs", "~6.16.0", "~6.16.1"],
        ["qs", "^6.14.0", "^6.16.1"],
        ["qs", "6.16.0", "6.16.1"],
        ["qs", "=6.16.0", "=6.16.1"],
        ["qs", "6.x", "^6.16.1"],
        ["qs", "6.16.x", "~6.16.1"],
        // Comparator sets and hyphen ranges.
        ["qs", ">=6 <7", ">=6.16.1 <7"],
        ["qs", ">=6.7.0", ">=6.16.1"],
        ["qs", "6.0.0 - 6.20.0", "6.16.1 - 6.20.0"],
        ["qs", ">=6.7.0 <6.16.0", "^6.16.1"],
        ["qs", "6.0.0 - 6.10.0", "^6.16.1"],
        // Only the alternative on the vulnerable major moves.
        ["qs", "^6.14.0 || ^7.0.0", "^6.16.1 || ^7.0.0"],
        ["@hono/node-server", "^1.19.9 || ^2.0.5", "^1.19.9 || ^2.1.3"],
        // Pre-releases of the fixed version are still below it.
        ["@hono/node-server", "2.1.3-rc.1", "2.1.3"],
        ["@hono/node-server", "^2.1.3-rc.1", "^2.1.3"],
        ["@hono/node-server", "^2.1.1", "^2.1.3"],
        // Already at or above the floor, or on another major: untouched.
        ["qs", "^6.16.1", "^6.16.1"],
        ["qs", "^6.17.0", "^6.17.0"],
        ["qs", "^5.2.0", "^5.2.0"],
        ["qs", ">=5 <6", ">=5 <6"],
        ["@hono/node-server", "~2.1.3", "~2.1.3"],
        ["@hono/node-server", "^2.2.0", "^2.2.0"],
        ["@hono/node-server", "^1.19.9", "^1.19.9"],
      ]) {
        const input: PackageManifest = { name: "consumer", [field]: { [name]: requested } };
        expect(readPackage(input)[field]?.[name], `${name}@${requested}`).toBe(expected);
        expect(input[field]?.[name]).toBe(requested);
      }
    }
  );

  it("leaves unrecognised ranges alone and reports them through pnpm's log", () => {
    for (const [name, requested] of [
      ["qs", "latest"],
      ["qs", "*"],
      ["@hono/node-server", "workspace:*"],
      ["@hono/node-server", "npm:other@2.0.0"],
    ]) {
      const logs: string[] = [];
      const output = readPackage(
        { name: "consumer", dependencies: { [name]: requested } },
        { log: (message: string) => logs.push(message) }
      );
      expect(output.dependencies?.[name]).toBe(requested);
      expect(logs).toEqual([expect.stringContaining(`${name} (${requested})`)]);
    }
    const logs: string[] = [];
    readPackage({ name: "consumer", dependencies: { qs: "^6.17.0" } }, { log: (message: string) => logs.push(message) });
    expect(logs).toEqual([]);
  });

  it("resolves no vulnerable qs, @hono/node-server or @vitest/mocker release", () => {
    const lock = load(readFileSync(new URL("../pnpm-lock.yaml", import.meta.url), "utf8")) as {
      packages: Record<string, unknown>;
    };
    const versions = (name: string) =>
      Object.keys(lock.packages)
        .filter((key) => key.startsWith(`${name}@`))
        .map((key) => key.slice(name.length + 1).split("(")[0]);
    const atLeast = (version: string, floor: string) => {
      const [a, b] = [version, floor].map((value) => value.split(".").map(Number));
      for (let index = 0; index < 3; index += 1) {
        if (a[index] !== b[index]) return a[index] > b[index];
      }
      return true;
    };
    for (const [name, floor] of [
      ["qs", "6.16.1"],
      ["@hono/node-server", "2.1.3"],
      ["@vitest/mocker", "4.1.12"],
    ]) {
      const resolved = versions(name);
      expect(resolved.length).toBeGreaterThan(0);
      for (const version of resolved) expect(atLeast(version, floor), `${name}@${version}`).toBe(true);
    }
  });

  it("patches transitive Zod while retaining the scoped selector-parser fix", () => {
    const output = readPackage({
      name: "@tailwindcss/typography",
      dependencies: { zod: "^3.23.8", "postcss-selector-parser": "6.0.10" },
    });
    expect(output.dependencies?.zod).toBe("^4.6.7");
    expect(output.dependencies?.["postcss-selector-parser"]).toBe("^7.1.6");
    expect(
      readPackage({
        name: "unrelated-consumer",
        dependencies: { "postcss-selector-parser": "^6.1.5" },
      }).dependencies?.["postcss-selector-parser"]
    ).toBe("^6.1.5");
  });

  it("locks every Zod consumer to the patched graph, including cdp protocol", () => {
    const lock = load(readFileSync(new URL("../pnpm-lock.yaml", import.meta.url), "utf8")) as {
      packages: Record<string, unknown>;
      snapshots: Record<string, { dependencies?: Record<string, string> }>;
    };
    expect(Object.keys(lock.packages).filter((key) => key.startsWith("zod@"))).toEqual([
      "zod@4.6.7",
    ]);
    for (const snapshot of Object.values(lock.snapshots)) {
      if (snapshot.dependencies?.zod) {
        expect(snapshot.dependencies.zod).toMatch(/^4\.6\.7(?:\(|$)/);
      }
    }
    const browserProtocol = Object.entries(lock.snapshots).filter(([name]) =>
      name.startsWith("chromium-bidi@")
    );
    expect(browserProtocol.length).toBeGreaterThan(0);
    for (const [, snapshot] of browserProtocol) {
      expect(snapshot.dependencies?.zod).toBe("4.6.7");
    }
  });
});

// Exercise the actual published protocol parser, not just the lockfile graph.
// A patched version number alone cannot establish a cross-major override is safe.
describe("Chromium BiDi runtime compatibility", () => {
  it("reports invalid protocol input as InvalidArgumentException rather than crashing", async () => {
    const lhciRequire = createRequire(require.resolve("@lhci/cli/package.json"));
    const lighthouseRequire = createRequire(lhciRequire.resolve("lighthouse/package.json"));
    const puppeteerRequire = createRequire(lighthouseRequire.resolve("puppeteer-core/package.json"));
    const bidiEntry = puppeteerRequire.resolve("chromium-bidi");
    const parserUrl = new URL("./protocol-parser/protocol-parser.js", pathToFileURL(bidiEntry));
    const parser = await import(/* @vite-ignore */ parserUrl.href);
    expect(parser.Browser.parseRemoveUserContextParameters({ userContext: "qa-context" }))
      .toEqual({ userContext: "qa-context" });
    let failure: unknown;
    try {
      parser.Browser.parseRemoveUserContextParameters({ userContext: 17 });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(TypeError);
    expect((failure as Error).message).toMatch(/userContext|invalid/i);
  });
});
