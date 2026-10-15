/* eslint-disable no-console */
import { runLocalCommand } from "../lib/local-e2e-runner-core";
import { preloadLocalE2eImages } from "../lib/local-e2e-image-preloader";

const safeEnvironment = Object.fromEntries(
  [
    "PATH",
    "HOME",
    "RUNNER_TEMP",
    "TMPDIR",
    "DOCKER_HOST",
    "DOCKER_CONTEXT",
    "DOCKER_CONFIG",
    "GITHUB_ACTIONS",
  ].flatMap((key) =>
    process.env[key] ? [[key, process.env[key] as string]] : []
  )
) as NodeJS.ProcessEnv;

async function runDocker(
  args: string[],
  env: NodeJS.ProcessEnv,
  timeoutMs: number
) {
  return runLocalCommand("docker", args, {
    cwd: process.cwd(),
    env,
    timeoutMs,
    allowNonZero: true,
  });
}

preloadLocalE2eImages(safeEnvironment, runDocker)
  .then(() => console.log("Pinned local Supabase images are available."))
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Image preload failed."
    );
    process.exitCode = 1;
  });
