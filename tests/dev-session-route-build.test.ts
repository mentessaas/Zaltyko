import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function pageExtensions(nodeEnv: "production" | "development" | "test"): string[] {
  const url = pathToFileURL(resolve(root, "next.config.mjs")).href;
  const output = execFileSync(
    process.execPath,
    ["--input-type=module", "-e", `const {default:c}=await import(${JSON.stringify(url)});console.log(JSON.stringify(c.pageExtensions));`],
    {
      cwd: root,
      env: { NODE_ENV: nodeEnv, NEXT_TELEMETRY_DISABLED: "1" },
      timeout: 15_000,
      maxBuffer: 128 * 1024,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  return JSON.parse(output.trim().split("\n").at(-1)!);
}

function appFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? appFiles(path) : [relative(root, path).split(sep).join("/")];
  });
}

describe("dev session route stays out of production builds", () => {
  it("only next dev treats *.dev.ts files as routes", () => {
    expect(pageExtensions("development")).toEqual(["dev.ts", "ts", "tsx", "mdx"]);
    expect(pageExtensions("production")).toEqual(["ts", "tsx", "mdx"]);
    expect(pageExtensions("test")).toEqual(["ts", "tsx", "mdx"]);
  });

  it("ships the dev session handler only as route.dev.ts", () => {
    expect(existsSync(join(root, "src/app/api/dev/session/route.dev.ts"))).toBe(true);
    expect(existsSync(join(root, "src/app/api/dev/session/route.ts"))).toBe(false);
    const devOnly = appFiles(join(root, "src/app")).filter(file => /\.dev\.tsx?$/.test(file));
    expect(devOnly).toEqual(["src/app/api/dev/session/route.dev.ts"]);
  });

  it("keeps the runtime guard as a second barrier under next dev", () => {
    const source = readFileSync(join(root, "src/app/api/dev/session/route.dev.ts"), "utf8");
    expect(source).toMatch(/isDevSessionEnabled\(\)/);
    expect(source).toContain('"DEV_SESSION_DISABLED"');
  });
});
