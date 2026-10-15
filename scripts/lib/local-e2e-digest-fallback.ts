// No CLI entrypoint: importing never runs Docker.
import { performance } from "node:perf_hooks";
import {
  DigestFallbackError,
  dockerDiagnosticFlags,
  emptyIdentityChecks,
  type DigestFallbackStage,
} from "./local-e2e-docker-diagnostics";
import { LOCAL_E2E_DIGEST_PINS } from "./local-e2e-digest-pins";

type Result = { status: number | null; stdout: string; stderr: string };
export type DigestDockerCommand = (
  args: string[],
  timeoutMs: number
) => Promise<Result>;
const BUDGET_MS = 600_000;
const digestPattern = /^sha256:[a-f0-9]{64}$/;

function inspectIdentity(
  output: string,
  repoDigests: readonly string[],
  config: string,
  stage: DigestFallbackStage
): string {
  const checks = emptyIdentityChecks();
  let data: unknown;
  try {
    data = JSON.parse(output);
    checks["json-valid"] = true;
  } catch {
    checks["json-valid"] = false;
    throw new DigestFallbackError(stage, 0, "identity", [], checks);
  }
  checks["single-object"] =
    Array.isArray(data) &&
    data.length === 1 &&
    data[0] !== null &&
    typeof data[0] === "object" &&
    !Array.isArray(data[0]);
  if (!checks["single-object"]) {
    throw new DigestFallbackError(stage, 0, "identity", [], checks);
  }
  const image = (data as Record<string, unknown>[])[0];
  checks["os-match"] = image.Os === "linux";
  checks["arch-match"] = image.Architecture === "amd64";
  checks["config-match"] = image.Id === config;
  checks["repo-digest-match"] =
    Array.isArray(image.RepoDigests) &&
    image.RepoDigests.some(
      (value: unknown) =>
        typeof value === "string" && repoDigests.includes(value)
    );
  if (Object.values(checks).some((value) => value !== true)) {
    throw new DigestFallbackError(stage, 0, "identity", [], checks);
  }
  return image.Id as string;
}

/** Call in place of the existing missing-image pull; caller retains its filtered env.
 * Only the exact logflare pin uses Hub first; all other pins retain quota-only fallback.
 * No login, registry env override, retries, raw provider output, or mutable Hub tag.
 */
export async function pullPinnedImageWithDigestFallback(
  ecrRef: string,
  run: DigestDockerCommand,
  now: () => number = () => performance.now()
): Promise<void> {
  const pin = LOCAL_E2E_DIGEST_PINS.find((item) => item.ecr === ecrRef);
  if (
    !pin ||
    !digestPattern.test(pin.manifest) ||
    !digestPattern.test(pin.config)
  ) {
    throw new DigestFallbackError("pin", null, "pin");
  }
  // Derive representations only from the trusted pin, never from observed strings.
  const repoDigests = [
    `${pin.hub}@${pin.manifest}`,
    `docker.io/${pin.hub}@${pin.manifest}`,
  ];
  const official = /^library\/([a-z0-9]+(?:[._-][a-z0-9]+)*)$/.exec(pin.hub);
  if (official) repoDigests.push(`${official[1]}@${pin.manifest}`);
  const started = now();
  let lastElapsed = 0;
  function elapsedAt(
    stage: DigestFallbackStage,
    status: number | null = null
  ): number {
    const elapsed = now() - started;
    if (
      !Number.isFinite(elapsed) ||
      elapsed < lastElapsed ||
      elapsed >= BUDGET_MS
    ) {
      throw new DigestFallbackError(stage, status, "clock");
    }
    lastElapsed = elapsed;
    return elapsed;
  }
  async function command(
    stage: DigestFallbackStage,
    args: string[]
  ): Promise<Result> {
    const elapsed = elapsedAt(stage);
    const remaining = Math.floor(BUDGET_MS - elapsed);
    if (remaining < 1) throw new DigestFallbackError(stage, null, "clock");
    let result: Result;
    try {
      result = await run(args, remaining);
    } catch {
      elapsedAt(stage);
      throw new DigestFallbackError(stage, null, "command");
    }
    elapsedAt(stage, result.status);
    return result;
  }
  const hubPrimary = ecrRef === "public.ecr.aws/supabase/logflare:1.34.14";
  if (!hubPrimary) {
    const primary = await command("ecr-pull", [
      "pull",
      "--platform",
      "linux/amd64",
      ecrRef,
    ]);
    if (primary.status === 0) return;
    // A terminated process has no exit code: quota-like stderr cannot authorize
    // another pull after termination or an invalid command result.
    if (
      primary.status === null ||
      !Number.isInteger(primary.status) ||
      primary.status <= 0
    ) {
      throw new DigestFallbackError("ecr-pull", primary.status, "primary");
    }
    const flags = dockerDiagnosticFlags(primary.stderr);
    if (flags.length !== 1 || flags[0] !== "rate-limit") {
      throw new DigestFallbackError(
        "ecr-pull",
        primary.status,
        "primary",
        flags
      );
    }
  }
  const hubRef = `docker.io/${pin.hub}@${pin.manifest}`;
  const fallback = await command("hub-pull", [
    "pull",
    "--platform",
    "linux/amd64",
    hubRef,
  ]);
  if (fallback.status !== 0)
    throw new DigestFallbackError(
      "hub-pull",
      fallback.status,
      hubPrimary ? "hub-primary" : "hub",
      dockerDiagnosticFlags(fallback.stderr)
    );
  const inspection = await command("hub-inspect", ["image", "inspect", hubRef]);
  if (inspection.status !== 0)
    throw new DigestFallbackError(
      "hub-inspect",
      inspection.status,
      "inspection",
      dockerDiagnosticFlags(inspection.stderr)
    );
  // Accept only exact canonical/familiar representations of this pinned repository.
  const imageId = inspectIdentity(
    inspection.stdout,
    repoDigests,
    pin.config,
    "hub-inspect"
  );
  const tag = await command("ecr-retag", ["image", "tag", imageId, ecrRef]);
  if (tag.status !== 0)
    throw new DigestFallbackError(
      "ecr-retag",
      tag.status,
      "tag",
      dockerDiagnosticFlags(tag.stderr)
    );
  const tagged = await command("ecr-inspect", ["image", "inspect", ecrRef]);
  if (tagged.status !== 0)
    throw new DigestFallbackError(
      "ecr-inspect",
      tagged.status,
      "inspection",
      dockerDiagnosticFlags(tagged.stderr)
    );
  inspectIdentity(tagged.stdout, repoDigests, pin.config, "ecr-inspect");
}
