import { createHash } from "node:crypto";
import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

export const SUPPORTED_SUPABASE_CLI_VERSION = "2.84.2";
export const SUPPORTED_SUPABASE_CLI_SHA256_BY_TARGET: Readonly<
  Record<string, string>
> = {
  "darwin-arm64":
    "c1c2bf3cac9cfb9679be798334821910f916d1cafe2cc5dc12d55443a15e920f",
  "linux-x64":
    "3132b218461bf90d4cd5983b27b44031cd9b6c797c259a431b2e2520b5f7bdce",
};

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

const runnerPackages = ["next", "playwright", "tsx"] as const;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function verifyInstalledRunnerPackages(root: string): void {
  const lockfile = readFileSync(join(root, "pnpm-lock.yaml"), "utf8");
  for (const name of runnerPackages) {
    const packagePath = resolve(root, "node_modules", name, "package.json");
    if (!existsSync(packagePath)) {
      throw new Error(
        `Required local ${name} package is missing; refusing package-manager installation.`
      );
    }
    const version = (
      JSON.parse(readFileSync(packagePath, "utf8")) as { version?: string }
    ).version;
    if (!version) throw new Error(`Could not read installed ${name} version.`);
    const lockPattern = new RegExp(
      `^  ${escapeRegExp(name)}@${escapeRegExp(version)}(?:[:(])`,
      "m"
    );
    if (!lockPattern.test(lockfile)) {
      throw new Error(
        `Installed ${name}@${version} does not match pnpm-lock.yaml; refusing to run.`
      );
    }
    localCliEntrypoint(root, name);
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

export function getSupportedSupabaseCliSha256(
  platform: string,
  architecture: string
): string {
  const target = `${platform}-${architecture}`;
  const expectedHash = SUPPORTED_SUPABASE_CLI_SHA256_BY_TARGET[target];
  if (!expectedHash) {
    throw new Error(
      `No verified Supabase CLI ${SUPPORTED_SUPABASE_CLI_VERSION} binary hash for ${target}; refusing to start containers.`
    );
  }
  return expectedHash;
}

export function verifySupabaseCliBinary(
  binaryPath: string,
  platform = process.platform,
  architecture = process.arch
): void {
  const expectedHash = getSupportedSupabaseCliSha256(platform, architecture);
  const actualHash = createHash("sha256")
    .update(readFileSync(binaryPath))
    .digest("hex");
  if (actualHash !== expectedHash) {
    throw new Error(
      `Local E2E image manifest is verified only for Supabase CLI ${SUPPORTED_SUPABASE_CLI_VERSION} on ${platform}-${architecture} (${expectedHash}); found binary SHA-256 ${actualHash}. Refusing to start containers.`
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

export type LocalRunnerPackage = "next" | "playwright" | "tsx";

export function localCliEntrypoint(
  root: string,
  name: LocalRunnerPackage
): string {
  const packageDirectory = resolve(root, "node_modules", name);
  const packagePath = join(packageDirectory, "package.json");
  if (!existsSync(packagePath)) {
    throw new Error(
      `Required local ${name} package is missing; refusing to install it.`
    );
  }
  const manifest = JSON.parse(readFileSync(packagePath, "utf8")) as {
    bin?: string | Record<string, string>;
  };
  const entrypoint =
    typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.[name];
  if (!entrypoint) {
    throw new Error(
      `Installed ${name} package does not declare its CLI entrypoint.`
    );
  }
  const cliPath = resolve(packageDirectory, entrypoint);
  const relativePath = relative(packageDirectory, cliPath);
  if (
    !relativePath ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    !existsSync(cliPath)
  ) {
    throw new Error(`Installed ${name} CLI entrypoint is invalid or missing.`);
  }
  return cliPath;
}

export function localNodeCliInvocation(
  root: string,
  name: LocalRunnerPackage,
  args: string[]
): { command: string; args: string[] } {
  return {
    command: process.execPath,
    args: [localCliEntrypoint(root, name), ...args],
  };
}
