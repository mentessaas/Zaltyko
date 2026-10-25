import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
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
