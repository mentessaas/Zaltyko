import { REQUIRED_LOCAL_SUPABASE_IMAGES } from "./local-e2e-preflight";
import { resolveLocalDockerEndpoint } from "./local-docker-endpoint";

export type DockerCommand = (
  args: string[],
  env: NodeJS.ProcessEnv,
  timeoutMs: number
) => Promise<{ status: number | null; stdout: string }>;

export async function preloadLocalE2eImages(
  env: NodeJS.ProcessEnv,
  run: DockerCommand
): Promise<void> {
  if (env.GITHUB_ACTIONS !== "true") {
    throw new Error(
      "Supabase image preloading is restricted to GitHub Actions."
    );
  }

  const dockerHost = resolveLocalDockerEndpoint({
    dockerHost: env.DOCKER_HOST,
    dockerContext: env.DOCKER_CONTEXT,
    dockerConfig: env.DOCKER_CONFIG,
    home: env.HOME,
  });
  const dockerEnvironment = {
    PATH: env.PATH,
    HOME: env.HOME,
    TMPDIR: env.RUNNER_TEMP ?? env.TMPDIR,
    DOCKER_HOST: dockerHost,
    NODE_ENV: "test" as const,
    NEXT_TELEMETRY_DISABLED: "1",
  };

  const daemon = await run(
    ["info", "--format", "{{.ServerVersion}}"],
    dockerEnvironment,
    15_000
  );
  if (daemon.status !== 0 || !daemon.stdout.trim()) {
    throw new Error("GitHub Actions local Docker daemon is unavailable.");
  }

  for (const image of REQUIRED_LOCAL_SUPABASE_IMAGES) {
    const inspection = await run(
      ["image", "inspect", image],
      dockerEnvironment,
      30_000
    );
    if (inspection.status === 0) continue;

    const pull = await run(["pull", image], dockerEnvironment, 600_000);
    if (pull.status !== 0) {
      throw new Error(`Could not preload pinned Supabase image ${image}.`);
    }
  }
}
