/* eslint-disable no-console */
import { spawnSync } from "node:child_process";

import { preloadLocalE2eImages } from "../lib/local-e2e-image-preloader";

function requireCiRunner(): void {
  if (process.env.GITHUB_ACTIONS !== "true" || process.platform !== "linux") {
    throw new Error(
      "Supabase image preloading is restricted to a Linux GitHub Actions runner."
    );
  }
}

async function main(): Promise<void> {
  requireCiRunner();
  await preloadLocalE2eImages(process.env, async (args, env, timeoutMs) => {
    const result = spawnSync("docker", args, {
      encoding: "utf8",
      env: { ...env, DOCKER_CLI_HINTS: "false" },
      stdio: "pipe",
      timeout: timeoutMs,
    });

    // Keep Docker's provider-controlled diagnostics inside the tested
    // sanitizer; never print a raw spawn error or registry response here.
    return {
      status: result.status,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  });
  console.log("Verified the pinned local Supabase images on the CI runner.");
}

main().catch((error: unknown) => {
  console.error(
    `[local-supabase-image-preloader] ${error instanceof Error ? error.message : "Unknown failure"}`
  );
  process.exitCode = 1;
});
