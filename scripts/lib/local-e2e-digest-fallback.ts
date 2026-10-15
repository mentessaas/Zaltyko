// No CLI entrypoint: importing never runs Docker.
import { performance } from "node:perf_hooks";
import {
  DigestFallbackError,
  dockerDiagnosticFlags,
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
  repoDigest: string,
  config: string,
  stage: DigestFallbackStage
): string {
  try {
    const data: unknown = JSON.parse(output);
    if (!Array.isArray(data) || data.length !== 1) throw new Error();
    const image = data[0];
    if (
      image.Os !== "linux" ||
      image.Architecture !== "amd64" ||
      image.Id !== config ||
      !Array.isArray(image.RepoDigests) ||
      !image.RepoDigests.includes(repoDigest)
    )
      throw new Error();
    return image.Id;
  } catch {
    throw new DigestFallbackError(stage, 0, "identity");
  }
}

/** Call in place of the existing missing-image pull; caller retains its filtered env.
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
    throw new DigestFallbackError("ecr-pull", primary.status, "primary", flags);
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
      "hub",
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
  // Docker canonicalizes Docker Hub RepoDigests without docker.io.
  const imageId = inspectIdentity(
    inspection.stdout,
    `${pin.hub}@${pin.manifest}`,
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
  inspectIdentity(
    tagged.stdout,
    `${pin.hub}@${pin.manifest}`,
    pin.config,
    "ecr-inspect"
  );
}
