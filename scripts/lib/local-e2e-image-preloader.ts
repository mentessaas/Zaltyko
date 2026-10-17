import { ACTIVE_LOCAL_SUPABASE_IMAGES } from "./local-e2e-preflight";
import { resolveLocalDockerEndpoint } from "./local-docker-endpoint";
import { pullPinnedImageWithDigestFallback } from "./local-e2e-digest-fallback";
import {
  DigestFallbackError,
  dockerDiagnosticFlags,
  formatDockerDiagnosticFlags,
} from "./local-e2e-docker-diagnostics";

export type DockerCommand = (
  args: string[],
  env: NodeJS.ProcessEnv,
  timeoutMs: number
) => Promise<{ status: number | null; stdout: string; stderr: string }>;

// Never echo registry-controlled text: credentials may occur in arbitrary paths
// or JSON values. Emit only fixed diagnostic labels, not redacted excerpts.
export function sanitizeDockerPullStderr(stderr: string): string {
  if (!stderr.trim()) return "No stderr output was captured.";
  return formatDockerDiagnosticFlags(dockerDiagnosticFlags(stderr));
}

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

  for (const image of ACTIVE_LOCAL_SUPABASE_IMAGES) {
    const inspection = await run(
      ["image", "inspect", image],
      dockerEnvironment,
      30_000
    );
    if (inspection.status === 0) continue;

    try {
      await pullPinnedImageWithDigestFallback(image, (args, timeoutMs) =>
        run(args, dockerEnvironment, timeoutMs)
      );
    } catch (error) {
      if (error instanceof DigestFallbackError) {
        const operation = error.stage.endsWith("-pull")
          ? "docker pull"
          : "docker";
        throw new Error(
          `Could not preload pinned Supabase image ${image} (${operation} exit status ${error.status ?? "unknown"}).\n${error.message}`
        );
      }
      throw new Error(
        `Could not preload pinned Supabase image ${image}; raw error omitted.`
      );
    }
  }
}
