import { REQUIRED_LOCAL_SUPABASE_IMAGES } from "./local-e2e-preflight";
import { resolveLocalDockerEndpoint } from "./local-docker-endpoint";

export type DockerCommand = (
  args: string[],
  env: NodeJS.ProcessEnv,
  timeoutMs: number
) => Promise<{ status: number | null; stdout: string; stderr: string }>;

// Never echo registry-controlled text: credentials may occur in arbitrary paths
// or JSON values. Emit only fixed diagnostic labels, not redacted excerpts.
export function sanitizeDockerPullStderr(stderr: string): string {
  if (!stderr.trim()) return "No stderr output was captured.";
  const categories: Array<[string, RegExp]> = [
    ["rate-limit", /too many requests|toomanyrequests|rate.?limit|\b429\b/i],
    [
      "authentication-or-permission",
      /unauthorized|authentication required|access denied|denied:|\b(?:401|403)\b/i,
    ],
    [
      "manifest-or-platform",
      /manifest unknown|no matching manifest|manifest.*not found|unsupported platform/i,
    ],
    ["disk-space", /no space left on device|disk quota exceeded/i],
    ["timeout", /timed? ?out|deadline exceeded/i],
    [
      "network-or-registry",
      /connection reset|connection refused|no such host|unexpected EOF|TLS handshake|\b(?:500|502|503|504)\b/i,
    ],
  ];
  const labels = categories
    .filter(([, pattern]) => pattern.test(stderr))
    .map(([label]) => label);
  return `Diagnostic indicators: ${labels.length ? labels.join(", ") : "unclassified"}. Raw stderr omitted.`;
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

  for (const image of REQUIRED_LOCAL_SUPABASE_IMAGES) {
    const inspection = await run(
      ["image", "inspect", image],
      dockerEnvironment,
      30_000
    );
    if (inspection.status === 0) continue;

    const pull = await run(["pull", image], dockerEnvironment, 600_000);
    if (pull.status !== 0) {
      const stderr = sanitizeDockerPullStderr(pull.stderr);
      throw new Error(
        `Could not preload pinned Supabase image ${image} (docker pull exit status ${pull.status ?? "unknown"}).\n${stderr}`
      );
    }
  }
}
