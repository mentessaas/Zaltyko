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
  readPackage: (pkg: PackageManifest) => PackageManifest;
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
    "lifts qs 6 and @hono/node-server 2 to their fixes without crossing a major in %s",
    (field) => {
      for (const [name, requested, expected] of [
        ["qs", "~6.16.0", "^6.16.1"],
        ["qs", "^6.14.0", "^6.16.1"],
        ["qs", "^5.2.0", "^5.2.0"],
        ["@hono/node-server", "^1.19.9 || ^2.0.5", "2.1.3"],
        ["@hono/node-server", "^2.1.1", "2.1.3"],
        ["@hono/node-server", "^1.19.9", "^1.19.9"],
        ["@hono/node-server", "workspace:*", "workspace:*"],
      ]) {
        const input: PackageManifest = { name: "consumer", [field]: { [name]: requested } };
        expect(readPackage(input)[field]?.[name]).toBe(expected);
        expect(input[field]?.[name]).toBe(requested);
      }
    }
  );

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
