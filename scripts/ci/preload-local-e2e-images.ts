/**
 * Preloads the versioned Supabase images on a disposable GitHub Linux runner.
 * Pulls are sequential to avoid ECR Public anonymous rate-limit bursts across
 * the Chromium/Firefox/WebKit matrix. This script refuses to run outside CI.
 */
import { spawnSync } from "node:child_process";

import {
  ACTIVE_LOCAL_SUPABASE_IMAGES,
  findMissingImages,
} from "../lib/local-e2e-preflight";

function requireCiRunner(): void {
  if (process.env.GITHUB_ACTIONS !== "true" || process.platform !== "linux") {
    throw new Error(
      "Supabase image preloading is restricted to a Linux GitHub Actions runner."
    );
  }
  if (ACTIVE_LOCAL_SUPABASE_IMAGES.length === 0) {
    throw new Error("The pinned local Supabase image manifest is empty.");
  }
}

function docker(args: string[], quiet = true): boolean {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    stdio: quiet ? "ignore" : "inherit",
    env: { ...process.env, DOCKER_CLI_HINTS: "false" },
  });
  if (result.error) {
    if ((result.error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("Docker CLI is unavailable on the CI runner.");
    }
    throw new Error("Docker command could not be started on the CI runner.");
  }
  return result.status === 0;
}

function listInstalledImages(): string[] {
  const result = spawnSync("docker", ["image", "ls", "--format", "{{.Repository}}:{{.Tag}}"], {
    encoding: "utf8",
    env: { ...process.env, DOCKER_CLI_HINTS: "false" },
  });
  if (result.error) {
    if ((result.error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("Docker CLI is unavailable on the CI runner.");
    }
    throw new Error("Docker image inventory could not be read on the CI runner.");
  }
  if (result.status !== 0) {
    throw new Error("Docker image inventory failed on the CI runner.");
  }
  return result.stdout
    .split(/\r?\n/)
    .map((image) => image.trim())
    .filter(Boolean);
}

function main(): void {
  requireCiRunner();

  const required = [...ACTIVE_LOCAL_SUPABASE_IMAGES];
  const missing = findMissingImages(required, listInstalledImages());
  for (const image of missing) {
    console.log(`Pulling pinned local Supabase image: ${image}`);
    if (!docker(["pull", image], false)) {
      throw new Error(`Docker failed to pull pinned image ${image}.`);
    }
  }

  const stillMissing = findMissingImages(required, listInstalledImages());
  if (stillMissing.length > 0) {
    throw new Error(
      `Pinned Supabase images remain unavailable after preload: ${stillMissing.join(", ")}`
    );
  }
  console.log(`Verified ${required.length} pinned local Supabase images on the CI runner.`);
}

try {
  main();
} catch (error) {
  console.error(
    `[local-supabase-image-preloader] ${error instanceof Error ? error.message : "Unknown failure"}`
  );
  process.exitCode = 1;
}
