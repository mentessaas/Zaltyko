import { createHash } from "node:crypto";
import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const SUPPORTED_SUPABASE_CLI_VERSION = "2.84.2";
export const SUPPORTED_SUPABASE_CLI_SHA256 =
  "c1c2bf3cac9cfb9679be798334821910f916d1cafe2cc5dc12d55443a15e920f";

// Image refs embedded in the verified Supabase CLI 2.84.2 default local stack.
// Keep this list versioned: a CLI upgrade must refresh and review the manifest.
export const REQUIRED_LOCAL_SUPABASE_IMAGES = [
  "public.ecr.aws/supabase/postgres:17.6.1.095",
  "public.ecr.aws/supabase/gotrue:v2.188.1",
  "public.ecr.aws/supabase/realtime:v2.78.18",
  "public.ecr.aws/supabase/storage-api:v1.44.11",
  "public.ecr.aws/supabase/kong:2.8.1",
  "public.ecr.aws/supabase/postgrest:v14.7",
  "public.ecr.aws/supabase/studio:2026.03.23-sha-b7847b7",
  "public.ecr.aws/supabase/logflare:1.34.14",
  "public.ecr.aws/supabase/vector:0.53.0-alpine",
  "public.ecr.aws/supabase/imgproxy:v3.8.0",
  "public.ecr.aws/supabase/mailpit:v1.22.3",
  "public.ecr.aws/supabase/postgres-meta:v0.96.1",
  "public.ecr.aws/supabase/edge-runtime:v1.73.0",
] as const;

const runnerPackages = [
  { name: "next", bin: "next" },
  { name: "playwright", bin: "playwright" },
  { name: "tsx", bin: "tsx" },
] as const;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function verifyInstalledRunnerPackages(root: string): void {
  const lockfile = readFileSync(join(root, "pnpm-lock.yaml"), "utf8");
  for (const entry of runnerPackages) {
    const packagePath = resolve(
      root,
      "node_modules",
      entry.name,
      "package.json"
    );
    const binPath = resolve(
      root,
      "node_modules",
      ".bin",
      process.platform === "win32" ? `${entry.bin}.cmd` : entry.bin
    );
    if (!existsSync(packagePath) || !existsSync(binPath)) {
      throw new Error(
        `Required local ${entry.bin} CLI is missing; refusing package-manager installation.`
      );
    }
    try {
      accessSync(binPath, constants.X_OK);
    } catch {
      if (process.platform !== "win32") {
        throw new Error(`Required local ${entry.bin} CLI is not executable.`);
      }
    }
    const version = (
      JSON.parse(readFileSync(packagePath, "utf8")) as { version?: string }
    ).version;
    if (!version)
      throw new Error(`Could not read installed ${entry.name} version.`);
    const lockPattern = new RegExp(
      `^  ${escapeRegExp(entry.name)}@${escapeRegExp(version)}(?:[:(])`,
      "m"
    );
    if (!lockPattern.test(lockfile)) {
      throw new Error(
        `Installed ${entry.name}@${version} does not match pnpm-lock.yaml; refusing to run.`
      );
    }
  }
}

export function resolveExecutableOnPath(
  name: string,
  pathValue: string | undefined
): string {
  for (const directory of (pathValue ?? "").split(":")) {
    if (!directory) continue;
    const candidate = resolve(directory, name);
    if (!existsSync(candidate)) continue;
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue; an earlier PATH entry may not be executable.
    }
  }
  throw new Error(`Required local ${name} CLI is unavailable on PATH.`);
}

export function verifySupabaseCliBinary(
  binaryPath: string,
  expectedHash = SUPPORTED_SUPABASE_CLI_SHA256
): void {
  const actualHash = createHash("sha256")
    .update(readFileSync(binaryPath))
    .digest("hex");
  if (actualHash !== expectedHash) {
    throw new Error(
      `Local E2E image manifest is verified only for Supabase CLI ${SUPPORTED_SUPABASE_CLI_VERSION} (${expectedHash}); found binary SHA-256 ${actualHash}. Refusing to start containers.`
    );
  }
}

export function assertSupportedNodeVersion(version: string): void {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  const major = Number(match?.[1]);
  const minor = Number(match?.[2]);
  if (
    !match ||
    (major !== 20 && major !== 22) ||
    (major === 20 && minor < 19)
  ) {
    throw new Error(
      `Local E2E requires Node ^20.19 or >=22.12 <23; found ${version}. Refusing to run.`
    );
  }
  if (major === 22 && minor < 12) {
    throw new Error(
      `Local E2E requires Node >=22.12 <23; found ${version}. Refusing to run.`
    );
  }
}

export function findMissingImages(
  requiredImages: readonly string[],
  installedImages: readonly string[]
): string[] {
  const installed = new Set(installedImages);
  return requiredImages.filter((image) => !installed.has(image));
}

export function localCliPath(
  root: string,
  name: "next" | "playwright"
): string {
  const cliPath = resolve(root, "node_modules", ".bin", name);
  if (!existsSync(cliPath)) {
    throw new Error(
      `Required local ${name} CLI is missing; refusing to install it.`
    );
  }
  return cliPath;
}
