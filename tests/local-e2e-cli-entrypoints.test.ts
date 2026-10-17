import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { localNodeCliInvocation } from "../scripts/lib/local-e2e-preflight";

function fixturePackage(
  root: string,
  name: "next" | "playwright",
  bin: string
) {
  const packageDirectory = join(root, "node_modules", name);
  mkdirSync(packageDirectory, { recursive: true });
  writeFileSync(
    join(packageDirectory, "package.json"),
    JSON.stringify({ name, bin: { [name]: bin } })
  );
  const entrypoint = join(packageDirectory, bin);
  mkdirSync(join(entrypoint, ".."), { recursive: true });
  writeFileSync(entrypoint, "// synthetic JS CLI entrypoint\n");

  const shim = join(root, "node_modules", ".bin", name);
  mkdirSync(join(shim, ".."), { recursive: true });
  writeFileSync(shim, "#!/bin/sh\n# synthetic package-manager shim\n");
  return { entrypoint, shim };
}

describe("local Node CLI entrypoints", () => {
  it.each([
    ["next", "dist/bin/next", ["build"]],
    ["playwright", "cli.js", ["test", "fixture.spec.ts"]],
  ] as const)(
    "passes the installed %s JavaScript entrypoint to Node, not its .bin shim",
    (name, bin, args) => {
      const root = mkdtempSync(join(tmpdir(), "local-node-cli-entrypoint-"));
      try {
        const fixture = fixturePackage(root, name, bin);
        const invocation = localNodeCliInvocation(root, name, [...args]);

        expect(invocation.command).toBe(process.execPath);
        expect(invocation.args).toEqual([fixture.entrypoint, ...args]);
        expect(invocation.args[0]).not.toBe(fixture.shim);
        expect(invocation.args[0]).not.toContain("node_modules/.bin");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  );
});
